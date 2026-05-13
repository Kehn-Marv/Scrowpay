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
┌─────────────────────────────────────────────────────────────────┐
│                          BROWSER                                │
│                                                                 │
│  website.html → account-creation.html → sign-in.html            │
│                                          ↓                      │
│                                    dashboard.html               │
│                                          │                      │
│                       ┌──────────────────┼──────────────────┐   │
│                       ↓                  ↓                  ↓   │
│            DashboardService   TransactionService   TrustEngine  │
│            (orchestrator)     StateMachineService  RiskProfiling│
│            BalanceService     DisputeService       AIRiskService│
│                              DisputeAgentService                │
└──────────────┬──────────────────┬─────────────────┬─────────────┘
               │                  │                 │
               ▼                  ▼                 ▼
        ┌────────────┐    ┌──────────────┐   ┌──────────────┐
        │  Turso DB  │    │  Squad API   │   │  AI Engine   │
        │  (libSQL)  │    │ (payments +  │   │  (Flask +    │
        │            │    │  virtual a/c)│   │  IsoForest)  │
        └────────────┘    └──────────────┘   └──────────────┘
                                                     ▲
                                                     │
                                              ┌──────────────┐
                                              │  Gemini API  │
                                              │  (dispute    │
                                              │   resolution │
                                              │   agent,     │
                                              │   multimodal)│
                                              └──────────────┘
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
| `frontend/account-creation.html` | The 9-stage signup flow (phone → OTP → BVN/NIN → name → Squad verify → face intro → blink liveness → address → PIN). |
| `frontend/sign-in.html` | Phone + 6-digit PIN login. Hashes PIN with SHA-256 + phone-as-salt and compares to DB. |
| `frontend/dashboard.html` | The main app. Lists transactions, lets users create/join/fund/ship/accept/dispute, shows trust score, balance, etc. **All escrow logic lives here.** |

---

## 4. Account Creation — Stage by Stage

File: `frontend/account-creation.html` (orchestrator) + the services it calls.

| # | Stage | What happens | Service involved |
|---|---|---|---|
| 1 | **Phone Number** | User enters Nigerian phone. Format-validated. | `InputValidationService.js` |
| 2 | **OTP** | 6-digit OTP. **Currently hardcoded to `123456`** for the hackathon. | `otp-service.js` |
| 3 | **ID Type + Number** | BVN or NIN (11 digits). | `id-validation-service.js` |
| 4 | **Name** | First / Middle / Last name. |  |
| 5 | **Squad Verification** | Calls Squad's BVN/NIN endpoint to confirm the ID matches the name + DOB + gender. | `squad-api-service.js` |
| 6 | **Face Verification Intro** | "Get ready to blink" screen. |  |
| 7 | **Blink Liveness** | MediaPipe Face Mesh runs in the browser, computes Eye Aspect Ratio (EAR), watches for a real blink. Proves user is a live human, not a photo. | `mediapipe-service.js` |
| 8 | **Address** | Cascading dropdowns: 36 states → 774 LGAs → wards. Data is bundled in `state-lga-area.json` (~350 KB). | `address-data-service.js` |
| 9 | **PIN Setup** | 6-digit PIN. Weak patterns blocked (`111111`, `123456`, `112233`). Hashed with SHA-256 + phone as salt. | `pin-service.js` |

On success, the user row is inserted into the `users` table in Turso, a Squad **virtual account** is created for them (so they have an account number people can pay into), and they're redirected to `sign-in.html`.

### What is NOT implemented yet at signup
- **Face image is never persisted.** MediaPipe just confirms a blink happened in-browser. The face image / face embedding is never uploaded or stored. (See section 12 for the planned image DB.)
- **OTP is fake** — there is no SMS provider wired up.
- **BVN/NIN photo from Squad** is fetched but not saved anywhere.

---

## 5. Sign In

File: `frontend/sign-in.html` + `SessionService.js`.

