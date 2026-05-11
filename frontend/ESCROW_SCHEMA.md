# Escrow Database Schema Documentation

## Overview

This document describes the database schema for the ScrowPay Escrow Dashboard. The schema is designed for Turso DB (libSQL over HTTP) and implements a complete escrow transaction system with AI-powered risk scoring, state machine management, and dispute resolution.

## Schema Architecture

The escrow schema consists of 5 core tables:

1. **transactions** - Core escrow transaction data
2. **transaction_state_history** - Audit trail for state transitions
3. **disputes** - Dispute resolution tracking
4. **trust_scores** - Cached user reputation scores
5. **ai_risk_logs** - AI risk scoring audit trail

## Table Definitions

### 1. Transactions Table

**Purpose**: Stores all escrow transaction data with state machine and AI risk scoring.

**Schema**:
```sql
CREATE TABLE transactions (
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
```

**Field Descriptions**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY | Auto-incrementing internal ID |
| `transaction_id` | TEXT | UNIQUE, NOT NULL | UUID-based transaction identifier (format: "TXN-{uuid}") |
| `seller_id` | INTEGER | NOT NULL, FK | User ID of the seller (creator) |
| `buyer_id` | INTEGER | FK | User ID of the buyer (NULL until funded) |
| `item_description` | TEXT | NOT NULL | Description of goods/services being sold |
| `price` | REAL | NOT NULL, ₦100-₦10M | Transaction amount in Nigerian Naira |
| `delivery_timeline_days` | INTEGER | NOT NULL, 1-90 | Expected delivery time in days |
| `inspection_window_days` | INTEGER | NOT NULL, 1-14 | Buyer inspection period in days |
| `state` | TEXT | NOT NULL, enum | Current transaction state (see State Machine) |
| `risk_score` | REAL | nullable | AI-generated risk score (1-100) |
| `ai_verdict` | TEXT | nullable, enum | AI decision: "pass" or "fail" |
| `created_at` | DATETIME | DEFAULT NOW | Transaction creation timestamp |
| `updated_at` | DATETIME | DEFAULT NOW | Last modification timestamp |
| `funded_at` | DATETIME | nullable | When buyer funded the escrow |
| `shipped_at` | DATETIME | nullable | When seller marked as shipped |
| `completed_at` | DATETIME | nullable | When transaction completed |

**Indexes**:
- `idx_transaction_id` - Fast lookup by transaction ID
- `idx_seller_id` - Query transactions by seller
- `idx_buyer_id` - Query transactions by buyer
- `idx_state` - Filter by transaction state
- `idx_created_at` - Sort by creation date

**State Machine**:
```
Created → Funded_Locked → In_Transit → Completed
                                    ↓
                                Disputed → Completed
```

### 2. Transaction State History Table

**Purpose**: Audit trail for all state transitions.

**Schema**:
```sql
CREATE TABLE transaction_state_history (
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
```

**Field Descriptions**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY | Auto-incrementing internal ID |
| `transaction_id` | TEXT | NOT NULL, FK | Reference to transaction |
| `from_state` | TEXT | nullable | Previous state (NULL for initial state) |
| `to_state` | TEXT | NOT NULL | New state after transition |
| `changed_by` | INTEGER | NOT NULL, FK | User ID who triggered the change |
| `changed_at` | DATETIME | DEFAULT NOW | When the state change occurred |
| `notes` | TEXT | nullable | Additional metadata (JSON format) |

**Indexes**:
- `idx_history_transaction_id` - Query history by transaction
- `idx_history_changed_at` - Sort by change timestamp

### 3. Disputes Table

**Purpose**: Track dispute resolution with AI-assisted and manual resolution.

**Schema**:
```sql
CREATE TABLE disputes (
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
```

