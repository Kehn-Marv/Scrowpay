/**
 * AnomalyDetectionEngine — The umbrella orchestrator.
 *
 * Single entry point for ANY pre-fund / pre-action anomaly question
 * the dashboard wants to ask. Internally composes two sub-detectors:
 *
 *   1. RuleEngine — RiskEngineService (deterministic, in-browser)
 *   2. MLEngine   — IsolationForestService → Python Isolation Forest
 *
 * Each sub-detector returns a 0–100 risk score and a flag list. The
 * umbrella combines them with calibrated weights into a SINGLE
 * composite_score, applies decision thresholds, and returns one
 * machine-readable verdict the dashboard can act on:
 *
 *   { decision: 'pass' | 'review' | 'block',
 *     compositeScore: number,
 *     subScores: { rules, ml, behavioral: null },
 *     flags: [...],
 *     layersActive: ['rules','ml'],
 *     fingerprintId: string,
 *     engineVersion: string,
 *     evaluationId: number  // row id in anomaly_decisions
 *   }
 *
 * `subScores.behavioral` is always null; `behavioral_score` in DB stays
 * null for backward compatibility with existing rows / schema.
 *
 * DESIGN PRINCIPLES
 * -----------------
 *  • Fail-OPEN per layer, fail-SAFE in aggregate. If a sub-detector is
 *    unavailable, we still produce a verdict from the others.
 *  • Every decision is persisted to `anomaly_decisions` for audit.
 *  • The ENGINE is the only place decision thresholds live.
 *
 * VERSIONING
 * ----------
 * `engineVersion` is bumped whenever weights or thresholds change.
 */

(function () {
  const ENGINE_VERSION = '2.1.0';

  const BLOCK_THRESHOLD  = 75;
  const REVIEW_THRESHOLD = 40;

  // Weights (sum to 1.0). Former behavioral weight redistributed
  // proportionally onto rules + ML (was 0.45 / 0.30 of 0.75).
  const W_RULES = 0.6;
  const W_ML    = 0.4;

  const HARD_BLOCK_FLAGS = new Set([
    // Reserved for rule-engine codes that must force block regardless of composite.
  ]);

  class AnomalyDetectionEngine {
    /**
     * @param {Object} config
     * @param {Object} config.turso
     * @param {Object} [deps]
     * @param {RiskEngineService} deps.riskEngine
     * @param {IsolationForestService} deps.isolationForest
     * @param {DeviceFingerprintService} deps.fingerprint
     */
    constructor(config = {}, deps = {}) {
      this.dbService = (config.turso && config.turso.databaseUrl)
        ? new TursoDBService(config.turso.databaseUrl, config.turso.authToken)
        : null;
      this.connected = false;

      this.riskEngine = deps.riskEngine || null;
      this.isolationForest = deps.isolationForest || null;
      this.fingerprint  = deps.fingerprint  || null;

      this.version = ENGINE_VERSION;
    }

    async _connect() {
      if (this.dbService && !this.connected) {
        await this.dbService.connect();
        this.connected = true;
      }
    }

    /**
     * Run sub-detectors and return a unified verdict.
     *
     * @param {Object} args
     * @param {Object} args.transaction
     * @param {Object} args.actor
     * @param {Object} args.counterparty
     * @param {Object} [args.userContext]
     * @returns {Promise<Object>}
     */
    async evaluate({ transaction, actor, counterparty, userContext = {} }) {
      const startedAt = Date.now();
      const layersActive = [];
      const flags = [];
      const subScores = { rules: null, ml: null, behavioral: null };

      let fingerprintInfo = null;
      if (this.fingerprint) {
        try {
          fingerprintInfo = await this.fingerprint.identify();
        } catch (_) { /* ignore */ }
      }

      const rulesRes = await this._runRules({ transaction, counterparty }).catch(e => {
        console.warn('[AnomalyEngine] rules layer failed:', e.message);
        return null;
      });

      const mlRes = await this._runML({
        transaction,
        userContext,
        fingerprintInfo,
        behavioralFeatures: null
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

      const composite = this._combine(subScores);

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

      verdict.evaluationId = await this._persistDecision({
        transaction, actor, verdict
      });

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

    async _runRules({ transaction, counterparty }) {
      if (!this.riskEngine) return null;
      const result = await this.riskEngine.evaluate({
        transaction,
        counterparty
      });
      return {
        score: Number(result.score) || 0,
        flags: (result.flags || []).map(f => ({ ...f, layer: 'rules' }))
      };
    }

    async _runML({ transaction, userContext, fingerprintInfo, behavioralFeatures }) {
      if (!this.isolationForest) return null;

      const enrichedContext = { ...userContext };
      if (this.fingerprint && fingerprintInfo) {
        enrichedContext.deviceFingerprint =
          this.fingerprint.toLegacyNumber(fingerprintInfo.visitorId);
      }
      if (behavioralFeatures) {
        enrichedContext.behavioralSignals = behavioralFeatures;
      }
      const result = await this.isolationForest.scoreTransaction(
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

    _combine(subScores) {
      const parts = [];
      if (typeof subScores.rules === 'number') parts.push({ s: subScores.rules, w: W_RULES });
      if (typeof subScores.ml === 'number')    parts.push({ s: subScores.ml,    w: W_ML });

      if (parts.length === 0) return 0;
      const totalW = parts.reduce((acc, p) => acc + p.w, 0);
      const composite = parts.reduce((acc, p) => acc + (p.s * (p.w / totalW)), 0);
      return Math.round(composite * 10) / 10;
    }

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