1. User enters phone + PIN.
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
| 8 | `AIRiskService.js` | Calls the Python AI engine over HTTP. |
| 9 | `squad-api-service.js` | Squad payments, virtual accounts, transfers. |
| 10 | `StateMachineService.js` | Enforces the transaction state machine (Created → Funded_Locked → In_Transit → Completed/Disputed). Holds auto-release timers. |
| 11 | `BalanceService.js` | Computes available vs locked balances per user. |
| 12 | `DisputeService.js` | Persists disputes; maps a `DisputeAgentService` verdict into fund transfer + state transition + notifications via `resolveWithAgentVerdict()`. |
| 13 | `DisputeAgentService.js` | **The AI dispute agent.** Multimodal Gemini call — reads the user's complaint + uploaded photos + transaction context, returns a binding verdict (or one clarifying question). |
| 14 | `TrustEngineService.js` | **Active** trust score engine (counter-based, signal-driven). Now includes temporal decay-on-inactivity and peer-graph diversity penalty. |
| 15 | `DeviceFingerprintService.js` | FingerprintJS-OSS-backed device identity. Loaded lazily from CDN; falls back to legacy hash if blocked. |
| 16 | `BehavioralSignalsService.js` | Session-scoped behavioral signals collector (PIN paste, tab blur, multi-account-from-device, etc.). |
| 17 | `RiskProfilingService.js` | Deterministic in-browser rules sub-detector. |
| 18 | `AnomalyDetectionEngine.js` | **The umbrella.** Composes rules + ML (`AIRiskService`) + behavioral into one verdict. The funding flow calls `engine.evaluate()` and uses the returned `decision`. |

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

#### Step D — Seller ships (Funded_Locked → In_Transit)
- Seller clicks "Mark as Shipped".
- `StateMachineService` validates: only the seller can do this, only when state is `Funded_Locked`.
- `shipped_at` is stamped.
- An **auto-release timer** is started: `inspection_window_days` after `shipped_at`, the funds auto-release to the seller (handled in `StateMachineService.autoReleaseTimers`).

#### Step E — Buyer accepts (In_Transit → Completed)
- Buyer clicks "I received my item, release funds".
- Squad API transfers from the holding account → seller's virtual account.
- `completed_at` is stamped.
- `StateMachineService` calls `trustEngine.applySignal()` for **both buyer and seller** with positive signals (`successful_deliveries +1`, `total_completed +1`, `total_volume_ngn +price`).
- Auto-release timer is cancelled.

#### Step F — Auto-release (alternative to E)
- If the buyer never accepts, the timer fires after the inspection window.
- Same money movement and trust signals as E.
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

> **Architecture (v2.0).** The "AI Anomaly Detection Engine" is now a real, single umbrella orchestrator (`AnomalyDetectionEngine.js`) that composes **three independent sub-detectors** — rules, ML, and behavioral — into one verdict per evaluation. The dashboard never asks any individual sub-detector; it always asks the umbrella.
>
> ```
>                    ┌──────────────────────────────────────┐
>                    │      AnomalyDetectionEngine          │
>                    │      (umbrella, v2.0)                │
>                    │                                      │
>                    │  evaluate({txn, actor, counterparty})│
>                    │   → { decision, compositeScore,      │
>                    │       subScores, flags, ... }        │
>                    └──────────────┬───────────────────────┘
>                                   │
>                ┌──────────────────┼──────────────────┐
>                ▼                  ▼                  ▼
>      ┌──────────────────┐ ┌──────────────┐ ┌────────────────────┐
>      │ RiskProfiling    │ │ AIRiskService│ │ BehavioralSignals  │
>      │ (rules, in-      │ │ → Python     │ │ (PIN paste, tab    │
>      │  browser)        │ │   Isolation  │ │  blur, multi-      │
>      │                  │ │   Forest     │ │  account-from-     │
>      │                  │ │   /score     │ │  device, etc.)     │
>      └──────────────────┘ └──────────────┘ └─────────┬──────────┘
>                                                      │
>                                                      ▼
>                                        ┌──────────────────────────┐
>                                        │ DeviceFingerprintService │
>                                        │ (FingerprintJS OSS v4    │
>                                        │  via CDN — real device   │
>                                        │  visitorId + confidence) │
>                                        └──────────────────────────┘
> ```

