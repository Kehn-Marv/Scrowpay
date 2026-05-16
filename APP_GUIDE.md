# ScrowPay — How The App Actually Works (End-to-End)

> A plain-English, top-to-bottom walkthrough of every moving piece in the ScrowPay codebase as it stands **today**. Written so a teammate can read it once and understand the whole system: what's built, what's wired up, what's mocked, and what's still on the TODO list.

---

## 1. What is ScrowPay (in one paragraph)

ScrowPay is a **Nigerian peer-to-peer escrow platform**. A seller creates an escrow listing → a buyer joins it → the buyer's money is held in a holding account → seller ships the item → buyer accepts → money is released to the seller. Around that core flow we layer:

- **AI risk scoring** (Python ML service) that decides whether a transaction is safe to fund **before** money moves.
- **Gemini AI** powering a **multimodal dispute resolution agent** — reads the user's complaint and uploaded photo evidence, then issues a binding ruling.
- **Trust score** (0–100) that grows or shrinks based on a user's escrow history.
- **Conversational dispute resolution** — either party can open a dispute; the AI agent may ask one clarifying question before ruling.
- **Squad API** for virtual accounts and real payments.
- **Turso (libSQL)** as the database.
- **MediaPipe** for face/blink liveness detection during signup.

The whole frontend is **vanilla JS + HTML + Tailwind** (no React, no build step). The AI engine is a **Flask microservice** running in Docker.

---

## 2. High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                                    BROWSER                                     │
│                                                                                │
│   web.html → account-creation.html → sign-in.html → dashboard.html             │
│   (SPA: escrows, funding, disputes, trust, notifications)                      │
│                                                                                │
│   Core services (representative):                                              │
│     DashboardService      TransactionService      TrustEngineService           │
│     (orchestrator)        StateMachineService     RiskEngineService            │
│     BalanceService        DisputeService          IsolationForestService       │
│                              DisputeAgentService                               │
│    └───────────┼───────────────┼───────────────┼───────────────┘               │
│                                                                                │
│                ↓                  ↓                  ↓                         │
│                                                                                │
│        ┌────────────┐    ┌──────────────┐   ┌──────────────────┐               │
│        │  Turso DB  │    │  Squad API   │   │    AI engine     │               │
│        │   libSQL   │    │   payments   │   │    Flask + IF    │               │
│        │            │    │              │   │    Isolation     │               │
│        │            │    │              │   │      Forest      │               │
│        └────────────┘    └──────────────┘   └──────────────────┘               │
│                                                                                │
│                                           ↓                                    │
│                                    ┌──────────────┐                            │
│                                    │ Gemini API   │                            │
│                                    │ (disputes)   │                            │
│                                    └──────────────┘                            │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Three deployable units:**
1. `frontend/` — static files (HTML/JS/CSS), served by any static host or `nginx`.
2. `ai-engine/` — Flask app in Docker, port `5000`.
3. **External services** — Turso, Squad, Google Gemini.

---

## 3. The Pages (User-Facing)

| File | What it does |
|---|---|
| `frontend/web.html` | Landing page. Has "Create Account" / "Sign In" buttons. |
| `frontend/account-creation.html` | The **10-stage** signup flow: phone **+ email** → **email OTP** → BVN → name/DOB/gender → Squad virtual account → face intro → blink liveness → address → **6-digit PIN** → success. |
| `frontend/sign-in.html` | Phone + 6-digit PIN login. Hashes PIN with SHA-256 + phone-as-salt and compares to DB. |
| `frontend/dashboard.html` | The main app. Lists transactions, lets users create/join/fund/ship/accept/dispute, shows trust score, balance, etc. **All escrow logic lives here.** |

---

## 4. Account Creation — Stage by Stage

File: `frontend/account-creation.html` (`StageManager`, **10** stages) + the services it calls.

