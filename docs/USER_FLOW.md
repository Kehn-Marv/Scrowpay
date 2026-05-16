# User Flow — Step-by-Step Product Walkthrough

This document walks through every screen and interaction in ScrowPay, from first visit to completed transaction. It is kept aligned with the **current** frontend (`web.html`, `account-creation.html`, `sign-in.html`, `dashboard.html`, `admin.html`) and services.

---

## 1. Landing Page (`web.html`)

The user arrives at the ScrowPay landing page which explains:

- **Hero section** — Value proposition with CTAs to create an account or sign in
- **How it works** — **Four** steps: **Create or Join** → **Inspect & Fund** → **Deliver & Inspect** → **Release or Dispute**
- **Trust Score explained** — 0–100 score with plain-language bands (**Safe to Proceed**, **Proceed with Caution**, **High Risk**) that map to the dashboard’s underlying tiers (**Trusted / Elite**, **Building**, **Low** — see `TrustEngineService.tierFor()`)
- **Why ScrowPay** — Speed, security, AI-assisted flows, simplicity
- **Get Started CTA** — Routes to account creation

---

## 2. Account Creation (`account-creation.html`)

A **10-stage** wizard (`StageManager.totalStages = 10`). Order in code:

| Stage | What the user does |
|------|---------------------|
| **1** | **Phone + email** — Nigerian mobile (+234…) and email; duplicates checked against Turso when online |
| **2** | **Email OTP** — 6-digit code (`DigitInputBox(6)`). Intended path: `EmailOTPService` + Resend via AI-engine proxy. **Resend** in demo shows a toast to use test code **`123456`** if the email engine was unreachable at stage 1 |
| **3** | **BVN** — 11 digits, format validation + duplicate check |
| **4** | **Personal details** — First / middle / last name, gender, DOB (must match BVN for Squad/NIBSS) |
| **5** | **Virtual account creation** — Squad `createVirtualAccount`; BVN matched to NIBSS; NUBAN returned on success |
| **6** | **Face verification intro** — Explains why liveness runs next |
| **7** | **Blink liveness** — MediaPipe Face Mesh; on success a reference frame may upload to **Cloudinary** (non-blocking; signup still completes if upload fails) |
| **8** | **Address** — State → LGA → ward from `state-lga-area.json` (current + optional permanent address) |
| **9** | **PIN setup** — **6-digit** PIN (`PINService.validatePIN`), confirm on-device; **SHA-256** hash with phone as salt before `saveUser()` |
| **10** | **Success** — Account created; link to sign in / dashboard |

**Not in this flow:** separate “phone SMS OTP” stage — phone ownership is implied via BVN + Squad; email OTP is the primary second factor on device.

---

## 3. Sign In (`sign-in.html`)

- **Phone** + **6-digit PIN** (same rules as signup; hashed with phone-as-salt server-side compare)
- **`SessionService`** — session blob in `localStorage` (`scrowpay_session`), expiry / inactivity rules as implemented in `SessionService.js`
- Redirect to **`dashboard.html`** on success (dashboard `<head>` may bounce unauthenticated users back to sign-in)

---

## 4. Dashboard (`dashboard.html`)

Main SPA: vanilla JS + Tailwind, no bundler. Heavy inline script orchestrates services loaded in a fixed order (see `frontend/README.md`).

### 4a. Balance panel

- **Available / locked / total** — `BalanceService` + Turso; merchant balance from Squad where configured
- **Hackathon / demo path:** funding path may use per-user **`demo_balance`** (see fund handler) while Squad remains the real rail for VA creation, payouts, and releases elsewhere

### 4b. Create transaction (seller)

1. Item description (**10–500** characters) — `TransactionService.validateTransactionData`
2. Price (**₦100 – ₦10,000,000**)
3. Delivery timeline (**1–90** days)
4. Submit → `TransactionService.generateTransactionId()` → IDs look like **`TXN-{uuid}`** (not `SCR-…`)
5. Share **transaction ID** with the buyer (copy affordances in UI)

**Inspection window:** validated in `InputValidationService` (0–14 days) for legacy/API compatibility; the **create UI may not collect it** (field retired from UX — see comment in `InputValidationService.validateInspectionWindow`).

### 4c. Join transaction (buyer)

1. Enter **transaction ID** (`TXN-…`)
2. Sees item, price, proof thumbnails if present, and seller **trust score / tier** (from `TrustEngineService` with legacy fallback where wired)
3. Accept terms → if joining as **buyer** on a seller-created escrow, flow opens **Fund** modal  
   **Note:** Full **AnomalyDetectionEngine** scoring is **not** wired to block this step in the current build; the fund modal’s risk block is often **hidden**, and **`anomalyEngine.evaluate()`** runs **after** a successful fund (post-fund, non-blocking) — see `FRAUD_DETECTION_FLOW.md`

