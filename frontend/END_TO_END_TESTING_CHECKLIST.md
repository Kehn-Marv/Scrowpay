# End-to-End Testing Checklist - Escrow Dashboard

**Task 18: Checkpoint - End-to-end testing**

This document provides a comprehensive manual testing checklist for verifying all implemented features of the ScrowPay Escrow Dashboard work correctly end-to-end.

## Testing Environment Setup

### Prerequisites
- [ ] AI Engine is running (Python Flask service on port 5000)
- [ ] Turso DB is accessible with valid credentials
- [ ] Squad API credentials are configured (sandbox mode recommended)
- [ ] Frontend server is running (use `start-server.ps1` or `START_SERVER.bat`)
- [ ] Browser developer console is open for monitoring errors
- [ ] At least 2 test user accounts created (for buyer/seller testing)

### Environment Variables Check
- [ ] `TURSO_DATABASE_URL` is set correctly
- [ ] `TURSO_AUTH_TOKEN` is valid
- [ ] `SQUAD_SECRET_KEY` is configured
- [ ] `SQUAD_PUBLIC_KEY` is configured
- [ ] `AI_ENGINE_URL` points to running AI service
- [ ] `HOLDING_ACCOUNT` is configured for escrow funds

---

## Flow 1: Complete Transaction Flow (Happy Path)
**Test: create → join → fund → ship → accept → complete**

### 1.1 Dashboard Load and Initial State
- [ ] Navigate to `dashboard.html`
- [ ] Verify user is redirected to sign-in if no session token
- [ ] Sign in with test user (Seller)
- [ ] Dashboard loads within 2 seconds
- [ ] Welcome message displays user's first name
- [ ] Account status shows "Verified ✓"
- [ ] Phone number displays correctly
- [ ] Available Balance displays (₦0.00 or actual balance)
- [ ] Locked Balance displays ₦0.00
- [ ] Total Balance = Available + Locked
- [ ] Trust Score displays (50 for new users)
- [ ] Trust Score visual indicator shows correct color
- [ ] "No active transactions" message displays

### 1.2 Create Transaction (Seller)
- [ ] Click "Create Escrow" button
- [ ] Modal opens with transaction creation form
- [ ] Enter item description (minimum 10 characters): "Brand new iPhone 15 Pro Max 256GB"
- [ ] Enter price: ₦850000
- [ ] Enter delivery timeline: 5 days
- [ ] Enter inspection window: 3 days
- [ ] Click "Create Transaction"
- [ ] Success modal displays with Transaction ID (format: TXN-xxxxx)
- [ ] Copy Transaction ID button works
- [ ] Transaction appears in "Active Transactions" list
- [ ] Transaction state shows "Created" or "Awaiting Funding"
- [ ] Close modal and verify transaction is visible on dashboard

**Validation Tests:**
- [ ] Try creating with price < ₦100 → Error: "Price must be between ₦100 and ₦10,000,000"
- [ ] Try creating with price > ₦10,000,000 → Error displayed
- [ ] Try creating with delivery timeline < 1 day → Error displayed
- [ ] Try creating with delivery timeline > 90 days → Error displayed
- [ ] Try creating with inspection window < 1 day → Error displayed
- [ ] Try creating with inspection window > 14 days → Error displayed
- [ ] Try creating with description < 10 characters → Error displayed

### 1.3 Join Transaction (Buyer)
- [ ] Sign out and sign in with second test user (Buyer)
- [ ] Dashboard loads successfully
- [ ] Click "Join Transaction" button
- [ ] Modal opens with Transaction ID input
- [ ] Paste the Transaction ID from step 1.2
- [ ] Click "Lookup Transaction"
- [ ] Transaction details display:
  - [ ] Transaction ID matches
  - [ ] Item description displays correctly
  - [ ] Price displays as ₦850,000.00
  - [ ] Delivery timeline shows "5 days"
  - [ ] Inspection window shows "3 days"
  - [ ] Seller trust score displays with progress bar

**Error Tests:**
- [ ] Try invalid Transaction ID → Error: "Transaction not found"
- [ ] Try Transaction ID that's already funded → Error: "Transaction already in progress"

