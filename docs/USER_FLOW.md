# User Flow — Step-by-Step Product Walkthrough

This document walks through every screen and interaction in ScrowPay, from first visit to completed transaction.

---

## 1. Landing Page (`web.html`)

The user arrives at the ScrowPay landing page which explains:
- **Hero section** — "Don't pay strangers. Pay through ScrowPay." with a clear CTA
- **How it works** — 4-step visual: Create → Inspect & Fund → Deliver → Release
- **Trust Score explained** — Three-tier breakdown (Safe / Caution / High Risk)
- **Why ScrowPay** — Speed, security, AI protection, simplicity
- **Get Started CTA** — Routes to account creation

---

## 2. Account Creation (`account-creation.html`)

A 9-stage wizard that onboards users with full identity verification:

### Stage 1: Phone Number
- User enters Nigerian mobile number (+234 format)
- Input validation ensures correct format

### Stage 2: OTP Verification
- 6-digit OTP sent to phone (dev mode: `123456`)
- 60-second cooldown between resends
- 3 attempts before lockout

### Stage 3: Identity Document
- User enters BVN
- 11-digit BVN entry with format validation

### Stage 4: Personal Details
- First name, last name, middle name (optional)
- Date of birth (date picker)
- Gender selection
- **Critical:** These must match BVN records — Squad validates against NIBSS

### Stage 5: Liveness Check
- Camera activates for MediaPipe Face Mesh blink detection
- User must blink naturally to prove liveness
- Captured frame is uploaded to Cloudinary as face reference photo
- This photo is later used for face re-verification on high-risk actions

### Stage 6: Address
- State selection (all 36 Nigerian states + FCT)
- LGA selection (filtered by state)
- Area/ward selection (filtered by LGA)
- Data sourced from `state-lga-area.json`

### Stage 7: PIN Setup
- 4-digit transaction PIN
- Confirmation re-entry
- PIN is hashed before storage

### Stage 8: Virtual Account Creation
- Squad API is called with all collected data
- BVN is validated against NIBSS (name, DOB, gender, phone)
- On success: a real NUBAN account number is created
- On BVN mismatch: user is informed which field doesn't match
- Progress indicator shows the API call is in progress (up to 45s)

### Stage 9: Welcome
- Success confirmation with account number displayed
- "Go to Dashboard" button

---

## 3. Sign In (`sign-in.html`)

- Phone number + 4-digit PIN
- Session created with device fingerprint
- Redirects to dashboard on success

---

## 4. Dashboard (`dashboard.html`)

The main application interface with multiple tabs/sections:

### 4a. Balance Panel
- **Available balance** — Fetched from Squad API (30s polling with cache)
- **Locked balance** — Calculated from active escrow transactions in Turso DB
- **Total balance** — Available + Locked (with invariant validation)
- Balance formatted as ₦X,XXX.XX

### 4b. Create Transaction (Seller)
1. Enter item description (10-500 characters)
2. Set price (₦100 – ₦10,000,000)
3. Set delivery timeline (1-90 days)
4. Set inspection period (1-14 days)
5. Submit → Transaction ID generated (`TXN-{uuid}`)
6. Share Transaction ID with buyer (copy button provided)

### 4c. Join Transaction (Buyer)
1. Enter Transaction ID received from seller
2. System displays:
   - Item description and price
   - Seller's Trust Score with tier badge (Safe / Caution / High Risk)
   - AI risk assessment of the transaction
3. If risk score is acceptable, buyer confirms to join

### 4d. Fund Escrow (Buyer)
1. Buyer clicks "Fund" on a joined transaction
2. Money transfers to the Squad holding virtual account
3. Transaction state changes: `Created → Funded_Locked`
4. Both parties receive notifications (bell + email)

### 4e. Mark as Shipped (Seller)
1. Seller clicks "Mark Shipped" after sending the item
2. Transaction state: `Funded_Locked → In_Transit`
3. Both parties notified
4. Delivery countdown timer starts

### 4f. Confirm Receipt (Buyer)
1. Buyer inspects the received item
2. Clicks "Confirm Receipt"
3. Transaction state: `In_Transit → Completed`
4. Money releases from holding account to seller via Squad NIP transfer
5. Trust scores updated for both parties

### 4g. Raise Dispute (Buyer)
1. Instead of confirming, buyer clicks "Raise Dispute"
2. Enters dispute description (free text)
3. Uploads up to 4 photos as evidence
4. Transaction state: `In_Transit → Disputed`
5. AI Dispute Agent (Gemini) analyzes the case:
   - **High confidence (>90%)** → Auto-resolved, funds move immediately
   - **Medium confidence (50-90%)** → Routed to admin with AI recommendation
   - **Low confidence (<50%)** → Routed to admin without recommendation
6. Both parties notified of resolution

### 4h. Withdraw Funds
1. Select bank from dropdown (21 Nigerian banks)
2. Enter account number (10 digits)
3. System verifies account name via Squad lookup
4. Enter amount and PIN
5. **If amount ≥ ₦500,000:** Face re-verification modal opens
   - Live camera capture
   - Gemini compares with signup reference photo
   - Only proceeds on "same person" verdict
6. Transfer initiated via Squad NIP payout
7. Confirmation with transaction reference

### 4i. Notification Feed
- Bell icon with unread count
- Per-user notification feed
- Categories: transaction updates, disputes, security alerts
- Each state transition fires a notification + optional email

### 4j. Trust Score Display
- Current score (0-100) with tier badge
- Score history sparkline
- "What changed?" tooltip showing recent events

---

## 5. Admin Console (`admin.html`)

Accessible only to users with `is_admin = 1` in the database.

### 5a. Pending Dispute Queue
- List of all transactions in `Disputed` state
- Each shows: transaction details, buyer complaint, photo evidence, AI agent's recommendation + confidence
- Admin can: Refund buyer / Release to seller / Split 50-50
- Resolution notes field for audit trail

### 5b. Face Verification Audit
- Log of all face re-verification attempts
- Filterable by verdict: `same_person` / `different_person` / `inconclusive`
- Shows timestamp, user, action attempted, and result

### 5c. Risky Transaction Monitor
- Transactions with risk score ≥ 50
- Sorted by risk level
- Quick view of risk factors and current state

### 5d. User Directory
- Searchable list of all users
- Trust scores, account status, transaction counts

---

## 6. State Machine

The complete transaction lifecycle follows a deterministic state machine:

```
                    ┌─────────────┐
                    │   Created   │
                    └──────┬──────┘
                           │ Buyer funds
                    ┌──────▼──────┐
             ┌──────│ Funded_Locked│──────┐
             │      └──────┬──────┘      │
         Cancel            │ Seller      Cancel
             │             │ ships       │
             ▼             ▼             ▼
       ┌──────────┐ ┌──────────┐  ┌──────────┐
       │Cancelled │ │In_Transit│  │ Refunded │
       └──────────┘ └─────┬────┘  └──────────┘
                          │
                   ┌──────┴──────┐
                   │             │
            Confirm│         Dispute
                   ▼             ▼
            ┌──────────┐  ┌──────────┐
            │Completed │  │ Disputed │
            └──────────┘  └─────┬────┘
                                │
                         AI / Admin resolves
                                │
                     ┌──────────┴──────────┐
                     ▼                     ▼
              ┌──────────┐          ┌──────────┐
              │ Refunded │          │Completed │
              └──────────┘          └──────────┘
```

Each state transition:
- Is logged to `transaction_state_history`
- Fires a notification to both parties
- Sends an email (if Resend is configured)
- Updates trust scores (on terminal states)