| # | Stage | What happens | Service / notes |
|---|---|---|---|
| 1 | **Phone + email** | Nigerian phone + email; duplicate checks when Turso is online. | `PhoneValidationService` / DB helpers |
| 2 | **Email OTP** | 6-digit code; **`EmailOTPService`** + AI-engine Resend proxy. If no OTP was reachable at stage 1, verify falls back to legacy **`123456`**. Resend cooldown UX (demo toast may still mention `123456`). | `EmailOTPService.js`, `otp-service.js` (fallback) |
| 3 | **BVN** | 11-digit BVN, format + duplicate check. | `id-validation-service.js` |
| 4 | **Personal details** | First / middle / last name, gender, DOB — must match BVN for Squad/NIBSS. | — |
| 5 | **Virtual account** | Squad `createVirtualAccount` — NUBAN on success. | `squad-api-service.js` |
| 6 | **Face intro** | Explains liveness. | — |
| 7 | **Blink liveness** | MediaPipe blink; optional **Cloudinary** upload of a reference frame (non-blocking). | `mediapipe-service.js`, Cloudinary unsigned upload |
| 8 | **Address** | State → LGA → ward from `state-lga-area.json`. | `address-data-service.js` |
| 9 | **PIN** | **6-digit** PIN, `PINService` validation + Web Crypto hash (phone as salt). | `pin-service.js` |
| 10 | **Success** | Account row saved; CTA to sign in. | `turso-db-service.js` |

On success, the user row is inserted into Turso, a Squad **virtual account** exists (from stage 5), and the user continues to **`sign-in.html`**.

### Caveats (honest)
- **Phone SMS OTP is not implemented** — second factor on-device is **email**, not carrier SMS.
- **Cloudinary / Gemini keys** may be absent locally; signup still completes, but face reference URL may be null and later face re-verify will no-op.
- **BVN photo from Squad** (if returned) is not persisted as its own artifact beyond what you store in user fields.

---

## 5. Sign In

File: `frontend/sign-in.html` + `SessionService.js`.

1. User enters phone + **6-digit PIN**.
2. PIN is hashed (`SHA-256(pin + phone)`) and compared to `users.hashed_pin`.
3. On match, a session blob is written to **`localStorage` under key `scrowpay_session`** (24h expiry).
4. Redirect to `dashboard.html`.
5. `dashboard.html` runs an **early session-check script in `<head>`** (`@frontend/dashboard.html:11`) that bounces unauthenticated users back to `sign-in.html` *before* any UI renders.

---

## 6. The Dashboard — Service Layout

`dashboard.html` loads **a stack of services in a specific order** (`@frontend/dashboard.html:2542-2563`). Each is a class attached to `window`. There is no module bundler — order matters.

### Loading order and responsibility

| Order | Service | Purpose |
|---|---|---|
| 1 | `turso-db-service.js` | Raw libSQL HTTP client. Every other service uses this for DB I/O. |
| 2 | `SessionService.js` | Read/write/refresh the `scrowpay_session` blob. |
| 3 | `error-handler-service.js` | Centralized try/catch + user-friendly error mapping. |
| 4 | `ToastNotificationService.js` | The little popup toasts (success/error/info). |
| 5 | `InputValidationService.js` | Phone, amount, ID number, address validators. |
| 6 | `transaction-service.js` | CRUD for transactions (create, join, fetch, list, store proof). |
| 7 | `TrustScoreService.js` | **Legacy** trust score (recency-weighted, table-driven). Kept for fallback only. |
| 8 | `IsolationForestService.js` | Calls the Python Isolation Forest engine over HTTP. |
| 9 | `squad-api-service.js` | Squad payments, virtual accounts, transfers. |
| 10 | `StateMachineService.js` | Enforces the transaction state machine (Created → Funded_Locked → In_Transit → Completed/Disputed). Holds auto-release timers. |
| 11 | `BalanceService.js` | Computes available vs locked balances per user. |
| 12 | `DisputeService.js` | Persists disputes; maps a `DisputeAgentService` verdict into fund transfer + state transition + notifications via `resolveWithAgentVerdict()`. |
| 13 | `DisputeAgentService.js` | **The AI dispute agent.** Multimodal Gemini call — reads the user's complaint + uploaded photos + transaction context, returns a binding verdict (or one clarifying question). |
| 14 | `TrustEngineService.js` | **Active** trust score engine (counter-based, signal-driven). Now includes temporal decay-on-inactivity and peer-graph diversity penalty. |
| 15 | `DeviceFingerprintService.js` | FingerprintJS-OSS-backed device identity. Loaded lazily from CDN; falls back to legacy hash if blocked. |
| 16 | `RiskEngineService.js` | Deterministic in-browser rules sub-detector (risk engine). |
| 17 | `AnomalyDetectionEngine.js` | **The umbrella.** Composes rules + ML (`IsolationForestService`) into one verdict. **`evaluate()` is wired post-fund** in `dashboard.html` today (trust + audit); a pre-fund gate would call the same API earlier. |

