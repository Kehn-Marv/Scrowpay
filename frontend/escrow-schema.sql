-- Escrow Dashboard Database Schema
-- ScrowPay - Pre-transaction anomaly detection escrow platform
-- Database: Turso DB (libSQL over HTTP)

-- ============================================================================
-- TRANSACTIONS TABLE
-- Core table for escrow transactions with state machine and AI risk scoring
-- ============================================================================
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT UNIQUE NOT NULL,
  seller_id INTEGER NOT NULL,
  buyer_id INTEGER,
  item_description TEXT NOT NULL,
  price REAL NOT NULL CHECK(price >= 100 AND price <= 10000000),
  delivery_timeline_days INTEGER NOT NULL CHECK(delivery_timeline_days BETWEEN 1 AND 90),
  inspection_window_days INTEGER NOT NULL CHECK(inspection_window_days BETWEEN 1 AND 14),
  state TEXT NOT NULL CHECK(state IN ('Created', 'Funded_Locked', 'In_Transit', 'Disputed', 'Completed')),
  risk_score REAL,
  ai_verdict TEXT CHECK(ai_verdict IN ('pass', 'fail')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  funded_at DATETIME,
  shipped_at DATETIME,
  completed_at DATETIME,
  
  FOREIGN KEY (seller_id) REFERENCES users(id),
  FOREIGN KEY (buyer_id) REFERENCES users(id)
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_transaction_id ON transactions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_seller_id ON transactions(seller_id);
CREATE INDEX IF NOT EXISTS idx_buyer_id ON transactions(buyer_id);
CREATE INDEX IF NOT EXISTS idx_state ON transactions(state);
CREATE INDEX IF NOT EXISTS idx_created_at ON transactions(created_at);

-- ============================================================================
-- TRANSACTION STATE HISTORY TABLE
-- Audit trail for all state transitions
-- ============================================================================
CREATE TABLE IF NOT EXISTS transaction_state_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  changed_by INTEGER NOT NULL,
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  
  FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id),
  FOREIGN KEY (changed_by) REFERENCES users(id)
);

-- Indexes for audit trail queries
CREATE INDEX IF NOT EXISTS idx_history_transaction_id ON transaction_state_history(transaction_id);
CREATE INDEX IF NOT EXISTS idx_history_changed_at ON transaction_state_history(changed_at);

-- ============================================================================
-- DISPUTES TABLE
-- Dispute resolution tracking with AI-assisted and manual resolution
-- ============================================================================
CREATE TABLE IF NOT EXISTS disputes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT NOT NULL UNIQUE,
  raised_by INTEGER NOT NULL,
  description TEXT NOT NULL,
  photo_urls TEXT,
  ai_resolution TEXT,
  ai_confidence REAL,
  manual_resolution TEXT,
  resolved_at DATETIME,
  resolution_type TEXT CHECK(resolution_type IN ('automated', 'ai_assisted', 'manual')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id),
  FOREIGN KEY (raised_by) REFERENCES users(id)
);

-- Indexes for dispute queries
CREATE INDEX IF NOT EXISTS idx_dispute_transaction_id ON disputes(transaction_id);
CREATE INDEX IF NOT EXISTS idx_dispute_created_at ON disputes(created_at);

-- ============================================================================
-- TRUST SCORES CACHE TABLE
-- Cached trust scores to avoid recalculating on every request
-- ============================================================================
CREATE TABLE IF NOT EXISTS trust_scores (
  user_id INTEGER PRIMARY KEY,
  score REAL NOT NULL CHECK(score BETWEEN 1 AND 100),
  total_transactions INTEGER DEFAULT 0,
  successful_transactions INTEGER DEFAULT 0,
  disputed_transactions INTEGER DEFAULT 0,
  last_calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Index for trust score queries
CREATE INDEX IF NOT EXISTS idx_trust_score ON trust_scores(score);

-- ============================================================================
-- AI RISK LOGS TABLE
-- Audit trail for all AI risk scoring requests
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_risk_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  risk_score REAL NOT NULL,
  verdict TEXT NOT NULL,
  anomaly_indicators TEXT,
  features TEXT NOT NULL,
  model_version TEXT,
  response_time_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Indexes for AI risk log queries
CREATE INDEX IF NOT EXISTS idx_risk_log_transaction_id ON ai_risk_logs(transaction_id);
CREATE INDEX IF NOT EXISTS idx_risk_log_user_id ON ai_risk_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_risk_log_created_at ON ai_risk_logs(created_at);

-- ============================================================================
-- SECURITY LOGS TABLE
-- Audit trail for security-relevant events (rate limits, blocked transactions, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS security_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL CHECK(event_type IN ('rate_limit_violation', 'blocked_transaction', 'failed_risk_check', 'invalid_state_transition', 'unauthorized_access')),
  user_id INTEGER NOT NULL,
  transaction_id TEXT,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id)
);

-- Indexes for security log queries
CREATE INDEX IF NOT EXISTS idx_security_log_user_id ON security_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_security_log_event_type ON security_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_security_log_created_at ON security_logs(created_at);

-- ============================================================================
-- WITHDRAWAL HISTORY TABLE
-- Records every outbound transfer via Squad Transfer API (seller cash-outs)
-- ============================================================================
CREATE TABLE IF NOT EXISTS withdrawal_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount REAL NOT NULL CHECK(amount >= 100),
  bank_name TEXT NOT NULL,
  bank_code TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  transaction_reference TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'success', 'failed', 'reversed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Indexes for withdrawal queries
CREATE INDEX IF NOT EXISTS idx_withdrawal_user_id ON withdrawal_history(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_reference ON withdrawal_history(transaction_reference);
CREATE INDEX IF NOT EXISTS idx_withdrawal_created_at ON withdrawal_history(created_at);
