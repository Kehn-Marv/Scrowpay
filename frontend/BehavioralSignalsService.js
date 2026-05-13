/**
 * BehavioralSignalsService — In-session behavioral fraud signals.
 *
 * Collects passive, privacy-respecting behavioral signals from the
 * browser session and turns them into a vector the AnomalyDetectionEngine
 * can consume. Nothing here calls out to a third party; everything is
 * derived from events the dashboard sees anyway.
 *
 * Signals captured:
 *   • Multi-account-from-device      (DB lookup against device_fingerprints)
 *   • Device-rotation                (this user across many fingerprints)
 *   • PIN paste-detection             (real users type their PIN; scammers paste)
 *   • Funding-modal idle time         (very long idle = social-engineering pause;
 *                                       very short = automation)
 *   • Tab-blur during funding         (user being coached on a phone call)
 *   • Suspicious time-of-day          (late-night high-value funding)
 *   • Session age at funding          (just logged in & immediately funding
 *                                       a high-value txn = compromised cred)
 *
 * USAGE
 * -----
 *   const bx = new BehavioralSignalsService(config, { fingerprint });
 *   bx.startSession(userId);                  // call after login
 *   bx.attachPinInput(document.getElementById('pin'));
 *   bx.markFundingModalOpened();
 *   const signals = await bx.snapshot({ userId, transactionAmount });
 *   //   -> { score: 0..100, flags: [...], features: {...} }
 *
 * The `score` is the behavioral sub-score that the AnomalyDetectionEngine
 * combines with rules + ML. The `features` object is shipped to the Python
 * ML engine as supplementary features (it ignores ones it doesn't know).
 */

