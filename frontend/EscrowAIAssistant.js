
/**
 * EscrowAIAssistant — Structured Wizard Engine
 *
 * The AI runs INVISIBLY behind a step-by-step product UI.
 * No chat. No conversation. Pure extraction + validation + scoring.
 *
 * Each step submits structured data → Gemini returns structured JSON.
 * The UI advances based on that JSON, not on AI prose.
 */
class EscrowAIAssistant {
  constructor(geminiApiKey, cloudinaryConfig) {
    this.apiKey       = geminiApiKey;
    this.cloudName    = cloudinaryConfig.cloudName;
    this.uploadPreset = cloudinaryConfig.uploadPreset;
    this.model        = 'gemini-1.5-flash';
    this.baseUrl      = 'https://generativelanguage.googleapis.com/v1beta/models';
    this.timeout      = 20000;

    // Accumulated transaction state
    this.state = {
      transaction_type: null,
      item:             null,
      condition:        null,
      amount:           null,
      currency:         'NGN',
      delivery_method:  null,
      timeline_days:    null,
      inspection_days:  null,
      release_conditions: null,
      evidence:         [],   // [{ label, cloudinaryUrl, analysis }]
      trust_score:      null,
      risk_level:       null,
      risk_flags:       [],
      escrow_terms:     null,
    };
  }

  // ── Gemini call (structured, not conversational) ─────────────────────────