When a buyer tries to join+fund a transaction, the umbrella engine runs all three sub-detectors and combines their scores with calibrated weights into a single decision.

### 8.1 Layer 1 — Deterministic Rules (always runs)
Hard-coded heuristics on data we already have:
- New buyer account (<7 days)
- Buyer's `failed_join_attempts` > N
- Counterparty trust score < 40
- Amount above the buyer's historical norm
- Late-night transaction (2am–5am)

Each rule contributes a weight; weights add up to a partial risk score.

### 8.2 Layer 2 — Python AI Engine (always runs if reachable)
`AIRiskService.js` POSTs to the Flask service:

```
POST http://localhost:5000/api/v1/score
{
  "user_id": "...",
  "transaction_amount": 50000,
  "transaction_velocity": 3,        # buyer's txns in last 24h
  "account_age_days": 45,
  "device_fingerprint": 5432,       # hash of userAgent+screen+tz
  "time_of_day": 14,
  "counterparty_trust_score": 75
}
```

The Flask app (`ai-engine/app.py`) feeds these 6 features into a pre-trained **Isolation Forest** model (`ai-engine/models/isolation_forest_model.pkl`). The model returns an anomaly score, which is mapped to **1–100**. Verdict is `fail` if score > 80.

It also returns human-readable indicators like `"High transaction amount"`, `"New account"`, `"Unusual transaction time"` — these show up in the UI.

**Timeout:** 5 seconds. If the engine is down or slow, `AIRiskService` returns a **fail-safe `fail` verdict** (better to block a real txn than let a fraud through silently).

### 8.3 Layer 3 — Behavioral Signals (always runs)
`BehavioralSignalsService` collects passive, privacy-respecting in-session signals and turns them into a sub-score:
- **PIN was pasted instead of typed** (+25, hard-block on high-value txns)
- **Same device used by ≥3 different accounts** (+25, hard-block; sock-puppet pattern)
- **Funded ≤30s after login on a high-value txn** (+20; compromised credential pattern)
- **Repeated tab blurs while the funding modal was open** (+12; coaching pattern)
- **Account using ≥5 different devices** (+10; device-rotation pattern)
- **Late-night high-value funding** (+10)

The device fingerprint is produced by `DeviceFingerprintService` using **FingerprintJS open-source v4** (Apache 2.0, loaded from `openfpcdn.io/fingerprintjs/v4/esm.min.js` at runtime — no build step). It returns a stable `visitorId` plus a confidence score. The legacy `userAgent+screen+tz` hash is kept only as a CDN-blocked fallback (marked `degraded:true` so the engine de-weights it).

### 8.4 Composite Decision (the umbrella)
`AnomalyDetectionEngine.evaluate()` returns:

```js
{
  decision: 'pass' | 'review' | 'block',
  compositeScore: 0..100,
  subScores: { rules, ml, behavioral },
  flags: [{ code, severity, message, layer }, ...],
  layersActive: ['rules','ml','behavioral'],
  fingerprintId: '...',
  engineVersion: '2.0.0'
}
```

**Combining rule:** weighted average — `rules×0.45 + ml×0.30 + behavioral×0.25`. If any layer is unavailable (e.g. Python ML engine is down), its weight is **redistributed** to the active layers — a missing detector doesn't soft-pass risky transactions.

**Thresholds:**
- `compositeScore ≥ 75` → **block**
- `compositeScore 40–74` → **review** (warning banner; user can self-confirm)
- `compositeScore < 40` → **pass**

**Hard blocks:** any single one of these flag codes forces a `block` regardless of composite score, because the false-positive cost is dominated by the fraud cost:
- `SHARED_DEVICE_MULTI_ACCOUNT` (≥3 accounts on one device)
- `PIN_PASTED_HIGH_VALUE` (PIN paste on a >₦200k transaction)

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
| `users` | Identity (phone, BVN/NIN, name, address, hashed_pin, virtual account) **plus** trust counters (`successful_deliveries`, `disputes_lost`, `total_volume_ngn`, `trust_score`, etc.) |
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
- BVN/NIN identity verification at signup
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

