/**
 * TrustEngineService - The Dynamic Trust Engine (Reputation Graph)
 *
 * Maintains a per-user Trust Score in [0, 100] that updates after every
 * terminal-state event. The score is stored on the `users` row as a
 * cached value (`trust_score`) and is the single source of truth read
 * by the dashboard, transaction cards, and the risk-profiling engine.
 *
 * DESIGN
 * ------
 * Every signal is captured as a CUMULATIVE counter on the user row
 * (e.g. `successful_deliveries`, `disputes_lost`). When a recalc runs,
 * we read the current counters and apply a deterministic formula to
 * produce the new score. This is O(1) per event and never re-aggregates
 * the entire history — important because Turso requests are network
 * round-trips.
 *
 * Every score change is appended to `trust_score_history` so the UI
 * can show a sparkline and a "What changed?" tooltip.
 *
 * TIERS
 *   0–39   Low      (red)    surfaces buyer warnings
 *   40–69  Building (yellow) neutral
 *   70–94  Trusted  (green)  no flags from this side
 *   95–100 Elite    (gold)   eligible for Instant Escrow Release
 *
 * This service is deliberately separate from the legacy `TrustScoreService`
 * (which was unwired and only counted Completed-vs-Disputed). We keep
 * `TrustScoreService` around to avoid breaking imports, but all new code
 * should call `TrustEngineService`.
 */

class TrustEngineService {
  /**
   * @param {Object} config
   * @param {Object} config.turso
   * @param {string} config.turso.databaseUrl
   * @param {string} config.turso.authToken
   */
  constructor(config) {
    this.dbService = new TursoDBService(config.turso.databaseUrl, config.turso.authToken);
    this.connected = false;

    // Default for new users with no signal yet. 50 = neutral.
    this.DEFAULT_SCORE = 50;

    // Instant Escrow Release thresholds (locked in via product decision —
    // conservative tier so a single account compromise can't drain).
    this.IR_MIN_SCORE = 95;
    this.IR_MIN_SUCCESSFUL_DELIVERIES = 10;
    this.IR_MAX_DISPUTES_LOST = 0;
  }

  async connect() {
    if (!this.connected) {
      await this.dbService.connect();
      this.connected = true;
    }
  }