### 4d. Fund escrow (buyer)

1. Buyer confirms amount and counterparty trust display
2. **Current implementation:** validates **`demo_balance` ≥ price**, debits buyer, `transactionService.updateBuyer`, then `stateMachineService.transitionState(…, 'Funded_Locked', …)` with `buyerAccount: 'DEMO_BALANCE'`
3. **After success:** background `anomalyEngine.evaluate` + `trustEngine.onAnomalyEvaluated` when those services initialized (`post_fund` metadata)
4. Notifications / toasts as wired

### 4e. Mark as shipped (seller)

- `Funded_Locked → In_Transit`; notifications; delivery / auto-release timers per `StateMachineService`

### 4f. Confirm receipt (buyer)

- `In_Transit → Completed`; payout side effects via Squad transfer service where configured; **trust** updates via `TrustEngineService` hooks on terminal events

### 4g. Raise dispute (buyer)

1. Dispute description + up to **4** photos (Cloudinary)
2. `In_Transit → Disputed`
3. **`DisputeAgentService`** (Gemini multimodal) produces a structured verdict  
4. **`DisputeService.resolveWithAgentVerdict`:** **`confidence > 90`** (same threshold as **> 90%**, i.e. `AUTO_RESOLUTION_THRESHOLD = 90` on 0–100 scale) → **auto** resolution path; **71–90** → `ai_assisted`; **≤ 90** for auto — lower scores go to **manual / admin** handling as implemented

### 4h. Withdraw funds

- Bank list, account lookup, amount + **6-digit PIN** confirmation  
- **Large withdrawals:** face re-verification (`FaceVerificationService` + Gemini vs. signup reference) when the dashboard threshold is met (e.g. **≥ ₦500,000**)

### 4i. Notification feed

- Bell + `NotificationService`; optional email via AI-engine proxy when configured

### 4j. Trust score display

- **0–100** with tier from **`TrustEngineService`**: **Low** (0–39), **Building** (40–69), **Trusted** (70–94), **Elite** (95–100)  
- History / tooltips from `trust_score_history` where implemented

### 4k. First dashboard visit

- **`TrustScoreService.initializeTrustScore(userId, 50)`** for brand-new users (legacy table / compatibility)  
- Optional **onboarding tooltips** controlled by `localStorage` flag `scrowpay_first_time_user`

---

## 5. Admin Console (`admin.html`)

Only if **`users.is_admin = 1`**.

- Pending disputes, face verification audit, risky transaction views, user directory — as implemented in `admin.html` + services

---

## 6. State machine (transactions)

Runtime schema (see `turso-db-service.js` / migrations) allows:

**`Created` · `Funded_Locked` · `In_Transit` · `Disputed` · `Completed` · `Cancelled` · `Refunded`**

`StateMachineService.validTransitions` encodes the happy-path graph among the first five; **cancel / refund** paths may be performed via **`TransactionService`** and DB updates (e.g. initiator cancel, mutual cancellation). Treat **Cancelled** / **Refunded** as **terminal** bookkeeping states when present.

High-level diagram (simplified):

```
                         Created
                           │
                    (buyer funds)
                           ▼
                    Funded_Locked
                     /    |     \
         (cancel) /      |      \ (ship)
                 /       |       \
                ▼        ▼        ▼
          Cancelled  In_Transit  (rare direct paths per code)
                       /    \
            (confirm) /      \ (dispute)
                     ▼        ▼
               Completed   Disputed
                              │
                     (AI / admin resolution)
                              ▼
                    Completed / Refunded
```

Each successful **`StateMachineService.transitionState`** logs **`transaction_state_history`** and runs side effects (notifications, trust hooks, timers) as coded.

---

## 7. Accuracy note (docs vs product ambition)

Some **marketing** and **hackathon** copy still describes “block before fund” and a third **Gemini** layer on pre-fund risk. **Today’s dashboard wiring** runs **`AnomalyDetectionEngine.evaluate()` after a successful fund** and does **not** re-enable the old Gemini-on-listing path inside **`RiskEngineService`** (removed by design). For the **canonical** behaviour of the anomaly + trust pipeline, prefer **`FRAUD_DETECTION_FLOW.md`** and **`AnomalyDetectionEngine.js`** comments alongside this file.