### ✅ Fully implemented
- 9-stage account creation with face liveness
- Phone+PIN sign-in with SHA-256 hashed PINs
- Session management (24h, localStorage)
- Transaction creation, joining, funding, shipping, accepting
- State machine with full transition validation + audit history
- Auto-release on inspection window expiry
- Trust engine with counter-based scoring, history, tiers, Instant Release eligibility
- Pre-fund risk pipeline (deterministic + Python ML + Gemini)
- Dispute creation + AI confidence analysis + auto-resolution for high-confidence cases
- Squad virtual accounts + transfers
- Toast notifications, error handling, input validation, rate-limit logging
- Docker Compose deployment for AI engine + frontend nginx

### 🟡 Partially implemented / mocked
- **OTP at signup** — hardcoded to `123456`, no SMS provider wired (would be Termii / Twilio).
- **Dispute photo storage** — `DisputeService.uploadPhotos()` currently converts uploaded files to **base64 data URLs** and stores them inline (`@frontend/DisputeService.js:619-654`). The comment explicitly says this is for the hackathon and production should use S3 / Cloudinary.
- **Fulfillment proof on transactions** — same problem (`@frontend/transaction-service.js:290-296`): base64 data URIs are kept in-memory only and not persisted because Turso's HTTP pipeline rejects oversized statements.
- **Manual dispute review** — low-confidence disputes are flagged in the DB but there is **no admin/moderator UI** to actually resolve them. They sit in `Disputed` state until manually updated.
- ~~**Device fingerprint** — currently a hash of `userAgent + screen + timezone`.~~ **DONE** in v2.0 — `DeviceFingerprintService` now uses **FingerprintJS open-source v4** (Apache 2.0) loaded from `openfpcdn.io`. Returns a stable `visitorId` plus confidence score, persisted to `device_fingerprints` for sock-puppet detection. Legacy hash retained only as a CDN-blocked fallback.

### ❌ Not implemented yet — the things we said we'd add
1. **Separate image / object store** — for face images (signup), dispute photos, fulfillment proof (shipping label, delivered package). The plan: stand up either **Cloudinary** or an **S3-compatible bucket** (Backblaze B2 / Cloudflare R2) and replace base64 with real upload URLs in:
   - `DisputeService.uploadPhotos`
   - `TransactionService.storeFulfillmentProof`
   - The MediaPipe liveness step (capture + upload one frame as a face reference for re-verification later).
