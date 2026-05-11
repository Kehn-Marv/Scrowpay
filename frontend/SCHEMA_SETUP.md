# Escrow Schema Setup Guide

## Overview

This guide explains how to set up the database schema for the ScrowPay Escrow Dashboard.

## Prerequisites

- Turso database account and credentials configured in `env.js`
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Local web server (for testing)

## Files Created

1. **escrow-schema.sql** - SQL schema definition file
2. **turso-db-service.js** - Updated with `createEscrowSchema()` method
3. **test-escrow-schema.html** - Interactive test page
4. **ESCROW_SCHEMA.md** - Complete schema documentation

## Setup Instructions

### Method 1: Using the Test Page (Recommended)

1. Start a local web server in the `frontend` directory:
   ```bash
   # Using Python 3
   python -m http.server 8000
   
   # Or using Python 2
   python -m SimpleHTTPServer 8000
   
   # Or using Node.js http-server
   npx http-server -p 8000
   
   # Or using the provided batch file (Windows)
   START_SERVER.bat
   
   # Or using PowerShell script
   .\start-server.ps1
   ```

2. Open your browser and navigate to:
   ```
   http://localhost:8000/test-escrow-schema.html
   ```

3. Click the buttons in sequence:
   - **1. Connect to Database** - Establishes connection to Turso DB
   - **2. Create User Schema** - Creates the users table (if not exists)
   - **3. Create Escrow Schema** - Creates all escrow tables
   - **4. Verify Tables** - Confirms all tables were created

4. Check the output panel for success messages

### Method 2: Using JavaScript Console

If you prefer to run the setup from an existing page:

1. Open any page that loads `turso-db-service.js` (e.g., `account-creation.html`)

2. Open the browser console (F12)

3. Run the following commands:

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

// Verify tables
const result = await dbService._executeHttp(`
  SELECT name FROM sqlite_master 
  WHERE type='table' 
  ORDER BY name
`);
console.log('Tables:', result.results[0].response.result.rows);
```

### Method 3: Programmatic Setup

Add this code to your application initialization:

```javascript
async function initializeDatabase() {
  try {
    const dbService = new TursoDBService(
      window.ENV.TURSO_DATABASE_URL,
      window.ENV.TURSO_AUTH_TOKEN
    );
    
    await dbService.connect();
    
    // Create schemas (safe to run multiple times)
    await dbService.createSchema();
    await dbService.createEscrowSchema();
    
    console.log('✅ Database schema initialized');
    return dbService;
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

// Call during app startup
const db = await initializeDatabase();
```

## Schema Components

The escrow schema creates 5 tables:

### 1. transactions
- Core escrow transaction data
- State machine: Created → Funded_Locked → In_Transit → Completed
- AI risk scoring fields
- Price range: ₦100 - ₦10,000,000
- Delivery timeline: 1-90 days
- Inspection window: 1-14 days

### 2. transaction_state_history
- Audit trail for all state transitions
- Records who changed the state and when
- Stores metadata in notes field

### 3. disputes
- Dispute resolution tracking
- AI-assisted and manual resolution
- Photo evidence support
- Resolution types: automated, ai_assisted, manual

### 4. trust_scores
- Cached user reputation scores
- Score range: 1-100
- Tracks successful vs disputed transactions
- Recalculated after each transaction

### 5. ai_risk_logs
- Audit trail for AI risk scoring
- Stores input features and output scores
- Tracks model version and response time
- Used for model evaluation and debugging

## Verification

After setup, verify the schema:

```javascript
// Get all tables
const result = await dbService._executeHttp(`
  SELECT name FROM sqlite_master 
  WHERE type='table' 
  ORDER BY name
`);

// Expected tables:
// - users
// - transactions
// - transaction_state_history
// - disputes
// - trust_scores
// - ai_risk_logs
```

## Data Validation

The schema includes CHECK constraints to ensure data integrity:

- **Price**: Must be between ₦100 and ₦10,000,000
- **Delivery Timeline**: Must be between 1 and 90 days
- **Inspection Window**: Must be between 1 and 14 days
- **Transaction State**: Must be one of: Created, Funded_Locked, In_Transit, Disputed, Completed
- **AI Verdict**: Must be either "pass" or "fail"
- **Trust Score**: Must be between 1 and 100
- **Resolution Type**: Must be one of: automated, ai_assisted, manual

## Indexes

All tables have appropriate indexes for performance:

- Transaction lookups by ID
- User transaction queries (buyer/seller)
- State filtering
- Date range queries
- Audit trail queries

## Safety

The schema creation is **idempotent** - safe to run multiple times:

- Uses `CREATE TABLE IF NOT EXISTS`
- Uses `CREATE INDEX IF NOT EXISTS`
- Will not drop or modify existing data
- Will not fail if tables already exist

## Troubleshooting

### Connection Failed

**Error**: "Unable to connect to database"

**Solution**:
1. Check that `env.js` has correct credentials
2. Verify internet connection
3. Check Turso database is active
4. Verify CORS is enabled for your domain

### Authentication Failed

**Error**: "Database authentication failed"

**Solution**:
1. Verify `TURSO_AUTH_TOKEN` is correct
2. Check token hasn't expired
3. Regenerate token in Turso dashboard if needed

### Table Already Exists

**Error**: "table transactions already exists"

**Solution**:
- This is normal if schema was already created
- The error is caught and logged
- Schema creation continues with other tables

### Constraint Violation

**Error**: "CHECK constraint failed"

**Solution**:
- This means data validation is working correctly
- Review the data being inserted
- Ensure values are within valid ranges

## Next Steps

After schema setup:

1. **Create Services**: Implement TransactionService, BalanceService, etc.
2. **Test Transactions**: Create test transactions to verify schema
3. **Implement State Machine**: Build state transition logic
4. **Add AI Integration**: Connect to AI risk engine
5. **Build Dashboard UI**: Create the dashboard interface

## Documentation

For detailed schema documentation, see:
- **ESCROW_SCHEMA.md** - Complete schema reference
- **escrow-schema.sql** - Raw SQL definitions
- **design.md** - System design document
- **requirements.md** - Feature requirements

## Support

If you encounter issues:

1. Check the browser console for detailed error messages
2. Review the schema documentation
3. Verify database credentials
4. Test with the interactive test page
5. Check Turso dashboard for database status

## Requirements Satisfied

This schema implementation satisfies:

- ✅ Requirement 1.2: Locked balance calculation
- ✅ Requirement 3.3: Transaction ID generation
- ✅ Requirement 3.6-3.8: Input validation
- ✅ Requirement 6.1: State machine
- ✅ Requirement 6.8: State history
- ✅ Requirement 10.2: Dispute tracking
- ✅ Requirement 14.7: AI risk logging
- ✅ Requirement 16.6: Transaction history

## Task Completion

This completes **Task 1: Set up database schema and core tables** from the implementation plan.

All required tables, indexes, and constraints have been created and tested.
