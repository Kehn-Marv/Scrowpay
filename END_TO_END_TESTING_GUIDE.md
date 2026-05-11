# ScrowPay End-to-End Testing Guide

## 🎯 Complete Testing Flow - From Account Creation to Transaction Completion

This guide walks you through testing the entire ScrowPay application from start to finish.

---

## 📋 Prerequisites

Before you start, ensure you have:
- ✅ Docker Desktop installed and running
- ✅ Internet connection (for Turso database and Squad API)
- ✅ Updated API keys in `.env` and `frontend/env.js` (already done!)

---

## 🚀 Step 1: Start the Application

### Option A: Quick Start (Windows)

```bash
# Double-click or run in terminal
start-dev.bat
```

This will:
1. Check Docker installation
2. Verify `.env` file exists
3. Start all services (AI Engine + Frontend)
4. Open the app in your browser

### Option B: Manual Start (All Platforms)

```bash
# Navigate to project root
cd path/to/scrowpay

# Start all services
docker-compose up -d

# View logs (optional)
docker-compose logs -f
```

### Verify Services Are Running

1. **Check Docker containers:**
   ```bash
   docker-compose ps
   ```
   You should see:
   - `scrowpay-ai-engine` - Status: Up
   - `scrowpay-frontend` - Status: Up

2. **Check AI Engine health:**
   - Open: http://localhost:5000/health
   - Should show: `{"status": "healthy", "model_loaded": true}`

3. **Check Frontend:**
   - Open: http://localhost:8080
   - Should load the landing page

---

## 🎬 Step 2: Test Account Creation Flow

### 2.1 Access Landing Page

1. Open browser: http://localhost:8080/website.html
2. You should see the ScrowPay landing page
3. Click **"Create Account"** button

### 2.2 Stage 1: Phone Number Entry

1. Enter a Nigerian phone number (e.g., `08135866028` or `8135866028`)
2. System validates format
3. Click **"Next"**
4. System checks for duplicate phone numbers in database

**Expected Result:** ✅ Proceeds to Stage 2

### 2.3 Stage 2: OTP Verification

1. A 6-digit OTP is displayed in browser console (for testing)
2. Check browser console (F12) for: `[OTPService] Generated OTP: XXXXXX`
3. Enter the 6-digit OTP
4. Click **"Verify"**

**Expected Result:** ✅ Success modal appears, click "Continue"

### 2.4 Stage 3: ID Information

1. Choose **NIN** or **BVN**
2. Enter 11-digit ID number (use test data or real if available)
3. Click **"Next"**
4. System validates format and checks for duplicates

**Expected Result:** ✅ Proceeds to Stage 4

### 2.5 Stage 4: Personal Information

1. Enter **First Name** (e.g., "John")
2. Enter **Middle Name** (optional)
3. Enter **Last Name** (e.g., "Doe")
4. Select **Date of Birth** (must be 18+ years old)
5. Select **Gender**
6. Click **"Next"**

**Expected Result:** ✅ Proceeds to Stage 5

### 2.6 Stage 5: Squad API Verification & Virtual Account Creation

**This is the critical stage where your account number is created!**

1. System sends data to Squad API for verification
2. Squad API validates your information
3. **Virtual account number is created** (e.g., `1234567890`)
4. A modal appears showing:
   ```
   Account Created Successfully! 🎉
   
   Your ScrowPay account has been created!
   
   Account Number: 1234567890
   Bank: GTBank (058)
   
   You can now receive payments to this account.
   ```
5. **IMPORTANT:** Note this account number (it will also be on your dashboard)
6. Click **"Continue"**

**Expected Result:** ✅ Virtual account created, proceeds to Stage 6

**Troubleshooting:**
- If this fails, check:
  - Squad API keys are correct in `frontend/env.js`
  - Internet connection is stable
  - Check browser console for error messages

### 2.7 Stage 6: Face Verification Intro

1. Read the face verification instructions
2. Click **"Start Verification"**

**Expected Result:** ✅ Proceeds to Stage 7

### 2.8 Stage 7: Blink Detection