### 1.4 AI Risk Scoring (Buyer)
- [ ] Click "Fund Escrow" button
- [ ] "AI Risk Analysis" section appears
- [ ] Loading indicator shows "Analyzing transaction for anomalies..."
- [ ] Wait for AI response (should complete within 3-5 seconds)
- [ ] Risk Score displays (1-100)
- [ ] Verdict displays ("pass" or "fail")
- [ ] If verdict = "pass", "Fund Escrow" button remains enabled
- [ ] If verdict = "fail", transaction blocked message displays
- [ ] Anomaly indicators list displays (if any)

**Expected for Normal Transaction:**
- [ ] Risk Score < 80
- [ ] Verdict = "pass"
- [ ] No blocking message

**AI Engine Failure Test:**
- [ ] Stop AI engine service
- [ ] Try to fund transaction
- [ ] Verify fallback behavior: verdict = "fail", message displays "Risk scoring unavailable"
- [ ] Restart AI engine for remaining tests

### 1.5 Fund Transaction (Buyer)
- [ ] Confirm AI verdict = "pass"
- [ ] Click "Fund Escrow" button (final confirmation)
- [ ] Loading indicator displays during Squad API call
- [ ] Success notification: "Transaction Funded!"
- [ ] Modal closes
- [ ] Dashboard updates:
  - [ ] Available Balance decreases by ₦850,000
  - [ ] Locked Balance increases by ₦850,000
  - [ ] Total Balance remains unchanged
  - [ ] Balance invariant holds: Available + Locked = Total
- [ ] Transaction appears in "Funded" or "In Transit" category
- [ ] Transaction state updates within 2 seconds

**Balance Update Verification:**
- [ ] Refresh page
- [ ] Balances persist correctly
- [ ] Transaction state persists

### 1.6 Mark as Shipped (Seller)
- [ ] Sign out and sign in as Seller
- [ ] Transaction appears in active transactions list
- [ ] Transaction state shows "Funded" or "Funded_Locked"
- [ ] "Mark as Shipped" button is visible
- [ ] Click "Mark as Shipped"
- [ ] Confirmation modal displays
- [ ] Transaction ID matches
- [ ] Click "Confirm Shipment"
- [ ] Success notification displays
- [ ] Transaction state changes to "In Transit"
- [ ] Inspection window countdown timer starts
- [ ] Timer displays remaining time (e.g., "3 days remaining")

### 1.7 Accept Item (Buyer)
- [ ] Sign out and sign in as Buyer
- [ ] Transaction shows state "In Transit"
- [ ] Inspection window countdown displays
- [ ] "Accept Item" button is visible
- [ ] "Dispute Item" button is visible
- [ ] Click "Accept Item"
- [ ] Confirmation modal displays
- [ ] Warning message: "This will release the funds to the seller"
- [ ] Click "Accept & Release Funds"
- [ ] Loading indicator during Squad API fund release
- [ ] Success notification: "Transaction Completed!"
- [ ] Transaction state changes to "Completed"
- [ ] Transaction moves to completed/history section

### 1.8 Fund Release and Balance Updates
**Seller Balance Check:**
- [ ] Sign out and sign in as Seller
- [ ] Available Balance increased by ₦850,000
- [ ] Locked Balance decreased by ₦850,000 (if seller had locked funds)
- [ ] Total Balance reflects fund receipt
- [ ] Balance invariant holds

**Buyer Balance Check:**
- [ ] Sign in as Buyer
- [ ] Locked Balance decreased by ₦850,000
- [ ] Available Balance unchanged (funds were already deducted)
- [ ] Balance invariant holds

### 1.9 Trust Score Updates
**Seller Trust Score:**
- [ ] Sign in as Seller
- [ ] Trust Score increased (or remains 50 if first transaction)
- [ ] Total Transactions count increased by 1
- [ ] Successful Transactions count increased by 1
- [ ] Visual indicator color reflects new score

**Buyer Trust Score:**
- [ ] Sign in as Buyer
- [ ] Trust Score increased
- [ ] Transaction counts updated

### 1.10 Transaction History and Audit Trail
- [ ] Click "View Transaction History" button
- [ ] Completed transaction appears in history
- [ ] Click on transaction to view details
- [ ] Transaction Details Modal displays:
  - [ ] All transaction information correct
  - [ ] Risk Score displays
  - [ ] AI Verdict displays
  - [ ] State History section shows all transitions:
    - [ ] Created → Funded_Locked (with timestamp)
    - [ ] Funded_Locked → In_Transit (with timestamp)
    - [ ] In_Transit → Completed (with timestamp)
  - [ ] Each state change has timestamp
  - [ ] Changed_by user IDs are correct

