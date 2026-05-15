/**
 * Test Helper: Backdates shipped_at timestamp for dispute testing
 * 
 * This script modifies a transaction's shipped_at timestamp to simulate
 * that it was shipped X days ago, allowing immediate dispute testing
 * without waiting for the actual delivery timeline.
 * 
 * Usage:
 * 1. Update the TRANSACTION_ID and DAYS_AGO constants below
 * 2. Run: node scripts/test-dispute-helper.js
 */

// ============================================================================
// CONFIGURATION - Update these values
// ============================================================================
const TRANSACTION_ID = 'TXN-your-transaction-id-here'; // Replace with your transaction ID
const DAYS_AGO = 2; // How many days ago to set the shipped_at timestamp

// Your Turso DB credentials (from .env or frontend/env.js)
const TURSO_DATABASE_URL = 'your-turso-url-here';
const TURSO_AUTH_TOKEN = 'your-turso-token-here';

// ============================================================================
// Script Logic
// ============================================================================

async function backdateShippedAt() {
  try {
    console.log(`\n🔧 Backdating shipped_at for transaction: ${TRANSACTION_ID}`);
    console.log(`   Setting to ${DAYS_AGO} days ago...\n`);

    // Calculate the backdated timestamp
    const backdatedDate = new Date();
    backdatedDate.setDate(backdatedDate.getDate() - DAYS_AGO);
    const backdatedISO = backdatedDate.toISOString();

    console.log(`   New shipped_at: ${backdatedISO}`);

    // Prepare the SQL update
    const sql = `
      UPDATE transactions 
      SET shipped_at = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE transaction_id = ?
    `;

    // Execute via Turso HTTP API
    const response = await fetch(`${TURSO_DATABASE_URL}/v2/pipeline`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TURSO_AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          {
            type: 'execute',
            stmt: {
              sql: sql,
              args: [
                { type: 'text', value: backdatedISO },
                { type: 'text', value: TRANSACTION_ID }
              ]
            }
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    console.log('\n✅ Success! Transaction backdated.');
    console.log('\n📋 Result:', JSON.stringify(result, null, 2));
    console.log('\n💡 You can now test the dispute functionality immediately!');
    console.log('   Refresh your dashboard to see the updated transaction.\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\n💡 Make sure to update the configuration values at the top of this script.\n');
  }
}

// Run the script
backdateShippedAt();
