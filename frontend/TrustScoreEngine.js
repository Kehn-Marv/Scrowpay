/**
 * TrustScoreEngine - Weighted signal aggregator for ScrowPay
 *
 * Combines verification signals, AI image/text scores, and behavioural
 * data into a single 0-100 trust score and a final AI decision.
 *
 * This is intentionally rule-based (no ML needed) — the intelligence
 * comes from the Gemini-generated decision narrative.
 */

class TrustScoreEngine {
  /**
   * @param {GeminiAIService} geminiService
   */
  constructor(geminiService) {
    this.gemini = geminiService;
  }

  // ─── Signal weights ──────────────────────────────────────────────────────
  static WEIGHTS = {
    faceVerified:        +30,
    idVerified:          +20,
    productImageUploaded:+10,
    authenticityHigh:    +20,  // authenticity_score >= 75
    authenticityMedium:  +10,  // authenticity_score 50-74
    authenticityLow:     -20,  // authenticity_score < 50
    scamLow:             +10,  // scam_probability < 30
    scamMedium:          -10,  // scam_probability 30-60
    scamHigh:            -30,  // scam_probability > 60
    newSeller:           -10,
    deliveryVerified:    +15,
    suspiciousImage:     -25,
  };

  /**
   * Calculate trust score from raw signals.
   *
   * @param {Object} signals
   * @param {boolean} signals.faceVerified
   * @param {boolean} signals.idVerified
   * @param {boolean} [signals.productImageUploaded]
   * @param {number}  [signals.authenticityScore]   - 0-100 from Gemini vision
   * @param {number}  [signals.scamProbability]     - 0-100 from Gemini text
   * @param {boolean} [signals.isNewSeller]
   * @param {boolean} [signals.deliveryVerified]
   * @param {boolean} [signals.suspiciousImageFlag]
   * @returns {{ score: number, breakdown: Object }}
   */
  calculateScore(signals) {
    const W = TrustScoreEngine.WEIGHTS;
    let score = 50; // neutral baseline
    const breakdown = {};

    if (signals.faceVerified) {
      score += W.faceVerified;
      breakdown.faceVerified = `+${W.faceVerified}`;
    }
    if (signals.idVerified) {
      score += W.idVerified;
      breakdown.idVerified = `+${W.idVerified}`;
    }
    if (signals.productImageUploaded) {
      score += W.productImageUploaded;
      breakdown.productImageUploaded = `+${W.productImageUploaded}`;
    }

    // Authenticity score bands
    if (signals.authenticityScore !== undefined) {
      if (signals.authenticityScore >= 75) {
        score += W.authenticityHigh;
        breakdown.authenticity = `+${W.authenticityHigh} (high)`;
      } else if (signals.authenticityScore >= 50) {
        score += W.authenticityMedium;
        breakdown.authenticity = `+${W.authenticityMedium} (medium)`;
      } else {
        score += W.authenticityLow;
        breakdown.authenticity = `${W.authenticityLow} (low)`;
      }
    }

    // Scam probability bands
    if (signals.scamProbability !== undefined) {
      if (signals.scamProbability < 30) {
        score += W.scamLow;
        breakdown.scamRisk = `+${W.scamLow} (low scam risk)`;
      } else if (signals.scamProbability <= 60) {
        score += W.scamMedium;
        breakdown.scamRisk = `${W.scamMedium} (medium scam risk)`;
      } else {
        score += W.scamHigh;
        breakdown.scamRisk = `${W.scamHigh} (high scam risk)`;
      }
    }

    if (signals.isNewSeller) {
      score += W.newSeller;
      breakdown.newSeller = `${W.newSeller}`;
    }
    if (signals.deliveryVerified) {
      score += W.deliveryVerified;
      breakdown.deliveryVerified = `+${W.deliveryVerified}`;
    }
    if (signals.suspiciousImageFlag) {
      score += W.suspiciousImage;
      breakdown.suspiciousImage = `${W.suspiciousImage}`;
    }

    // Clamp 0-100
    score = Math.max(0, Math.min(100, Math.round(score)));

    return { score, breakdown };
  }

  /**
   * Full AI analysis pipeline:
   *  1. Optionally analyze product image (Gemini Vision)
   *  2. Analyze transaction text (Gemini NLP)
   *  3. Calculate trust score
   *  4. Generate AI decision narrative (Gemini)
   *
   * @param {Object} params
   * @param {string}  params.description
   * @param {number}  params.amount
   * @param {boolean} params.faceVerified
   * @param {boolean} params.idVerified
   * @param {boolean} [params.isNewSeller]
   * @param {string}  [params.imageBase64]   - optional product image
   * @param {string}  [params.imageMimeType]
   * @returns {Promise<{
   *   trustScore: number,
   *   breakdown: Object,
   *   imageAnalysis: Object|null,
   *   textAnalysis: Object,
   *   decision: Object,
   *   allFlags: string[]
   * }>}
   */
  async runFullAnalysis(params) {
    console.log('[TrustScoreEngine] Starting full AI analysis...');

    // 1. Image analysis (optional)
    let imageAnalysis = null;
    if (params.imageBase64) {
      imageAnalysis = await this.gemini.analyzeProductImage(
        params.imageBase64,
        params.imageMimeType || 'image/jpeg'
      );
      console.log('[TrustScoreEngine] Image analysis:', imageAnalysis);
    }

    // 2. Text analysis
    const textAnalysis = await this.gemini.analyzeTransactionText(
      params.description,
      params.amount
    );
    console.log('[TrustScoreEngine] Text analysis:', textAnalysis);

    // 3. Build signals object
    const signals = {
      faceVerified:         params.faceVerified,
      idVerified:           params.idVerified,
      isNewSeller:          params.isNewSeller || false,
      productImageUploaded: !!params.imageBase64,
      authenticityScore:    imageAnalysis?.authenticity_score,
      scamProbability:      textAnalysis?.scam_probability,
      suspiciousImageFlag:  imageAnalysis?.risk_level === 'High'
    };

    // 4. Calculate score
    const { score, breakdown } = this.calculateScore(signals);
    console.log('[TrustScoreEngine] Trust score:', score, breakdown);

    // 5. Collect all flags
    const allFlags = [
      ...(imageAnalysis?.flags || []),
      ...(textAnalysis?.flags || [])
    ];

    // 6. AI decision narrative
    const decision = await this.gemini.generateTrustDecision({
      trustScore:        score,
      faceVerified:      params.faceVerified,
      idVerified:        params.idVerified,
      authenticityScore: imageAnalysis?.authenticity_score,
      scamProbability:   textAnalysis?.scam_probability,
      flags:             allFlags,
      amount:            params.amount
    });
    console.log('[TrustScoreEngine] Decision:', decision);

    return {
      trustScore: score,
      breakdown,
      imageAnalysis,
      textAnalysis,
      decision,
      allFlags
    };
  }
}

if (typeof window !== 'undefined') {
  window.TrustScoreEngine = TrustScoreEngine;
}