---

## Flow 2: Dispute Resolution Flow
**Test: create → join → fund → ship → dispute → resolve**

### 2.1 Create and Fund Transaction
- [ ] Follow steps 1.1-1.5 to create and fund a new transaction
- [ ] Use different item: "Samsung Galaxy S24 Ultra"
- [ ] Price: ₦650000
- [ ] Delivery: 3 days
- [ ] Inspection: 2 days

### 2.2 Ship Item
- [ ] Seller marks as shipped
- [ ] Transaction state: "In Transit"
- [ ] Inspection window starts

### 2.3 Dispute Transaction (Buyer)
- [ ] Sign in as Buyer
- [ ] Transaction shows "In Transit" state
- [ ] Click "Dispute Item" button
- [ ] Dispute modal opens
- [ ] Enter description: "Item received is damaged. Screen has cracks and device won't power on."
- [ ] Upload photos (optional - test file upload)
- [ ] Click "Submit Dispute"
- [ ] Success notification displays
- [ ] Transaction state changes to "Disputed"
- [ ] Funds remain locked (not released to seller)

### 2.4 Dispute Resolution
**AI-Assisted Resolution (if implemented):**
- [ ] Dispute data sent to AI engine
- [ ] AI confidence score calculated
- [ ] If confidence > 90%, automatic resolution applied
- [ ] If confidence ≤ 90%, flagged for manual review

**Manual Resolution:**
- [ ] Dispute appears in admin/manual review queue
- [ ] Resolution can be applied: refund buyer or release to seller
- [ ] After resolution, transaction state changes to "Completed"
- [ ] Funds transferred per resolution decision

### 2.5 Balance Updates After Dispute
**If Buyer Wins (Refund):**
- [ ] Buyer's Available Balance increases by transaction amount
- [ ] Buyer's Locked Balance decreases by transaction amount
- [ ] Seller receives nothing
- [ ] Seller's Trust Score decreases

**If Seller Wins (Release):**
- [ ] Seller's Available Balance increases
- [ ] Buyer's Locked Balance decreases
- [ ] Buyer's Trust Score may decrease

### 2.6 Trust Score Impact
- [ ] Disputed transactions affect trust scores
- [ ] Party at fault has score decreased
- [ ] Dispute count increments in trust_scores table
- [ ] Visual indicator updates

---

## Flow 3: Auto-Release Flow
**Test: create → join → fund → ship → wait for expiry → auto-complete**

### 3.1 Create Transaction with Short Inspection Window
- [ ] Create new transaction as Seller
- [ ] Set inspection window to 1 day (minimum)
- [ ] Fund transaction as Buyer
- [ ] Seller marks as shipped

### 3.2 Wait for Inspection Window Expiry
**Note:** For testing, you may need to modify the inspection window calculation or use a test mode that accelerates time.

**Production Testing:**
- [ ] Wait for inspection window to expire (1 day + delivery time)
- [ ] Monitor auto-release timer

**Development Testing (Recommended):**
- [ ] Modify `StateMachineService.js` to use shorter timer (e.g., 2 minutes instead of days)
- [ ] Or manually trigger auto-release via database update

### 3.3 Auto-Release Execution
- [ ] Timer expires
- [ ] Transaction automatically transitions to "Completed"
- [ ] Funds automatically released to seller
- [ ] No buyer action required
- [ ] Both parties receive notification (if notifications implemented)

### 3.4 Verify Auto-Release
- [ ] Transaction state = "Completed"
- [ ] State history shows auto-release flag
- [ ] Seller's Available Balance increased
- [ ] Buyer's Locked Balance decreased
- [ ] Trust scores updated (successful transaction)

### 3.5 Auto-Release Cancellation Test
- [ ] Create another transaction with short inspection window
- [ ] Fund and ship
- [ ] Before timer expires, buyer accepts item
- [ ] Verify auto-release timer is cancelled
- [ ] Transaction completes normally
- [ ] No duplicate fund release

---

## Flow 4: Error Handling Paths

### 4.1 Squad API Errors

