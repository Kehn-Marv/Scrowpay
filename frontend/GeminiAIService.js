/**
 * GeminiAIService - Google Gemini AI Integration for ScrowPay
 *
 * Provides three AI capabilities:
 *  1. analyzeProductImage(base64, mimeType) — Vision fraud/authenticity analysis
 *  2. analyzeTransactionText(description, amount) — NLP scam detection
 *  3. generateTrustDecision(signals) — Final trust narrative + recommendation
 *
 * All methods return a consistent result shape so callers don't need to
 * handle Gemini-specific response structures.
 */

class GeminiAIService {
  /**
   * @param {string} apiKey - Gemini API key
   */
  constructor(apiKey) {
    if (!apiKey) throw new Error('[GeminiAIService] API key is required');
    this.apiKey = apiKey;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
    this.visionModel = 'gemini-1.5-flash';   // fast + cheap for vision
    this.textModel   = 'gemini-1.5-flash';
    this.timeout     = 20000; // 20 s
    console.log('[GeminiAIService] Initialized');
  }

  // ─── private helpers ────────────────────────────────────────────────────

  /** POST to Gemini generateContent endpoint */
  async _generate(model, parts) {
    const url = `${this.baseUrl}/${model}:generateContent?key=${this.apiKey}`;
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] }),
        signal: controller.signal
      });
      clearTimeout(tid);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Gemini API error ${res.status}: ${err?.error?.message || res.statusText}`);
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return text.trim();
    } catch (e) {
      clearTimeout(tid);
      throw e;
    }
  }

  /** Extract JSON block from a Gemini text response */
  _parseJSON(text) {
    // Strip markdown code fences if present
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    try {
      return JSON.parse(clean);
    } catch {
      // Try to extract first {...} block
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error('Could not parse JSON from Gemini response');
    }
  }

  // ─── public API ─────────────────────────────────────────────────────────

  /**
   * Analyze a product image for fraud / authenticity signals.
   *
   * @param {string} base64Data  - Base64-encoded image (no data-URI prefix)
   * @param {string} mimeType    - e.g. "image/jpeg"
   * @returns {Promise<{
   *   success: boolean,
   *   authenticity_score: number,   // 0-100
   *   risk_level: string,           // "Low" | "Medium" | "High"
   *   flags: string[],
   *   recommendation: string,
   *   raw?: string
   * }>}
   */
  async analyzeProductImage(base64Data, mimeType = 'image/jpeg') {
    console.log('[GeminiAIService] Analyzing product image...');

    const prompt = `You are a fraud detection AI for an escrow payment platform.
Analyze this product image for trust and authenticity.

Check for:
- Signs of counterfeit or fake packaging
- Reused or stolen internet images (stock photos, watermarks)
- Image editing or manipulation artifacts
- Suspicious inconsistencies (mismatched labels, blurry details)
- Poor verification quality

Return ONLY valid JSON (no markdown, no explanation):
{
  "authenticity_score": <number 0-100>,
  "risk_level": "<Low|Medium|High>",
  "flags": ["<observation 1>", "<observation 2>"],
  "recommendation": "<one sentence>"
}`;

    try {
      const raw = await this._generate(this.visionModel, [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64Data } }
      ]);

      const parsed = this._parseJSON(raw);

      return {
        success: true,
        authenticity_score: Number(parsed.authenticity_score) || 50,
        risk_level: parsed.risk_level || 'Medium',
        flags: Array.isArray(parsed.flags) ? parsed.flags : [],
        recommendation: parsed.recommendation || 'Manual review recommended.',
        raw
      };
    } catch (err) {
      console.error('[GeminiAIService] Image analysis failed:', err.message);
      return {
        success: false,
        authenticity_score: 50,
        risk_level: 'Medium',
        flags: ['Image analysis unavailable'],
        recommendation: 'Proceed with caution — AI image analysis failed.',
        error: err.message
      };
    }
  }

  /**
   * Analyze transaction description + amount for scam / NLP signals.
   *
   * @param {string} description
   * @param {number} amount
   * @returns {Promise<{
   *   success: boolean,
   *   scam_probability: number,   // 0-100
   *   risk_level: string,
   *   flags: string[],
   *   recommendation: string
   * }>}
   */
  async analyzeTransactionText(description, amount) {
    console.log('[GeminiAIService] Analyzing transaction text...');

    const prompt = `You are a fraud detection AI for an escrow payment platform in Nigeria.