1. Allow camera access when prompted
2. Position your face in the oval overlay
3. Blink naturally 2-3 times
4. System detects blinks using MediaPipe
5. Success message appears

**Expected Result:** ✅ Face verified, proceeds to Stage 8

**Note:** If you don't have a camera or want to skip, you can modify the code temporarily.

### 2.9 Stage 8: Address Information

**Current Address:**
1. Select **State** (e.g., "Lagos")
2. Select **LGA** (e.g., "Ikeja")
3. Select **Area** (e.g., "Allen Avenue")
4. Enter **Street Address** (e.g., "123 Main Street")
5. Enter **Landmark** (optional, e.g., "Near Shoprite")

**Permanent Address:**
1. Check "Same as current address" OR
2. Fill in different permanent address details

Click **"Next"**

**Expected Result:** ✅ Proceeds to Stage 9

### 2.10 Stage 9: PIN Setup

1. Enter a 6-digit PIN (e.g., `123456`)
2. Re-enter the same PIN to confirm
3. Click **"Complete"**
4. System:
   - Hashes your PIN (SHA-256)
   - Saves all data to Turso database
   - Creates your user account

**Expected Result:** ✅ Proceeds to Stage 10

### 2.11 Stage 10: Success Screen

1. You see a success checkmark
2. Message: "Account Created Successfully!"
3. Click anywhere on the screen
4. System creates a session
5. **Automatically redirects to dashboard**

**Expected Result:** ✅ You're now on the dashboard!

---

## 📊 Step 3: Explore the Dashboard

### 3.1 Verify Your Information

You should see:

1. **Welcome Card:**
   - ✅ Your name: "Welcome, John!"
   - ✅ Account Status: Verified ✓
   - ✅ Phone Number: +2348135866028
   - ✅ **Account Number: 1234567890** ← NEW! This is your virtual account
   - ✅ Bank: GTBank
   - ✅ Account Type: Personal

2. **Copy Account Number:**
   - Click the copy icon next to your account number
   - You should see: "Account number copied to clipboard!"

3. **Balance Display:**
   - Available Balance: ₦0.00
   - Locked Balance: ₦0.00
   - Total Balance: ₦0.00

4. **Trust Score:**
   - Score: 50 (default for new users)
   - Status: Medium Trust
   - Total Transactions: 0

5. **Quick Actions:**
   - Create Escrow
   - Join Transaction
   - Add Funds
   - Withdraw Funds

6. **Active Transactions:**
   - "No transactions yet"

**Expected Result:** ✅ All information displays correctly

---

## 🔄 Step 4: Test Login/Logout Flow

### 4.1 Test Logout

1. Click **"Logout"** button (top right)
2. Confirm logout
3. You're redirected to `sign-in.html`

**Expected Result:** ✅ Logged out successfully

### 4.2 Test Login

1. You should be on the sign-in page
2. Enter your **phone number** (e.g., `08135866028`)
3. Enter your **6-digit PIN** (e.g., `123456`)
4. Click **"Sign In"**
5. System:
   - Validates credentials against database
   - Verifies PIN hash
   - Creates new session
   - Redirects to dashboard

**Expected Result:** ✅ Logged back in, see your dashboard with same account number!

**This confirms persistent authentication is working!** 🎉

---

## 💰 Step 5: Test Transaction Creation (Seller Flow)

### 5.1 Create an Escrow Transaction

1. On dashboard, click **"Create Escrow"**
2. Fill in the form:
   - **Item Description:** "iPhone 13 Pro Max 256GB"
   - **Price:** 450000 (₦450,000)
   - **Delivery Timeline:** 3 (days)
   - **Inspection Window:** 2 (days)
3. Click **"Create Transaction"**

4. System:
   - Validates input
   - Generates unique Transaction ID
   - Saves to database
   - Shows success modal with Transaction ID

5. **Copy the Transaction ID** (e.g., `TXN-1715385600-ABC123`)

**Expected Result:** ✅ Transaction created, ID displayed

### 5.2 View Transaction in Dashboard

1. Close the modal
2. Scroll to "Active Transactions"
3. You should see your transaction:
   - Item: iPhone 13 Pro Max 256GB
   - Amount: ₦450,000
   - Status: Created (Awaiting Funding)
   - Your Role: Seller