**Authentication Error:**
- [ ] Temporarily use invalid Squad API key
- [ ] Try to fund transaction
- [ ] Error message: "Authentication failed. Please contact support."
- [ ] Transaction state unchanged
- [ ] Balances unchanged

**Insufficient Funds:**
- [ ] Try to fund transaction with amount > available balance
- [ ] Error message displays
- [ ] Transaction not funded

**Network Error:**
- [ ] Disconnect internet
- [ ] Try any Squad API operation
- [ ] Error message: "No internet connection. Please check your network."
- [ ] Reconnect and retry successfully

**Server Error (500+):**
- [ ] Mock Squad API 500 error (if possible)
- [ ] Verify retry logic with exponential backoff
- [ ] After 3 retries, error message displays
- [ ] User can retry manually

### 4.2 Turso DB Errors

**Connection Failure:**
- [ ] Use invalid Turso credentials
- [ ] Try to load dashboard
- [ ] Error message: "Unable to load data. Please refresh the page."
- [ ] Fix credentials and refresh

**Query Failure:**
- [ ] Monitor console for any database errors
- [ ] Verify graceful error handling
- [ ] User-friendly messages displayed

### 4.3 AI Engine Errors

**Engine Unavailable:**
- [ ] Stop AI engine
- [ ] Try to fund transaction
- [ ] Fallback verdict = "fail"
- [ ] Message: "Risk scoring unavailable. Transaction blocked for security."
- [ ] Transaction not funded

**Timeout (>5 seconds):**
- [ ] Simulate slow AI response
- [ ] Verify 5-second timeout
- [ ] Fallback to "fail" verdict
- [ ] User notified

**Invalid Response:**
- [ ] Mock invalid AI response format
- [ ] Verify error handling
- [ ] Safe default applied

### 4.4 State Machine Errors

**Invalid Transition:**
- [ ] Try to transition from "Created" directly to "Completed" (invalid)
- [ ] Error message displays
- [ ] State unchanged
- [ ] Error logged

**Permission Violation:**
- [ ] As Buyer, try to mark transaction as shipped (seller-only action)
- [ ] Error: "Only seller can mark as shipped"
- [ ] State unchanged

**Concurrent Actions:**
- [ ] Buyer accepts item
- [ ] Simultaneously, auto-release timer fires
- [ ] Verify only one fund release occurs
- [ ] No duplicate transfers
- [ ] State history shows single completion

### 4.5 Validation Errors

**Client-Side Validation:**
- [ ] All validation tests from section 1.2
- [ ] Verify errors display immediately
- [ ] No server requests made for invalid inputs

**Server-Side Validation:**
- [ ] Bypass client validation (browser dev tools)
- [ ] Submit invalid data
- [ ] Server rejects with appropriate error
- [ ] Database constraints prevent invalid data

---

## Flow 5: Real-Time Updates and Polling

### 5.1 Balance Polling
- [ ] Monitor network tab in browser dev tools
- [ ] Verify Squad API balance query every 30 seconds
- [ ] Verify Turso DB transaction query every 10 seconds
- [ ] Balances update automatically without page refresh

### 5.2 Transaction State Updates
- [ ] Create transaction as Seller
- [ ] In separate browser/incognito, sign in as Buyer and fund
- [ ] In Seller's browser, verify transaction state updates within 10 seconds
- [ ] No page refresh required

### 5.3 Optimistic UI Updates
- [ ] Perform any action (create, fund, ship, accept)
- [ ] UI updates immediately (optimistic)
- [ ] Loading indicator shows during backend sync
- [ ] If backend fails, UI reverts to previous state

### 5.4 Staleness Indicator
- [ ] Disconnect internet
- [ ] Wait 30+ seconds
- [ ] Staleness indicator appears: "Using Cached Balance"
- [ ] Message: "Squad API is temporarily unreachable. Displaying last known balance."
- [ ] Reconnect internet
- [ ] Staleness indicator disappears
- [ ] Fresh balance loaded

---

## Flow 6: Security Features

### 6.1 Session Management
- [ ] Sign in successfully
- [ ] Session token stored in localStorage
- [ ] Close browser and reopen
- [ ] Session persists (no re-login required)
- [ ] Wait 24 hours (or modify session expiry for testing)
- [ ] Session expires
- [ ] Redirected to sign-in page

