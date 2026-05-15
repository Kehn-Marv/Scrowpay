/**
 * DisputeAgentService - Gemini-powered escrow dispute resolution agent.
 *
 * WHAT THIS DOES
 * --------------
 * Replaces the old rule-of-thumb dispute scoring (description length +
 * photo count + keyword matches) with a real multimodal LLM judgement.
 * The agent receives:
 *   - the full transaction context (price, listing, both parties' trust
 *     stats, state history, prior risk verdict)
 *   - the user's free-text complaint
 *   - any uploaded photos as evidence (sent inline as base64)
 * and returns a STRICTLY-shaped JSON verdict that the existing
 * DisputeService can act on (refund / release / split + confidence).
 *
 * CONVERSATION SHAPE
 * ------------------
 * The agent is single-call by default. It MAY ask exactly ONE clarifying
 * question if the evidence is genuinely ambiguous. The UI feeds the
 * answer back in via `analyze()` again with `priorTurn` populated. We
 * cap clarifications at 1 to keep the flow bounded — if the agent still
 * can't decide after the clarifier, it returns a low-confidence verdict
 * which routes the case to manual review.
 *
 * RESILIENCE
 * ----------
 * - Missing/empty API key  -> `available = false`, callers must fall
 *   back to manual review (low-confidence verdict, no auto-execute).
 * - Network / timeout / non-JSON -> single warning log, returns a
 *   structured `{ action: 'rule', confidence: 0, ... }` so the caller
 *   never has to handle a thrown exception in the dispute flow.
 *
 * VERDICT SHAPE (JSON returned to caller)
 * ---------------------------------------
 *   {
 *     action:               'ask' | 'rule',
 *     clarifyingQuestion:   string,           // when action=ask
 *     greeting:             string,           // friendly first-turn line
 *     favoredParty:         'buyer' | 'seller' | 'split' | null,
 *     confidence:           number,           // 0-1
 *     payout:               { buyerPct, sellerPct },
 *     reasoning:            string,           // <= 300 chars
 *     evidenceCited:        string[]
 *   }
 */

class DisputeAgentService {
  constructor() {
    const cfg = (typeof window !== 'undefined' && window.GEMINI_CONFIG) || {};
    this.apiKey = cfg.apiKey || '';
    // Use a vision-capable model. 2.0 flash handles inline images and
    // strict-JSON responses cheaply, which is what we need.
    this.model = cfg.model || 'gemini-2.0-flash';
    // Disputes are higher-stakes than the old description check, so we
    // give the model a bit more time before timing out. Still kept
    // tight enough that the modal feels responsive.
    this.timeoutMs = Number(cfg.timeoutMs) || 12000;
    this.enabled = cfg.enabled !== false;

    // Hard cap on the number of inline photos we send. Each photo is
    // base64-encoded and counts against the request body size, plus
    // Gemini latency scales with image count.
    this.MAX_PHOTOS = 4;
    // Per-photo cap (~2MB raw). We don't downscale here — we just drop
    // anything bigger than this from the payload to avoid 413s.
    this.MAX_PHOTO_BYTES = 2 * 1024 * 1024;
  }

  /** True if a usable Gemini key is configured and the service is enabled. */
  get available() {
    return Boolean(this.enabled && this.apiKey && this.apiKey.length > 8);
  }

