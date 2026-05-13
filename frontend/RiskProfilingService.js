/**
 * RiskProfilingService - Predictive Risk Profiling (Pre-Transaction Intervention)
 *
 * Deterministic, browser-side rules engine that produces a risk profile
 * for a transaction BEFORE money is committed. The score is independent
 * of the legacy `AIRiskService` (which calls an external Python engine).
 *
 * OUTPUT
 * ------
 *   {
 *     score:  number,    // 0-100, higher = riskier
 *     level:  'low' | 'elevated' | 'high',
 *     flags:  Array<{
 *       code:     string,    // machine-readable (e.g. 'NEW_ACCOUNT_HIGH_VALUE')
 *       severity: 'low' | 'medium' | 'high',
 *       message:  string,    // human-readable for the warning banner
 *       weight:   number,    // contribution to the score
 *       signal:   any        // raw value that triggered the rule
 *     }>
 *   }
 *
 * THRESHOLDS (locked in by product decision)
 *   score >= 60   -> 'high'      banner + REQUIRED checkbox before funding
 *   score 30..59  -> 'elevated'  banner only
 *   score < 30    -> 'low'       silent, no UI
 *
 * Each evaluation is cached on the transaction row
 * (`risk_profile_score`, `risk_profile_flags`, `risk_profile_evaluated_at`)
 * so the warning surfaces consistently across renders without re-running
 * the rules every time a card paints.
 *
 * NOTE: A previous version of this service called Gemini to sanity-check
 * the listing's description vs price. That layer was removed because it
 * was generic and low-signal. Gemini is now used only by the post-fund
 * dispute resolution agent (see `DisputeAgentService`). The deterministic
 * rules below carry the entire pre-fund risk evaluation.
 */

class RiskProfilingService {
  /**
   * @param {Object} config
   * @param {Object} config.turso
   * @param {string} config.turso.databaseUrl
   * @param {string} config.turso.authToken
   * @param {Object} [deps] - injected services for risk evaluation
   * @param {TrustEngineService} [deps.trustEngine]
   */
  constructor(config, deps = {}) {
    this.dbService = new TursoDBService(config.turso.databaseUrl, config.turso.authToken);
    this.connected = false;
    this.trustEngine = deps.trustEngine || null;

    // Score thresholds.
    this.HIGH_THRESHOLD = 60;
    this.ELEVATED_THRESHOLD = 30;
  }

  async connect() {
    if (!this.connected) {
      await this.dbService.connect();
      this.connected = true;
    }
  }