**Logout:**
- [ ] Click "Logout" button
- [ ] Session token cleared from localStorage
- [ ] Redirected to sign-in page
- [ ] Cannot access dashboard without re-login

### 6.2 Input Sanitization (XSS Prevention)
- [ ] Try to create transaction with description: `<script>alert('XSS')</script>`
- [ ] Verify script does not execute
- [ ] HTML is escaped and displayed as text
- [ ] No XSS vulnerability

### 6.3 Rate Limiting
- [ ] Create 10 transactions rapidly (within 1 hour)
- [ ] 11th transaction attempt blocked
- [ ] Error message: "Rate limit exceeded. Maximum 10 transactions per hour."
- [ ] Wait 1 hour or reset rate limit
- [ ] Can create transactions again

### 6.4 Security Event Logging
- [ ] Perform actions that trigger security logs:
  - [ ] Failed risk check (high risk score)
  - [ ] Blocked transaction
  - [ ] Rate limit violation
- [ ] Verify logs created in database (security_logs or ai_risk_logs table)
- [ ] Sensitive data redacted in logs

---

## Flow 7: Responsive Design and Performance

### 7.1 Mobile Responsiveness (320px - 768px)
- [ ] Open dashboard on mobile device or resize browser to 320px width
- [ ] Mobile navigation menu appears (hamburger icon)
- [ ] Click hamburger menu
- [ ] Mobile menu opens with:
  - [ ] User info
  - [ ] Create Escrow button
  - [ ] Join Transaction button
  - [ ] View History button
  - [ ] Logout button
- [ ] All buttons are touch-friendly (minimum 44x44px)
- [ ] Text is readable (no overflow)
- [ ] Modals are responsive and scrollable
- [ ] Forms are usable on mobile

### 7.2 Tablet Responsiveness (768px - 1024px)
- [ ] Resize browser to tablet width
- [ ] Layout adjusts appropriately
- [ ] Desktop navigation visible
- [ ] Grid layouts adjust (2 columns instead of 3)

### 7.3 Desktop Responsiveness (1024px - 2560px)
- [ ] Test on various desktop widths
- [ ] Layout scales appropriately
- [ ] Max-width constraints prevent excessive stretching
- [ ] Font sizes scale on large displays (1440px+, 2560px+)

### 7.4 Performance
**Initial Load Time:**
- [ ] Clear browser cache
- [ ] Open dashboard
- [ ] Measure load time (use browser dev tools Performance tab)
- [ ] Initial view loads within 2 seconds on 4G connection

**UI Update Speed:**
- [ ] Perform state transition (e.g., fund transaction)
- [ ] UI updates within 2 seconds
- [ ] No noticeable lag

**AI Scoring Speed:**
- [ ] Fund transaction
- [ ] AI risk scoring completes within 3 seconds
- [ ] If >5 seconds, timeout occurs

---

## Flow 8: Integration with Account Creation

### 8.1 New User Flow
- [ ] Complete account creation flow (account-creation.html)
- [ ] After successful creation, redirected to dashboard
- [ ] Session token passed via URL parameter or localStorage
- [ ] Dashboard loads user data
- [ ] Welcome message displays user's first name
- [ ] Virtual Account number displays
- [ ] Trust Score initialized to 50
- [ ] "No active transactions" message displays

### 8.2 Onboarding Tooltips (if implemented)
- [ ] First-time user sees onboarding tooltips
- [ ] Tooltips explain key features
- [ ] Can dismiss tooltips
- [ ] Tooltips don't show on subsequent visits

---

## Flow 9: Transaction History and Filtering

### 9.1 View Transaction History
- [ ] Click "View Transaction History" button
- [ ] All transactions display (buyer and seller)
- [ ] Each transaction shows:
  - [ ] Transaction ID
  - [ ] Date
  - [ ] Item description
  - [ ] Amount
  - [ ] Counterparty name
  - [ ] Final state
  - [ ] Trust score impact

### 9.2 Filtering
- [ ] Filter by date range
- [ ] Filter by transaction state (Created, Funded, In Transit, Disputed, Completed)
- [ ] Filter by role (Buyer, Seller)
- [ ] Multiple filters work together

### 9.3 Sorting
- [ ] Sort by date (ascending/descending)
- [ ] Sort by amount (ascending/descending)
- [ ] Sort by state