  /**
   * Analyze a dispute. Single round-trip by default; pass `priorTurn`
   * with the user's answer to a clarifying question for a follow-up.
   *
   * @param {Object} args
   * @param {Object} args.transaction       - the transactions row
   * @param {Object} args.buyerStats        - { trust_score, successful_deliveries, disputes_lost, account_age_days }
   * @param {Object} args.sellerStats       - same shape
   * @param {Array}  [args.stateHistory]    - rows from transaction_state_history
   * @param {string} args.raisedBy          - 'buyer' | 'seller'
   * @param {string} args.userMessage       - the user's complaint
   * @param {Array<string>} [args.photos]   - base64 data URLs (data:image/...;base64,...)
   * @param {Object} [args.priorTurn]       - { question: string, answer: string } if this is a follow-up
   * @returns {Promise<Object>} verdict (see header for shape)
   */
  async analyze(args) {
    if (!this.available) {
      // No key — emit a deterministic "needs human" verdict so the caller
      // can short-circuit straight to manual review.
      return this._manualReviewVerdict('Dispute Agent unavailable (no API key configured).');
    }

    const prompt = this._buildPrompt(args);
    const photoParts = this._photosToParts(args.photos || []);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const body = {
      contents: [{
        role: 'user',
        parts: [{ text: prompt }, ...photoParts]
      }],
      generationConfig: {
        // Slightly above zero so the model can actually weigh nuance,
        // but low enough that the verdict shape stays stable across runs.
        temperature: 0.3,
        maxOutputTokens: 600,
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
        console.warn('[DisputeAgent] non-OK status:', res.status);
        return this._manualReviewVerdict(`Agent service returned HTTP ${res.status}.`);
      }

      const json = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        return this._manualReviewVerdict('Agent returned an empty response.');
      }

      const parsed = this._safeParseJson(text);
      if (!parsed) {
        return this._manualReviewVerdict('Agent returned malformed JSON.');
      }

      return this._normalizeVerdict(parsed);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        console.warn('[DisputeAgent] request timed out after', this.timeoutMs, 'ms');
        return this._manualReviewVerdict('Agent timed out. Routing to manual review.');
      }
      console.warn('[DisputeAgent] request failed:', err.message);
      return this._manualReviewVerdict('Agent request failed. Routing to manual review.');
    }
  }

  // ---------------------------------------------------------------------------
  // INTERNAL
  // ---------------------------------------------------------------------------
  /**
   * Build the strict-JSON prompt the model must obey. We embed the
   * entire transaction context inline so the model never needs to call
   * a tool — keeps the implementation single-shot and dependency-free.
   * @private
   */
  _buildPrompt({ transaction, buyerStats, sellerStats, stateHistory, raisedBy, userMessage, priorTurn }) {
    const txn = transaction || {};
    const ctx = {
      transaction: {
        id: txn.transaction_id,
        state: txn.state,
        price_ngn: Number(txn.price) || 0,
        listing_description: txn.item_description,
        delivery_timeline_days: txn.delivery_timeline_days,
        created_at: txn.created_at,
        funded_at: txn.funded_at,
        shipped_at: txn.shipped_at,
        prior_risk_verdict: {
          score: txn.risk_score != null ? Number(txn.risk_score) : null,
          verdict: txn.ai_verdict || null
        }
      },
      buyer: this._safeStats(buyerStats),
      seller: this._safeStats(sellerStats),
      state_history: Array.isArray(stateHistory) ? stateHistory.slice(0, 20) : [],
      raised_by: raisedBy === 'seller' ? 'seller' : 'buyer',
      user_message: String(userMessage || '').slice(0, 2000)
    };

    let priorTurnBlock = '';
    if (priorTurn && priorTurn.question && priorTurn.answer) {
      priorTurnBlock = `\n\nEARLIER IN THIS DISPUTE\nYou previously asked: """${String(priorTurn.question).slice(0, 500)}"""\nThe user answered: """${String(priorTurn.answer).slice(0, 1000)}"""\nYou MUST now decide (action="rule"). Do not ask another question.`;
    }

    return `You are the ScrowPay Dispute Resolution Agent for a Nigerian peer-to-peer escrow service. You make BINDING rulings on escrow disputes based on the transaction context, both parties' history, and any photo evidence provided.

YOUR JOB
- Decide whether the escrowed funds should be refunded to the buyer, released to the seller, or split between them.
- A "split" verdict is ONLY appropriate when both parties share clear fault. Do not split as a default.
- Confidence reflects how strongly the evidence supports your ruling. If evidence is weak or contradictory, set confidence below 0.85 so the case routes to a human.
- You MAY ask ONE clarifying question (action="ask") if a single missing fact would let you decide confidently. Do not ask more than once.${priorTurnBlock}

WEIGHTING GUIDELINES
- A user with a high trust score and many successful deliveries gets a marginal benefit of the doubt — but EVIDENCE matters more than reputation.
- A brand-new account raising a high-value dispute with no photos is suspicious.
- Photos that clearly show damage / wrong item / packaging tampering / non-delivery proof are STRONG evidence.
- If the disputer is the seller, evaluate whether the buyer is plausibly stalling acceptance vs. genuinely reporting an issue.
- Consider the timeline: a dispute opened minutes after shipment is suspicious; a dispute opened after the inspection window is harder to credit.

CONTEXT (JSON)
${JSON.stringify(ctx, null, 2)}

ANY ATTACHED IMAGES BELOW THIS POINT ARE EVIDENCE THE DISPUTING USER UPLOADED.

RESPONSE FORMAT — STRICT JSON, NO PROSE OUTSIDE THE JSON
{
  "action": "ask" | "rule",
  "greeting": "<= 200 char friendly first line that acknowledges the user and references one concrete fact from the transaction context",
  "clarifying_question": "<= 200 chars, ONLY when action=ask",
  "favored_party": "buyer" | "seller" | "split" | null,
  "confidence": <number between 0 and 1>,
  "payout": { "buyer_pct": <0-100>, "seller_pct": <0-100> },
  "reasoning": "<= 300 chars, plain English explanation cited to facts and evidence",
  "evidence_cited": ["<= 80 char item, e.g. 'photo_1: clear screen crack visible'"]
}

If action="ask", set favored_party=null, confidence=0, payout={buyer_pct:0,seller_pct:0}, evidence_cited=[].
If action="rule", buyer_pct + seller_pct MUST equal 100.`;
  }

  /**
   * Strip data-URL prefixes off photo strings and convert each into a
   * Gemini `inlineData` part. Drops anything that isn't an image data URL
   * or is over the size cap.
   * @private
   */
  _photosToParts(photos) {
    const parts = [];
    for (const p of photos.slice(0, this.MAX_PHOTOS)) {
      if (typeof p !== 'string' || !p.startsWith('data:image/')) continue;
      const m = p.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!m) continue;
      const mimeType = m[1];
      const data = m[2];
      // Rough size check: base64 is ~4/3 the byte size.
      if (data.length * 0.75 > this.MAX_PHOTO_BYTES) continue;
      parts.push({ inlineData: { mimeType, data } });
    }
    return parts;
  }

  /** @private */
  _safeStats(s) {
    const o = s || {};
    return {
      trust_score: o.trust_score != null ? Number(o.trust_score) : null,
      successful_deliveries: Number(o.successful_deliveries) || 0,
      disputes_lost: Number(o.disputes_lost) || 0,
      disputes_won: Number(o.disputes_won) || 0,
      account_age_days: o.account_age_days != null ? Number(o.account_age_days) : null
    };
  }

  /** @private */
  _safeParseJson(text) {
    try {
      return JSON.parse(text);
    } catch (_) {
      // Sometimes models wrap JSON in fences — try to recover.
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return null;
      try { return JSON.parse(m[0]); } catch (_) { return null; }
    }
  }

  /**
   * Coerce the parsed model output into our canonical verdict shape.
   * Any deviation from spec is clamped to safe defaults.
   * @private
   */
  _normalizeVerdict(parsed) {
    const action = parsed.action === 'ask' ? 'ask' : 'rule';
    const greeting = String(parsed.greeting || 'Hi, I\'m the ScrowPay Dispute Agent.').slice(0, 240);

    if (action === 'ask') {
      const q = String(parsed.clarifying_question || 'Can you tell me a bit more about what happened?').slice(0, 240);
      return {
        action: 'ask',
        greeting,
        clarifyingQuestion: q,
        favoredParty: null,
        confidence: 0,
        payout: { buyerPct: 0, sellerPct: 0 },
        reasoning: '',
        evidenceCited: []
      };
    }

    let favored = parsed.favored_party;
    if (!['buyer', 'seller', 'split'].includes(favored)) favored = 'split';

    let confidence = Number(parsed.confidence);
    if (!Number.isFinite(confidence)) confidence = 0;
    confidence = Math.max(0, Math.min(1, confidence));

    let buyerPct = Number(parsed.payout?.buyer_pct);
    let sellerPct = Number(parsed.payout?.seller_pct);
    if (!Number.isFinite(buyerPct) || !Number.isFinite(sellerPct) || (buyerPct + sellerPct !== 100)) {
      // Repair the split based on favored_party so we always send a
      // valid payout downstream.
      if (favored === 'buyer') { buyerPct = 100; sellerPct = 0; }
      else if (favored === 'seller') { buyerPct = 0; sellerPct = 100; }
      else { buyerPct = 50; sellerPct = 50; }
    }

    const reasoning = String(parsed.reasoning || '').slice(0, 300);
    const evidenceCited = Array.isArray(parsed.evidence_cited)
      ? parsed.evidence_cited.slice(0, 8).map(s => String(s).slice(0, 120))
      : [];

    return {
      action: 'rule',
      greeting,
      clarifyingQuestion: '',
      favoredParty: favored,
      confidence,
      payout: { buyerPct, sellerPct },
      reasoning,
      evidenceCited
    };
  }

  /** @private */
  _manualReviewVerdict(reason) {
    return {
      action: 'rule',
      greeting: 'Hi, I\'m the ScrowPay Dispute Agent.',
      clarifyingQuestion: '',
      favoredParty: null,
      confidence: 0,
      payout: { buyerPct: 0, sellerPct: 0 },
      reasoning: reason || 'Routing to manual review.',
      evidenceCited: []
    };
  }
}

if (typeof window !== 'undefined') {
  window.DisputeAgentService = DisputeAgentService;
}
