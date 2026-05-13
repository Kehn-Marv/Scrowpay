/**
 * AnomalyDetectionEngine — The umbrella orchestrator.
 *
 * Single entry point for ANY pre-fund / pre-action anomaly question
 * the dashboard wants to ask. Internally composes three independent
 * sub-detectors:
 *
 *   1. RuleEngine        — RiskProfilingService (deterministic, in-browser)
 *   2. MLEngine          — AIRiskService -> Python Isolation Forest
 *   3. BehavioralEngine  — BehavioralSignalsService (session + fingerprint)
 *
 * Each sub-detector returns a 0–100 risk score and a flag list. The
 * umbrella combines them with calibrated weights into a SINGLE
 * composite_score, applies decision thresholds, and returns one
 * machine-readable verdict the dashboard can act on:
 *
 *   { decision: 'pass' | 'review' | 'block',
 *     compositeScore: number,
 *     subScores: { rules, ml, behavioral },
 *     flags: [...],
 *     layersActive: ['rules','ml','behavioral'],   // which actually ran
 *     fingerprintId: string,
 *     engineVersion: string,
 *     evaluationId: number  // row id in anomaly_decisions
 *   }
 *
 * DESIGN PRINCIPLES
 * -----------------
 *  • Fail-OPEN per layer, fail-SAFE in aggregate. If a sub-detector is
 *    unavailable, we still produce a verdict from the others. We only
 *    BLOCK on strong, multi-layer agreement OR on a single hard-rule
 *    "block_immediately" flag (e.g. shared device with >=3 users).
 *  • All sub-detectors run in parallel — total wall-time is gated by
 *    the slowest one (the ML call) and capped at 5s by AIRiskService.
 *  • Every decision is persisted to `anomaly_decisions` for audit. The
 *    dashboard never re-evaluates on re-render — it reads the cached
 *    decision off the transaction row.
 *  • The ENGINE is the only place decision thresholds live. Sub-detectors
 *    only produce raw scores + flags.
 *
 * VERSIONING
 * ----------
 * `engineVersion` is bumped whenever weights or thresholds change so we
 * can later compare false-positive rates across versions.
 */