### 9.4 Pagination
- [ ] If >20 transactions, pagination appears
- [ ] Navigate to page 2
- [ ] 20 transactions per page
- [ ] Page numbers work correctly

### 9.5 Transaction Details
- [ ] Click any transaction in history
- [ ] Transaction Details Modal opens
- [ ] All information displays correctly
- [ ] State history shows complete audit trail
- [ ] Risk score and AI verdict visible

---

## Flow 10: Add and Withdraw Funds

### 10.1 Add Funds
- [ ] Click "Add Funds" button
- [ ] Modal displays virtual account details:
  - [ ] Account number (10 digits)
  - [ ] Bank name (GTBank)
  - [ ] Account name (user's name)
- [ ] Copy account number button works
- [ ] Instructions are clear
- [ ] Important notes displayed

**Actual Fund Transfer (Optional):**
- [ ] Transfer money to virtual account from real bank account
- [ ] Wait 5-10 minutes
- [ ] Refresh dashboard
- [ ] Available Balance increases by transferred amount

### 10.2 Withdraw Funds
- [ ] Click "Withdraw Funds" button
- [ ] Modal displays available balance
- [ ] Enter bank account number (10 digits)
- [ ] Select bank name from dropdown
- [ ] Enter amount to withdraw
- [ ] Amount validation:
  - [ ] Cannot exceed available balance
  - [ ] Minimum withdrawal amount enforced (if any)
- [ ] Click "Withdraw"
- [ ] Loading indicator during Squad API call
- [ ] Success notification
- [ ] Available Balance decreases by withdrawal amount

**Withdraw Button State:**
- [ ] If Available Balance = ₦0.00, "Withdraw Funds" button is disabled
- [ ] Tooltip or message explains why

---

## Summary Checklist

### Core Functionality
- [ ] All 3 main transaction flows work end-to-end
- [ ] Balance calculations are always correct (invariant holds)
- [ ] Trust scores update appropriately
- [ ] State machine enforces valid transitions only
- [ ] AI risk scoring works before funding
- [ ] Auto-release mechanism functions correctly

### Error Handling
- [ ] All error paths tested and display user-friendly messages
- [ ] Retry logic works for transient failures
- [ ] Fallback behaviors are safe (e.g., AI failure → block transaction)
- [ ] No crashes or unhandled exceptions

### Security
- [ ] Session management works correctly
- [ ] XSS prevention effective
- [ ] Rate limiting enforced
- [ ] Security events logged
- [ ] No sensitive data exposed in logs or UI

### Performance
- [ ] Initial load < 2 seconds
- [ ] UI updates < 2 seconds
- [ ] AI scoring < 3 seconds
- [ ] Polling intervals correct (30s Squad, 10s Turso)

### Responsive Design
- [ ] Works on mobile (320px+)
- [ ] Works on tablet (768px+)
- [ ] Works on desktop (1024px+)
- [ ] Works on large displays (2560px+)
- [ ] Touch-friendly on mobile

### Integration
- [ ] Account creation → dashboard flow works
- [ ] Session persists across page reloads
- [ ] All external services integrate correctly (Squad, Turso, AI)

---

## Known Limitations (Hackathon Context)

1. **Auto-Release Testing**: Requires waiting for actual time to pass or modifying code for accelerated testing
2. **Real Money Transfers**: Testing with actual Squad API transfers requires real funds
3. **Dispute Resolution**: AI-assisted resolution may not be fully implemented; manual resolution may be required
4. **Notifications**: Email/SMS notifications may not be implemented
5. **Concurrent User Testing**: Requires multiple devices or browser sessions

---

## Reporting Issues

If any test fails, document:
1. **Test Step**: Which step failed
2. **Expected Behavior**: What should happen
3. **Actual Behavior**: What actually happened
4. **Error Messages**: Any console errors or user-facing errors
5. **Screenshots**: Visual evidence of the issue
6. **Reproduction Steps**: How to reproduce the issue

---

## Test Completion Sign-Off

**Tester Name:** ___________________________

**Date:** ___________________________

**Overall Status:** 
- [ ] All critical flows pass
- [ ] Minor issues documented
- [ ] Ready for demo/deployment

**Notes:**
_____________________________________________________________
_____________________________________________________________
_____________________________________________________________