### Why two trust services?
`TrustScoreService.js` is the v1 design (recompute from history with exponential recency decay). `TrustEngineService.js` is the v2 (cumulative counters on the user row, O(1) updates, history table for "what changed?" tooltips). The dashboard **prefers the engine** and falls back to the legacy service only if the engine fails (`@frontend/dashboard.html:3260-3281`).

---

## 7. The Transaction Lifecycle (The Core Flow)

This is the most important section. It's the thing the rest of the app revolves around.

### 7.1 States

Defined in the DB (`@frontend/escrow-schema.sql:18`) and enforced in code (`@frontend/StateMachineService.js:40-46`):

```
Created  ─────►  Funded_Locked  ─────►  In_Transit  ─────►  Completed
                                              │
                                              └─────►  Disputed  ─────►  Completed
```

### 7.2 Step-by-step

#### Step A — Seller creates the escrow
- Seller fills in: item description, price (₦100 – ₦10M), delivery timeline (1–90 days), inspection window (1–14 days).
- `TransactionService.createTransaction()` validates input, generates a unique `transaction_id` (short shareable code), inserts into `transactions` with `state = 'Created'`.
- Seller gets a code to share with the buyer.

#### Step B — Buyer joins by entering the code
- Buyer types the `transaction_id` into "Join Transaction".
- The system fetches the transaction and runs the **Risk Profiling Pipeline** (section 8 below) **before** showing a "Fund" button.
- Each failed join attempt increments `users.failed_join_attempts` (which hurts the buyer's trust score — this discourages brute-forcing codes).

#### Step C — Buyer funds (Created → Funded_Locked)
- Only allowed if risk verdict = `pass`.
- Squad API debits the buyer's virtual account and credits the **central holding account** (`CONFIG.holdingAccount`).
- `transactions.buyer_id`, `funded_at`, `risk_score`, `ai_verdict` are all set.
- An entry is added to `transaction_state_history`.
- Toast: "Funds locked".
- **Delivery deadline timer starts**: Seller has `delivery_timeline_days` to ship, or funds auto-refund to buyer and transaction is cancelled.

#### Step D — Seller ships (Funded_Locked → In_Transit)
- Seller clicks "Mark as Shipped".
- `StateMachineService` validates: only the seller can do this, only when state is `Funded_Locked`.
- `shipped_at` is stamped.
- **Delivery deadline timer is cancelled** (seller shipped on time).
- **Auto-release timer starts**: `delivery_timeline_days + 7 days` after `shipped_at`, the funds auto-release to the seller (handled in `StateMachineService.autoReleaseTimers`).

#### Step E — Buyer accepts (In_Transit → Completed)
- Buyer clicks "I received my item, release funds".
- Squad API transfers from the holding account → seller's virtual account.
- `completed_at` is stamped.
- `StateMachineService` calls `trustEngine.applySignal()` for **both buyer and seller** with positive signals (`successful_deliveries +1`, `total_completed +1`, `total_volume_ngn +price`).
- Auto-release timer is cancelled.

#### Step F — Auto-release (alternative to E)
- If the buyer never accepts, the timer fires after `delivery_timeline_days + 7 days` from shipment.
- Same money movement and trust signals as E.
- Both parties get a notification.

#### Step G — Auto-refund (if seller doesn't ship)
- If seller doesn't mark as shipped within `delivery_timeline_days` after funding.
- Squad API refunds from holding account → buyer's virtual account.
- Transaction state changes to `Cancelled`.
- Both parties get a notification.

#### Step G — Disputes (any state with locked funds → Disputed)

Disputes can be opened by **either party**, in three situations:

| Trigger button | Visible to | When |
|---|---|---|
| `Dispute Item` | buyer | `In_Transit` (item arrived but is wrong/damaged/etc.) |
| `Report a problem` | seller | `In_Transit` (buyer is stalling acceptance) |
| `Seller missed delivery` | buyer | `Funded_Locked` and now past `funded_at + delivery_timeline_days` |

**The flow is conversational** (`@frontend/dashboard.html` — the `dispute-modal` block):

1. User clicks the trigger → modal opens with an agent greeting drawn from the actual transaction ("Hi, I see you're disputing as the buyer on a ₦125,000 transaction…").
2. User types what happened + optionally attaches up to 4 photos.
3. Photos are read in-browser as base64 data URLs (no upload server) and sent inline to `DisputeAgentService.analyze()`.
4. `DisputeAgentService` calls Gemini multimodally with: full transaction context, both parties' trust stats, the user's complaint, and the photos. Strict-JSON response.
5. The agent returns either:
   - `action: "ask"` → **one** clarifying question, rendered as another agent bubble. The user types an answer; the agent then must rule.
   - `action: "rule"` → a binding verdict: `favoredParty` (buyer/seller/split), `confidence` (0–1), `payout` (`buyerPct`/`sellerPct`), `reasoning`, `evidenceCited`.
6. `DisputeService.resolveWithAgentVerdict()` maps the verdict into the legacy resolution shape (`refund_buyer` / `release_to_seller` / `split`) and:
   - persists the agent's full reasoning + cited evidence on the `disputes` row,
   - if `confidence > 90%` → **auto-executes the fund transfer** through the existing `applyResolution` path,
   - otherwise flags the case for manual review (no admin UI exists yet — see section 12).
7. State is transitioned to `Disputed`; both parties are notified; trust signals fire (winner gets `disputes_won`, loser gets `disputes_lost -15` — the harshest single penalty).

**Resilience:** if `gemini-config.js` is missing/empty, `DisputeAgentService.available` is `false` and the flow degrades to a manual-review verdict (no auto-transfer). Same on timeout, malformed JSON, or HTTP error — the agent never throws into the modal; it always returns a structured verdict that the existing fund-transfer code understands.

#### Step H — Instant Escrow Release (special case)
- If the **seller's** trust score is `≥95` AND they have `≥10` successful deliveries AND `0` disputes lost, they're "Elite" (`TrustEngineService.isInstantReleaseEligible`).
- For Elite sellers, funds release immediately on shipment (no inspection window). This is currently a **flag** the engine reports — the UI hooks for it are present in the dashboard.

---

## 8. The AI Anomaly Detection Engine (Pre-Fund)

> **Architecture (v2.1).** The umbrella orchestrator (`AnomalyDetectionEngine.js`) composes **two** sub-detectors — **deterministic rules** (`RiskEngineService`) and **ML** (`IsolationForestService` → Python Isolation Forest) — into one verdict per evaluation. `DeviceFingerprintService` feeds the ML feature vector (and audit trail). The `behavioral_score` field in `anomaly_decisions` is always **NULL** for new evaluations (column retained for legacy rows).
>
> ```
>                 ┌────────────────────────────────────────────────────────┐
>                 │        AnomalyDetectionEngine (umbrella, v2.1)         │
>                 │     evaluate() → decision + compositeScore + flags     │
>                 └──────────────────┼─────────────────────────────────────┘
>                                    ↓
>                  ┌──────────────────────────┴──────────────────────────┐
>                  ↓                                                    ↓
>  ┌──────────────────────────────────┐   ┌──────────────────────────────────────────────┐
>  │ RiskEngineService                │   │ IsolationForestService                       │
>  │ deterministic rules              │   │ HTTP → Python IF /score                      │
>  └──────────────────────────────────┘   └──────────────────────────────────┼───────────┘
>                                                                                ↓
>          ┌──────────────────────────────────────────────────────────────────────┐
>          │      DeviceFingerprintService (visitorId → ML features + Turso)      │
>          └──────────────────────────────────────────────────────────────────────┘
> ```

When a buyer tries to join+fund a transaction, the umbrella engine runs both sub-detectors and combines their scores with calibrated weights into a single decision.

### 8.1 Layer 1 — Deterministic Rules (always runs)
Hard-coded heuristics on data we already have:
- New buyer account (<7 days)
- Buyer's `failed_join_attempts` > N
- Counterparty trust score < 40
- Amount above the buyer's historical norm
- Late-night transaction (2am–5am)

Each rule contributes a weight; weights add up to a partial risk score.

### 8.2 Layer 2 — Python AI Engine (runs if reachable)
`IsolationForestService.js` POSTs to the Flask service:

```
POST http://localhost:5000/api/v1/score
{
  "user_id": "...",
  "transaction_amount": 50000,
  "transaction_velocity": 3,        # buyer's txns in last 24h
  "account_age_days": 45,
  "device_fingerprint": 5432,       # from DeviceFingerprintService
  "time_of_day": 14,
  "counterparty_trust_score": 75
}
```

The Flask app (`ai-engine/app.py`) feeds these features into a pre-trained **Isolation Forest** model (`ai-engine/models/isolation_forest_model.pkl`). The model returns an anomaly score, which is mapped to **1–100**. Verdict is `fail` if score > 80.

It also returns human-readable indicators like `"High transaction amount"`, `"New account"`, `"Unusual transaction time"` — these show up in the UI.

**Timeout:** 5 seconds. If the engine is down or slow, the ML layer is skipped and the umbrella **re-normalizes** weights onto the rules layer.

The device fingerprint is produced by `DeviceFingerprintService` using **FingerprintJS open-source v4** (Apache 2.0, loaded from `openfpcdn.io/fingerprintjs/v4/esm.min.js` at runtime — no build step). It returns a stable `visitorId` plus a confidence score. The legacy `userAgent+screen+tz` hash is kept only as a CDN-blocked fallback (marked `degraded:true` so downstream logic can de-weight it).

### 8.3 Composite Decision (the umbrella)
`AnomalyDetectionEngine.evaluate()` returns:

```js
{
  decision: 'pass' | 'review' | 'block',
  compositeScore: 0..100,
  subScores: { rules, ml, behavioral: null },
  flags: [{ code, severity, message, layer }, ...],
  layersActive: ['rules','ml'],
  fingerprintId: '...',
  engineVersion: '2.1.0'
}
```

**Combining rule:** weighted average — `rules×0.6 + ml×0.4`. If the ML layer is unavailable, weight is **redistributed** entirely onto rules.

**Thresholds:**
- `compositeScore ≥ 75` → **block**
- `compositeScore 40–74` → **review** (warning banner; user can self-confirm)
- `compositeScore < 40` → **pass**

**Hard blocks:** reserved for future rule-engine codes that must force `block` regardless of composite score (none active in v2.1).

Every decision is persisted to **`anomaly_decisions`** (umbrella audit, runs even when ML is down) and the ML-only sub-call is also logged to **`ai_risk_logs`** as before.

> **Why no Gemini here?** The previous `GeminiAnomalyService` description-vs-price check was generic and produced too many false positives on legitimate Nigerian listings (slang, abbreviations, regional pricing patterns). Gemini's value in this app is concentrated where it moves the needle: **judging post-fund disputes with photo evidence**. See `DisputeAgentService` (section 7, Step G).

---

## 9. The Trust Score System (in detail)

Two implementations exist; **`TrustEngineService` is the active one**.

### 9.1 The score formula (`TrustEngineService.computeScore`)

Starts at **50** (neutral baseline). Then:

**Positives:**
- `+1.5` per successful delivery (capped at +30)
- `+5 × ln(volume_in_₦/100k + 1)` (capped at +15) — diminishing reward for volume
- `+5` per dispute won (capped at +10)
- Up to `+5` for on-time delivery rate

**Negatives:**
- `-15` per dispute lost ← biggest single signal
- `-3` per **distinct counterparty** the user has lost a dispute to, beyond the first (capped at -15) — peer-graph diversity penalty: 5 losses to 5 different counterparties is scammer-shaped; 5 losses to the same chronic complainer is one feud
- `-3` per cancellation initiated, plus `-4` extra per cancellation beyond 5
- `-1` per mutual cancellation
- `-2` per late delivery
- `-2` per failed join attempt (capped at -20)
- **Temporal decay on inactivity:** linear ramp from 0 (90 days idle) to -10 (270 days idle). Old reputation should not shield a dormant account that wakes up to defraud.

Final score is **clamped to [0, 100]** and rounded to 1 decimal.

### 9.2 The four tiers

| Score | Tier | Color | Meaning |
|---|---|---|---|
| 0–39 | **Low** | Red | Buyers see a warning before joining |
| 40–69 | **Building** | Lime | Neutral / new users |
| 70–94 | **Trusted** | Brand green | No flags |
| 95–100 | **Elite** | Green + gold ring | Eligible for Instant Escrow Release |

A brand-new user starts with no signals and the engine returns the default **`50`**, which is in the **Building** tier — **this is exactly what the screenshot you sent shows**. It is not a bug. It is the correct initial state.

### 9.3 How the score changes
`TrustEngineService.applySignal({ userId, deltas, reason, transactionId })` is called from:
- `StateMachineService` whenever a transaction transitions to `Completed` (positive for both parties)
- `DisputeService` when a dispute is resolved (positive for winner, negative for loser)
- `TransactionService` when a buyer fails to join repeatedly

Each call updates the **counter columns on the `users` row** AND appends a row to `trust_score_history` with `score_before`, `score_after`, `delta`, and `reason`. The history table is what powers the "What changed?" tooltip in the UI.

---

## 10. The Database (Turso / libSQL)

Single Turso database. Schema is in `frontend/escrow-schema.sql` for the escrow tables, plus the `users` table from the older account-creation spec.

### Tables and what they store

| Table | Purpose |
|---|---|
| `users` | Identity (phone, BVN, name, address, hashed_pin, virtual account) **plus** trust counters (`successful_deliveries`, `disputes_lost`, `total_volume_ngn`, `trust_score`, etc.) |
| `transactions` | One row per escrow. Holds state, parties, price, timeline, `risk_score`, `ai_verdict`, timestamps. |
| `transaction_state_history` | Append-only audit log. Every state change writes a row here. |
| `disputes` | One row per dispute. Description, `photo_urls` (JSON), AI resolution, manual resolution, confidence. |
| `trust_scores` | **Legacy cache** for the old `TrustScoreService`. Still written to for backward compat but the engine doesn't read it. |
| `trust_score_history` | Every score change (used by the engine). |
| `ai_risk_logs` | Every call to the Python AI engine — features, response, verdict, latency. |
| `security_logs` | Rate-limit hits, blocked transactions, unauthorized access attempts. |

### Connection
Talks to Turso over **HTTP** (`/v2/pipeline` endpoint) via `turso-db-service.js`. **No native SQLite, no WebSocket.** Auth is a bearer token (`TURSO_AUTH_TOKEN`).

---

## 11. External Integrations

### 11.1 Squad API (`squad-api-service.js`)
Used for:
- BVN identity verification at signup
- Creating a **virtual account number** for each user (so they can receive payments)
- Moving money between virtual accounts and the central holding account
- Handling the actual ₦ transfers when escrow funds/releases

Sandbox keys live in `env.js` / `CONFIG.squad`. Production swap is just an env variable change.

### 11.2 Google Gemini (`DisputeAgentService.js` + `gemini-config.js`)
Used as the **dispute resolution agent**. When a user opens a dispute, `DisputeAgentService.analyze()` sends the transaction context + the user's complaint + up to 4 photos (inline as base64) to Gemini 2.0 Flash, with a strict-JSON prompt that constrains the response to a verdict shape (`favoredParty`, `confidence`, `payout`, `reasoning`, `evidenceCited`). The agent may ask one clarifying question, after which it must rule.

Optional dependency — if `gemini-config.js` is missing or empty, `DisputeAgentService.available` is `false` and the dispute flow degrades to manual review (no auto-resolve). `gemini-config.js` is gitignored; `gemini-config.example.js` is the template.

### 11.3 MediaPipe Face Mesh (`mediapipe-service.js`)
Loaded from CDN. Runs **entirely in the browser**. Used during signup stage 7 for blink-based liveness. No data leaves the device.

### 11.4 AI Risk Engine (`ai-engine/app.py`)
Self-hosted Flask service in Docker. The model (`isolation_forest_model.pkl`) is trained ahead of time using `train_model.py` on synthetic data from `generate_synthetic_data.py` (10k transactions, 5% labeled anomalies across 5 anomaly archetypes). The trained model lives in `ai-engine/models/`.

---

## 12. What's Built vs What's NOT (the honest list)

> **2026 update.** Phases A through G are complete. Everything that
> was previously in the "Partially implemented" or "Not implemented"
> bucket — except OTP-via-SMS, push notifications, frontend test
> suite, and edge rate-limiting — has now been built. The full
> change log is in section 12.5 below.

### ✅ Fully implemented
- **10-stage** account creation with face liveness
- **Face reference photo persisted to Cloudinary at signup** (Phase B). MediaPipe liveness now captures + uploads one frame; URL stored on `users.face_reference_url`.
- **Email field at signup with verification OTP delivered via Resend** (Phase D).
- Phone+PIN sign-in with SHA-256 hashed PINs
- Session management (24h, localStorage)
- Transaction creation, joining, funding, shipping, accepting
- State machine with full transition validation + audit history
- Auto-release on inspection window expiry
- Trust engine with counter-based scoring, history, tiers, Instant Release eligibility
- Pre-fund risk pipeline (deterministic + Python ML + Gemini)
- Dispute creation + AI confidence analysis + auto-resolution for high-confidence cases
- **Dispute photos persisted to Cloudinary** (Phase B), not base64
- **Fulfillment proof photos persisted to Cloudinary** (Phase B)
- Squad virtual accounts + transfers
- Toast notifications, error handling, input validation, rate-limit logging
- **Per-user in-app notification feed with bell counter + transactional email** (Phase C). Every state transition fires a row into `notifications` and conditionally sends a Resend email.
- **Profile panel** with avatar, virtual account display, trust score, address, sign-out (Phase E)
- **Face re-verification via Gemini multimodal** (Phase F). High-risk funds (≥₦500k or anomaly score ≥0.85) and large/stale withdrawals open a re-verification modal that compares a fresh capture to the signup reference. Audit rows in `face_verifications`.
- **Admin moderation console** (`admin.html`, Phase G) — pending dispute queue with one-click resolution, face verification audit, risky-transaction monitor, user directory. Gated by `users.is_admin`.
- Docker Compose deployment for AI engine + frontend nginx
- FingerprintJS-backed device IDs persisted to `device_fingerprints` for sock-puppet detection

### 🟡 Partially implemented / mocked
- **OTP at signup** — **Email** OTP is real (`EmailOTPService` + AI-engine Resend proxy). **Phone** SMS OTP is **not** wired; stage 2 verifies **email** with 6 digits (demo toast still references **`123456`** when Resend is unavailable).
- **Push notifications** — only email + in-app feed today; no web-push or mobile push.

### ❌ Not implemented yet
1. **Real phone-OTP provider** (Termii / Twilio).
2. **Mobile-first PWA polish** (service worker, offline fallback).
3. **Production rate-limiting at the network edge** (currently app-level only).
4. **Frontend unit/integration test suite** (AI engine has `test_api.py` + `test_model.py`; frontend has none).
5. **`ai_reasoning` column on `disputes`** — the dispute agent's free-text reasoning isn't persisted; only the verdict + confidence are. The admin console shows a placeholder.

---

## 12.5 Phase-by-phase change log

What changed and where, for anyone catching up after the original commit:

### Phase A — Foundation (schema + uploads + email plumbing)
- `users` table gained `email`, `email_verified`, `face_reference_url`, `last_face_verified_at`, `is_admin`
- New tables: `notifications`, `email_otps`, `face_verifications`
- New service: `CloudinaryService.js` (browser-side unsigned uploads)
- New service: `NotificationService.js` (persistence + Resend email proxy)
- New service: `EmailOTPService.js`
- AI engine gained `/api/v1/notify/email` and `/api/v1/notify/otp` Resend proxy endpoints
- `cloudinary-config.example.js` and `gemini-config.example.js` templates

### Phase B — Real image storage
- `DisputeService.uploadPhotos()` now uploads to Cloudinary, base64 fallback if config missing
- `TransactionService.storeFulfillmentProof()` same pattern
- Signup liveness now captures one frame and uploads to Cloudinary on success; URL written to `users.face_reference_url`

### Phase C — Notifications + emails on state changes
- Bell icon in dashboard topbar with unread counter, category filters, mark-all-read
- Every `StateMachineService.transition()` fires `NotifyFlow.<event>()` to both participants
- 8 email templates (funding confirmed, shipment created, delivery accepted, dispute opened/resolved, cancellation, security alerts)

### Phase D — Email at signup
- New stage in `account-creation.html` collects email
- 6-digit OTP delivered via Resend, validated against `email_otps` table
- `users.email_verified` flipped on successful match

### Phase E — Profile panel
- Profile icon in topbar replaces the legacy hamburger menu
- Modal shows avatar (Cloudinary photo if available, else initial), full name, virtual account number with copy-to-clipboard, trust score badge, address, sign-out

### Phase F — Face re-verification
- New service: `FaceVerificationService.js` (Gemini 2.0 Flash multimodal: reference URL + fresh capture → same-person verdict)
- `shouldReverify({ user, trigger, anomalyScore, amount })` pure decision function (large amount / high anomaly / sensitive setting / staleness)
- `FaceGate` UI controller in `dashboard.html`: 4-state modal (intro → capture → checking → result)
- Triggers wired: high-risk funding (after AI risk pass), large/stale withdrawals
- All attempts (pass/fail/manual) persisted to `face_verifications`

### Phase G — Admin console
- New page: `admin.html`
- Gated by `users.is_admin = 1`; 403 splash otherwise
- 4 tabs: Pending disputes / Face verifications / Risky transactions / Users
- `DisputeService.resolveManually()` added — bypasses confidence threshold, stamps `manual_resolution`, runs fund transfer + state transition + trust attribution
- "Admin Console" link added to the dashboard profile panel, shown only when `is_admin = 1`

---

## 13. End-to-End Walkthrough — A Concrete Example

Let's trace **one full transaction** through every system.

> Alice (seller) is selling a used iPhone for ₦400,000. Bob (buyer) is paying.

1. **Alice signs up** → **10** stages (see `docs/USER_FLOW.md`) → row in `users` with neutral trust (**50 / Building** once `TrustEngineService` runs) and a Squad virtual account number.
2. **Alice opens the dashboard** → `dashboard.html` loads → trust badge shows **Building** for a new user (`total_completed = 0`).
3. **Alice creates escrow** → `TransactionService.createTransaction` writes `state = 'Created'` with `transaction_id = 'TXN-{uuid}'`.
4. **Alice copies the `TXN-…` code** and sends it to Bob.
5. **Bob signs up**, opens the dashboard, **Join Transaction**, pastes the code, accepts terms → **Fund** modal.
6. **Risk / anomaly (today):** `AnomalyDetectionEngine.evaluate()` is **not** what gates the Fund click — it runs **after** a successful fund and feeds `TrustEngineService.onAnomalyEvaluated` (see `FRAUD_DETECTION_FLOW.md`). The join/fund UI may still show trust and any inline warnings where implemented.
7. **Bob clicks Fund** — **Hackathon path:** buyer **`demo_balance`** is debited, buyer id is written, `stateMachineService.transitionState(..., 'Funded_Locked', …)` succeeds. (A full Squad VA → holding transfer is the production-shaped path elsewhere in the services stack.)
8. **Background:** `anomalyEngine.evaluate` + `trustEngine.onAnomalyEvaluated` may run with `trigger: 'post_fund'`; rows can be written to `anomaly_decisions` / `ai_risk_logs` when the pipeline and tables are available.
9. **Alice gets a toast** “Bob funded the escrow” and **Mark as Shipped**.
10. **Alice ships** → `In_Transit`; timers per `StateMachineService`.
11. **Bob confirms receipt** → `Completed`; payout via **`SquadTransferService`** / transfer layer as configured; **`trustEngine.applySignal`** attributes successful delivery / volume to Alice (and buyer-side counters to Bob).
12. **Trust history** rows append to `trust_score_history` for “what changed?” UI.
13. Both parties see **Completed**; balances refresh. **Done.**

---

## 14. Running It Locally

```powershell
# 1. Set up .env (copy .env.example and fill in Turso + Squad keys)
# 2. Optional: copy frontend/gemini-config.example.js -> frontend/gemini-config.js, add your key
# 3. Spin up everything:
docker-compose up -d
# Frontend → http://localhost:8080
# AI engine → http://localhost:5000/health
```

Or for frontend-only dev (no AI engine), `cd frontend` and run `python -m http.server 8000`, then open `http://localhost:8000/account-creation.html`. The dashboard degrades: **Isolation Forest** may be offline, so the umbrella **re-normalises** weights; trust and rules layers still run.

---

## 15. TL;DR for Your Teammate

1. **It's a vanilla-JS frontend + Flask AI microservice + Turso DB + Squad payments.** No build step, no React.
2. **The dashboard is one giant HTML file** that loads ~30 services in a strict order; each service is one class on `window`.
3. **There's a separate admin page** (`admin.html`) for moderators, gated by `users.is_admin = 1`.
4. **Money flow** is buyer → holding account → seller, gated by a state machine.
5. **Trust score** starts at 50 ("Building") for everyone; goes up on successful deliveries, way down on lost disputes.
6. **AI & risk stack:** **post-fund** anomaly pipeline (**`RiskEngineService` + `IsolationForestService`** under **`AnomalyDetectionEngine`**) updates trust; **Gemini** powers **disputes** (`DisputeAgentService`) and **face re-verification** (`FaceVerificationService`). There is **no** live Gemini “stage 3” on pre-fund listings in the current codebase.
7. **Images live in Cloudinary now** — dispute photos, fulfillment proof, and face references. Base64 fallback only kicks in if Cloudinary config is missing.
8. **Notifications are real**: in-app bell + Resend transactional emails on every state change.
9. **The "Building" badge is correct** — it's the default tier for any user with no completed transactions yet.

---

*Last updated: post Phase G (admin console). If you change service load order in `dashboard.html`, add a new state to the state machine, or add a new admin tab, please update sections 6, 7, 10, and 12.5.*
