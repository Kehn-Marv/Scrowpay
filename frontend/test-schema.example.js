/**
 * Test Schema Setup Script
 * 
 * This script tests the database schema setup for ScrowPay.
 * 
 * IMPORTANT: This is an example file. To use:
 * 1. Copy this file to test-schema.js
 * 2. Replace the placeholder credentials with your actual credentials
 * 3. Run the script to test schema setup
 * 
 * DO NOT commit test-schema.js to git - it's in .gitignore
 */

// Load environment variables from .env or environment
const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL || 'YOUR_TURSO_DATABASE_URL_HERE';
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || 'YOUR_TURSO_AUTH_TOKEN_HERE';

// Validate credentials are set
if (TURSO_DATABASE_URL === 'YOUR_TURSO_DATABASE_URL_HERE' || 
    TURSO_AUTH_TOKEN === 'YOUR_TURSO_AUTH_TOKEN_HERE') {
  console.error('❌ Error: Please set your Turso credentials');
  console.error('');
  console.error('Option 1: Set environment variables');
  console.error('  export TURSO_DATABASE_URL="libsql://your-database.turso.io"');
  console.error('  export TURSO_AUTH_TOKEN="your-auth-token"');
  console.error('');
  console.error('Option 2: Copy this file to test-schema.js and edit credentials');
  console.error('  cp test-schema.example.js test-schema.js');
  console.error('  # Edit test-schema.js with your credentials');
  console.error('');
  process.exit(1);
}

// Load TursoDBService
const TursoDBService = require('./turso-db-service.js');

async function testSchemaSetup() {
  try {
    console.log('🧪 Testing Turso DB Schema Setup');
    console.log('='.repeat(60));
    console.log();

    // Step 1: Connect to database
    console.log('1️⃣ Connecting to Turso database...');
    const dbService = new TursoDBService(TURSO_DATABASE_URL, TURSO_AUTH_TOKEN);
    await dbService.connect();
    console.log('✅ Connected successfully\n');

    // Step 2: Set up schema
    console.log('2️⃣ Setting up database schema...');
    await dbService.setupSchema();
    console.log('✅ Schema setup complete\n');

    // Step 3: Verify tables exist
    console.log('3️⃣ Verifying tables...');
    const tables = [
      'users',
      'transactions',
      'transaction_state_history',
      'disputes',
      'trust_scores',
      'ai_risk_logs'
    ];

    for (const table of tables) {
      const result = await dbService.query(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        [table]
      );
      if (result.rows.length > 0) {
        console.log(`  ✅ Table '${table}' exists`);
      } else {
        console.log(`  ❌ Table '${table}' NOT found`);
      }
    }
    console.log();

    // Step 4: Test basic operations
    console.log('4️⃣ Testing basic operations...');
    
    // Test user creation
    const testUser = {
      phone_number: '+2348135866028',
      first_name: 'Test',
      last_name: 'User',
      virtual_account_number: '1234567890'
    };
    
    console.log('  Creating test user...');
    const userId = await dbService.createUser(testUser);
    console.log(`  ✅ User created with ID: ${userId}`);

    // Test transaction creation
    const testTransaction = {
      seller_id: userId,
      item_description: 'Test Item',
      price: 50000,
      delivery_timeline_days: 5,
      inspection_window_days: 3
    };
    
    console.log('  Creating test transaction...');
    const transactionId = await dbService.createTransaction(testTransaction);
    console.log(`  ✅ Transaction created with ID: ${transactionId}`);

    // Clean up test data
    console.log('  Cleaning up test data...');
    await dbService.query('DELETE FROM transactions WHERE transaction_id = ?', [transactionId]);
    await dbService.query('DELETE FROM users WHERE id = ?', [userId]);
    console.log('  ✅ Test data cleaned up\n');

    console.log('='.repeat(60));
    console.log('✅ All tests passed!');
    console.log('='.repeat(60));
    console.log();

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run tests
testSchemaSetup();
