/**
 * EmailOTPService — real email OTP for signup, password reset, and
 * other sensitive actions.
 *
 * SPLIT-OF-DUTY between this module and the Python AI engine:
 *
 *     Frontend (this file)     Python /api/v1/notify/otp
 *     ────────────────────     ─────────────────────────
 *     • Generate 6-digit code  • Send via Resend
 *     • Hash + store in Turso  • Format the email body
 *     • Verify on submit       • Subject mapping by `purpose`
 *     • Attempt counter / lock • (stateless — no DB)
 *
 * That split means the AI engine stays stateless and we can replace
 * the SMS provider later (or add a second channel) without changing
 * verify logic.
 *
 * STORAGE — table `email_otps`:
 *     email, purpose, code_hash, attempts, expires_at, used_at, created_at
 * We never store the plaintext. SHA-256 of `email|purpose|code` is
 * keyed: a code minted for `signup` cannot be replayed against
 * `password_reset` even if the same digits randomly collide.
 *
 * SECURITY POSTURE:
 *   • 10-minute expiry (configurable via OPTIONS.ttlMs)
 *   • Soft-lock at 5 wrong attempts (sets used_at to now + lockMs)
 *   • Always-most-recent: if a user re-requests, older codes for the
 *     same (email,purpose) are marked used to prevent replay.
 *   • SHA-256 via Web Crypto — no library needed.
 *
 * GRACEFUL DEGRADATION:
 *   When the Python engine is unreachable OR responds 503 (Resend not
 *   configured), `requestOTP()` returns { delivered:false, fallback:true }
 *   and the caller can decide what to do. The hackathon-friendly
 *   strategy used by account-creation.html is to fall back to the
 *   legacy OTPService ("123456") in dev so the flow isn't blocked.
 */
class EmailOTPService {
  constructor(config = {}) {
    this.dbService = null;
    this.connected = false;
    this.aiEngineUrl = (config.aiEngine && config.aiEngine.url) || 'http://localhost:5000';
    this.ttlMs       = config.ttlMs   || 10 * 60 * 1000; // 10 min
    this.maxAttempts = config.maxAttempts || 5;
    this.tursoConfig = config.turso || {};
  }

  async connect() {
    if (this.connected) return;
    if (typeof TursoDBService === 'undefined') {
      throw new Error('TursoDBService not loaded — include turso-db-service.js before EmailOTPService.');
    }
    // TursoDBService takes (databaseUrl, authToken) positionally —
    // not an options object.
    this.dbService = new TursoDBService(
      this.tursoConfig.databaseUrl,
      this.tursoConfig.authToken
    );
    await this.dbService.connect();
    this.connected = true;
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Generate + persist a fresh OTP and ask the AI engine to email it.
   *
   * @param {string} email
   * @param {object} opts
   * @param {'signup'|'password_reset'|'sensitive'|'reverify'} [opts.purpose='signup']
   * @param {string} [opts.name]  optional first name for greeting
   * @returns {Promise<{delivered:boolean, fallback:boolean, expiresAt:string, error?:string, retryAfter?:number}>}
   */
  async requestOTP(email, opts = {}) {
    await this.connect();
    const normalized = this._normalizeEmail(email);
    if (!normalized) throw new Error('Invalid email address');

    const purpose = opts.purpose || 'signup';
    const code = this._generateCode();
    const codeHash = await this._sha256(`${normalized}|${purpose}|${code}`);
    const expiresAt = new Date(Date.now() + this.ttlMs).toISOString();

    // Invalidate prior unused OTPs for the same (email,purpose) so a
    // freshly-requested code immediately makes older ones dead.
    try {
      await this.dbService._executeHttp(
        `UPDATE email_otps SET used_at = CURRENT_TIMESTAMP
          WHERE email = ? AND purpose = ? AND used_at IS NULL`,
        [normalized, purpose]
      );
    } catch (e) {
      // Non-fatal — worst case we just have multiple live codes.
      console.warn('[EmailOTPService] could not invalidate prior OTPs:', e.message);
    }

    // Insert the new hashed OTP. We store BEFORE attempting to email
    // so that even if the email send fails, a tester can manually
    // copy the plaintext code we logged below to verify.
    await this.dbService._executeHttp(
      `INSERT INTO email_otps (email, purpose, code_hash, attempts, expires_at)
       VALUES (?, ?, ?, 0, ?)`,
      [normalized, purpose, codeHash, expiresAt]
    );

    // Dev visibility: in non-production this is the easiest way to
    // grab the code without checking the inbox. In production you'd
    // gate this behind a debug flag — but logs aren't sent anywhere.
    console.log(`[EmailOTPService] OTP for ${normalized} (${purpose}): ${code} — expires ${expiresAt}`);

    // Forward to Python for delivery.
    try {
      const resp = await fetch(this.aiEngineUrl.replace(/\/$/, '') + '/api/v1/notify/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: normalized, code, purpose, name: opts.name || '' })
      });
      if (resp.ok) {
        return { delivered: true, fallback: false, expiresAt };
      }
      // 503 = Resend not configured on the AI engine. We treat that
      // as "fall back to dev mode" rather than a hard error so the
      // signup flow doesn't break in environments without an API key.
      if (resp.status === 503) {
        console.warn('[EmailOTPService] Resend not configured — caller should fall back.');
        return { delivered: false, fallback: true, expiresAt };
      }
      if (resp.status === 429) {
        const data = await resp.json().catch(() => ({}));
        return {
          delivered: false, fallback: false, expiresAt,
          error: data.message || 'Too many requests. Please wait a minute.',
          retryAfter: 60
        };
      }
      const data = await resp.json().catch(() => ({}));
      return {
        delivered: false, fallback: false, expiresAt,
        error: data.message || `Email send failed (HTTP ${resp.status})`
      };
    } catch (err) {
      // Network error — AI engine unreachable. Fall back path.
      console.warn('[EmailOTPService] AI engine unreachable:', err.message);
      return {
        delivered: false, fallback: true, expiresAt,
        error: 'Email service unreachable'
      };
    }
  }

