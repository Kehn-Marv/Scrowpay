# Testing Disputes Without Waiting

The dispute functionality requires transactions to be in the `In_Transit` state, but there's no hard-coded time restriction in the UI. You can test disputes immediately using any of these methods:

## Method 1: Browser Console (Easiest - No Code Changes)

1. Open your dashboard in the browser
2. Navigate to a transaction that's in `In_Transit` state
3. Open the browser console (F12 or Right-click → Inspect → Console)
4. Run this command to backdate the `shipped_at` timestamp:

```javascript
// Replace 'TXN-your-id-here' with your actual transaction ID
const transactionId = 'TXN-your-id-here';
const daysAgo = 2; // How many days to backdate

(async function backdateTransaction() {
  try {
    // Get DB service from window
    const dbService = window.tursoDBService;
    if (!dbService) {
      console.error('❌ Database service not found. Make sure you\'re on the dashboard page.');
      return;
    }

    // Calculate backdated timestamp
    const backdatedDate = new Date();
    backdatedDate.setDate(backdatedDate.getDate() - daysAgo);
    const backdatedISO = backdatedDate.toISOString();

    console.log(`🔧 Backdating transaction ${transactionId} to ${daysAgo} days ago...`);
    console.log(`   New shipped_at: ${backdatedISO}`);

    // Update the database
    const sql = `
      UPDATE transactions 
      SET shipped_at = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE transaction_id = ?
    `;

    await dbService._executeHttp(sql, [backdatedISO, transactionId]);

    console.log('✅ Success! Transaction backdated.');
    console.log('💡 Refresh the page to see the updated transaction.');
    
    // Auto-refresh after 2 seconds
    setTimeout(() => {
      console.log('🔄 Refreshing page...');
      location.reload();
    }, 2000);

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
})();
```

## Method 2: SQL Direct Update (Via Turso CLI or Dashboard)

If you have access to the Turso database directly:

```sql
-- Replace 'TXN-your-id-here' with your transaction ID
UPDATE transactions 
SET shipped_at = datetime('now', '-2 days')
WHERE transaction_id = 'TXN-your-id-here';
```

## Method 3: Use the Test Helper Script

1. Open `scripts/test-dispute-helper.js`
2. Update the configuration at the top:
   - `TRANSACTION_ID`: Your transaction ID
   - `DAYS_AGO`: How many days to backdate (1 is enough)
   - `TURSO_DATABASE_URL`: Your Turso database URL
   - `TURSO_AUTH_TOKEN`: Your Turso auth token

3. Run the script:
```bash
node scripts/test-dispute-helper.js
```

## Method 4: Temporary Code Modification (For Development)

Add this to your `frontend/env.js` or `frontend/config.js`:

```javascript
// Test mode - bypasses time restrictions
window.SCROWPAY_TEST_MODE = true;
```

Then modify the dispute button logic in `dashboard.html` to check this flag.

## How Disputes Work

Once you've backdated the transaction:

1. **Buyer View**: In the `In_Transit` state, you'll see:
   - "Accept Item" button (green)
   - "Dispute Item" button (red)

2. **Seller View**: In the `In_Transit` state, you'll see:
   - "Report a problem" button (if buyer is stalling)

3. **Click the Dispute Button** to open the Dispute Agent modal

4. **Fill in the dispute form**:
   - Describe the issue (minimum 10 characters)
   - Upload photos (optional, up to 4 images)
   - Click "Send to agent"

5. **The AI Agent will**:
   - Analyze the transaction history
   - Review your evidence
   - May ask a clarifying question
   - Provide a verdict with confidence score

6. **Resolution**:
   - If confidence > 90%: Automatic resolution (funds transferred)
   - If confidence 70-90%: AI-assisted (flagged for review)
   - If confidence < 70%: Manual review required

## Quick Test Workflow

1. Create a transaction as a seller
2. Have a buyer fund it (or fund it yourself with a different account)
3. Mark it as shipped (moves to `In_Transit`)
4. Use **Method 1** (browser console) to backdate the `shipped_at` timestamp
5. Refresh the page
6. Click "Dispute Item" button
7. Test the dispute flow!

## Notes

- The minimum delivery timeline is 1 day, but you can test immediately by backdating
- The inspection window is separate from the delivery timeline
- Disputes can be raised by either buyer or seller while in `In_Transit` state
- The AI agent uses Gemini to analyze disputes (make sure your API key is configured)