  // -------------------------------------------------------------------------
  // PUBLIC API
  // -------------------------------------------------------------------------
  /**
   * Evaluate risk for a transaction.
   *
   * @param {Object} args
   * @param {Object} args.transaction          - the transaction row (or partial: price, item_description, created_at, seller_id, buyer_id)
   * @param {Object} args.counterparty         - the OTHER user from the perspective of whoever's about to commit (e.g. for a buyer about to fund, this is the seller)
   * @param {Object} [args.counterpartyStats]  - optional pre-fetched velocity / cancellation rate / etc.
   * @returns {Promise<{ score: number, level: string, flags: Array }>}
   */
  async evaluate({ transaction, counterparty, counterpartyStats }) {
    const flags = [];

    if (!counterparty) {
      // Without a counterparty there's nothing to profile (e.g. a
      // freshly-created Created-state txn with no buyer yet).
      return { score: 0, level: 'low', flags: [] };
    }

    // Ensure stats — fetch if not pre-supplied.
    let stats = counterpartyStats;
    if (!stats) {
      stats = await this._fetchCounterpartyStats(counterparty.id);
    }

    const txn = transaction || {};
    const price = Number(txn.price) || 0;
    const accountAgeDays = this._accountAgeDays(counterparty.created_at);
    const trustScore = counterparty.trust_score != null
      ? Number(counterparty.trust_score)
      : 50;

    // --- Rule 1: Counterparty trust score is low ---
    if (trustScore < 40) {
      flags.push({
        code: 'COUNTERPARTY_LOW_TRUST',
        severity: 'high',
        weight: 25,
        signal: trustScore,
        message: `The other party has a low Trust Score (${Math.round(trustScore)}/100). Proceed with extra caution.`
      });
    } else if (trustScore < 55) {
      // Soft warning band — we don't add a flag at < 55 because that's
      // most new accounts; trust < 40 is the real signal.
    }

    // --- Rule 2: Newly-created account selling expensive item ---
    if (accountAgeDays !== null && accountAgeDays < 7 && price > 200000) {
      flags.push({
        code: 'NEW_ACCOUNT_HIGH_VALUE',
        severity: 'high',
        weight: 30,
        signal: { accountAgeDays, price },
        message: `This account was created ${accountAgeDays} day${accountAgeDays === 1 ? '' : 's'} ago and is offering a ₦${price.toLocaleString()} transaction — a common scammer pattern.`
      });
    }

    // --- Rule 3: Counterparty has lost multiple disputes ---
    const disputesLost = Number(counterparty.disputes_lost) || 0;
    if (disputesLost >= 2) {
      flags.push({
        code: 'COUNTERPARTY_DISPUTES_LOST',
        severity: 'high',
        weight: 25,
        signal: disputesLost,
        message: `The other party has lost ${disputesLost} prior dispute${disputesLost === 1 ? '' : 's'}.`
      });
    }

    // --- Rule 4: Counterparty cancellation rate is unusually high ---
    const cancelsInitiated = Number(counterparty.total_cancellations_initiated) || 0;
    const totalAttempts = cancelsInitiated + (Number(counterparty.total_completed) || 0);
    if (totalAttempts >= 3 && cancelsInitiated / totalAttempts > 0.3) {
      const pct = Math.round((cancelsInitiated / totalAttempts) * 100);
      flags.push({
        code: 'HIGH_CANCEL_RATE',
        severity: 'medium',
        weight: 15,
        signal: { rate: pct, cancelsInitiated, totalAttempts },
        message: `${pct}% of the other party's recent transactions ended in cancellation.`
      });
    }

    // --- Rule 5: Velocity spike (>5 txns in last 24h) ---
    const velocity = Number(stats.recentTxnCount24h) || 0;
    if (velocity > 5) {
      flags.push({
        code: 'VELOCITY_SPIKE',
        severity: 'medium',
        weight: 10,
        signal: velocity,
        message: `The other party has created ${velocity} transactions in the past 24 hours — unusually high activity.`
      });
    }

    // --- Rule 6: Price >> counterparty's typical average ---
    const avgPrice = Number(stats.avgPrice) || 0;
    if (avgPrice > 0 && price > avgPrice * 3 && price > 100000) {
      flags.push({
        code: 'PRICE_DEVIATES_FROM_HISTORY',
        severity: 'medium',
        weight: 10,
        signal: { price, avgPrice },
        message: `This transaction is ${Math.round(price / avgPrice)}× the other party's typical transaction value.`
      });
    }

    // --- Rule 7: Created at suspicious hour (02:00–05:00 local) ---
    const createdAtHour = this._localHour(txn.created_at || new Date().toISOString());
    if (createdAtHour !== null && createdAtHour >= 2 && createdAtHour < 5) {
      flags.push({
        code: 'OFF_HOURS_CREATION',
        severity: 'low',
        weight: 5,
        signal: createdAtHour,
        message: `Transaction created at ${String(createdAtHour).padStart(2, '0')}:00 local time — outside typical business hours.`
      });
    }

    // --- Rule 8: First-ever transaction by counterparty AND high price ---
    const totalTxns = Number(stats.totalTxns) || 0;
    if (totalTxns <= 1 && price > 500000) {
      flags.push({
        code: 'FIRST_TXN_HIGH_VALUE',
        severity: 'high',
        weight: 20,
        signal: { totalTxns, price },
        message: `This is the other party's first transaction on the platform — and it's a ₦${price.toLocaleString()} one.`
      });
    }

    // --- Aggregate ---
    const score = Math.min(100, flags.reduce((s, f) => s + (Number(f.weight) || 0), 0));
    const level = score >= this.HIGH_THRESHOLD
      ? 'high'
      : score >= this.ELEVATED_THRESHOLD
        ? 'elevated'
        : 'low';

    return { score, level, flags };
  }