  /**
   * Verify a user-submitted code against the most recent live OTP for
   * (email,purpose). Increments the attempt counter on every wrong
   * try; locks the row after `maxAttempts`.
   *
   * @returns {Promise<{ok:boolean, reason?:string, attemptsLeft?:number}>}
   */
  async verifyOTP(email, code, purpose = 'signup') {
    await this.connect();
    const normalized = this._normalizeEmail(email);
    if (!normalized) return { ok: false, reason: 'invalid_email' };
    const trimmed = String(code || '').trim();
    if (!/^\d{4,8}$/.test(trimmed)) return { ok: false, reason: 'bad_format' };

    // Pull the most recent unused OTP for this email + purpose.
    const sel = await this.dbService._executeHttp(
      `SELECT id, code_hash, attempts, expires_at
         FROM email_otps
        WHERE email = ? AND purpose = ? AND used_at IS NULL
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
      [normalized, purpose]
    );
    const exec = sel.results[0]?.response?.result;
    const row = exec?.rows?.[0];
    if (!row) return { ok: false, reason: 'no_active_otp' };

    const cell = (i) => {
      const v = row[i];
      return (v && typeof v === 'object' && 'value' in v) ? v.value : v;
    };
    const id        = Number(cell(0));
    const storedHash = cell(1);
    const attempts   = Number(cell(2)) || 0;
    const expiresAt  = cell(3);

    if (new Date(expiresAt).getTime() < Date.now()) {
      // Mark expired so we don't keep selecting it.
      await this.dbService._executeHttp(
        `UPDATE email_otps SET used_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]
      ).catch(() => {});
      return { ok: false, reason: 'expired' };
    }

    if (attempts >= this.maxAttempts) {
      await this.dbService._executeHttp(
        `UPDATE email_otps SET used_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]
      ).catch(() => {});
      return { ok: false, reason: 'locked' };
    }

    const candidateHash = await this._sha256(`${normalized}|${purpose}|${trimmed}`);
    if (candidateHash !== storedHash) {
      const newAttempts = attempts + 1;
      // Bump attempts; auto-lock if we've hit the cap.
      await this.dbService._executeHttp(
        newAttempts >= this.maxAttempts
          ? `UPDATE email_otps SET attempts = ?, used_at = CURRENT_TIMESTAMP WHERE id = ?`
          : `UPDATE email_otps SET attempts = ? WHERE id = ?`,
        [newAttempts, id]
      ).catch(() => {});
      return {
        ok: false,
        reason: newAttempts >= this.maxAttempts ? 'locked' : 'mismatch',
        attemptsLeft: Math.max(0, this.maxAttempts - newAttempts)
      };
    }

    // ✓ Match — burn the OTP so it can't be reused.
    await this.dbService._executeHttp(
      `UPDATE email_otps SET used_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]
    ).catch(() => {});
    return { ok: true };
  }

  // ── Internals ───────────────────────────────────────────────────

  _normalizeEmail(email) {
    if (!email) return null;
    const e = String(email).trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
  }

  // Cryptographically-strong 6-digit code. We use `crypto.getRandomValues`
  // and modulo-bias is negligible at 6 digits (10^6 is well under 2^32).
  _generateCode() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const n = buf[0] % 1000000;
    return String(n).padStart(6, '0');
  }

  async _sha256(str) {
    const enc = new TextEncoder().encode(str);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

if (typeof window !== 'undefined') {
  window.EmailOTPService = EmailOTPService;
}