**Expected Result:** ✅ Transaction appears in list

---

## 🛒 Step 6: Test Transaction Funding (Buyer Flow)

### 6.1 Create a Second Account (Buyer)

1. **Logout** from seller account
2. Click **"Create Account"** on sign-in page
3. Complete registration with **different phone number**
4. Use a different name (e.g., "Jane Smith")
5. Complete all stages
6. You're now logged in as the buyer

### 6.2 Join the Transaction

1. On dashboard, click **"Join Transaction"**
2. Enter the **Transaction ID** you copied earlier
3. Click **"Find Transaction"**

4. System displays transaction details:
   - Item description
   - Price
   - Seller name
   - Seller trust score
   - Delivery timeline
   - Inspection window

5. Review the details
6. Click **"Proceed to Fund"**

**Expected Result:** ✅ Transaction details loaded

### 6.3 AI Risk Scoring (Critical!)

**This is where the AI magic happens!**

1. System automatically calls AI Risk Engine
2. AI analyzes:
   - Transaction amount (₦450,000)
   - Your transaction velocity (0 for new user)
   - Your account age (0 days)
   - Time of day
   - Seller's trust score (50)
   - Device fingerprint

3. AI returns:
   - **Risk Score:** 0-100
   - **Verdict:** Pass or Fail
   - **Confidence:** Percentage

4. You see the risk assessment:
   ```
   AI Risk Assessment
   Risk Score: 45
   Verdict: PASS ✓
   Confidence: 85%
   
   This transaction appears safe to proceed.
   ```

**Expected Results:**
- ✅ **If Risk Score ≤ 80:** Transaction allowed, proceed to funding
- ❌ **If Risk Score > 80:** Transaction blocked, cannot fund

**Check AI Engine Logs:**
```bash
docker-compose logs -f ai-engine
```
You should see:
```
[AI Engine] Received scoring request
[AI Engine] Features: {...}
[AI Engine] Risk Score: 45
[AI Engine] Verdict: pass
```

### 6.4 Fund the Transaction

1. If risk check passed, click **"Fund Transaction"**
2. System:
   - Calls Squad API to transfer funds
   - Moves funds from your account to holding account
   - Updates transaction state: Created → Funded_Locked
   - Updates balances

3. Success notification appears
4. Transaction state changes to "Funded & Locked"

**Expected Result:** ✅ Transaction funded successfully

### 6.5 Verify Balance Updates

1. Check your balance card:
   - Available Balance: ₦0.00 (or remaining balance)
   - **Locked Balance: ₦450,000** ← Funds are locked!
   - Total Balance: ₦450,000

2. Check "Active Transactions":
   - Status: Funded & Locked
   - Your Role: Buyer

**Expected Result:** ✅ Balances updated correctly

---

## 📦 Step 7: Test Transaction Completion (Seller Flow)

### 7.1 Switch Back to Seller Account

1. **Logout** from buyer account
2. **Sign in** as seller (first account)
3. Go to dashboard

### 7.2 Mark Item as Shipped

1. Find the transaction in "Active Transactions"
2. Status should be: Funded & Locked
3. Click **"Mark as Shipped"**
4. Confirm action

5. System:
   - Updates state: Funded_Locked → In_Transit
   - Starts inspection window countdown
   - Logs state change

**Expected Result:** ✅ Status changes to "In Transit"

### 7.3 Verify Seller Balance

1. Check balance card:
   - Available Balance: ₦0.00 (funds still locked)
   - Locked Balance: ₦450,000 (waiting for buyer acceptance)

**Expected Result:** ✅ Funds still locked (correct!)

---

## ✅ Step 8: Test Transaction Acceptance (Buyer Flow)

### 8.1 Switch Back to Buyer Account

1. **Logout** from seller account
2. **Sign in** as buyer
3. Go to dashboard

### 8.2 Accept the Item

1. Find the transaction in "Active Transactions"
2. Status should be: In Transit
3. Click **"Accept Item"**
4. Confirm acceptance