  /**
   * Cache the evaluation result on the transaction row so the UI can
   * read it back consistently without re-evaluating.
   * @param {string} transactionId
   * @param {{ score: number, flags: Array }} evaluation
   */
  async cacheOnTransaction(transactionId, evaluation) {
    try {
      await this.connect();
      await this.dbService._executeHttp(
        `UPDATE transactions
            SET risk_profile_score = ?,
                risk_profile_flags = ?,
                risk_profile_evaluated_at = CURRENT_TIMESTAMP
          WHERE transaction_id = ?`,
        [
          evaluation.score,
          JSON.stringify(evaluation.flags || []),
          transactionId
        ]
      );
    } catch (e) {
      console.warn('[RiskProfiling] cache write failed (non-fatal):', e.message);
    }
  }

  /**
   * Convenience: run evaluate + cache in one call.
   */
  async evaluateAndCache({ transaction, counterparty, counterpartyStats }) {
    const evaluation = await this.evaluate({ transaction, counterparty, counterpartyStats });
    if (transaction && transaction.transaction_id) {
      await this.cacheOnTransaction(transaction.transaction_id, evaluation);
    }
    return evaluation;
  }

  /**
   * Read the cached evaluation back off a transaction row. Returns null
   * if not yet evaluated.
   * @param {string} transactionId
   */
  async getCached(transactionId) {
    try {
      await this.connect();
      const result = await this.dbService._executeHttp(
        `SELECT risk_profile_score, risk_profile_flags, risk_profile_evaluated_at
           FROM transactions WHERE transaction_id = ? LIMIT 1`,
        [transactionId]
      );
      const exec = result.results[0]?.response?.result;
      if (!exec || !exec.rows || exec.rows.length === 0) return null;
      const row = exec.rows[0];
      const cell = (i) => {
        const v = row[i];
        return (v && typeof v === 'object' && 'value' in v) ? v.value : v;
      };
      const score = cell(0);
      const flagsRaw = cell(1);
      const evaluatedAt = cell(2);
      if (score == null) return null;
      let flags = [];
      try { flags = flagsRaw ? JSON.parse(flagsRaw) : []; } catch (_) {}
      const num = Number(score);
      return {
        score: num,
        level: num >= this.HIGH_THRESHOLD ? 'high' : num >= this.ELEVATED_THRESHOLD ? 'elevated' : 'low',
        flags,
        evaluatedAt
      };
    } catch (e) {
      console.warn('[RiskProfiling] getCached failed:', e.message);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // INTERNAL
  // -------------------------------------------------------------------------
  /**
   * Pull the velocity, avg price, and total-txn-count for a counterparty
   * in a single round-trip. Falls back to zeros on error.
   * @private
   */
  async _fetchCounterpartyStats(userId) {
    const fallback = { recentTxnCount24h: 0, avgPrice: 0, totalTxns: 0 };
    if (!userId) return fallback;
    try {
      await this.connect();
      const result = await this.dbService._executeHttp(
        `SELECT
            (SELECT COUNT(*) FROM transactions
              WHERE (seller_id = ? OR buyer_id = ?)
                AND created_at >= datetime('now', '-1 day')) AS recent24h,
            (SELECT AVG(price) FROM transactions
              WHERE (seller_id = ? OR buyer_id = ?)) AS avgPrice,
            (SELECT COUNT(*) FROM transactions
              WHERE (seller_id = ? OR buyer_id = ?)) AS totalTxns`,
        [userId, userId, userId, userId, userId, userId]
      );
      const exec = result.results[0]?.response?.result;
      if (!exec || !exec.rows || exec.rows.length === 0) return fallback;
      const row = exec.rows[0];
      const cell = (i) => {
        const v = row[i];
        return (v && typeof v === 'object' && 'value' in v) ? v.value : v;
      };
      return {
        recentTxnCount24h: Number(cell(0)) || 0,
        avgPrice: Number(cell(1)) || 0,
        totalTxns: Number(cell(2)) || 0
      };
    } catch (e) {
      console.warn('[RiskProfiling] _fetchCounterpartyStats failed:', e.message);
      return fallback;
    }
  }

  /** @private */
  _accountAgeDays(createdAt) {
    if (!createdAt) return null;
    const t = new Date(createdAt).getTime();
    if (!isFinite(t)) return null;
    return Math.max(0, Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24)));
  }

  /** @private */
  _localHour(iso) {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return null;
      return d.getHours();
    } catch (_) {
      return null;
    }
  }
}

if (typeof window !== 'undefined') {
  window.RiskProfilingService = RiskProfilingService;
}
