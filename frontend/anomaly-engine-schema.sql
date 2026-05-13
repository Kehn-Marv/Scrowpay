-- ============================================================================
-- ScrowPay — AI Anomaly Detection Engine + Trust Engine schema migration
--
-- Additive, idempotent. Safe to re-run. Apply this AFTER `escrow-schema.sql`.
--
-- What this migration adds:
--   1. Trust Engine counter columns on `users` (cumulative O(1) signals).
--   2. `trust_score_history` table (audit trail, "what changed?" tooltip).
--   3. Risk-profile cache columns on `transactions`.
--   4. Behavioral / fingerprint columns on `ai_risk_logs`.
--   5. `device_fingerprints` table (multi-account-from-device detection).
--   6. `anomaly_decisions` table (umbrella engine's final per-evaluation
--      verdict, regardless of which sub-detector triggered).
--
-- Turso/libSQL note: SQLite supports `ALTER TABLE ADD COLUMN` but NOT
-- `ADD COLUMN IF NOT EXISTS`. We work around this by using a CREATE TABLE
-- IF NOT EXISTS for the additive tables and tolerating "duplicate column"
-- errors at runtime for the ALTER statements (the migration runner in
-- `turso-db-service.js` swallows them).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TRUST ENGINE COUNTERS on users
--    Cumulative counters; single round-trip score updates via TrustEngineService.
-- ----------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN trust_score REAL;
ALTER TABLE users ADD COLUMN trust_score_updated_at DATETIME;
ALTER TABLE users ADD COLUMN last_activity_at DATETIME;
ALTER TABLE users ADD COLUMN successful_deliveries INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN total_completed INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN total_cancellations_initiated INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN mutual_cancellations INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN disputes_won INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN disputes_lost INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN late_deliveries INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN failed_join_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN total_volume_ngn REAL DEFAULT 0;
ALTER TABLE users ADD COLUMN avg_fulfillment_hours REAL;
-- Peer-graph signal: number of DISTINCT counterparties this user lost a dispute to.
-- A user who lost 5 disputes against 5 different people is much riskier than
-- a user who lost 5 against the same chronic complainer.
ALTER TABLE users ADD COLUMN distinct_dispute_losers INTEGER DEFAULT 0;

-- ----------------------------------------------------------------------------
-- 2. TRUST SCORE HISTORY
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trust_score_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  score_before REAL,
  score_after REAL NOT NULL,
  delta REAL,
  reason TEXT NOT NULL,
  transaction_id TEXT,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_tsh_user_created ON trust_score_history(user_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 3. RISK PROFILE CACHE on transactions
-- ----------------------------------------------------------------------------
ALTER TABLE transactions ADD COLUMN risk_profile_score REAL;
ALTER TABLE transactions ADD COLUMN risk_profile_flags TEXT;       -- JSON array
ALTER TABLE transactions ADD COLUMN risk_profile_evaluated_at DATETIME;
ALTER TABLE transactions ADD COLUMN anomaly_decision TEXT;         -- 'pass' | 'review' | 'block'
ALTER TABLE transactions ADD COLUMN anomaly_engine_version TEXT;

-- ----------------------------------------------------------------------------
-- 4. ai_risk_logs: behavioral + fingerprint enrichment
-- ----------------------------------------------------------------------------
ALTER TABLE ai_risk_logs ADD COLUMN device_fingerprint_id TEXT;
ALTER TABLE ai_risk_logs ADD COLUMN behavioral_signals TEXT;       -- JSON
ALTER TABLE ai_risk_logs ADD COLUMN engine_version TEXT;
ALTER TABLE ai_risk_logs ADD COLUMN final_decision TEXT;           -- 'pass' | 'review' | 'block'
ALTER TABLE ai_risk_logs ADD COLUMN sub_scores TEXT;               -- JSON: {rules, ml, behavioral}

-- ----------------------------------------------------------------------------
-- 5. DEVICE FINGERPRINTS
--    Tracks which fingerprints have been seen by which users. Used by the
--    BehavioralSignalsService to detect multi-account-from-device patterns.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS device_fingerprints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint_id TEXT NOT NULL,        -- visitorId from FingerprintJS
  user_id INTEGER NOT NULL,
  first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  seen_count INTEGER DEFAULT 1,
  confidence REAL,                     -- FingerprintJS confidence 0..1
  components TEXT,                     -- JSON snapshot of selected stable signals
  user_agent TEXT,
  UNIQUE(fingerprint_id, user_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_df_fpid ON device_fingerprints(fingerprint_id);
CREATE INDEX IF NOT EXISTS idx_df_user ON device_fingerprints(user_id);

-- ----------------------------------------------------------------------------
-- 6. ANOMALY DECISIONS
--    One row per AnomalyDetectionEngine.evaluate() call. Separate from
--    `ai_risk_logs` (which is ML-engine-specific) so we can audit decisions
--    even when the ML layer was down.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS anomaly_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT,
  user_id INTEGER NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('pass','review','block')),
  composite_score REAL NOT NULL,
  rules_score REAL,
  ml_score REAL,
  behavioral_score REAL,
  flags TEXT,                          -- JSON array of {code, severity, message}
  layers_active TEXT,                  -- JSON: which sub-detectors actually ran
  fingerprint_id TEXT,
  engine_version TEXT,
  evaluated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_ad_user ON anomaly_decisions(user_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_txn ON anomaly_decisions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ad_decision ON anomaly_decisions(decision);