  async _ask(prompt) {
    const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2 }
        }),
        signal: controller.signal
      });
      clearTimeout(tid);
      if (!res.ok) throw new Error(`Gemini ${res.status}`);
      const data = await res.json();
      return (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    } catch (e) {
      clearTimeout(tid);
      throw e;
    }
  }

  _parseJSON(text) {
    const clean = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    try { return JSON.parse(clean); } catch {
      const m = clean.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
      throw new Error('JSON parse failed');
    }
  }

  // ── Step processors ──────────────────────────────────────────────────────

  /**
   * Step 2: Extract structured data from free-text description.
   * Returns { item, condition, amount, category, ai_notice }
   */
  async extractDescription(rawText, transactionType) {
    const prompt = `You are a transaction data extractor for an escrow platform.
Extract structured data from this seller description.

Transaction type: ${transactionType}
Seller input: "${rawText}"

Return ONLY valid JSON:
{
  "item": "<product or service name>",
  "condition": "<new|used|digital|service>",
  "amount": <number in NGN, 0 if not mentioned>,
  "category": "<electronics|fashion|services|real_estate|crypto|other>",
  "ai_notice": "<null or a short warning if something seems off, max 12 words>"
}`;

    try {
      const raw = await this._ask(prompt);
      const parsed = this._parseJSON(raw);
      Object.assign(this.state, {
        item:      parsed.item,
        condition: parsed.condition,
        amount:    parsed.amount || null,
      });
      return parsed;
    } catch {
      return { item: rawText, condition: 'unknown', amount: 0, category: 'other', ai_notice: null };
    }
  }

  /**
   * Step 5: Validate release conditions text.
   * Returns { valid, ai_notice, suggested_conditions }
   */
  async validateReleaseConditions(conditionsText, transactionData) {
    const prompt = `You are an escrow terms validator.
Evaluate these release conditions for a ${transactionData.transaction_type} transaction.

Item: ${transactionData.item}
Amount: ₦${transactionData.amount}
Conditions entered: "${conditionsText}"

Return ONLY valid JSON:
{
  "valid": true,
  "ai_notice": "<null or short warning max 12 words>",
  "suggested_conditions": "<improved one-line conditions if needed, else null>"
}`;

    try {
      const raw = await this._ask(prompt);
      return this._parseJSON(raw);
    } catch {
      return { valid: true, ai_notice: null, suggested_conditions: null };
    }
  }

  /**
   * Step 6: Analyze uploaded evidence image via Gemini Vision.
   * imageUrl = Cloudinary URL
   */
  async analyzeEvidenceImage(imageUrl, label) {
    const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;
    const prompt = `Analyze this ${label} image for an escrow transaction.
Check: manipulation, stock photo, blurry/suspicious areas, missing details.
Return ONLY valid JSON:
{
  "authenticity_score": <0-100>,
  "risk_level": "<Low|Medium|High>",
  "ai_notice": "<null or short actionable feedback max 12 words>"
}`;

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), this.timeout);
    try {
      const res = await fetch(`${url}?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { text: prompt },
              { file_data: { file_uri: imageUrl, mime_type: 'image/jpeg' } }
            ]
          }]
        }),
        signal: controller.signal
      });
      clearTimeout(tid);
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const clean = text.replace(/```json\s*/gi,'').replace(/```/g,'').trim();
      try { return JSON.parse(clean); } catch {
        const m = clean.match(/\{[\s\S]*\}/);
        return m ? JSON.parse(m[0]) : { authenticity_score: 60, risk_level: 'Medium', ai_notice: null };
      }
    } catch (e) {
      clearTimeout(tid);
      return { authenticity_score: 60, risk_level: 'Medium', ai_notice: null };
    }
  }

  /**
   * Step 7: Generate final trust score + escrow terms from all collected state.
   * Returns { trust_score, risk_level, risk_flags, escrow_terms, ai_decision }
   */
  async generateFinalAnalysis() {
    const s = this.state;
    const avgAuth = s.evidence.length > 0
      ? Math.round(s.evidence.reduce((a, e) => a + (e.analysis?.authenticity_score || 60), 0) / s.evidence.length)
      : 60;

    const prompt = `You are an escrow risk engine. Generate a final trust assessment.

Transaction:
- Type: ${s.transaction_type}
- Item: ${s.item} (${s.condition})
- Amount: ₦${s.amount}
- Delivery: ${s.delivery_method} in ${s.timeline_days} days
- Inspection: ${s.inspection_days} days
- Evidence uploaded: ${s.evidence.length} file(s)
- Average image authenticity: ${avgAuth}/100
- Release conditions: ${s.release_conditions}

Return ONLY valid JSON:
{
  "trust_score": <0-100>,
  "risk_level": "<Low|Medium|High>",
  "risk_flags": ["<flag>"],
  "escrow_terms": "<2-4 bullet points as plain text with • separator>",
  "ai_decision": "<APPROVE|REVIEW|BLOCK>",
  "ai_summary": "<one sentence, max 15 words>"
}`;

    try {
      const raw = await this._ask(prompt);
      const parsed = this._parseJSON(raw);
      Object.assign(this.state, {
        trust_score:  parsed.trust_score,
        risk_level:   parsed.risk_level,
        risk_flags:   parsed.risk_flags || [],
        escrow_terms: parsed.escrow_terms,
      });
      return parsed;
    } catch {
      const fallback = {
        trust_score: 65, risk_level: 'Medium', risk_flags: [],
        escrow_terms: `• Buyer confirms receipt\n• Item matches uploaded proof\n• No dispute within ${s.inspection_days || 3} days`,
        ai_decision: 'REVIEW', ai_summary: 'Standard escrow terms applied.'
      };
      Object.assign(this.state, fallback);
      return fallback;
    }
  }

  // ── Cloudinary upload ────────────────────────────────────────────────────

  async uploadToCloudinary(file) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', this.uploadPreset);
    fd.append('folder', 'escrow-evidence');
    const res = await fetch(`https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`, {
      method: 'POST', body: fd
    });
    if (!res.ok) throw new Error('Upload failed');
    const data = await res.json();
    return data.secure_url;
  }

  // ── Final data for TransactionService ───────────────────────────────────

  getFinalTransactionData() {
    const s = this.state;
    return {
      itemDescription:      `${s.item || 'Item'}${s.condition ? ' (' + s.condition + ')' : ''}`,
      price:                Number(s.amount) || 0,
      deliveryTimelineDays: Number(s.timeline_days) || 7,
      inspectionWindowDays: Number(s.inspection_days) || 3,
      trustScore:           s.trust_score,
      riskLevel:            s.risk_level,
      riskFlags:            s.risk_flags,
      escrowTerms:          s.escrow_terms,
    };
  }
}

if (typeof window !== 'undefined') window.EscrowAIAssistant = EscrowAIAssistant;
