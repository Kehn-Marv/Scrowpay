/**
 * NotificationService — Per-user in-app notification feed + email proxy.
 *
 * Two responsibilities:
 *
 *   1. PERSISTED IN-APP FEED. Rows in the `notifications` table. The
 *      bell-icon panel in the dashboard reads from here. Notifications
 *      survive page reloads, mark-as-read syncs across tabs, and the
 *      red badge count is real (not just "since you opened the tab").
 *
 *   2. TRANSACTIONAL EMAIL. When a notification is `important enough`,
 *      we also fire a Resend email via the Python proxy at
 *      `/api/v1/notify/email`. The browser never sees the Resend key.
 *
 * The cleanest mental model is: every meaningful state change in the
 * app calls `notify.create(...)` exactly once. The service decides
 * whether to ALSO send an email based on the notification type — the
 * caller doesn't have to think about it.
 *
 * USAGE
 * -----
 *   const notify = new NotificationService(CONFIG);
 *   await notify.connect();
 *
 *   await notify.create({
 *     userId: 42,
 *     type: 'funding.confirmed',
 *     title: 'Escrow funded',
 *     message: '₦25,000 is now locked in escrow for SCR-12345.',
 *     category: 'transactions',
 *     severity: 'success',
 *     transactionId: 'SCR-12345',
 *     sendEmail: true,                 // optional override; auto-decided otherwise
 *     emailContext: { name: 'Marv' }
 *   });
 *
 *   const list   = await notify.list(userId, { unreadOnly: false, limit: 50 });
 *   const count  = await notify.unreadCount(userId);
 *   await notify.markRead(notificationId);
 *   await notify.markAllRead(userId);
 *
 * EVENTS
 * ------
 * Emits `scrowpay:notification` on `window` whenever a new notification
 * is created for the current user. The bell-icon panel listens for
 * this and re-renders without polling.
 */

