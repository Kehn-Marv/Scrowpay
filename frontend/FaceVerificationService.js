/**
 * FaceVerificationService — Gemini-powered "is this still you?" check.
 *
 * WHY THIS EXISTS
 * ---------------
 * At signup we capture a face reference photo (after blink-liveness)
 * and store its Cloudinary secure_url on `users.face_reference_url`.
 * Phase F lets us call back to that reference image when something
 * smells off:
 *
 *   • a high-risk transaction is being funded
 *   • a large withdrawal is initiated
 *   • account-sensitive settings are about to change
 *   • the last successful re-verification is stale
 *
 * The user is shown a camera modal, snaps a fresh frame, and Gemini
 * compares the two images. A pass updates `users.last_face_verified_at`
 * (gating future stale checks); a fail blocks the action and writes an
 * audit row to `face_verifications` for admin review.
 *
 * WHY GEMINI
 * ----------
 * Gemini 2.0 Flash is multimodal, cheap, fast, and we already use it
 * elsewhere (DisputeAgentService). Going through the same provider
 * means one API key, one config file, and one cost line. The model
 * is given two images + a strict-JSON prompt and returns
 * { match, confidence, reasoning }. We never train any face model
 * ourselves.
 *
 * SECURITY POSTURE
 * ----------------
 *   • The Gemini API key sits in `gemini-config.js` (gitignored). In
 *     production this would be proxied through the Python AI engine
 *     so the key never reaches the browser.
 *   • Capture frames are NEVER persisted client-side — only sent to
 *     Gemini for the decision. If you wire Cloudinary upload into
 *     `verify()` (commented below), the same `scrowpay_face` preset
 *     used at signup gets the new image too.
 *   • Every attempt — pass OR fail — writes to `face_verifications`
 *     with the trigger reason so anomalies show up in admin review.
 *
 * RETURN SHAPE
 * ------------
 *   {
 *     match:      true | false | null,   // null when service unavailable / soft-fail
 *     confidence: 0..1,
 *     reasoning:  string,
 *     verdict:    'pass' | 'fail' | 'manual_review' | 'unavailable',
 *     persisted:  boolean,
 *     verificationId: number | null
 *   }
 */
class FaceVerificationService {
  constructor(config = {}) {
    const cfg = (typeof window !== 'undefined' && window.GEMINI_CONFIG) || {};
    this.apiKey   = cfg.apiKey || '';
    this.model    = cfg.model  || 'gemini-2.0-flash';
    this.timeoutMs = cfg.timeoutMs || 25000;

    this.dbService = null;
    this.connected = false;
    this.tursoConfig = config.turso || {};

    // Match-confidence threshold. Below this we still record the
    // attempt but treat it as a soft fail — caller should decide
    // whether to allow a retry or escalate.
    this.MIN_PASS_CONFIDENCE = 0.75;

    // Stale window: any successful re-verify older than this is
    // treated as "not recent enough" for high-risk gating. 30 days
    // matches the typical KYC refresh cadence.
    this.STALE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

    // Photo size caps before sending inline to Gemini. Anything
    // bigger gets rejected before the request, with a clear error.
    this.MAX_PHOTO_BYTES = 2 * 1024 * 1024; // ~2 MB raw
  }

  /** True if Gemini is configured (we can actually compare). */
  get available() {
    return Boolean(this.apiKey && this.apiKey.length > 8);
  }

  async connect() {
    if (this.connected) return;
    if (typeof TursoDBService === 'undefined') {
      throw new Error('TursoDBService not loaded — include turso-db-service.js before FaceVerificationService.');
    }
    this.dbService = new TursoDBService(
      this.tursoConfig.databaseUrl,
      this.tursoConfig.authToken
    );
    await this.dbService.connect();
    this.connected = true;
  }

  // ── Decision: does this action require a fresh face check? ───────────────

  /**
   * Pure decision function: should we gate this action behind a
   * face re-verification right now? Returns { required, reason }.
   *
   * @param {object} ctx
   * @param {object} ctx.user            user row (must have face_reference_url to be re-verifiable)
   * @param {string} [ctx.trigger]       'fund_high_risk' | 'large_withdrawal' | 'sensitive_settings' | 'manual'
   * @param {number} [ctx.anomalyScore]  0..1 from AnomalyDetectionEngine
   * @param {number} [ctx.amount]        NGN amount of the action being gated
   * @returns {{required: boolean, reason: string}}
   */
  shouldReverify(ctx = {}) {
    const user = ctx.user || {};
    if (!user.face_reference_url) {
      // Nothing to compare against — user signed up before face
      // capture was added, or capture failed. We DON'T block these
      // users; the legacy flow (PIN-only) takes over upstream.
      return { required: false, reason: 'no_reference' };
    }
    if (!this.available) {
      return { required: false, reason: 'service_unavailable' };
    }

    const trigger = ctx.trigger || 'manual';
    const anomaly = Number(ctx.anomalyScore) || 0;
    const amount  = Number(ctx.amount) || 0;
    const lastVerifiedAt = user.last_face_verified_at
      ? new Date(user.last_face_verified_at).getTime()
      : null;
    const staleness = lastVerifiedAt ? Date.now() - lastVerifiedAt : Infinity;
    const isFresh   = staleness < this.STALE_WINDOW_MS;

    // Hard triggers — always require, even if recently verified.
    if (trigger === 'sensitive_settings') {
      return { required: true, reason: 'sensitive_settings' };
    }
    if (amount >= 500_000) {
      return { required: true, reason: 'large_amount' };
    }
    if (anomaly >= 0.85) {
      return { required: true, reason: 'high_anomaly' };
    }

    // Soft triggers — only require if not freshly verified.
    if (anomaly >= 0.65 && !isFresh) {
      return { required: true, reason: 'medium_anomaly_stale' };
    }
    if (trigger === 'fund_high_risk' && !isFresh) {
      return { required: true, reason: 'fund_high_risk_stale' };
    }
    if (trigger === 'large_withdrawal' && !isFresh) {
      return { required: true, reason: 'withdrawal_stale' };
    }

    return { required: false, reason: 'fresh_or_low_risk' };
  }