(function () {
  const ENGINE_VERSION = '2.0.0';

  // Composite-score thresholds. Tuned conservatively for the hackathon
  // baseline; will get re-calibrated once we have real labeled data.
  const BLOCK_THRESHOLD  = 75;   // composite_score >= 75 → block
  const REVIEW_THRESHOLD = 40;   // 40..74 → review (warn + require ack)

  // Sub-detector weights (sum to 1.0). Rules carry the most weight
  // because they're deterministic & explainable; ML is a tie-breaker;
  // behavioral catches the patterns the other two structurally miss
  // (credential theft, social engineering, sock-puppets).
  const W_RULES       = 0.45;
  const W_ML          = 0.30;
  const W_BEHAVIORAL  = 0.25;

  // "Hard block" flag codes — any single one of these forces a block
  // regardless of composite score, because the false-positive cost is
  // dominated by the fraud cost.
  const HARD_BLOCK_FLAGS = new Set([
    'SHARED_DEVICE_MULTI_ACCOUNT',  // ≥3 accounts on one device
    'PIN_PASTED_HIGH_VALUE'         // composite flag added below
  ]);

  class AnomalyDetectionEngine {
    /**
     * @param {Object} config
     * @param {Object} config.turso
     * @param {Object} [deps]
     * @param {RiskProfilingService}    deps.riskProfiling
     * @param {AIRiskService}           deps.aiRisk
     * @param {BehavioralSignalsService} deps.behavioral
     * @param {DeviceFingerprintService} deps.fingerprint
     */
    constructor(config = {}, deps = {}) {
      this.dbService = (config.turso && config.turso.databaseUrl)
        ? new TursoDBService(config.turso.databaseUrl, config.turso.authToken)
        : null;
      this.connected = false;

      this.riskProfiling = deps.riskProfiling || null;
      this.aiRisk        = deps.aiRisk        || null;
      this.behavioral    = deps.behavioral    || null;
      this.fingerprint   = deps.fingerprint   || null;

      this.version = ENGINE_VERSION;
    }

    async _connect() {
      if (this.dbService && !this.connected) {
        await this.dbService.connect();
        this.connected = true;
      }
    }

    /**
     * Run all sub-detectors in parallel and return a unified verdict.
     *
     * @param {Object} args
     * @param {Object} args.transaction         - the transaction row
     * @param {Object} args.actor               - the user about to commit (e.g. the buyer)
     * @param {Object} args.counterparty        - the OTHER user (e.g. the seller)
     * @param {Object} [args.userContext]       - extra ML features (velocity, etc.)
     * @returns {Promise<Object>}
     */
    async evaluate({ transaction, actor, counterparty, userContext = {} }) {
      const startedAt = Date.now();
      const layersActive = [];
      const flags = [];
      const subScores = { rules: null, ml: null, behavioral: null };

      const amount = Number(transaction?.price) || 0;

      // ---- Resolve fingerprint up-front (cheap, memoized) ----
      let fingerprintInfo = null;
      if (this.fingerprint) {
        try {
          fingerprintInfo = await this.fingerprint.identify();
        } catch (_) { /* ignore — non-fatal */ }
      }

      // ---- Phase 1: rules + behavioral in parallel (both are fast) ----
      // The rules layer is pure in-browser; behavioral does at most one
      // small DB roundtrip. We let them run together so the ML call in
      // phase 2 can pipe behavioral features through to the Python
      // engine for its post-ML boost.
      const [rulesRes, behaviorRes] = await Promise.all([
        this._runRules({ transaction, counterparty }).catch(e => {
          console.warn('[AnomalyEngine] rules layer failed:', e.message);
          return null;
        }),
        this._runBehavioral({ actor, transaction }).catch(e => {
          console.warn('[AnomalyEngine] behavioral layer failed:', e.message);
          return null;
        })
      ]);

      // ---- Phase 2: ML, with behavioral features attached ----
      const mlRes = await this._runML({
        transaction,
        userContext,
        fingerprintInfo,
        behavioralFeatures: behaviorRes ? behaviorRes.features : null
      }).catch(e => {
        console.warn('[AnomalyEngine] ML layer failed:', e.message);
        return null;
      });

      if (rulesRes) {
        subScores.rules = rulesRes.score;
        layersActive.push('rules');
        flags.push(...(rulesRes.flags || []));
      }
      if (mlRes) {
        subScores.ml = mlRes.score;
        layersActive.push('ml');
        flags.push(...(mlRes.flags || []));
      }
      if (behaviorRes) {
        subScores.behavioral = behaviorRes.score;
        layersActive.push('behavioral');
        flags.push(...(behaviorRes.flags || []));
      }

      // ---- Composite signal: PIN paste on a high-value txn becomes a hard block ----
      if (amount > 200000 && flags.some(f => f.code === 'PIN_PASTED')) {
        flags.push({
          code: 'PIN_PASTED_HIGH_VALUE',
          severity: 'high',
          weight: 0,                  // weight already counted on PIN_PASTED
          message: `PIN was pasted on a ₦${amount.toLocaleString()} transaction — hard block.`
        });
      }

      // ---- Combine sub-scores with re-normalized weights ----
      // If a layer was unavailable we redistribute its weight to the
      // active layers so missing one detector doesn't soft-pass risky
      // transactions.
      const composite = this._combine(subScores);

      // ---- Decide ----
      let decision;
      const hardBlock = flags.find(f => HARD_BLOCK_FLAGS.has(f.code));
      if (hardBlock) {
        decision = 'block';
      } else if (composite >= BLOCK_THRESHOLD) {
        decision = 'block';
      } else if (composite >= REVIEW_THRESHOLD) {
        decision = 'review';
      } else {
        decision = 'pass';
      }

      const verdict = {
        decision,
        compositeScore: composite,
        subScores,
        flags: this._dedupeFlags(flags),
        layersActive,
        fingerprintId: fingerprintInfo ? fingerprintInfo.visitorId : null,
        engineVersion: this.version,
        elapsedMs: Date.now() - startedAt
      };

      // ---- Persist (best-effort) ----
      verdict.evaluationId = await this._persistDecision({
        transaction, actor, verdict
      });

      // ---- Cache on transaction row so re-renders read it back ----
      if (transaction && transaction.transaction_id) {
        await this._cacheOnTransaction(transaction.transaction_id, verdict);
      }

      console.log('[AnomalyEngine]', {
        txn: transaction && transaction.transaction_id,
        decision,
        composite,
        sub: subScores,
        layers: layersActive,
        flags: verdict.flags.length,
        ms: verdict.elapsedMs
      });

      return verdict;
    }

    /**
     * Read the most recent cached evaluation off a transaction. Useful
     * for re-rendering risk banners without re-running the engine.
     */
    async getCachedDecision(transactionId) {
      if (!transactionId || !this.dbService) return null;
      try {
        await this._connect();
        const result = await this.dbService._executeHttp(
          `SELECT anomaly_decision, risk_profile_score, risk_profile_flags,
                  anomaly_engine_version, risk_profile_evaluated_at
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
        const decision = cell(0);
        if (!decision) return null;
        let flags = [];
        try { flags = cell(2) ? JSON.parse(cell(2)) : []; } catch (_) {}
        return {
          decision,
          compositeScore: Number(cell(1)) || 0,
          flags,
          engineVersion: cell(3),
          evaluatedAt: cell(4)
        };
      } catch (e) {
        return null;
      }
    }

    // -----------------------------------------------------------------------
    // SUB-DETECTOR RUNNERS
    // -----------------------------------------------------------------------
    async _runRules({ transaction, counterparty }) {
      if (!this.riskProfiling) return null;
      const result = await this.riskProfiling.evaluate({
        transaction,
        counterparty
      });
      return {
        score: Number(result.score) || 0,
        flags: (result.flags || []).map(f => ({ ...f, layer: 'rules' }))
      };
    }

    async _runML({ transaction, userContext, fingerprintInfo, behavioralFeatures }) {
      if (!this.aiRisk) return null;

      // Plug the real fingerprint into the ML feature vector. The
      // Python engine expects an integer; DeviceFingerprintService can
      // hash the visitorId down for us.
      const enrichedContext = { ...userContext };
      if (this.fingerprint && fingerprintInfo) {
        enrichedContext.deviceFingerprint =
          this.fingerprint.toLegacyNumber(fingerprintInfo.visitorId);
      }
      // Pass behavioral signals through so the Python engine can apply
      // its auditable post-ML boost (PIN paste, shared device, etc.).
      if (behavioralFeatures) {
        enrichedContext.behavioralSignals = behavioralFeatures;
      }
      const result = await this.aiRisk.scoreTransaction(
        transaction,
        enrichedContext
      );
      const flags = (result.anomaly_indicators || []).map(msg => ({
        code: 'ML_' + msg.replace(/\s+/g, '_').toUpperCase().slice(0, 40),
        severity: result.risk_score > 80 ? 'high' : result.risk_score > 50 ? 'medium' : 'low',
        weight: 0,
        message: msg,
        layer: 'ml'
      }));
      return {
        score: Number(result.risk_score) || 0,
        flags
      };
    }

    async _runBehavioral({ actor, transaction }) {
      if (!this.behavioral) return null;
      const result = await this.behavioral.snapshot({
        userId: actor && (actor.id || actor.userId),
        transactionAmount: transaction && transaction.price
      });
      return {
        score: Number(result.score) || 0,
        flags: (result.flags || []).map(f => ({ ...f, layer: 'behavioral' })),
        features: result.features || {}
      };
    }

    // -----------------------------------------------------------------------
    // INTERNAL
    // -----------------------------------------------------------------------
    /**
     * Re-normalize weights across whichever layers actually returned a
     * score. Missing layers don't get a free pass — their weight is
     * redistributed.
     */
    _combine(subScores) {
      const parts = [];
      if (typeof subScores.rules === 'number')      parts.push({ s: subScores.rules,      w: W_RULES });
      if (typeof subScores.ml === 'number')         parts.push({ s: subScores.ml,         w: W_ML });
      if (typeof subScores.behavioral === 'number') parts.push({ s: subScores.behavioral, w: W_BEHAVIORAL });

      if (parts.length === 0) return 0;
      const totalW = parts.reduce((acc, p) => acc + p.w, 0);
      const composite = parts.reduce((acc, p) => acc + (p.s * (p.w / totalW)), 0);
      return Math.round(composite * 10) / 10;
    }

    /**
     * Drop duplicate flag codes (the same code can fire in both rules
     * and behavioral, e.g. late-night detection). Keep the highest
     * severity / weight version.
     */
    _dedupeFlags(flags) {
      const sevRank = { high: 3, medium: 2, low: 1 };
      const byCode = new Map();
      for (const f of flags) {
        if (!f || !f.code) continue;
        const existing = byCode.get(f.code);
        if (!existing) { byCode.set(f.code, f); continue; }
        const aS = sevRank[existing.severity] || 0;
        const bS = sevRank[f.severity] || 0;
        if (bS > aS || (bS === aS && (f.weight || 0) > (existing.weight || 0))) {
          byCode.set(f.code, f);
        }
      }
      return Array.from(byCode.values());
    }

    async _persistDecision({ transaction, actor, verdict }) {
      if (!this.dbService) return null;
      try {
        await this._connect();
        const result = await this.dbService._executeHttp(
          `INSERT INTO anomaly_decisions
             (transaction_id, user_id, decision, composite_score,
              rules_score, ml_score, behavioral_score,
              flags, layers_active, fingerprint_id, engine_version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            (transaction && transaction.transaction_id) || null,
            (actor && (actor.id || actor.userId)) || null,
            verdict.decision,
            verdict.compositeScore,
            verdict.subScores.rules,
            verdict.subScores.ml,
            verdict.subScores.behavioral,
            JSON.stringify(verdict.flags || []),
            JSON.stringify(verdict.layersActive || []),
            verdict.fingerprintId,
            verdict.engineVersion
          ]
        );
        const exec = result.results[0]?.response?.result;
        return exec && exec.last_insert_rowid
          ? Number(exec.last_insert_rowid)
          : null;
      } catch (e) {
        console.warn('[AnomalyEngine] persistDecision failed:', e.message);
        return null;
      }
    }

    async _cacheOnTransaction(transactionId, verdict) {
      if (!this.dbService) return;
      try {
        await this._connect();
        await this.dbService._executeHttp(
          `UPDATE transactions
              SET risk_profile_score      = ?,
                  risk_profile_flags      = ?,
                  risk_profile_evaluated_at = CURRENT_TIMESTAMP,
                  anomaly_decision        = ?,
                  anomaly_engine_version  = ?
            WHERE transaction_id = ?`,
          [
            verdict.compositeScore,
            JSON.stringify(verdict.flags || []),
            verdict.decision,
            verdict.engineVersion,
            transactionId
          ]
        );
      } catch (e) {
        console.warn('[AnomalyEngine] cacheOnTransaction failed:', e.message);
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.AnomalyDetectionEngine = AnomalyDetectionEngine;
  }
})();