Analyze this transaction for scam signals.

Transaction description: "${description}"
Amount: ₦${Number(amount).toLocaleString()}

Check for:
- Unrealistic promises or too-good-to-be-true offers
- Urgency / pressure language
- Vague or suspicious item descriptions
- Amount inconsistencies for the described item
- Common Nigerian e-commerce scam patterns

Return ONLY valid JSON (no markdown, no explanation):
{
  "scam_probability": <number 0-100>,
  "risk_level": "<Low|Medium|High>",
  "flags": ["<signal 1>", "<signal 2>"],
  "recommendation": "<one sentence>"
}`;

    try {
      const raw = await this._generate(this.textModel, [{ text: prompt }]);
      const parsed = this._parseJSON(raw);

      return {
        success: true,
        scam_probability: Number(parsed.scam_probability) || 30,
        risk_level: parsed.risk_level || 'Medium',
        flags: Array.isArray(parsed.flags) ? parsed.flags : [],
        recommendation: parsed.recommendation || 'Review transaction details carefully.'
      };
    } catch (err) {
      console.error('[GeminiAIService] Text analysis failed:', err.message);
      return {
        success: false,
        scam_probability: 30,
        risk_level: 'Medium',
        flags: ['Text analysis unavailable'],
        recommendation: 'Proceed with standard verification.',
        error: err.message
      };
    }
  }

  /**
   * Generate a final trust decision narrative from aggregated signals.
   *
   * @param {Object} signals
   * @param {number}  signals.trustScore          - 0-100
   * @param {boolean} signals.faceVerified
   * @param {boolean} signals.idVerified
   * @param {number}  [signals.authenticityScore] - from image analysis
   * @param {number}  [signals.scamProbability]   - from text analysis
   * @param {string[]} [signals.flags]            - combined flags
   * @param {number}  signals.amount
   * @returns {Promise<{
   *   success: boolean,
   *   verdict: "RELEASE" | "REVIEW" | "HOLD",
   *   confidence: number,
   *   summary: string,
   *   action: string
   * }>}
   */
  async generateTrustDecision(signals) {
    console.log('[GeminiAIService] Generating trust decision...', signals);

    const prompt = `You are the AI decision engine for ScrowPay, a Nigerian escrow platform.
Based on these trust signals, generate a final payment release decision.

Signals:
- Trust Score: ${signals.trustScore}/100
- Face Verified: ${signals.faceVerified ? 'Yes' : 'No'}
- ID Verified: ${signals.idVerified ? 'Yes' : 'No'}
- Product Authenticity Score: ${signals.authenticityScore ?? 'N/A'}/100
- Scam Probability: ${signals.scamProbability ?? 'N/A'}%
- Flags: ${(signals.flags || []).join(', ') || 'None'}
- Transaction Amount: ₦${Number(signals.amount || 0).toLocaleString()}

Decision rules:
- Trust Score > 75 AND Scam Probability < 30 AND Authenticity > 70 → RELEASE
- Trust Score 40-75 OR moderate flags → REVIEW
- Trust Score < 40 OR Scam Probability > 70 OR Authenticity < 40 → HOLD

Return ONLY valid JSON (no markdown):
{
  "verdict": "<RELEASE|REVIEW|HOLD>",
  "confidence": <number 0-100>,
  "summary": "<2-3 sentence explanation>",
  "action": "<one clear instruction for the user>"
}`;

    try {
      const raw = await this._generate(this.textModel, [{ text: prompt }]);
      const parsed = this._parseJSON(raw);

      return {
        success: true,
        verdict: ['RELEASE', 'REVIEW', 'HOLD'].includes(parsed.verdict) ? parsed.verdict : 'REVIEW',
        confidence: Number(parsed.confidence) || 60,
        summary: parsed.summary || 'AI analysis complete.',
        action: parsed.action || 'Proceed with caution.'
      };
    } catch (err) {
      console.error('[GeminiAIService] Trust decision failed:', err.message);
      return {
        success: false,
        verdict: 'REVIEW',
        confidence: 50,
        summary: 'AI decision engine temporarily unavailable.',
        action: 'Manual review recommended before releasing funds.',
        error: err.message
      };
    }
  }
}

// Export
if (typeof window !== 'undefined') {
  window.GeminiAIService = GeminiAIService;
}