  // -------------------------------------------------------------------------
  // FORMULA
  // -------------------------------------------------------------------------
  /**
   * Pure function: given a user counters object, returns the score.
   *
   * Kept pure so we can unit-test it without a database and so the
   * "What changed?" tooltip can preview a hypothetical score change
   * without hitting the network.
   *
   * @param {Object} c - counters
   * @returns {number} score in [0, 100], rounded to 1 decimal
   */
  computeScore(c) {
    const successful_deliveries = Number(c.successful_deliveries) || 0;
    const total_completed = Number(c.total_completed) || 0;
    const total_cancellations_initiated = Number(c.total_cancellations_initiated) || 0;
    const mutual_cancellations = Number(c.mutual_cancellations) || 0;
    const disputes_won = Number(c.disputes_won) || 0;
    const disputes_lost = Number(c.disputes_lost) || 0;
    const late_deliveries = Number(c.late_deliveries) || 0;
    const failed_join_attempts = Number(c.failed_join_attempts) || 0;
    const total_volume_ngn = Number(c.total_volume_ngn) || 0;

    let score = 50; // neutral baseline for everyone

    // ---- Positive contributions ----
    // Reward repeat success, but capped so a whale with 1000 deliveries
    // doesn't drown out the rest of the signal.
    score += Math.min(30, successful_deliveries * 1.5);

    // Peer-graph diversity penalty. `distinct_dispute_losers` is the
    // number of DIFFERENT counterparties this user has lost a dispute
    // to. Five losses to five different counterparties is dramatically
    // worse than five to the same chronic complainer — the former is
    // scammer-shaped, the latter is one ongoing feud. We add an extra
    // -3 per distinct loser BEYOND 1, capped at -15.
    const distinct_dispute_losers = Number(c.distinct_dispute_losers) || 0;
    if (distinct_dispute_losers > 1) {
      score -= Math.min(15, (distinct_dispute_losers - 1) * 3);
    }

    // Temporal decay on inactivity. Trust naturally erodes if a user
    // hasn't completed a transaction in a long time — old reputation
    // shouldn't shield a dormant account that wakes up to defraud. We
    // start the decay at 90 days idle and cap it at -10.
    const last_activity_at = c.last_activity_at || c.trust_score_updated_at;
    if (last_activity_at && total_completed > 0) {
      const lastTs = new Date(last_activity_at).getTime();
      if (isFinite(lastTs)) {
        const idleDays = Math.max(0, (Date.now() - lastTs) / 86400000);
        if (idleDays > 90) {
          // Linear ramp from 0 (90d) to -10 (270d).
          const decay = Math.min(10, ((idleDays - 90) / 180) * 10);
          score -= decay;
        }
      }
    }

    // Diminishing-return reward on monetary volume. ln-based so the first
    // ₦100k matters more than the millionth.
    score += Math.min(15, Math.log(total_volume_ngn / 100000 + 1) * 5);

    // Successfully defended disputes prove counterparty was at fault —
    // strong positive signal.
    score += Math.min(10, disputes_won * 5);

    // On-time-delivery bonus: of all completed transactions, fraction
    // that were NOT late, scaled to +5.
    if (total_completed > 0) {
      const onTimeRate = 1 - (late_deliveries / total_completed);
      score += Math.max(0, onTimeRate * 5);
    }

    // ---- AI / Anomaly risk factor ----
    // The AnomalyDetectionEngine (rules + ML) produces a
    // composite 0–100 risk score. We fold it in as a negative factor:
    // a score of 0 means the engine sees nothing unusual (no penalty);
    // a score of 100 means full-spectrum red flags (up to -20).
    // This makes the anomaly engine one more piece of the unified trust
    // umbrella instead of a standalone blocker.
    const anomalyRisk = Math.max(0, Math.min(100, Number(c.last_anomaly_score) || 0));
    score -= (anomalyRisk / 100) * 20;

    // ---- Negative contributions ----
    // Losing a dispute is the single most damning signal — scammer-shaped.
    score -= disputes_lost * 15;

    // Initiating cancellations is mildly bad (canceling Created-state
    // before the buyer even joins is normal correction; doing it
    // repeatedly looks like list-then-bait behavior).
    score -= total_cancellations_initiated * 3;

    // Pattern penalty: sustained cancellation behavior is much worse
    // than the occasional cancellation.
    if (total_cancellations_initiated > 5) {
      score -= (total_cancellations_initiated - 5) * 4;
    }

    // Mutual cancellations are very mild — both parties agreed, no harm
    // done — but still slightly suboptimal vs. a clean completion.
    score -= mutual_cancellations * 1;

    // Late deliveries indicate poor reliability.
    score -= late_deliveries * 2;

    // Failed shortcode attempts (typos / brute force / wrong txn) —
    // capped contribution but ramps up to discourage abuse.
    score -= Math.min(20, failed_join_attempts * 2);

    // Clamp + round to 1 decimal for stability in the UI.
    const clamped = Math.max(0, Math.min(100, score));
    return Math.round(clamped * 10) / 10;
  }

  /**
   * Maps a numeric score to a tier descriptor used by the UI.
   * @param {number} score
   * @returns {{ tier: string, label: string, color: string, bg: string, border: string }}
   */
  tierFor(score) {
    if (score >= 95) {
      return {
        tier: 'elite',
        label: 'Elite',
        color: '#92400e',         // amber-800 text
        bg: '#fef3c7',            // amber-100 bg
        border: '#f59e0b',        // amber-500 border
        icon: 'star'
      };
    }
    if (score >= 70) {
      return {
        tier: 'trusted',
        label: 'Trusted',
        color: '#15803d',
        bg: '#dcfce7',
        border: '#16a34a',
        icon: 'check'
      };
    }
    if (score >= 40) {
      return {
        tier: 'building',
        label: 'Building',
        color: '#854d0e',
        bg: '#fef9c3',
        border: '#ca8a04',
        icon: 'circle'
      };
    }
    return {
      tier: 'low',
      label: 'Low',
      color: '#b91c1c',
      bg: '#fee2e2',
      border: '#dc2626',
      icon: 'alert'
    };
  }

  /**
   * @param {Object} userOrCounters - either a full users-row or just counters
   * @returns {boolean} whether this user should currently bypass the inspection window
   */
  isInstantReleaseEligible(userOrCounters) {
    const score = userOrCounters.trust_score != null
      ? Number(userOrCounters.trust_score)
      : this.computeScore(userOrCounters);
    const successful = Number(userOrCounters.successful_deliveries) || 0;
    const lost = Number(userOrCounters.disputes_lost) || 0;
    return (
      score >= this.IR_MIN_SCORE &&
      successful >= this.IR_MIN_SUCCESSFUL_DELIVERIES &&
      lost <= this.IR_MAX_DISPUTES_LOST
    );
  }