(function () {
  class BehavioralSignalsService {
    constructor(config = {}, deps = {}) {
      this.dbService = (config.turso && config.turso.databaseUrl)
        ? new TursoDBService(config.turso.databaseUrl, config.turso.authToken)
        : null;
      this.connected = false;
      this.fingerprint = deps.fingerprint || null;   // DeviceFingerprintService

      // Session-scoped state. Reset on startSession().
      this._reset();

      // Wire global passive listeners (idempotent — startSession won't
      // re-attach if already attached).
      this._listenersAttached = false;
    }

    _reset() {
      this.session = {
        startedAt: 0,
        userId: null,
        tabBlurCount: 0,
        tabBlurDuration: 0,
        _lastBlurAt: 0,
        pinPasteCount: 0,
        pinKeystrokeCount: 0,
        pinTypingDurationMs: 0,
        _pinFirstKeyAt: 0,
        fundingModalOpenedAt: 0,
        clipboardEvents: 0
      };
    }

    async _connect() {
      if (this.dbService && !this.connected) {
        await this.dbService.connect();
        this.connected = true;
      }
    }

    /**
     * Begin a behavioral session for the given user. Call after login
     * succeeds. Idempotent.
     */
    startSession(userId) {
      this._reset();
      this.session.startedAt = Date.now();
      this.session.userId = userId;

      if (!this._listenersAttached && typeof window !== 'undefined') {
        window.addEventListener('blur', () => {
          this.session._lastBlurAt = Date.now();
          this.session.tabBlurCount++;
        });
        window.addEventListener('focus', () => {
          if (this.session._lastBlurAt) {
            this.session.tabBlurDuration += Date.now() - this.session._lastBlurAt;
            this.session._lastBlurAt = 0;
          }
        });
        // Global paste tracking (scammer scripts often paste fields)
        document.addEventListener('paste', () => {
          this.session.clipboardEvents++;
        }, true);
        this._listenersAttached = true;
      }
    }

    /**
     * Attach the PIN input to capture typing-vs-paste behavior. The
     * event handlers are passive — we never read the actual PIN value.
     */
    attachPinInput(inputEl) {
      if (!inputEl || inputEl._bxAttached) return;
      inputEl._bxAttached = true;

      inputEl.addEventListener('paste', () => {
        this.session.pinPasteCount++;
      });
      inputEl.addEventListener('keydown', (e) => {
        // Ignore non-character keys for cadence purposes.
        if (e.key && e.key.length === 1) {
          if (!this.session._pinFirstKeyAt) {
            this.session._pinFirstKeyAt = Date.now();
          }
          this.session.pinKeystrokeCount++;
          this.session.pinTypingDurationMs = Date.now() - this.session._pinFirstKeyAt;
        }
      });
    }

    markFundingModalOpened() {
      this.session.fundingModalOpenedAt = Date.now();
    }

    // -----------------------------------------------------------------------
    // SNAPSHOT — turn the session state into a score + flags + features.
    // -----------------------------------------------------------------------
    /**
     * @param {Object} ctx
     * @param {number} ctx.userId
     * @param {number} ctx.transactionAmount
     * @returns {Promise<{ score, flags, features }>}
     */
    async snapshot(ctx = {}) {
      const flags = [];
      const features = {};
      let score = 0;

      const now = Date.now();
      const sessionAgeSec = this.session.startedAt
        ? Math.floor((now - this.session.startedAt) / 1000)
        : 0;
      features.session_age_sec = sessionAgeSec;
      features.tab_blur_count = this.session.tabBlurCount;
      features.tab_blur_duration_sec = Math.floor(this.session.tabBlurDuration / 1000);
      features.pin_paste_count = this.session.pinPasteCount;
      features.pin_keystroke_count = this.session.pinKeystrokeCount;
      features.clipboard_events = this.session.clipboardEvents;

      const amount = Number(ctx.transactionAmount) || 0;

      // --- Signal 1: PIN was pasted (instead of typed) ---
      if (this.session.pinPasteCount > 0) {
        flags.push({
          code: 'PIN_PASTED',
          severity: 'high',
          weight: 25,
          message: 'PIN was pasted instead of typed — common scammer / credential-theft pattern.'
        });
        score += 25;
      }

      // --- Signal 2: Just logged in & funding a HIGH-VALUE txn ---
      // Compromised credentials are usually drained immediately.
      if (sessionAgeSec > 0 && sessionAgeSec < 30 && amount > 200000) {
        flags.push({
          code: 'INSTANT_HIGH_VALUE_FUND',
          severity: 'high',
          weight: 20,
          message: `Funding a ₦${amount.toLocaleString()} transaction within ${sessionAgeSec}s of login.`
        });
        score += 20;
      }

      // --- Signal 3: Long blur during the funding modal ---
      // 3+ blurs OR >30s of cumulative blur while the modal was open
      // suggests the user is being coached on a phone call.
      if (this.session.fundingModalOpenedAt) {
        const blurInModalSec = Math.floor(this.session.tabBlurDuration / 1000);
        if (this.session.tabBlurCount >= 3 || blurInModalSec >= 30) {
          flags.push({
            code: 'COACHING_PATTERN',
            severity: 'medium',
            weight: 12,
            message: 'Repeated tab focus changes during funding — possible social-engineering pattern.'
          });
          score += 12;
        }
        features.funding_modal_dwell_sec = Math.floor((now - this.session.fundingModalOpenedAt) / 1000);
      }

      // --- Signal 4: Late-night high-value funding ---
      const hour = new Date().getHours();
      features.time_of_day = hour;
      if ((hour >= 1 && hour < 5) && amount > 100000) {
        flags.push({
          code: 'LATE_NIGHT_HIGH_VALUE',
          severity: 'medium',
          weight: 10,
          message: `High-value transaction at ${String(hour).padStart(2, '0')}:00 local time.`
        });
        score += 10;
      }

      // --- Signal 5 & 6: Device fingerprint multi-account / device-rotation ---
      if (this.fingerprint) {
        try {
          const fp = await this.fingerprint.identify();
          features.fingerprint_id = fp.visitorId;
          features.fingerprint_confidence = fp.confidence;
          features.fingerprint_degraded = !!fp.degraded;

          // 5: Same fingerprint, multiple users → sock-puppet pattern.
          const stats = await this.fingerprint.getDeviceStats(fp.visitorId);
          features.fingerprint_distinct_users = stats.distinctUsers;
          if (stats.distinctUsers >= 3) {
            flags.push({
              code: 'SHARED_DEVICE_MULTI_ACCOUNT',
              severity: 'high',
              weight: 25,
              message: `This device has been used by ${stats.distinctUsers} different accounts.`
            });
            score += 25;
          } else if (stats.distinctUsers === 2) {
            // Couples / family share devices — soft signal only.
            flags.push({
              code: 'SHARED_DEVICE',
              severity: 'low',
              weight: 5,
              message: 'This device has been used by another account before.'
            });
            score += 5;
          }

          // 6: Same user across many fingerprints → device rotation.
          const rotation = await this._countDevicesForUser(ctx.userId);
          features.user_distinct_devices = rotation;
          if (rotation >= 5) {
            flags.push({
              code: 'DEVICE_ROTATION',
              severity: 'medium',
              weight: 10,
              message: `Account has been used from ${rotation} different devices.`
            });
            score += 10;
          }
        } catch (e) {
          console.warn('[BehavioralSignals] fingerprint stats failed:', e.message);
        }
      }

      // --- Signal 7: Excessive tab blur outside the funding modal ---
      // Already covered above when modal is open. This catches the
      // general "user is multitasking heavily" case.
      if (this.session.tabBlurCount > 10) {
        flags.push({
          code: 'HIGH_DISTRACTION',
          severity: 'low',
          weight: 3,
          message: 'Unusually high tab-switching during this session.'
        });
        score += 3;
      }

      // Clamp.
      score = Math.max(0, Math.min(100, score));

      return { score, flags, features };
    }

    /**
     * @private
     * How many DISTINCT fingerprints have we seen for this user?
     */
    async _countDevicesForUser(userId) {
      if (!userId || !this.dbService) return 0;
      try {
        await this._connect();
        const result = await this.dbService._executeHttp(
          `SELECT COUNT(DISTINCT fingerprint_id) AS n
             FROM device_fingerprints WHERE user_id = ?`,
          [userId]
        );
        const exec = result.results[0]?.response?.result;
        if (!exec || !exec.rows || exec.rows.length === 0) return 0;
        const cell = exec.rows[0][0];
        const v = (cell && typeof cell === 'object' && 'value' in cell) ? cell.value : cell;
        return Number(v) || 0;
      } catch (e) {
        return 0;
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.BehavioralSignalsService = BehavioralSignalsService;
  }
})();