5. System:
   - Updates state: In_Transit → Completed
   - Calls Squad API to release funds to seller
   - Updates both users' balances
   - Recalculates trust scores
   - Logs completion

**Expected Result:** ✅ Transaction completed!

### 8.3 Verify Buyer Balance

1. Check balance card:
   - Available Balance: ₦0.00
   - Locked Balance: ₦0.00 (funds released!)
   - Total Balance: ₦0.00

**Expected Result:** ✅ Funds released from buyer

### 8.4 Verify Trust Score Update

1. Check Trust Score card:
   - Score should increase (e.g., 50 → 55)
   - Total Transactions: 1
   - Successful: 1

**Expected Result:** ✅ Trust score updated

---

## 💰 Step 9: Verify Seller Received Funds

### 9.1 Switch Back to Seller Account

1. **Logout** from buyer account
2. **Sign in** as seller
3. Go to dashboard

### 9.2 Check Seller Balance

1. Check balance card:
   - **Available Balance: ₦450,000** ← Funds received!
   - Locked Balance: ₦0.00
   - Total Balance: ₦450,000

**Expected Result:** ✅ Seller received funds!

### 9.3 Check Seller Trust Score

1. Check Trust Score card:
   - Score should increase (e.g., 50 → 55)
   - Total Transactions: 1
   - Successful: 1

**Expected Result:** ✅ Trust score updated

### 9.4 Check Transaction History

1. Transaction should now show:
   - Status: Completed ✓
   - Your Role: Seller
   - Amount: ₦450,000

**Expected Result:** ✅ Transaction marked as completed

---

## 🎉 Step 10: Verify Complete Flow

### Checklist - Everything Should Work:

- ✅ **Account Creation:** User can register with phone + PIN
- ✅ **Virtual Account:** Account number created and displayed
- ✅ **Persistent Login:** User can logout and login with same credentials
- ✅ **Account Number Display:** Always visible on dashboard with copy button
- ✅ **Transaction Creation:** Seller can create escrow
- ✅ **Transaction Discovery:** Buyer can find transaction by ID
- ✅ **AI Risk Scoring:** AI engine analyzes transaction before funding
- ✅ **Transaction Funding:** Buyer can fund if risk check passes
- ✅ **Balance Management:** Locked vs Available balance tracked correctly
- ✅ **State Transitions:** Created → Funded → In Transit → Completed
- ✅ **Fund Release:** Funds transferred to seller on completion
- ✅ **Trust Score:** Both parties' scores updated after completion
- ✅ **Transaction History:** All transactions logged and visible

---

## 🧪 Additional Tests

### Test 1: High-Risk Transaction (AI Blocking)

1. Create a transaction with very high amount (e.g., ₦5,000,000)
2. Try to fund as a brand new account (0 days old)
3. AI should flag as high risk and block

**Expected:** ❌ Transaction blocked by AI

### Test 2: Dispute Flow

1. Create and fund a transaction
2. Seller marks as shipped
3. Buyer clicks **"Dispute Item"**
4. Upload photo and description
5. Transaction state: In_Transit → Disputed

**Expected:** ✅ Dispute created, funds remain locked

### Test 3: Auto-Release

1. Create and fund a transaction
2. Seller marks as shipped
3. Wait for inspection window to expire (or modify code to test)
4. System auto-releases funds to seller

**Expected:** ✅ Funds auto-released after timeout

### Test 4: Session Expiry

1. Login to dashboard
2. Wait 30 minutes (or modify session timeout in code)
3. Try to perform an action
4. System should logout and redirect to sign-in

**Expected:** ✅ Session expired, redirected to login

---

## 🐛 Troubleshooting

### Issue: AI Engine Not Responding

**Symptoms:** Risk scoring fails, timeout errors

**Solution:**
```bash
# Check AI engine status
docker-compose ps

# View AI engine logs
docker-compose logs -f ai-engine

# Restart AI engine
docker-compose restart ai-engine

# Check health endpoint
curl http://localhost:5000/health
```

### Issue: Squad API Errors

**Symptoms:** Virtual account creation fails, balance queries fail