  // -------------------------------------------------------------------------
  // DB INTERACTION
  // -------------------------------------------------------------------------
  /**
   * Fetches the counter columns from the users row.
   * Returns an object with all counters; missing/null values default to 0.
   * @param {number} userId
   * @returns {Promise<Object|null>} counters or null if user not found
   */
  async _fetchCounters(userId) {
    await this.connect();
    const sql = `
      SELECT
        trust_score,
        successful_deliveries,
        total_completed,
        total_cancellations_initiated,
        mutual_cancellations,
        disputes_won,
        disputes_lost,
        late_deliveries,
        failed_join_attempts,
        total_volume_ngn,
        avg_fulfillment_hours,
        created_at,
        last_anomaly_score
      FROM users WHERE id = ? LIMIT 1
    `;
    const result = await this.dbService._executeHttp(sql, [userId]);
    const exec = result.results[0]?.response?.result;
    if (!exec || !exec.rows || exec.rows.length === 0) return null;

    const cols = exec.cols;
    const row = exec.rows[0];
    const obj = {};
    cols.forEach((col, idx) => {
      const cell = row[idx];
      const value = (cell && typeof cell === 'object' && 'value' in cell) ? cell.value : cell;
      obj[col.name] = value;
    });
    return obj;
  }

  /**
   * Atomic counter increment + score recalculation.
   *
   * Why a single function instead of separate `incrementCounter` and
   * `recalculate` calls: keeps each terminal-state hook to a single
   * round-trip path and ensures the history row reflects the actual
   * cause (`reason`) of the score change.
   *
   * @param {Object} args
   * @param {number} args.userId         - user whose score is changing
   * @param {Object} args.deltas         - { counter_name: number_to_add, ... }
   * @param {string} args.reason         - human-readable reason (stored in history)
   * @param {string} [args.transactionId]- linked transaction (optional)
   * @param {Object} [args.metadata]     - any extra JSON-serializable context
   * @returns {Promise<{ score: number, scoreBefore: number, delta: number, tier: Object }>}
   */
  async applySignal({ userId, deltas = {}, reason, transactionId = null, metadata = null }) {
    if (!userId) {
      console.warn('[TrustEngine] applySignal called without userId');
      return null;
    }
    try {
      await this.connect();

      // Read current counters to compute the "before" score for history.
      const before = await this._fetchCounters(userId);
      if (!before) {
        console.warn('[TrustEngine] User not found:', userId);
        return null;
      }
      const scoreBefore = before.trust_score != null
        ? Number(before.trust_score)
        : this.computeScore(before);

      // Build the SET clause from deltas. Each delta is added to the
      // existing column value via `col = COALESCE(col, 0) + ?`.
      const allowed = new Set([
        'successful_deliveries',
        'total_completed',
        'total_cancellations_initiated',
        'mutual_cancellations',
        'disputes_won',
        'disputes_lost',
        'late_deliveries',
        'failed_join_attempts',
        'total_volume_ngn',
        'distinct_dispute_losers',
        'last_anomaly_score'
      ]);

      const setClauses = [];
      const args = [];
      const projected = { ...before };

      for (const [key, val] of Object.entries(deltas)) {
        if (!allowed.has(key)) {
          console.warn('[TrustEngine] Ignoring unknown counter:', key);
          continue;
        }
        if (typeof val !== 'number' || !isFinite(val)) continue;
        setClauses.push(`${key} = COALESCE(${key}, 0) + ?`);
        args.push(val);
        projected[key] = (Number(projected[key]) || 0) + val;
      }

      // Compute the new score from PROJECTED counters (what the row will
      // look like after the UPDATE). This avoids a second round-trip
      // just to read back the counters.
      const scoreAfter = this.computeScore(projected);
      const delta = Math.round((scoreAfter - scoreBefore) * 10) / 10;

      // Always update score + timestamp + last_activity_at, even when
      // no counter deltas were provided (e.g. a manual recalc).
      setClauses.push('trust_score = ?');
      args.push(scoreAfter);
      setClauses.push('trust_score_updated_at = CURRENT_TIMESTAMP');
      setClauses.push('last_activity_at = CURRENT_TIMESTAMP');

      const updateSql = `UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`;
      args.push(userId);
      await this.dbService._executeHttp(updateSql, args);

      // Append to history (best-effort; never break the main flow).
      try {
        await this.dbService._executeHttp(
          `INSERT INTO trust_score_history
             (user_id, score_before, score_after, delta, reason, transaction_id, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            scoreBefore,
            scoreAfter,
            delta,
            reason || 'unspecified',
            transactionId,
            metadata ? JSON.stringify(metadata) : null
          ]
        );
      } catch (histErr) {
        console.warn('[TrustEngine] history append failed:', histErr.message);
      }

      const tier = this.tierFor(scoreAfter);
      console.log('[TrustEngine] applySignal OK:', {
        userId, reason, scoreBefore, scoreAfter, delta, tier: tier.tier
      });
      return { score: scoreAfter, scoreBefore, delta, tier };
    } catch (err) {
      console.error('[TrustEngine] applySignal failed:', err);
      // Never throw — trust score updates are best-effort and must
      // never block the transaction flow.
      return null;
    }
  }

  /**
   * Reads the cached score for a user. Returns the default if user not
   * found or the cached value is null (unmigrated row).
   *
   * @param {number} userId
   * @returns {Promise<{ score: number, tier: Object, isDefault: boolean, counters?: Object }>}
   */
  async getScore(userId) {
    try {
      const counters = await this._fetchCounters(userId);
      if (!counters) {
        return {
          score: this.DEFAULT_SCORE,
          tier: this.tierFor(this.DEFAULT_SCORE),
          isDefault: true
        };
      }
      const score = counters.trust_score != null
        ? Number(counters.trust_score)
        : this.computeScore(counters);
      return {
        score,
        tier: this.tierFor(score),
        isDefault: counters.trust_score == null,
        counters
      };
    } catch (err) {
      console.error('[TrustEngine] getScore failed:', err);
      return {
        score: this.DEFAULT_SCORE,
        tier: this.tierFor(this.DEFAULT_SCORE),
        isDefault: true
      };
    }
  }

  /**
   * Recent history for a user (most recent first). Used by the score-
   * detail panel to show a sparkline and the last few "what changed"
   * entries.
   * @param {number} userId
   * @param {number} [limit=20]
   */
  async getHistory(userId, limit = 20) {
    try {
      await this.connect();
      const result = await this.dbService._executeHttp(
        `SELECT score_before, score_after, delta, reason, transaction_id, created_at
         FROM trust_score_history
         WHERE user_id = ?
         ORDER BY created_at DESC LIMIT ?`,
        [userId, limit]
      );
      const exec = result.results[0]?.response?.result;
      if (!exec || !exec.rows) return [];
      const cols = exec.cols;
      return exec.rows.map(row => {
        const obj = {};
        cols.forEach((col, idx) => {
          const cell = row[idx];
          obj[col.name] = (cell && typeof cell === 'object' && 'value' in cell) ? cell.value : cell;
        });
        return obj;
      });
    } catch (err) {
      console.error('[TrustEngine] getHistory failed:', err);
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // SEMANTIC HELPERS
  // -------------------------------------------------------------------------
  // These wrap applySignal with the right counter-deltas + reason for
  // each terminal-state event. Call these from the relevant hook points
  // — the call sites stay readable and the formula stays in one place.
  // -------------------------------------------------------------------------

  /** Buyer accepted item (or auto-release fired). Seller benefits. */
  async onTransactionCompleted({ sellerId, buyerId, amount, transactionId, wasLate = false, autoRelease = false }) {
    const sellerDeltas = {
      successful_deliveries: 1,
      total_completed: 1,
      total_volume_ngn: Number(amount) || 0
    };
    if (wasLate) sellerDeltas.late_deliveries = 1;
    await this.applySignal({
      userId: sellerId,
      deltas: sellerDeltas,
      reason: autoRelease ? 'auto_release_completed' : 'transaction_completed',
      transactionId,
      metadata: { amount, wasLate, autoRelease, role: 'seller' }
    });
    // Buyer: no counter change, but bump their last_activity_at via
    // an empty applySignal so we still log a history row for context.
    if (buyerId) {
      await this.applySignal({
        userId: buyerId,
        deltas: { total_completed: 1, total_volume_ngn: Number(amount) || 0 },
        reason: 'transaction_completed',
        transactionId,
        metadata: { amount, role: 'buyer' }
      });
    }
  }

  /** Initiator unilaterally cancelled a Created-state transaction. */
  async onCancelInitiated({ initiatorId, transactionId }) {
    await this.applySignal({
      userId: initiatorId,
      deltas: { total_cancellations_initiated: 1 },
      reason: 'cancel_initiated',
      transactionId
    });
  }

  /** Both parties agreed to cancel a Funded transaction. */
  async onMutualCancellation({ buyerId, sellerId, transactionId }) {
    if (buyerId) {
      await this.applySignal({
        userId: buyerId,
        deltas: { mutual_cancellations: 1 },
        reason: 'mutual_cancellation',
        transactionId
      });
    }
    if (sellerId) {
      await this.applySignal({
        userId: sellerId,
        deltas: { mutual_cancellations: 1 },
        reason: 'mutual_cancellation',
        transactionId
      });
    }
  }

  /**
   * Dispute resolved. `winnerId` got the outcome they wanted; `loserId`
   * lost. Pass null on either side for a split decision.
   *
   * If the loser has not previously lost a dispute against this winner
   * (a NEW peer-graph edge), we also bump `distinct_dispute_losers` so
   * the trust formula penalizes scammer-shaped patterns harder than
   * a single chronic feud.
   */
  async onDisputeResolved({ winnerId, loserId, transactionId, resolution }) {
    if (winnerId) {
      await this.applySignal({
        userId: winnerId,
        deltas: { disputes_won: 1 },
        reason: 'dispute_won',
        transactionId,
        metadata: { resolution }
      });
    }
    if (loserId) {
      // Detect whether this is a new (loser, winner) pair on the
      // peer-graph. If yes, also bump distinct_dispute_losers.
      let isNewLoserEdge = false;
      if (winnerId && transactionId) {
        try {
          await this.connect();
          const result = await this.dbService._executeHttp(
            `SELECT COUNT(*) AS n
               FROM trust_score_history
              WHERE user_id = ?
                AND reason = 'dispute_lost'
                AND metadata LIKE ?`,
            [loserId, `%"counterpartyId":${winnerId}%`]
          );
          const exec = result.results[0]?.response?.result;
          const cell = exec?.rows?.[0]?.[0];
          const n = (cell && typeof cell === 'object' && 'value' in cell) ? cell.value : cell;
          isNewLoserEdge = (Number(n) || 0) === 0;
        } catch (e) {
          // Best-effort: if the lookup fails, default to bumping
          // (false negatives here would mask real signal).
          isNewLoserEdge = true;
        }
      } else {
        isNewLoserEdge = true;
      }

      const deltas = { disputes_lost: 1 };
      if (isNewLoserEdge) deltas.distinct_dispute_losers = 1;

      await this.applySignal({
        userId: loserId,
        deltas,
        reason: 'dispute_lost',
        transactionId,
        metadata: { resolution, counterpartyId: winnerId, isNewLoserEdge }
      });
    }
  }

  /**
   * Called after AnomalyDetectionEngine.evaluate() produces a composite
   * score for a user action. We store the latest composite score on
   * the user row so computeScore() can factor it in, then recalc.
   *
   * NOTE: Unlike the other deltas which are cumulative (+1 each time),
   * last_anomaly_score is an ABSOLUTE overwrite — we always want the
   * most recent evaluation, not a running sum. applySignal uses
   * `COALESCE(col,0) + ?` for deltas, so we first zero out the column
   * and set the delta to the new value.
   */
  async onAnomalyEvaluated({ userId, compositeScore, transactionId = null, decision = null, metadata = null }) {
    if (!userId) return null;
    const score = Math.max(0, Math.min(100, Number(compositeScore) || 0));
    try {
      await this.connect();
      // Absolute overwrite: set last_anomaly_score directly.
      await this.dbService._executeHttp(
        'UPDATE users SET last_anomaly_score = ? WHERE id = ?',
        [score, userId]
      );
    } catch (e) {
      console.warn('[TrustEngine] onAnomalyEvaluated overwrite failed:', e.message);
    }
    // Now recalc the trust score with the updated anomaly input.
    return this.applySignal({
      userId,
      deltas: {},
      reason: 'anomaly_evaluation',
      transactionId,
      metadata: { compositeScore: score, decision, ...(metadata || {}) }
    });
  }

  /** User typed wrong shortcode / failed to join an existing txn. */
  async onFailedJoin({ userId, attemptedCode }) {
    await this.applySignal({
      userId,
      deltas: { failed_join_attempts: 1 },
      reason: 'failed_join',
      metadata: { attemptedCode: typeof attemptedCode === 'string' ? attemptedCode.slice(0, 32) : null }
    });
  }
}

// Browser export
if (typeof window !== 'undefined') {
  window.TrustEngineService = TrustEngineService;
}