2. **Face re-verification flow** — there's a Kiro spec for it (`.kiro/specs/face-verification-reverification/`) but no code yet. Idea: when a user does something high-risk (large withdrawal, password reset), we re-run liveness and compare to the stored face reference.
3. **Real OTP provider** integration.
4. **Admin dashboard** for manual dispute resolution, KYC review, watching `security_logs`.
5. **Push notifications / email** when a transaction state changes (right now it's just toast within the open tab).
6. **Mobile-first PWA polish** (service worker, offline fallback).
7. **Production rate-limiting at the network edge** (currently it's app-level only — `rate-limiting-integration-example.js` is just a sketch).
8. **Real transactional email/SMS receipts** for funding, shipping, completion.
9. **Proper unit/integration test suite for the frontend services** (the AI engine has `test_api.py` and `test_model.py`; the frontend has none).

---

## 13. End-to-End Walkthrough — A Concrete Example

Let's trace **one full transaction** through every system.

> Alice (seller) is selling a used iPhone for ₦400,000. Bob (buyer) is paying.

1. **Alice signs up** → 9 stages → row in `users` with `trust_score = NULL` (treated as 50 / Building) and a Squad virtual account number.
2. **Alice opens the dashboard** → `dashboard.html` loads → her trust badge shows `50 / Building` (lime). The new-user notice is shown because `total_completed = 0`.
3. **Alice clicks Create Escrow** → fills in description "iPhone 13 Pro 256GB, mint condition", price ₦400,000, delivery 5 days, inspection 3 days → `TransactionService.createTransaction` writes a row with `state = 'Created'`, `transaction_id = 'SCR-AB12CD'`.
4. **Alice copies `SCR-AB12CD`** and texts it to Bob.
5. **Bob signs up too**, opens dashboard, clicks Join Transaction, enters the code.
6. The dashboard fetches the transaction → calls `RiskProfilingService.evaluate()`:
   - **Deterministic rules**: Bob's account is 2 days old → **+15 risk weight** ("New account").
   - **Gemini check** (if key present): description matches price → returns `{ suspicious: false }`.
   - **Python AI engine**: features `{amount: 400000, velocity: 1, age: 2, ...}` → Isolation Forest returns risk_score `45` → verdict `pass`, indicators `["New account"]`.
   - Final verdict: `pass with warning`.
7. Bob sees a yellow warning ("New account — proceed with caution") and a green **Fund Now** button.
8. **Bob clicks Fund** → `StateMachineService.transition(Created → Funded_Locked)`:
   - `validateUserPermission`: passes (Bob ≠ seller).
   - `SquadVirtualAccountService.transfer`: ₦400,000 from Bob's VA → holding account.
   - DB update: `state = 'Funded_Locked'`, `buyer_id = bob.id`, `funded_at = now`, `risk_score = 45`, `ai_verdict = 'pass'`.
   - Row added to `transaction_state_history`.
   - Row added to `ai_risk_logs`.
9. **Alice gets a toast** "Bob funded the escrow" and a Mark as Shipped button.
10. **Alice clicks Mark as Shipped** → `state = 'In_Transit'`, `shipped_at = now`. An auto-release timer is scheduled for `now + 3 days` (the inspection window).
11. **Bob receives the phone in 4 days**. He opens the dashboard, clicks **I received my item**.
12. `StateMachineService.transition(In_Transit → Completed)`:
    - `SquadVirtualAccountService.transfer`: ₦400,000 from holding → Alice's VA.
    - `state = 'Completed'`, `completed_at = now`.
    - Auto-release timer cancelled.
    - `trustEngine.applySignal(alice, { successful_deliveries: +1, total_completed: +1, total_volume_ngn: +400000 })` → Alice's score goes from 50 → ~57.5 → still **Building**, but climbing.
    - Same signal applied to Bob.
    - Two rows appended to `trust_score_history` so both can see "+7.5 — successful delivery as seller" in their tooltip.
13. Both users see green "Completed" badges. Alice's balance updates. Done.

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

Or for frontend-only dev (no AI engine), `cd frontend` and run `python -m http.server 8000`, then open `http://localhost:8000/account-creation.html`. The dashboard will degrade gracefully — risk profiling will fall back to rules-only with a `fail` verdict from the AI layer.

---

## 15. TL;DR for Your Teammate

1. **It's a vanilla-JS frontend + Flask AI microservice + Turso DB + Squad payments.** No build step, no React.
2. **The dashboard is one giant HTML file** that loads ~14 services in a strict order; each service is one class on `window`.
3. **Money flow** is buyer → holding account → seller, gated by a state machine.
4. **Trust score** starts at 50 ("Building") for everyone; goes up on successful deliveries, way down on lost disputes.
5. **Two AI layers** decide if a transaction can be funded: rule-based + Isolation Forest (Python). Either one can block. Gemini isn't in this path — it now powers the **post-fund dispute resolution agent** (multimodal: reads complaint + photos, issues a binding verdict).
6. **Images are currently base64-in-DB** (a known hack); we still need to wire up real object storage.
7. **The "Building" badge is correct** — it's the default tier for any user with no completed transactions yet.

---

*Last updated: based on codebase state in `c:\Users\chukw\Desktop\Scrowpay`. If you change service load order in `dashboard.html` or add a new state to the state machine, please update sections 6, 7, and 10.*