**Field Descriptions**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY | Auto-incrementing internal ID |
| `transaction_id` | TEXT | NOT NULL, UNIQUE, FK | One dispute per transaction |
| `raised_by` | INTEGER | NOT NULL, FK | User ID who raised the dispute (buyer) |
| `description` | TEXT | NOT NULL | Buyer's description of the issue |
| `photo_urls` | TEXT | nullable | JSON array of photo URLs |
| `ai_resolution` | TEXT | nullable | AI-suggested resolution |
| `ai_confidence` | REAL | nullable | AI confidence score (0-100) |
| `manual_resolution` | TEXT | nullable | Manual resolution decision |
| `resolved_at` | DATETIME | nullable | When dispute was resolved |
| `resolution_type` | TEXT | nullable, enum | How dispute was resolved |
| `created_at` | DATETIME | DEFAULT NOW | When dispute was created |

**Indexes**:
- `idx_dispute_transaction_id` - Query disputes by transaction
- `idx_dispute_created_at` - Sort by creation date

**Resolution Types**:
- `automated` - System automatically resolved (e.g., auto-release)
- `ai_assisted` - AI provided resolution with >90% confidence
- `manual` - Human review required

### 4. Trust Scores Cache Table

**Purpose**: Cache user reputation scores to avoid recalculating on every request.

