<div align="center">

# ScrowPay

**AI-powered escrow for Nigerian peer-to-peer commerce.**

Money sits in a holding account until both sides honour the deal. **Risk stack:** deterministic rules + Isolation Forest feed an umbrella score; in the **current dashboard build** the composite run is **post-fund** (non-blocking) and updates trust — see `FRAUD_DETECTION_FLOW.md`. Escrow releases and payouts still go through Squad-backed flows.

[![Built for](https://img.shields.io/badge/Built%20for-Squad%20Hackathon-caff04?style=flat-square)](https://squadco.com)
[![Stack](https://img.shields.io/badge/Stack-Vanilla%20JS%20%2B%20Flask%20%2B%20Turso-111111?style=flat-square)](#-tech-stack)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

[Problem](#the-problem) · [Solution](#solution-overview) · [Squad APIs](#squad-api-integration) · [AI / Data](#ai--data-intelligence) · [User Flow](#user-flow) · [Quick Start](#-quick-start--5-minutes) · [Impact](#impact-potential) · [Docs](docs/)

</div>

---

## The Problem

**Who is suffering?** Millions of Nigerians buying and selling on WhatsApp, Twitter/X, Instagram, Jiji, and Facebook Marketplace. These platforms have no built-in payment protection.

**Why it matters right now:**
- Nigeria's informal e-commerce is estimated at over **$10 billion annually**, and the majority of peer-to-peer transactions happen outside regulated marketplaces.
- **1 in 3 online buyers** in Nigeria has experienced a failed delivery or outright scam (NOIPolls / EFInA surveys).
- Sellers face the reverse problem — chargebacks and fake "item not received" claims with no neutral arbiter.
- Existing escrow solutions are either bank-grade (minimum ₦5M, corporate-only) or informal (a friend holds the cash). There is **no consumer-grade, AI-protected escrow** for everyday transactions.

The trust gap costs the ecosystem real money. Buyers overpay for "safe" channels (COD markups, marketplace fees), sellers lose honest customers who refuse to pay first, and repeat commerce never forms.

---

## Target User

**Tunde, 27, Lagos.** Sells refurbished phones on Twitter/X. His buyers want delivery before payment; he wants payment before shipping. Neither side trusts the other. He loses ~3 deals per week to trust breakdown. ScrowPay lets both sides lock funds in escrow, verify each other's identity and reputation, and complete the deal with zero risk.

**Amaka, 24, Abuja.** Buys fashion items from Instagram vendors. She has been scammed twice — paid via bank transfer, got blocked. She now only buys from sellers who accept ScrowPay because she can see their Trust Score and knows her money is locked until she confirms delivery.

These are the thousands of everyday Nigerian buyers and sellers who trade informally online and need a simple, trustworthy middle-ground.

---

## Solution Overview

ScrowPay is a **peer-to-peer escrow platform** where money is held in a Squad virtual account until both sides honour the deal. Around that core payment flow, we layer AI to **prevent fraud before it happens** and **resolve disputes automatically when it does**.

**How it works in one sentence:** Seller lists, buyer funds (money goes to a holding account via Squad), goods are delivered, buyer confirms, money releases to seller — and AI watches every step.

### What we built

| Layer | What it does |
|---|---|
| **Escrow engine** | State machine over **`Created` → `Funded_Locked` → `In_Transit` → (`Completed` \| `Disputed`)** plus **`Cancelled` / `Refunded`** terminal paths in the DB schema and `TransactionService` |
| **Squad payment rails** | Virtual accounts for every user + a central holding account + NIP transfers for payouts |
| **AI risk scoring** | `AnomalyDetectionEngine`: **`RiskEngineService`** (rules) + **`IsolationForestService`** (Flask Isolation Forest). **Wired today:** `evaluate()` runs **after** a successful fund and feeds **`TrustEngineService.onAnomalyEvaluated`** — non-blocking. *Product goal:* optional pre-fund gate. |
| **AI dispute agent** | Gemini 2.0 Flash multimodal agent that reads complaints + photo evidence and issues binding verdicts |
| **Face re-verification** | Gemini-powered face match for high-risk actions (large withdrawals) against signup reference photo |
| **Trust engine** | Dynamic 0-100 reputation score with tiers, history, and Instant Release eligibility |
| **Admin console** | Moderation dashboard for manual dispute review, face audit, and risky transaction monitoring |

---

## Squad API Integration

Squad is the **complete financial backbone** of ScrowPay. We use **three product lines** across **eight API endpoints**:

### 1. Virtual Account API — Identity + Funding

| Method | Endpoint | What it does in ScrowPay |
|--------|----------|--------------------------|
| `POST` | `/virtual-account` | Creates a real NUBAN for every user. Squad validates BVN against NIBSS (name, DOB, gender, phone) — giving us **bank-grade KYC at zero extra cost**. |
| `GET` | `/virtual-account/customer/{id}` | Retrieves account details and balance for the dashboard. |
| `GET` | `/virtual-account/{identifier}` | Looks up a user by their unique identifier. |

**Why it's central:** Every user gets a real Nigerian bank account. Buyers fund escrow by transferring Naira to the holding virtual account. No virtual accounts = no money movement = no product.

### 2. Transfer / Payout API — Escrow Release + Withdrawals

| Method | Endpoint | What it does in ScrowPay |
|--------|----------|--------------------------|
| `POST` | `/payout/account/lookup` | Verifies destination bank + account name before any transfer — prevents misdirected payments. |
| `POST` | `/payout/transfer` | Releases escrow funds to the seller (or refunds the buyer) via NIP instant transfer. |
| `POST` | `/payout/requery` | Re-queries transfer status for confirmation — ensures idempotency. |
| `GET` | `/merchant/balance` | Fetches the Squad Merchant Ledger balance in real-time (30s polling). |
| `GET` | `/payout/list` | Lists all historical transfers for audit. |

**Why it's central:** Every escrow release, every refund, every withdrawal flows through these endpoints. Supports 21+ Nigerian banks.

### 3. Merchant Balance API — Real-Time Dashboard

The dashboard polls Squad every 30 seconds for the live available balance, combining it with locked-in-escrow amounts from the database to show users their complete financial picture.

**Implementation files:**
- `frontend/squad-api-service.js` — Virtual Account API client
- `frontend/SquadTransferService.js` — Transfer/Payout API client
- `frontend/BalanceService.js` — Balance orchestrator with 30s TTL cache

> Full technical deep-dive: [docs/SQUAD_API_INTEGRATION.md](docs/SQUAD_API_INTEGRATION.md)

---

## AI / Data Intelligence

ScrowPay addresses **two AI pillars**: **Fraud Prevention** and **Automated Dispute Resolution**.

### Pillar 1: Fraud / anomaly detection (rules + ML)

1. **`RiskEngineService`** — deterministic, in-browser rules (counterparty, amount, time-of-day, etc.). **No Gemini** in this path today (legacy listing check was removed).
2. **`IsolationForestService`** — browser client → **Python `ai-engine`** Isolation Forest **`/api/v1/score`**.

**Current product wiring (`dashboard.html`):** after a buyer **successfully** funds, `anomalyEngine.evaluate()` runs in the background and **`trustEngine.onAnomalyEvaluated`** ingests the composite score. Funding itself is **not** blocked by this call in the present implementation (see `FRAUD_DETECTION_FLOW.md`). Verdicts and features are still logged for audit when the pipeline runs.

**Design thresholds** (umbrella): see `AnomalyDetectionEngine.js` (`BLOCK_THRESHOLD` / `REVIEW_THRESHOLD`) — distinct from any copy that still mentions “>80 block” from older marketing drafts.

### Pillar 2: Multimodal Dispute Resolution

When a buyer raises a dispute:
1. The **Gemini 2.0 Flash agent** receives: transaction context, free-text complaint, up to 4 uploaded photos
2. It returns a structured JSON verdict: `favoredParty`, `confidence`, `payout`, `reasoning`, `evidenceCited`
3. High-confidence verdicts (>90%) auto-execute. Lower confidence routes to the admin console for human review.

### Additional AI Features

- **Face re-verification** — High-value withdrawals: Gemini multimodal compare vs. optional Cloudinary signup reference (`FaceVerificationService`)
- **Device fingerprint** — **`DeviceFingerprintService`** (FingerprintJS) supplies visitor ID for ML features + audit; not a separate “behavioural model” layer in `AnomalyDetectionEngine` v2.1 (`behavioral_score` is **null**)
- **Trust Score engine** — **`TrustEngineService`**: deterministic 0–100 score from counters + **`last_anomaly_score`**; tiers **Low / Building / Trusted / Elite**; marketing copy on `web.html` maps these to three plain-language bands

> Full technical deep-dive: [docs/AI_INTELLIGENCE.md](docs/AI_INTELLIGENCE.md)

---

## User Flow

A step-by-step walkthrough of the complete product experience:

### Account Creation (10 stages)
1. **Phone + email**
2. **Email OTP** (6-digit; demo fallback **`123456`** when engine unreachable)
3. **BVN**
4. **Name + gender + DOB** (must match BVN / NIBSS)
5. **Squad virtual account** creation (NUBAN)
6. **Face intro**
7. **Blink liveness** (MediaPipe) + optional Cloudinary reference upload
8. **Address** (state → LGA → ward)
9. **6-digit PIN** (hashed via `PINService`)
10. **Success** → sign in

### Core Transaction Flow
1. **Seller creates listing** — Description, price (₦100 – ₦10M), delivery timeline (inspection UI optional / legacy field)
2. **Buyer joins** — Enters **`TXN-{uuid}`**; sees seller trust + listing context (pre-fund anomaly UI is limited in current wiring)
3. **Buyer funds escrow** — **Demo path:** `demo_balance` debit + state → `Funded_Locked`; **Squad** still powers VA, payouts, and releases in the wider system
4. **Seller ships** — Marks as shipped; both parties notified
5. **Buyer inspects** — Confirms receipt OR raises a dispute
6. **Money releases** — Funds transfer to seller's bank via Squad NIP payout

### Dispute Flow
1. Buyer files dispute with description + photo evidence
2. AI agent analyzes and returns verdict with confidence score
3. High confidence → auto-resolved. Low confidence → admin queue
4. Resolution triggers automatic fund movement (refund / release / split)

> Full walkthrough with screenshots: [docs/USER_FLOW.md](docs/USER_FLOW.md)

---

## Impact Potential

**Who can this reach:**
- **Immediate**: ~50M Nigerians active in informal online commerce (WhatsApp, social media, classifieds)
- **Year 1 target**: 10,000 active users processing ₦500M+ in escrow transactions
- **Expansion**: Every African market with similar trust gaps — Ghana, Kenya, South Africa

**How quickly:**
- Zero-install (web app, no app store approval needed)
- Integrates with existing commerce channels — sellers share a transaction link on WhatsApp/Twitter
- Viral loop: every transaction exposes a new counterparty to ScrowPay

---

## Scalability & Business Model

| Revenue stream | Model |
|---|---|
| **Transaction fee** | 1.5% of escrow amount (capped at ₦5,000 per transaction) |
| **Instant Release** | Premium feature for Elite-tier users (Trust Score ≥ 95) |
| **API access** | B2B escrow-as-a-service for marketplaces and logistics platforms |

**Technical scalability:**
- Stateless frontend (vanilla JS + CDN) — scales horizontally behind any CDN/load balancer
- Turso (distributed SQLite) — edge-replicated, handles millions of reads
- Squad handles all payment infrastructure — no PCI compliance burden
- AI engine is a stateless Flask container — auto-scales independently

---

## Research & Validation

| Claim | Evidence |
|---|---|
| Trust is the #1 barrier to Nigerian e-commerce | NOIPolls 2023: 67% of online shoppers cite fear of fraud as primary concern |
| Informal e-commerce exceeds $10B | EFInA Access to Financial Services survey + CBN reports on informal sector |
| 1 in 3 buyers has been scammed | Consumer protection data from FCCPC + independent surveys |
| Escrow reduces dispute rates by 60-80% | Payoneer & Escrow.com public case studies on marketplace trust |
| Isolation Forest is effective for transaction fraud | IEEE 2022 survey on unsupervised anomaly detection in financial data |
| BVN verification deters fraud | NIBSS data: BVN-linked accounts have 40% fewer fraud incidents |
| Real-time risk scoring improves catch rates | Stripe Radar public benchmarks + academic literature on pre-authorization scoring |

> Full research citations: [docs/RESEARCH_VALIDATION.md](docs/RESEARCH_VALIDATION.md)

---

## 🚀 Quick start — 5 minutes

> Detailed step-by-step (with copy-paste commands and a comprehensive FAQ) is in **[SETUP_CHECKLIST.md](SETUP_CHECKLIST.md)**.

**Docker is the only supported way to run this project.** No Python, no Node.js, no nginx — the bundled `docker-compose.yml` brings up the entire stack.

### Prerequisites

- **Docker Desktop** (with Compose v2) — <https://www.docker.com/products/docker-desktop>
- **Git**
- A free account on **[Turso](https://turso.tech)** (database)
- A sandbox account on **[Squad](https://squadco.com)** (payments)
- **Recommended**: free accounts on **[Google AI Studio](https://aistudio.google.com)** (Gemini), **[Cloudinary](https://cloudinary.com)** (image storage), and **[Resend](https://resend.com)** (email)

### 1. Clone and configure

```bash
git clone <repository-url> scrowpay
cd scrowpay
cp .env.example .env
```

Edit `.env` and fill in at minimum:

```bash
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=eyJ...
SQUAD_SECRET_KEY=sandbox_sk_...
SQUAD_PUBLIC_KEY=sandbox_pk_...
```

### 2. Browser-side configs (three files, all gitignored)

Copy the three templates and paste in your real values. None of these are auto-generated — each one has a `*.example` you copy from:

```powershell
# Windows
Copy-Item frontend\env.js.example            frontend\env.js
Copy-Item frontend\gemini-config.example.js  frontend\gemini-config.js
Copy-Item frontend\cloudinary-config.example.js frontend\cloudinary-config.js

# Mac/Linux
cp frontend/env.js.example            frontend/env.js
cp frontend/gemini-config.example.js  frontend/gemini-config.js
cp frontend/cloudinary-config.example.js frontend/cloudinary-config.js
```

Each file's header explains exactly what to paste.

- `frontend/env.js` — Turso + Squad keys (same values as `.env`, the browser needs its own copy)
- `frontend/gemini-config.js` — Google AI Studio key (unlocks dispute AI + face re-verification)
- `frontend/cloudinary-config.js` — Cloudinary cloud name (unlocks real image storage)

If you skip the Gemini / Cloudinary ones, the app still runs — it just degrades cleanly:

| Missing config | Degraded behaviour |
|---|---|
| `gemini-config.js` | Dispute auto-resolution disabled; face re-verification disabled. Rule-based risk only. |
| `cloudinary-config.js` | Dispute photos + face references fall back to base64 inline storage (hackathon mode). |
| Resend key in `.env` | Notifications still appear in the bell dropdown; no email is sent; signup OTP falls back to a dev code in the console. |

### 3. Start everything

```powershell
docker compose up -d
docker compose logs -f          # watch boot
```

### 4. Open the app

| Service | URL |
|---|---|
| **Frontend (landing page)** | <http://localhost:8080/web.html> |
| **Sign-in** | <http://localhost:8080/sign-in.html> |
| **Dashboard** (after sign-in) | <http://localhost:8080/dashboard.html> |
| **Admin console** | <http://localhost:8080/admin.html> ([requires `is_admin` flag](#-accessing-the-admin-console)) |
| **AI risk engine** | <http://localhost:5000> |
| **AI engine health** | <http://localhost:5000/health> |

That's it. Create an account, fund a transaction, raise a dispute, watch the AI agent rule on it.

---

## 🎬 Demo flow for judges

This is the path to take to see everything working in ~5 minutes:

1. **Sign up two accounts** (use two browsers / incognito windows).
   - Both go through phone → OTP (`123456`) → BVN → name → liveness blink → address → PIN
   - Both end up with a Squad virtual account
2. **Seller** creates an escrow listing (₦10,000 iPhone case), copies the transaction ID.
3. **Buyer** joins the transaction with the ID.
   - Watch the AI risk score appear; with a new account it flags "new account" but passes.
4. **Buyer** funds it → money moves into the holding virtual account → notifications fire (bell + email).
5. **Seller** marks as shipped → both get notified.
6. **Buyer** raises a dispute with a description and a photo of the (allegedly) damaged item.
   - The dashboard uploads the photo to Cloudinary → calls the Gemini dispute agent → gets a verdict.
   - High confidence (>90%) → auto-resolved with fund transfer.
   - Lower confidence → falls into the **admin console** queue.
7. **Admin** opens `admin.html`, sees the pending dispute, clicks it, reviews the photo + AI recommendation, and resolves it. Funds move; both parties get notified.
8. **Try a large withdrawal** (≥ ₦500,000) → the face re-verification modal opens, captures a fresh frame, sends both your stored signup photo + the new frame to Gemini, and only releases the withdrawal on a "same person" verdict.

---

## 🏗️ Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                              BROWSER                                  │
│                                                                       │
│   web.html  ─►  account-creation.html  ─►  sign-in.html               │
│                                                       │               │
│                                                       ▼               │
│                                                  dashboard.html       │
│                                                       │               │
│   ┌───────────────────────────────────────────────────┴─────────────┐ │
│   │  30+ vanilla-JS services on `window.*`:                         │ │
│   │  • TransactionService     • StateMachineService                 │ │
│   │  • BalanceService         • TrustEngineService                  │ │
│   │  • DisputeService         • DisputeAgentService (Gemini)        │ │
│   │  • IsolationForestService • RiskEngineService                   │ │
│   │  • AnomalyDetectionEngine • DeviceFingerprintService             │ │
│   │  • FaceVerificationService (Phase F, Gemini multimodal)         │ │
│   │  • CloudinaryService      • NotificationService                 │ │
│   │  • EmailOTPService        • DeviceFingerprintService            │ │
│   │  • SessionService         • SquadAPIService                     │ │
│   │  ...                                                            │ │
│   └─────────┬──────────────────┬─────────────────┬───────────────┬──┘ │
│             │                  │                 │               │    │
│   admin.html (Phase G):  separate page for manual dispute        │    │
│   review, face audit, risky-txn monitor, user directory          │    │
└─────────────┼──────────────────┼─────────────────┼───────────────┼────┘
              ▼                  ▼                 ▼               ▼
       ┌────────────┐    ┌──────────────┐  ┌──────────────┐  ┌──────────┐
       │  Turso DB  │    │  Squad API   │  │  AI Engine   │  │ Cloudinary│
       │  (libSQL,  │    │ (virtual a/c │  │  (Flask +    │  │ (photo +  │
       │   HTTP)    │    │  + transfers)│  │  IsoForest)  │  │  face refs)│
       └────────────┘    └──────────────┘  └──────────────┘  └──────────┘
                                                  ▲                ▲
                                                  │                │
                                          ┌──────────────┐         │
                                          │  Gemini API  │         │
                                          │ (dispute     │  ┌──────────┐
                                          │  agent +     │  │  Resend  │
                                          │  face verify │  │  (email) │
                                          │  + risk hint)│  └──────────┘
                                          └──────────────┘
```

**Three deployable units:**

| Unit | Tech | Port | Purpose |
|---|---|---|---|
| `frontend/` | Vanilla JS + nginx | `8080` | Static files; all UI + business logic |
| `ai-engine/` | Python Flask + scikit-learn | `5000` | Anomaly scoring + email proxy |
| External services | Turso, Squad, Gemini, Cloudinary, Resend | n/a | DB, payments, AI, storage, mail |

For a top-to-bottom walkthrough of every service, table, and flow, see **[APP_GUIDE.md](APP_GUIDE.md)** (~500 lines, deliberately exhaustive).

---

## ✨ Features

### Core escrow flow
- **10-stage** account creation (phone **+ email**, **email OTP**, BVN, Squad VA, liveness, address, **6-digit PIN**) with BVN verification via Squad
- MediaPipe blink liveness check, with the captured frame uploaded to Cloudinary as a face reference (non-blocking if upload fails)
- Buyer-funded transactions: **demo build** debits `demo_balance` then locks state; **Squad** virtual accounts + holding/payout paths power real money movement in integrated environments
- Deterministic state machine: `Created → Funded_Locked → In_Transit → Completed` (plus `Disputed`, `Cancelled`, `Refunded`)
- Auto-release when delivery / inspection timers fire (`StateMachineService`)
- Trust score with tiers (**Low / Building / Trusted / Elite**) and Instant Release eligibility

### AI safety net
- **Anomaly pipeline (`AnomalyDetectionEngine`)** — `RiskEngineService` (rules) + `IsolationForestService` (Flask ML). **Current dashboard wiring:** runs **`evaluate()` post-fund** and feeds `TrustEngineService` (non-blocking). Optional Gemini on listings is **not** enabled in code today.
- **Multimodal dispute resolution agent** — Gemini 2.0 Flash reads the complaint + up to 4 photos and returns a structured JSON verdict (`favoredParty`, `confidence`, `payout`, `reasoning`, `evidenceCited`)
- **Face re-verification gate** — on high-value withdrawals, compares a fresh capture against the signup reference photo using Gemini multimodal; results are persisted to `face_verifications` for audit

### Notifications & communication
- Per-user notification feed with category filters and unread counts (bell icon)
- Transactional emails via Resend (funding confirmed, shipment, dispute opened, dispute resolved, face check failed)
- Email at signup with OTP delivery via the AI-engine email proxy

### Admin console (`admin.html`)
- Pending dispute queue with photo evidence, AI recommendation, and one-click resolution (refund / release / split)
- Face verification audit log filterable by verdict
- Risky transaction monitor (risk score ≥ 50)
- User directory with search

---

## 🛠️ Tech stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Vanilla JS, HTML5, Tailwind CSS (CDN) | Zero build step, deploys anywhere static |
| Database | [Turso](https://turso.tech) (libSQL over HTTP) | Distributed SQLite; free tier is generous; HTTP API works from the browser without a backend |
| Payments | [Squad API](https://squadco.com) | Nigerian payment rails; virtual accounts; BVN verification |
| Risk ML | Python 3.11, Flask, scikit-learn (Isolation Forest) | Industry-standard unsupervised anomaly detection |
| Dispute AI | [Google Gemini 2.0 Flash](https://aistudio.google.com) | Multimodal (text + image), JSON-mode output, low latency |
| Image storage | [Cloudinary](https://cloudinary.com) | Unsigned upload presets — no backend needed |
| Email | [Resend](https://resend.com) | Modern email API with a clean dashboard |
| Face liveness | [MediaPipe Face Mesh](https://google.github.io/mediapipe/) | Runs entirely in browser; no PII leaves the device for liveness |
| Device ID | [FingerprintJS](https://fingerprint.com) open-source v4 | Stable visitor IDs for sock-puppet detection |
| Container | Docker + Docker Compose | One-command local + production deploys |

---

## 📂 Project structure

```
scrowpay/
├── README.md                        ← you are here (answers: what, how, run it)
├── APP_GUIDE.md                     ← exhaustive technical deep dive
├── DEPLOYMENT.md                    ← production deployment recipes
├── SETUP_CHECKLIST.md               ← copy-paste reproducibility script
├── CONTRIBUTING.md                  ← contribution guidelines
├── LICENSE                          ← MIT
├── .env.example                     ← environment variable template
├── .gitignore
├── docker-compose.yml               ← the only thing you run — brings up ai-engine + frontend
├── nginx.conf                       ← nginx config for the frontend container
├── start-dev.sh / start-dev.bat     ← thin convenience wrapper around `docker compose up`
│
├── docs/                            ← detailed documentation for judges
│   ├── SQUAD_API_INTEGRATION.md     ← deep dive into all Squad API usage
│   ├── AI_INTELLIGENCE.md           ← AI/ML architecture and data pipeline
│   ├── USER_FLOW.md                 ← step-by-step product walkthrough
│   └── RESEARCH_VALIDATION.md       ← evidence and citations for claims
│
├── screenshots/                     ← product screenshots for submission
│   └── README.md                    ← screenshot index
│
├── frontend/                        ← all UI + business logic (vanilla JS)
│   ├── README.md                    ← per-file service index
│   ├── web.html                     ← landing page
│   ├── account-creation.html        ← 10-stage signup
│   ├── sign-in.html                 ← phone + 6-digit PIN login
│   ├── dashboard.html               ← main app (the big one)
│   ├── admin.html                   ← Phase G admin console
│   ├── *.js                         ← 30+ services; one class per file on window.*
│   ├── env.js.example               ← copy to env.js (gitignored)
│   ├── cloudinary-config.example.js ← copy to cloudinary-config.js (gitignored)
│   ├── gemini-config.example.js     ← copy to gemini-config.js (gitignored)
│   └── state-lga-area.json          ← Nigerian states / LGAs / wards
│
├── ai-engine/                       ← Python Flask microservice
│   ├── README.md
│   ├── app.py                       ← Flask app: /api/v1/score, /notify/*, /health
│   ├── train_model.py               ← Isolation Forest training script
│   ├── generate_synthetic_data.py   ← synthetic transaction generator
│   ├── requirements.txt
│   ├── Dockerfile
│   └── models/                      ← isolation_forest_model.pkl (committed)
│
└── scripts/                         ← utility scripts
    ├── README.md
    ├── make-admin.ps1               ← grant admin access (Windows)
    ├── make-admin.sh                ← grant admin access (Mac/Linux)
    └── make-admin.bat               ← grant admin access (Windows CMD)
```

---

## 🔐 Accessing the admin console

The admin console at `/admin.html` is gated by a database flag — there's intentionally no UI to grant yourself access.

### Grant admin to a user

Sign up normally, then run the helper script (it reads your Turso credentials from `.env`, so you never have to paste them):

```powershell
# Windows - by user id (most reliable):
.\scripts\make-admin.ps1 -UserId 1

# Or by phone number:
.\scripts\make-admin.ps1 -PhoneNumber "+2348012345678"
```

```bash
# macOS / Linux / WSL
./scripts/make-admin.sh --id 1
# or
./scripts/make-admin.sh +2348012345678
```

If phone lookup fails even though the user exists, the script lists recent users with their `id`s — re-run with `-UserId <n>` / `--id <n>` to bypass phone matching (hidden whitespace in the stored phone can defeat exact equality).

Or for the manual route, run this SQL against your Turso database (Turso CLI, dashboard, or any libSQL client):

```sql
UPDATE users SET is_admin = 1 WHERE id = 1;
-- or
UPDATE users SET is_admin = 1 WHERE phone_number = '+2348012345678';
```

Either way, the user now sees an "Admin Console" link in their profile panel, and `admin.html` will load for them. See [scripts/README.md](scripts/README.md) for full options.

### What admins can do
- View all pending disputes (transactions stuck in `Disputed` state)
- See the AI agent's recommendation + confidence for each
- Resolve manually with notes (refund buyer / release to seller / split 50/50)
- Audit the face verification log filtered by verdict
- Monitor high-risk transactions
- Search the user directory

Non-admin users hitting `/admin.html` see a 403 splash with a link back to the dashboard. The page makes zero non-public queries until the `is_admin = 1` check passes.

---

## 🗄️ Database

Schema is **auto-created and auto-migrated** on first app load via `TursoDBService.initializeSchema()`. There are no separate migration files — every `CREATE TABLE` / `ALTER TABLE` lives in `turso-db-service.js` and is idempotent (`IF NOT EXISTS` / column existence checks).

**Tables:** `users`, `transactions`, `transaction_state_history`, `disputes`, `trust_scores`, `trust_score_history`, `device_fingerprints`, `ai_risk_logs`, `security_logs`, `notifications`, `email_otps`, `face_verifications`.

Full table-by-table description in **[APP_GUIDE.md § 10](APP_GUIDE.md)**.

---

## 🧪 Testing

### Try the AI risk engine directly

```bash
curl -X POST http://localhost:5000/api/v1/score \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test_user",
    "transaction_amount": 50000,
    "transaction_velocity": 3,
    "account_age_days": 45,
    "device_fingerprint": 5432,
    "time_of_day": 14,
    "counterparty_trust_score": 75
  }'
```

Expected: `{"risk_score": <0..100>, "verdict": "pass" | "fail", "anomaly_indicators": [...]}`

### Frontend manual test flow

See [Demo flow](#-demo-flow-for-judges) above.

### Python AI engine unit tests

The AI engine ships a small pytest suite. Run it inside the container so you don't need a local Python install:

```powershell
docker compose exec ai-engine pytest test_api.py test_model.py
```

The frontend services don't have unit tests yet (see [Known limitations](#-known-limitations--roadmap)).

---

## 📚 Documentation map

| File | What it covers |
|---|---|
| [README.md](README.md) | Problem, solution, Squad APIs, AI, user flow, impact, quick start (this file) |
| [docs/SQUAD_API_INTEGRATION.md](docs/SQUAD_API_INTEGRATION.md) | Deep dive into all 8 Squad API endpoints and how they power the product |
| [docs/AI_INTELLIGENCE.md](docs/AI_INTELLIGENCE.md) | AI/ML architecture: Isolation Forest, Gemini dispute agent, face verification |
| [docs/USER_FLOW.md](docs/USER_FLOW.md) | Step-by-step product walkthrough with UI descriptions |
| [docs/RESEARCH_VALIDATION.md](docs/RESEARCH_VALIDATION.md) | Evidence, citations, and validation for all claims |
| [APP_GUIDE.md](APP_GUIDE.md) | ~500-line exhaustive walkthrough — every service, every table, every flow |
| [SETUP_CHECKLIST.md](SETUP_CHECKLIST.md) | Copy-paste reproduction script for a fresh clone |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Production deploys to Vercel / Netlify / VPS, Squad sandbox→production swap |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution guidelines (code style, JSDoc, commit format) |
| [frontend/README.md](frontend/README.md) | Per-service index of every JS file in `frontend/` |
| [ai-engine/README.md](ai-engine/README.md) | AI engine API spec, model training, performance benchmarks |
| [screenshots/README.md](screenshots/README.md) | Product screenshot index |

---

## 🚧 Known limitations / roadmap

We're explicit about what's not production-grade. None of these affect the demo flow:

| Area | Status | Workaround / plan |
|---|---|---|
| OTP at signup | Hardcoded to `123456` — no SMS provider wired | Termii or Twilio integration is a one-file change |
| Manual rate limiting | App-level only (`rate-limiting-integration-example.js`) | Move to nginx / Cloudflare in production |
| Push notifications | Email only; no web-push or mobile push | Service worker + FCM/APNs |
| Frontend unit tests | None | Vitest + jsdom |
| Disputes `ai_reasoning` column | Not persisted (only the verdict + confidence are) | Add column; admin console will display it |

---

## 🤝 Contributing

See **[CONTRIBUTING.md](CONTRIBUTING.md)**. Short version:

- One class per file, attached to `window.*`
- JSDoc every public method
- Follow the existing service-load order in `dashboard.html`
- Never commit `.env`, `frontend/env.js`, `frontend/gemini-config.js`, or `frontend/cloudinary-config.js`

---

## 📄 License

[MIT](LICENSE) — see file for details.

---

## 🙏 Acknowledgments

Built for the **Squad Hackathon**. Special thanks to:

- **[Squad](https://squadco.com)** for excellent payment APIs and sandbox tooling
- **[Turso](https://turso.tech)** for a libSQL HTTP API that lets the browser talk to SQLite directly
- **[Google AI Studio](https://aistudio.google.com)** for accessible multimodal Gemini access
- **[Cloudinary](https://cloudinary.com)** for unsigned upload presets that work without a backend
- **[Resend](https://resend.com)** for the cleanest transactional email API around

---

<div align="center">

**Questions? Issues?** Open a GitHub issue or check the [troubleshooting section in DEPLOYMENT.md](DEPLOYMENT.md#troubleshooting).

Built with care for Nigerian commerce.

</div>