**Solution:**
1. Verify API keys in `frontend/env.js`
2. Check if keys are sandbox keys (start with `sandbox_sk_` and `sandbox_pk_`)
3. Verify internet connection
4. Check Squad API status: https://squadco.com/status

### Issue: Database Connection Failed

**Symptoms:** "Unable to connect to database" errors

**Solution:**
1. Verify Turso credentials in `frontend/env.js`
2. Check internet connection
3. Test database connection:
   ```bash
   # Install Turso CLI
   curl -sSfL https://get.tur.so/install.sh | bash
   
   # Test connection
   turso db shell scrowpay-db-scrop
   ```

### Issue: Camera Not Working (Face Verification)

**Symptoms:** Camera access denied, black screen

**Solution:**
1. Allow camera access in browser
2. Use HTTPS (camera requires secure context)
3. Or temporarily skip face verification for testing

### Issue: Frontend Not Loading

**Symptoms:** Blank page, 404 errors

**Solution:**
```bash
# Check if frontend container is running
docker-compose ps

# View frontend logs
docker-compose logs -f frontend

# Restart frontend
docker-compose restart frontend

# Access directly
open http://localhost:8080/website.html
```

---

## 📊 Monitoring During Testing

### View Real-Time Logs

**All Services:**
```bash
docker-compose logs -f
```

**AI Engine Only:**
```bash
docker-compose logs -f ai-engine
```

**Frontend Only:**
```bash
docker-compose logs -f frontend
```

### Check Service Health

**AI Engine:**
```bash
curl http://localhost:5000/health
```

**Frontend:**
```bash
curl http://localhost:8080
```

### Monitor Database

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Connect to database
turso db shell scrowpay-db-scrop

# View users
SELECT * FROM users;

# View transactions
SELECT * FROM transactions;

# View trust scores
SELECT * FROM trust_scores;
```

---

## 🎯 Success Criteria

Your app is working correctly if:

1. ✅ Users can create accounts and receive virtual account numbers
2. ✅ Users can logout and login with phone + PIN
3. ✅ Account numbers are displayed on dashboard with copy functionality
4. ✅ Sellers can create escrow transactions
5. ✅ Buyers can find and join transactions
6. ✅ AI risk engine scores transactions before funding
7. ✅ High-risk transactions are blocked
8. ✅ Low-risk transactions can be funded
9. ✅ Balances update correctly (available vs locked)
10. ✅ State transitions work (Created → Funded → In Transit → Completed)
11. ✅ Funds are released to seller on completion
12. ✅ Trust scores update after successful transactions
13. ✅ All data persists across sessions

---

## 🛑 Stopping the Application

When you're done testing:

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

---

## 📝 Test Results Template

Use this to document your testing:

```
ScrowPay End-to-End Test Results
Date: _______________
Tester: _______________

Account Creation:
[ ] Phone validation works
[ ] OTP verification works
[ ] ID validation works
[ ] Virtual account created
[ ] Account number displayed
[ ] User saved to database

Authentication:
[ ] Login works with phone + PIN
[ ] Logout works
[ ] Session persists
[ ] Account number visible after login

Transaction Flow:
[ ] Seller can create transaction
[ ] Buyer can find transaction
[ ] AI risk scoring works
[ ] High-risk transactions blocked
[ ] Low-risk transactions allowed
[ ] Funding works
[ ] Balances update correctly
[ ] State transitions work
[ ] Funds released on completion
[ ] Trust scores updated

Issues Found:
1. _______________
2. _______________
3. _______________

Overall Status: [ ] PASS  [ ] FAIL
```

---

## 🚀 Next Steps

After successful testing:

1. **Production Deployment:**
   - Switch to production Squad API keys
   - Deploy frontend to Vercel/Netlify
   - Deploy AI engine to VPS
   - Update environment variables

2. **Additional Features:**
   - Email notifications
   - SMS alerts
   - Mobile app
   - Advanced dispute resolution

3. **Monitoring:**
   - Set up error tracking (Sentry)
   - Add analytics (Google Analytics)
   - Monitor API usage
   - Track transaction success rates

---

**Happy Testing!** 🎉

If you encounter any issues, check the troubleshooting section or review the logs.