**Schema**:
```sql
CREATE TABLE trust_scores (
  user_id INTEGER PRIMARY KEY,
  score REAL NOT NULL CHECK(score BETWEEN 1 AND 100),
  total_transactions INTEGER DEFAULT 0,
  successful_transactions INTEGER DEFAULT 0,
  disputed_transactions INTEGER DEFAULT 0,
  last_calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

**Field Descriptions**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `user_id` | INTEGER | PRIMARY KEY, FK | User ID (one score per user) |
| `score` | REAL | NOT NULL, 1-100 | Trust score (1=lowest, 100=highest) |
| `total_transactions` | INTEGER | DEFAULT 0 | Total completed transactions |
| `successful_transactions` | INTEGER | DEFAULT 0 | Transactions completed without dispute |
| `disputed_transactions` | INTEGER | DEFAULT 0 | Transactions that were disputed |
| `last_calculated_at` | DATETIME | DEFAULT NOW | When score was last calculated |

**Indexes**:
- `idx_trust_score` - Query users by trust score range

**Trust Score Calculation**:
```javascript
score = (successful_transactions / total_transactions) * 100
// With recency weighting: weight = e^(-days/30)
```

### 5. AI Risk Logs Table

**Purpose**: Audit trail for all AI risk scoring requests.

**Schema**:
```sql
CREATE TABLE ai_risk_logs (
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
```

**Field Descriptions**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY | Auto-incrementing internal ID |
| `transaction_id` | TEXT | NOT NULL, FK | Transaction being scored |
| `user_id` | INTEGER | NOT NULL, FK | User being scored (buyer) |
| `risk_score` | REAL | NOT NULL | AI-generated risk score (1-100) |
| `verdict` | TEXT | NOT NULL | AI decision: "pass" or "fail" |
| `anomaly_indicators` | TEXT | nullable | JSON array of detected anomalies |
| `features` | TEXT | NOT NULL | JSON object of input features |
| `model_version` | TEXT | nullable | AI model version used |
| `response_time_ms` | INTEGER | nullable | AI engine response time |
| `created_at` | DATETIME | DEFAULT NOW | When scoring occurred |

**Indexes**:
- `idx_risk_log_transaction_id` - Query logs by transaction
- `idx_risk_log_user_id` - Query logs by user
- `idx_risk_log_created_at` - Sort by timestamp

## Data Validation

### CHECK Constraints

The schema enforces data integrity through CHECK constraints:

1. **Price Range**: `price >= 100 AND price <= 10000000`
   - Minimum: ₦100
   - Maximum: ₦10,000,000

2. **Delivery Timeline**: `delivery_timeline_days BETWEEN 1 AND 90`
   - Minimum: 1 day
   - Maximum: 90 days

3. **Inspection Window**: `inspection_window_days BETWEEN 1 AND 14`
   - Minimum: 1 day
   - Maximum: 14 days

4. **Transaction State**: `state IN ('Created', 'Funded_Locked', 'In_Transit', 'Disputed', 'Completed')`
   - Only valid states allowed

5. **AI Verdict**: `ai_verdict IN ('pass', 'fail')`
   - Only valid verdicts allowed

6. **Trust Score**: `score BETWEEN 1 AND 100`
   - Valid range: 1-100

7. **Resolution Type**: `resolution_type IN ('automated', 'ai_assisted', 'manual')`
   - Only valid resolution types allowed

## Foreign Key Relationships

```
users (id)
  ↓
  ├─ transactions (seller_id, buyer_id)
  │    ↓
  │    ├─ transaction_state_history (transaction_id)
  │    ├─ disputes (transaction_id)
  │    └─ ai_risk_logs (transaction_id)
  │
  ├─ trust_scores (user_id)
  ├─ transaction_state_history (changed_by)
  ├─ disputes (raised_by)
  └─ ai_risk_logs (user_id)
```

## Usage

### Creating the Schema

```javascript
// Initialize database service
const dbService = new TursoDBService(
  window.ENV.TURSO_DATABASE_URL,
  window.ENV.TURSO_AUTH_TOKEN
);

// Connect to database
await dbService.connect();

// Create user schema (if not exists)
await dbService.createSchema();

// Create escrow schema
await dbService.createEscrowSchema();
```

### Testing the Schema

Open `test-escrow-schema.html` in a browser to:
1. Connect to the database
2. Create user schema
3. Create escrow schema
4. Verify all tables exist

## Performance Considerations

### Indexes

All tables have appropriate indexes for common query patterns:
- Transaction lookups by ID
- User transaction queries (buyer/seller)
- State filtering
- Date range queries
- Audit trail queries

### Query Optimization

1. **Balance Calculations**: Use indexed state column
   ```sql
   SELECT SUM(price) FROM transactions 
   WHERE (buyer_id = ? OR seller_id = ?) 
   AND state IN ('Funded_Locked', 'In_Transit')
   ```

2. **Active Transactions**: Use state index
   ```sql
   SELECT * FROM transactions 
   WHERE (buyer_id = ? OR seller_id = ?) 
   AND state != 'Completed'
   ORDER BY created_at DESC
   ```

3. **Trust Score Calculation**: Use completed transactions
   ```sql
   SELECT COUNT(*) as total,
          SUM(CASE WHEN state = 'Completed' AND id NOT IN (SELECT transaction_id FROM disputes) THEN 1 ELSE 0 END) as successful
   FROM transactions
   WHERE (buyer_id = ? OR seller_id = ?)
   AND state = 'Completed'
   ```

## Security Considerations

1. **Foreign Key Constraints**: Ensure referential integrity
2. **CHECK Constraints**: Prevent invalid data at database level
3. **UNIQUE Constraints**: Prevent duplicate transactions and disputes
4. **Audit Trail**: All state changes are logged
5. **AI Scoring Logs**: Complete audit trail for risk decisions

## Migration Notes

If updating an existing database:

1. The schema uses `CREATE TABLE IF NOT EXISTS` - safe to run multiple times
2. Indexes use `CREATE INDEX IF NOT EXISTS` - safe to run multiple times
3. No data migration required for new installations
4. For existing data, ensure foreign key relationships are valid

## Requirements Mapping

This schema satisfies the following requirements:

- **Requirement 1.2**: Locked balance calculation (transactions table with state)
- **Requirement 3.3**: Transaction ID generation (transaction_id field)
- **Requirement 3.6-3.8**: Input validation (CHECK constraints)
- **Requirement 6.1**: State machine (state field with CHECK constraint)
- **Requirement 6.8**: State history (transaction_state_history table)
- **Requirement 10.2**: Dispute tracking (disputes table)
- **Requirement 14.7**: AI risk logging (ai_risk_logs table)
- **Requirement 16.6**: Transaction history (transactions table with indexes)

## Support

For issues or questions about the schema:
1. Check the design document: `.kiro/specs/escrow-dashboard/design.md`
2. Review the requirements: `.kiro/specs/escrow-dashboard/requirements.md`
3. Test using: `frontend/test-escrow-schema.html`