(function () {
  // Notification `type` values that automatically trigger an email.
  // Anything not in this set is in-app only by default; the caller
  // can override with `sendEmail: true`.
  const EMAIL_TRIGGERING_TYPES = new Set([
    'funding.confirmed',
    'shipment.created',
    'transaction.completed',
    'transaction.cancelled',
    'dispute.opened',
    'dispute.resolved',
    'security.password_changed',
    'security.face_reverify_failed',
    'security.high_risk_blocked',
    'kyc.face_reverify_required'
  ]);

  // Default From-name used in email templates. The Python service
  // controls the actual From address; this is just the display name
  // we send in the email body.
  const APP_NAME = 'ScrowPay';

  class NotificationService {
    constructor(config) {
      if (!config) throw new Error('NotificationService requires config');
      this.dbService = new TursoDBService(
        config.turso.databaseUrl,
        config.turso.authToken
      );
      this.aiEngineUrl = (config.aiEngine && config.aiEngine.url) ||
                         config.aiEngineUrl ||
                         'http://localhost:5000';
      this.connected = false;
    }

    async connect() {
      if (!this.connected) {
        await this.dbService.connect();
        this.connected = true;
      }
    }

    // -----------------------------------------------------------------------
    // CREATE
    // -----------------------------------------------------------------------
    /**
     * Insert one notification row + optionally fire a Resend email.
     * @returns {Promise<{notificationId, emailed}>}
     */
    async create({
      userId,
      type,
      title,
      message,
      category = 'activities',
      severity = 'info',
      actionUrl = null,
      transactionId = null,
      metadata = null,
      sendEmail = null,             // null = auto-decide via EMAIL_TRIGGERING_TYPES
      emailHtml = null,             // optional explicit override of the auto-generated HTML
      emailContext = {}
    }) {
      if (!userId) throw new Error('create: userId required');
      if (!type)   throw new Error('create: type required');
      if (!title)  throw new Error('create: title required');
      if (!message) throw new Error('create: message required');

      await this.connect();

      // 1. Insert the row.
      let notificationId = null;
      try {
        const result = await this.dbService._executeHttp(
          `INSERT INTO notifications
             (user_id, category, type, title, message, severity,
              action_url, transaction_id, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            category,
            type,
            title,
            message,
            severity,
            actionUrl,
            transactionId,
            metadata ? JSON.stringify(metadata) : null
          ]
        );
        const exec = result.results[0]?.response?.result;
        notificationId = exec && exec.last_insert_rowid ? Number(exec.last_insert_rowid) : null;
      } catch (e) {
        console.error('[NotificationService] insert failed:', e);
        // We still try to send the email below — losing the in-app
        // row is bad but not catastrophic.
      }

      // 2. Fire the `scrowpay:notification` event so the bell-icon
      //    panel can re-render without polling.
      try {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('scrowpay:notification', {
            detail: { userId, type, title, message, category, severity, transactionId, notificationId }
          }));
        }
      } catch (_) {}

      // 3. Decide whether to email.
      // DISABLED: Until a sending domain is verified on Resend, outbound
      // notification email is off (free-tier limits). In-app notifications
      // still work normally.
      const shouldEmail = false;
      let emailed = false;
      if (shouldEmail) {
        try {
          emailed = await this._sendEmail({
            userId,
            type,
            title,
            message,
            severity,
            actionUrl,
            transactionId,
            html: emailHtml,
            context: emailContext
          });
        } catch (e) {
          console.warn('[NotificationService] email send failed (non-fatal):', e.message);
        }
      }

      return { notificationId, emailed };
    }

    // -----------------------------------------------------------------------
    // READ
    // -----------------------------------------------------------------------
    /**
     * @param {number} userId
     * @param {Object} [opts]
     * @param {boolean} [opts.unreadOnly=false]
     * @param {'transactions'|'activities'|'all'} [opts.category='all']
     * @param {number} [opts.limit=50]
     */
    async list(userId, opts = {}) {
      await this.connect();
      const unreadOnly = !!opts.unreadOnly;
      const category = opts.category && opts.category !== 'all' ? opts.category : null;
      const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);

      const where = ['user_id = ?'];
      const args = [userId];
      if (unreadOnly) where.push('is_read = 0');
      if (category)   { where.push('category = ?'); args.push(category); }
      args.push(limit);

      try {
        const result = await this.dbService._executeHttp(
          `SELECT id, category, type, title, message, severity,
                  action_url, transaction_id, metadata, is_read, created_at
             FROM notifications
            WHERE ${where.join(' AND ')}
            ORDER BY created_at DESC, id DESC
            LIMIT ?`,
          args
        );
        const exec = result.results[0]?.response?.result;
        if (!exec || !exec.rows) return [];
        return exec.rows.map(row => this._rowToObject(row));
      } catch (e) {
        console.error('[NotificationService] list failed:', e);
        return [];
      }
    }

    async unreadCount(userId) {
      await this.connect();
      try {
        const result = await this.dbService._executeHttp(
          'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0',
          [userId]
        );
        const cell = result.results[0]?.response?.result?.rows?.[0]?.[0];
        const v = (cell && typeof cell === 'object' && 'value' in cell) ? cell.value : cell;
        return Number(v) || 0;
      } catch (e) {
        return 0;
      }
    }

    async markRead(notificationId) {
      await this.connect();
      try {
        await this.dbService._executeHttp(
          'UPDATE notifications SET is_read = 1 WHERE id = ?',
          [notificationId]
        );
        return true;
      } catch (e) {
        console.error('[NotificationService] markRead failed:', e);
        return false;
      }
    }

    async markAllRead(userId) {
      await this.connect();
      try {
        await this.dbService._executeHttp(
          'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
          [userId]
        );
        return true;
      } catch (e) {
        console.error('[NotificationService] markAllRead failed:', e);
        return false;
      }
    }

    // -----------------------------------------------------------------------
    // INTERNAL — Email proxy
    // -----------------------------------------------------------------------
    /**
     * Resolve the user's email + name (for personalization), then POST
     * to the Python /api/v1/notify/email endpoint. Returns true on
     * delivery confirmation, false otherwise.
     */
    async _sendEmail({ userId, type, title, message, severity, actionUrl, transactionId, html, context }) {
      // Look up the recipient.
      let email = null;
      let name = null;
      try {
        const result = await this.dbService._executeHttp(
          'SELECT email, email_verified, first_name FROM users WHERE id = ? LIMIT 1',
          [userId]
        );
        const row = result.results[0]?.response?.result?.rows?.[0];
        if (row) {
          const cell = (i) => {
            const v = row[i];
            return (v && typeof v === 'object' && 'value' in v) ? v.value : v;
          };
          email = cell(0);
          const verified = Number(cell(1)) === 1;
          name = cell(2);
          if (!email) return false;
          // Only send to verified emails — anything else risks bouncing
          // and burns our Resend reputation.
          if (!verified && type !== 'signup.otp') {
            console.warn('[NotificationService] Skipping email — user email not verified:', userId);
            return false;
          }
        } else {
          return false;
        }
      } catch (e) {
        console.warn('[NotificationService] user lookup for email failed:', e.message);
        return false;
      }

      const renderedHtml = html || this._renderHtml({
        title, message, severity, name, actionUrl, transactionId, type, context
      });
      const text = this._renderText({ title, message, name, actionUrl, transactionId });

      try {
        const resp = await fetch(this.aiEngineUrl.replace(/\/$/, '') + '/api/v1/notify/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: email,
            subject: title,
            html: renderedHtml,
            text,
            tags: {
              category: 'notification',
              type,
              severity
            }
          })
        });
        if (!resp.ok) {
          const body = await resp.text();
          console.warn('[NotificationService] email proxy returned', resp.status, body);
          return false;
        }
        return true;
      } catch (e) {
        console.warn('[NotificationService] email proxy unreachable:', e.message);
        return false;
      }
    }

    _renderHtml({ title, message, severity, name, actionUrl, transactionId, type, context }) {
      const severityColor = {
        success: '#10b981',
        info:    '#60a5fa',
        warning: '#f59e0b',
        danger:  '#ef4444'
      }[severity] || '#60a5fa';
      const greeting = name ? `Hi ${name},` : 'Hi,';
      const actionButton = actionUrl ? `
        <div style="text-align:center;margin:24px 0 8px;">
          <a href="${actionUrl}" style="display:inline-block;background:#10b981;color:#0b0f17;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Open in ${APP_NAME}</a>
        </div>` : '';
      const txnLine = transactionId ? `<div style="font-size:12px;color:#64748b;margin-top:18px;">Reference: <code>${transactionId}</code></div>` : '';
      return `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0b0f17;color:#e6e9ef;padding:32px 16px;">
        <div style="max-width:560px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:14px;padding:28px 32px;">
          <div style="text-align:center;font-size:22px;font-weight:700;color:#10b981;margin-bottom:20px;">${APP_NAME}</div>
          <div style="height:3px;background:${severityColor};border-radius:2px;margin-bottom:20px;opacity:0.9;"></div>
          <h1 style="margin:0 0 12px;font-size:18px;color:#f3f4f6;">${title}</h1>
          <p style="margin:0 0 8px;font-size:14px;color:#9ca3af;">${greeting}</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#cbd5e1;">${message}</p>
          ${actionButton}
          ${txnLine}
        </div>
        <div style="text-align:center;font-size:11px;color:#475569;margin-top:18px;">© ${APP_NAME} · Secure escrow for digital commerce</div>
      </div>`;
    }

    _renderText({ title, message, name, actionUrl, transactionId }) {
      const lines = [];
      if (name) lines.push(`Hi ${name},`);
      lines.push('');
      lines.push(title);
      lines.push('');
      lines.push(message);
      if (actionUrl) {
        lines.push('');
        lines.push('Open: ' + actionUrl);
      }
      if (transactionId) {
        lines.push('');
        lines.push('Reference: ' + transactionId);
      }
      lines.push('');
      lines.push('— ScrowPay');
      return lines.join('\n');
    }

    _rowToObject(row) {
      const cell = (i) => {
        const v = row[i];
        return (v && typeof v === 'object' && 'value' in v) ? v.value : v;
      };
      let metadata = null;
      try { metadata = cell(8) ? JSON.parse(cell(8)) : null; } catch (_) {}
      return {
        id: cell(0),
        category: cell(1),
        type: cell(2),
        title: cell(3),
        message: cell(4),
        severity: cell(5),
        actionUrl: cell(6),
        transactionId: cell(7),
        metadata,
        isRead: Number(cell(9)) === 1,
        createdAt: cell(10)
      };
    }
  }

  if (typeof window !== 'undefined') {
    window.NotificationService = NotificationService;
  }
})();