  // ── Verification: full pipeline ──────────────────────────────────────────

  /**
   * Run the full face check: fetch reference, compare against capture,
   * persist the result, update the user's last_face_verified_at on
   * success.
   *
   * @param {object} args
   * @param {number} args.userId
   * @param {string} args.trigger          why we're checking (audit field)
   * @param {string} args.referenceUrl     usually user.face_reference_url
   * @param {Blob|string} args.capture     fresh frame (Blob from canvas.toBlob OR data URL)
   * @param {string} [args.transactionId]  link to a txn if applicable
   * @returns {Promise<object>} verdict (see header for shape)
   */
  async verify(args) {
    const userId        = args.userId;
    const trigger       = args.trigger || 'manual';
    const referenceUrl  = args.referenceUrl;
    const transactionId = args.transactionId || null;

    if (!this.available) {
      return this._unavailable('Face verification service unavailable (no API key).');
    }
    if (!referenceUrl) {
      return this._unavailable('No reference photo on file for this account.');
    }
    if (!args.capture) {
      return this._unavailable('No fresh capture provided.');
    }

    // ----- Convert both inputs to base64 inline parts -----------------------
    let referencePart, capturePart;
    try {
      referencePart = await this._urlToInlinePart(referenceUrl);
    } catch (e) {
      return this._unavailable(`Could not load reference photo: ${e.message}`);
    }
    try {
      capturePart = await this._anyToInlinePart(args.capture);
    } catch (e) {
      return this._unavailable(`Could not encode capture: ${e.message}`);
    }

    // ----- Call Gemini ------------------------------------------------------
    const verdict = await this._callGemini(referencePart, capturePart, { trigger });

    // ----- Persist + update last_face_verified_at on success ----------------
    let persisted = false;
    let verificationId = null;
    if (this.connected || this.dbService) {
      try {
        verificationId = await this._persist({
          userId,
          trigger,
          referenceUrl,
          captureUrl: null, // We don't upload the capture by default; admin can re-trigger if needed.
          match: verdict.match,
          confidence: verdict.confidence,
          reasoning: verdict.reasoning,
          transactionId
        });
        persisted = true;

        if (verdict.verdict === 'pass') {
          await this._touchLastVerifiedAt(userId).catch(() => {});
        }
      } catch (e) {
        console.warn('[FaceVerification] persistence failed (non-fatal):', e.message);
      }
    }

    return { ...verdict, persisted, verificationId };
  }

  // ── Internals ────────────────────────────────────────────────────────────

