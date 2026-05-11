# ScrowPay Testing Flowchart

## 🎯 Complete User Journey Visualization

```
┌─────────────────────────────────────────────────────────────────┐
│                    START: Open Browser                          │
│              http://localhost:8080/website.html                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Landing Page                               │
│  [Create Account]  [Sign In]  [Learn More]                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
                    ▼                 ▼
        ┌───────────────────┐  ┌──────────────┐
        │  Create Account   │  │   Sign In    │
        │   (New User)      │  │ (Existing)   │
        └─────────┬─────────┘  └──────┬───────┘
                  │                    │
                  │                    │
┌─────────────────▼────────────────────────────────────────────────┐
│              ACCOUNT CREATION FLOW (10 Stages)                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Stage 1: Phone Number Entry                                    │
│  ├─ Enter: 08135866028                                          │
│  ├─ Validate format                                             │
│  └─ Check for duplicates ✓                                      │
│                                                                  │
│  Stage 2: OTP Verification                                      │
│  ├─ Generate OTP (check console)                                │
│  ├─ Enter 6-digit code                                          │
│  └─ Verify ✓                                                    │
│                                                                  │
│  Stage 3: ID Information                                        │
│  ├─ Choose: NIN or BVN                                          │
│  ├─ Enter 11-digit ID                                           │
│  └─ Validate format ✓                                           │
│                                                                  │
│  Stage 4: Personal Information                                  │
│  ├─ First Name: John                                            │
│  ├─ Last Name: Doe                                              │
│  ├─ Date of Birth (18+)                                         │
│  └─ Gender ✓                                                    │
│                                                                  │
│  Stage 5: Squad API Verification ⭐ CRITICAL                    │
│  ├─ Send data to Squad API                                      │
│  ├─ Validate identity                                           │
│  ├─ CREATE VIRTUAL ACCOUNT NUMBER                               │
│  │   └─ Account: 1234567890                                     │
│  │   └─ Bank: GTBank (058)                                      │
│  └─ Show modal with account number ✓                            │
│                                                                  │
│  Stage 6: Face Verification Intro                               │
│  └─ Read instructions ✓                                         │
│                                                                  │
│  Stage 7: Blink Detection                                       │
│  ├─ Allow camera access                                         │
│  ├─ Position face in oval                                       │
│  ├─ Blink 2-3 times                                             │
│  └─ MediaPipe detects blinks ✓                                  │
│                                                                  │
│  Stage 8: Address Information                                   │
│  ├─ Current Address:                                            │
│  │   ├─ State: Lagos                                            │
│  │   ├─ LGA: Ikeja                                              │
│  │   ├─ Area: Allen Avenue                                      │
│  │   └─ Street: 123 Main St                                     │
│  └─ Permanent Address ✓                                         │
│                                                                  │
│  Stage 9: PIN Setup                                             │
│  ├─ Enter PIN: 123456                                           │
│  ├─ Confirm PIN: 123456                                         │
│  ├─ Hash PIN (SHA-256)                                          │
│  └─ Save to database ✓                                          │
│                                                                  │
│  Stage 10: Success Screen                                       │
│  ├─ Show success checkmark                                      │
│  ├─ Create session                                              │
│  └─ Redirect to dashboard ✓                                     │
│                                                                  │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                        DASHBOARD                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Welcome Card:                                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Welcome, John!                                            │ │
│  │                                                           │ │
│  │ Account Status: Verified ✓                               │ │
│  │ Phone Number: +2348135866028                             │ │
│  │ Account Number: 1234567890  [📋 Copy] ⭐ NEW!           │ │
│  │ Bank: GTBank                                             │ │
│  │ Account Type: Personal                                   │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Balance Display:                                               │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Available Balance: ₦0.00                                 │ │
│  │ Locked Balance: ₦0.00                                    │ │
│  │ Total Balance: ₦0.00                                     │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Trust Score:                                                   │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Score: 50 (Medium Trust)                                 │ │
│  │ Total Transactions: 0                                    │ │
│  │ Successful: 0                                            │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Quick Actions:                                                 │
│  [Create Escrow] [Join Transaction] [Add Funds] [Withdraw]     │
│                                                                 │
└────────────────────┬────────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
┌───────────────┐         ┌──────────────┐
│    Logout     │         │  Transaction │
│               │         │     Flow     │
└───────┬───────┘         └──────┬───────┘
        │                        │
        ▼                        │
┌───────────────┐                │
│   Sign In     │                │
│   Page        │                │
│               │                │
│ Phone: ______ │                │
│ PIN: ______   │                │
│ [Sign In]     │                │
└───────┬───────┘                │
        │                        │
        └────────┬───────────────┘
                 │
                 ▼
        ┌────────────────┐
        │  Back to       │
        │  Dashboard     │
        │  (Same Account │
        │   Number!)     │
        └────────────────┘


═══════════════════════════════════════════════════════════════════
                    TRANSACTION FLOW (Optional)
═══════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────┐
│                    SELLER: Create Transaction                   │
├─────────────────────────────────────────────────────────────────┤
│  1. Click "Create Escrow"                                       │
│  2. Fill form:                                                  │
│     - Item: iPhone 13 Pro Max                                   │
│     - Price: ₦450,000                                           │
│     - Delivery: 3 days                                          │
│     - Inspection: 2 days                                        │
│  3. Submit                                                      │
│  4. Get Transaction ID: TXN-1715385600-ABC123                   │
│  5. Share ID with buyer                                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BUYER: Join Transaction                      │
├─────────────────────────────────────────────────────────────────┤
│  1. Click "Join Transaction"                                    │
│  2. Enter Transaction ID                                        │
│  3. View transaction details                                    │
│  4. See seller trust score                                      │
│  5. Click "Proceed to Fund"                                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              AI RISK SCORING ⭐ CRITICAL                        │
├─────────────────────────────────────────────────────────────────┤
│  AI Engine analyzes:                                            │
│  ├─ Transaction amount: ₦450,000                                │
│  ├─ Buyer transaction velocity: 0                               │
│  ├─ Buyer account age: 0 days                                   │
│  ├─ Time of day: 14:00                                          │
│  ├─ Seller trust score: 50                                      │
│  └─ Device fingerprint: 5432                                    │
│                                                                 │
│  AI returns:                                                    │
│  ├─ Risk Score: 45                                              │
│  ├─ Verdict: PASS ✓                                             │
│  └─ Confidence: 85%                                             │
│                                                                 │
│  Decision:                                                      │
│  ├─ If score ≤ 80: Allow funding ✓                             │
│  └─ If score > 80: Block transaction ✗                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
                    ▼                 ▼
            ┌───────────────┐  ┌──────────────┐
            │  PASS (≤80)   │  │  FAIL (>80)  │
            │  Allow Fund   │  │  Block       │
            └───────┬───────┘  └──────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BUYER: Fund Transaction                      │
├─────────────────────────────────────────────────────────────────┤
│  1. Click "Fund Transaction"                                    │
│  2. Squad API transfers funds:                                  │
│     - From: Buyer account                                       │
│     - To: Holding account                                       │
│     - Amount: ₦450,000                                          │
│  3. Update state: Created → Funded_Locked                       │
│  4. Update balances:                                            │
│     - Buyer Available: -₦450,000                                │
│     - Buyer Locked: +₦450,000                                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  SELLER: Mark as Shipped                        │
├─────────────────────────────────────────────────────────────────┤
│  1. Click "Mark as Shipped"                                     │
│  2. Update state: Funded_Locked → In_Transit                    │
│  3. Start inspection window countdown                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BUYER: Accept Item                           │
├─────────────────────────────────────────────────────────────────┤
│  1. Click "Accept Item"                                         │
│  2. Update state: In_Transit → Completed                        │
│  3. Squad API releases funds:                                   │
│     - From: Holding account                                     │
│     - To: Seller account                                        │
│     - Amount: ₦450,000                                          │
│  4. Update balances:                                            │
│     - Buyer Locked: -₦450,000                                   │
│     - Seller Available: +₦450,000                               │
│  5. Update trust scores:                                        │
│     - Buyer: 50 → 55                                            │
│     - Seller: 50 → 55                                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TRANSACTION COMPLETED ✓                      │
├─────────────────────────────────────────────────────────────────┤
│  Seller:                                                        │
│  ├─ Received: ₦450,000                                          │
│  ├─ Trust Score: 55                                             │
│  └─ Transactions: 1                                             │
│                                                                 │
│  Buyer:                                                         │
│  ├─ Funds Released: ₦450,000                                    │
│  ├─ Trust Score: 55                                             │
│  └─ Transactions: 1                                             │
└─────────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════
                    SYSTEM ARCHITECTURE
═══════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                │
│                    (http://localhost:8080)                      │
├─────────────────────────────────────────────────────────────────┤
│  - website.html (Landing)                                       │
│  - account-creation.html (Registration)                         │
│  - sign-in.html (Login)                                         │
│  - dashboard.html (Main App)                                    │
│                                                                 │
│  Services:                                                      │
│  ├─ SessionService.js (Auth)                                    │
│  ├─ TransactionService.js (CRUD)                                │
│  ├─ BalanceService.js (Calculations)                            │
│  ├─ TrustScoreService.js (Reputation)                           │
│  ├─ AIRiskService.js (AI Integration)                           │
│  └─ StateMachineService.js (State Management)                   │
└────────────┬────────────────────────────────────────────────────┘
             │
             ├──────────────────┐
             │                  │
             ▼                  ▼
┌─────────────────────┐  ┌──────────────────────┐
│   TURSO DATABASE    │  │   SQUAD API          │
│   (libSQL/HTTP)     │  │   (Payments)         │
├─────────────────────┤  ├──────────────────────┤
│ - users             │  │ - Create accounts    │
│ - transactions      │  │ - Check balances     │
│ - trust_scores      │  │ - Transfer funds     │
│ - disputes          │  │ - Verify identity    │
│ - ai_risk_logs      │  └──────────────────────┘
└─────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AI RISK ENGINE                             │
│                  (http://localhost:5000)                        │
├─────────────────────────────────────────────────────────────────┤
│  - Flask API                                                    │
│  - Isolation Forest Model                                       │
│  - Synthetic Data Training                                      │
│                                                                 │
│  Endpoints:                                                     │
│  ├─ GET  /health                                                │
│  └─ POST /api/v1/score                                          │
└─────────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════
                    KEY FEATURES TESTED
═══════════════════════════════════════════════════════════════════

✅ Persistent Authentication
   └─ Users register once, login anytime

✅ Virtual Account Creation
   └─ Squad API creates unique account number

✅ Account Number Display
   └─ Always visible on dashboard with copy button

✅ Session Management
   └─ 24-hour sessions, 30-min inactivity timeout

✅ AI Risk Scoring
   └─ Pre-transaction anomaly detection

✅ Balance Management
   └─ Separate tracking of available vs locked funds

✅ State Machine
   └─ Deterministic transaction lifecycle

✅ Trust Score System
   └─ Reputation based on transaction history

✅ Fund Transfers
   └─ Squad API integration for payments

✅ Transaction History
   └─ All transactions logged and visible


═══════════════════════════════════════════════════════════════════
                    TESTING CHECKLIST
═══════════════════════════════════════════════════════════════════

Phase 1: Setup (1 minute)
[ ] Start Docker containers
[ ] Verify AI engine health
[ ] Open frontend in browser

Phase 2: Account Creation (2 minutes)
[ ] Complete 10-stage registration
[ ] Note virtual account number
[ ] Verify account number on dashboard

Phase 3: Authentication (1 minute)
[ ] Logout
[ ] Login with phone + PIN
[ ] Verify account number persists

Phase 4: Transaction Creation (1 minute)
[ ] Create escrow transaction
[ ] Copy Transaction ID

Phase 5: Full Transaction Flow (5 minutes)
[ ] Create second account (buyer)
[ ] Join transaction
[ ] AI risk scoring
[ ] Fund transaction
[ ] Mark as shipped
[ ] Accept item
[ ] Verify fund transfer
[ ] Check trust scores

═══════════════════════════════════════════════════════════════════

Total Testing Time: ~10 minutes for complete flow
Quick Test: ~5 minutes for basic features

═══════════════════════════════════════════════════════════════════
```