  /**
   * Fetch a Cloudinary URL (or any image URL) and turn it into the
   * Gemini `inlineData` part shape. We do this client-side because
   * Gemini's `fileData.fileUri` requires Files API uploads — far more
   * setup than just sending the bytes inline.
   */
  async _urlToInlinePart(url) {
    const resp = await fetch(url, { mode: 'cors' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    return this._blobToInlinePart(blob);
  }

  async _anyToInlinePart(source) {
    if (source instanceof Blob) return this._blobToInlinePart(source);
    if (typeof source === 'string') {
      // Already a data URL — just split and forward.
      const m = source.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!m) throw new Error('Capture is not a base64 image data URL');
      const approxBytes = (m[2].length * 3) / 4;
      if (approxBytes > this.MAX_PHOTO_BYTES) throw new Error('Capture exceeds 2MB');
      return { inlineData: { mimeType: m[1], data: m[2] } };
    }
    throw new Error('Capture must be Blob or data URL');
  }

  async _blobToInlinePart(blob) {
    if (blob.size > this.MAX_PHOTO_BYTES) throw new Error('Image exceeds 2MB');
    const mimeType = blob.type || 'image/jpeg';
    const dataUrl  = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('FileReader failed'));
      r.readAsDataURL(blob);
    });
    const m = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
    if (!m) throw new Error('Could not encode image as base64');
    return { inlineData: { mimeType, data: m[1] } };
  }

  /**
   * Call Gemini with the two images + a strict-JSON prompt asking
   * "is this the same person?". Returns the normalised verdict.
   */
  async _callGemini(referencePart, capturePart, { trigger }) {
    const prompt = this._buildPrompt({ trigger });
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const body = {
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          { text: 'IMAGE 1 (reference, captured at signup):' },
          referencePart,
          { text: 'IMAGE 2 (fresh capture, just now):' },
          capturePart
        ]
      }],
      generationConfig: {
        // Identity matching is binary by nature — we want low
        // temperature for stable, repeatable verdicts.
        temperature: 0.1,
        maxOutputTokens: 400,
        responseMimeType: 'application/json'
      }
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        console.warn('[FaceVerification] non-OK status:', res.status);
        return this._manualReviewVerdict(`Gemini returned HTTP ${res.status}.`);
      }
      const json = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return this._manualReviewVerdict('Gemini returned an empty response.');

      const parsed = this._safeParseJson(text);
      if (!parsed) return this._manualReviewVerdict('Gemini returned malformed JSON.');

      return this._normalizeVerdict(parsed);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        return this._manualReviewVerdict('Face verification timed out.');
      }
      console.warn('[FaceVerification] request failed:', err.message);
      return this._manualReviewVerdict('Face verification request failed.');
    }
  }

  _buildPrompt({ trigger }) {
    return `You are a face-identity verifier for a Nigerian peer-to-peer escrow service.

YOUR JOB
- Decide if IMAGE 2 (a fresh capture) shows the SAME PERSON as IMAGE 1 (the reference photo from signup).
- You MUST be conservative. If lighting, angle, or image quality genuinely make the comparison hard, lower confidence — do NOT guess.
- Glasses on/off, beard growth, mild weight change, hairstyle change, makeup — these do NOT count as different person.
- Different person = different bone structure, eye spacing, nose shape, jawline, ears, lip shape, etc.
- A photo of a screen / printed photo / mask / video of someone else is NOT a live capture and should be flagged as not matching.

CONTEXT
- Trigger reason: "${trigger}"
- Both images are real photos sent by the user's browser; treat IMAGE 2 as ground truth for "the person currently using the account".

RESPONSE FORMAT — STRICT JSON, NO PROSE OUTSIDE THE JSON
{
  "match": true | false,
  "confidence": <number between 0 and 1, two decimals>,
  "spoof_suspected": true | false,
  "reasoning": "<= 240 chars, plain English. Cite specific facial features when calling a mismatch."
}`;
  }

  _normalizeVerdict(parsed) {
    const match = parsed.match === true;
    const confidence = Math.min(1, Math.max(0, Number(parsed.confidence) || 0));
    const reasoning = String(parsed.reasoning || '').slice(0, 500);
    const spoofSuspected = parsed.spoof_suspected === true;

    let verdict = 'manual_review';
    if (match && confidence >= this.MIN_PASS_CONFIDENCE && !spoofSuspected) {
      verdict = 'pass';
    } else if (!match && confidence >= this.MIN_PASS_CONFIDENCE) {
      verdict = 'fail';
    } else {
      verdict = 'manual_review';
    }

    return { match, confidence, reasoning, spoofSuspected, verdict };
  }

  _manualReviewVerdict(reason) {
    return {
      match: null,
      confidence: 0,
      reasoning: reason,
      spoofSuspected: false,
      verdict: 'manual_review'
    };
  }

  _unavailable(reason) {
    return {
      match: null,
      confidence: 0,
      reasoning: reason,
      spoofSuspected: false,
      verdict: 'unavailable',
      persisted: false,
      verificationId: null
    };
  }

  _safeParseJson(text) {
    try { return JSON.parse(text); } catch (_) {}
    // Sometimes the model still wraps the JSON in a code fence even
    // with responseMimeType set — strip and retry once.
    const stripped = text.replace(/^\s*```(?:json)?\s*/, '').replace(/\s*```\s*$/, '');
    try { return JSON.parse(stripped); } catch (_) { return null; }
  }

  async _persist({ userId, trigger, referenceUrl, captureUrl, match, confidence, reasoning, transactionId }) {
    await this.connect();
    const result = await this.dbService._executeHttp(
      `INSERT INTO face_verifications
         (user_id, trigger, reference_url, capture_url, match, confidence, reasoning, transaction_id, engine_used)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'gemini')`,
      [
        userId, trigger, referenceUrl, captureUrl,
        match === true ? 1 : (match === false ? 0 : null),
        confidence == null ? null : Number(confidence),
        reasoning || null,
        transactionId || null
      ]
    );
    return result.results?.[0]?.response?.result?.last_insert_rowid || null;
  }

  async _touchLastVerifiedAt(userId) {
    await this.connect();
    await this.dbService._executeHttp(
      `UPDATE users SET last_face_verified_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [userId]
    );
  }
}

if (typeof window !== 'undefined') {
  window.FaceVerificationService = FaceVerificationService;
}
