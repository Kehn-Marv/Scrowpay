# AI / Data Intelligence — Deep Dive

ScrowPay addresses two AI pillars: **Fraud Prevention** (pre-funding) and **Automated Dispute Resolution** (post-transaction). This document details the architecture, models, and data flows.

---

## Overview

| AI Feature | Technology | Where it runs | Fallback if unavailable |
|---|---|---|---|
| Pre-funding risk scoring | Deterministic rules + Isolation Forest | Browser + Flask container | Rules-only (Stage 1) |
| Dispute resolution agent | Gemini 2.0 Flash (multimodal) | Browser → Gemini API | Manual admin review |
| Face re-verification | Gemini 2.0 Flash (multimodal) | Browser → Gemini API | Action proceeds without face check |
| Behavioral signals | FingerprintJS + custom heuristics | Browser | Reduced signal quality |
| Trust Score engine | Deterministic formula on counters | Browser → Turso DB | Always available (no external dependency) |

---

## Pillar 1: Pre-Funding Fraud Detection

### The Pipeline

Every transaction is scored **before** funds are locked in escrow. The pipeline has three stages:

```
Transaction Created
        │
        ▼
┌─────────────────────┐
│  Stage 1: Rules     │  (browser, instant)
│  • Account age      │
│  • Tx velocity      │
│  • Amount outliers   │
│  • Time of day      │
│  • Device fingerprint│
│  • Counterparty trust│
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Stage 2: ML Model  │  (Flask API, <3s)
│  Isolation Forest   │
│  trained on 10K     │
│  synthetic Nigerian │
│  transactions       │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Stage 3: Gemini    │  (optional, borderline cases)
│  Contextual fraud   │
│  hint on suspicious │
│  descriptions       │
└────────┬────────────┘
         │
         ▼
   Combined Score 0-100
   >80 → BLOCKED
   50-80 → WARNING
   <50 → PASS
```

### Stage 1: Deterministic Rules (`AIRiskService.js`)

Runs entirely in the browser. Evaluates:

| Signal | Weight | Logic |
|---|---|---|
| Account age < 7 days | +20 | New accounts are higher risk |
| Transaction velocity > 5/hour | +15 | Rapid transactions suggest automation |
| Amount > ₦500,000 | +10 | Large amounts warrant extra scrutiny |
| Off-hours (midnight – 5am) | +5 | Unusual transaction timing |
| Device fingerprint mismatch | +15 | Different device from usual pattern |
| Counterparty trust < 30 | +10 | Low-trust counterparty increases risk |

### Stage 2: Isolation Forest Model (`ai-engine/`)

**Model:** scikit-learn `IsolationForest`
- **Training data:** 10,000 synthetic transactions generated to match Nigerian commerce patterns
- **Features:** `transaction_amount`, `transaction_velocity`, `account_age_days`, `device_fingerprint`, `time_of_day`, `counterparty_trust_score`
- **Contamination:** 0.05 (5% expected anomaly rate)
- **Trees:** 100 estimators
- **Performance targets:** Precision ≥ 80%, Recall ≥ 70%

**API endpoint:**
```
POST /api/v1/score
Content-Type: application/json

{
  "user_id": "user_123",
  "transaction_amount": 50000,
  "transaction_velocity": 3,
  "account_age_days": 45,
  "device_fingerprint": 5432,
  "time_of_day": 14,
  "counterparty_trust_score": 75
}

Response:
{
  "risk_score": 23,
  "verdict": "pass",
  "anomaly_indicators": []
}
```

**Response time:** < 3 seconds (typically < 500ms)

### Stage 3: Gemini Contextual Check (Optional)

For borderline scores (50-80), the transaction description is sent to Gemini for a contextual fraud assessment. This catches social engineering patterns that statistical models miss (e.g., "urgent Western Union" descriptions).

---

## Pillar 2: Multimodal Dispute Resolution

### Architecture (`DisputeAgentService.js`)

When a buyer raises a dispute, the Gemini 2.0 Flash agent receives:

1. **Transaction context** — Price, item description, both parties' trust stats, state history, prior risk verdict
2. **Free-text complaint** — The buyer's description of the issue
3. **Photo evidence** — Up to 4 images (uploaded to Cloudinary, sent as URLs or base64)

### Verdict Shape

```json
{
  "action": "rule",
  "favoredParty": "buyer",
  "confidence": 0.92,
  "payout": {
    "buyer_percent": 100,
    "seller_percent": 0
  },
  "reasoning": "The photos clearly show a damaged item inconsistent with the listing description...",
  "evidenceCited": ["photo_1", "description_mismatch"]
}
```

### Decision Flow

```
Dispute Filed
     │
     ▼
┌──────────────┐
│ Gemini Agent │
│ analyzes     │
│ text + photos│
└──────┬───────┘
       │
       ▼
  confidence > 0.90? ──YES──► Auto-execute verdict
       │                       (refund/release/split)
       NO
       │
       ▼
  confidence > 0.50? ──YES──► Route to admin with
       │                       AI recommendation
       NO
       │
       ▼
  Route to admin
  (no recommendation)
```

### Conversation Flow

The agent may ask **exactly one** clarifying question if evidence is ambiguous. The UI feeds the answer back via `analyze()` with `priorTurn` populated. After clarification, if the agent still can't decide, it returns a low-confidence verdict routed to manual review.

---

## Face Re-Verification (`FaceVerificationService.js`)

High-risk actions (withdrawals ≥ ₦500,000) trigger a face re-verification gate:

1. Browser captures a fresh frame via webcam
2. The signup reference photo is retrieved from Cloudinary
3. Both images are sent to Gemini 2.0 Flash multimodal
4. Gemini compares the faces and returns a `same_person` / `different_person` / `inconclusive` verdict
5. Result is persisted to `face_verifications` table for audit
6. Only `same_person` allows the action to proceed

---

## Trust Score Engine (`TrustEngineService.js`)

### Formula

The Trust Score is a deterministic function of cumulative counters stored on the user row:

| Counter | Effect on Score |
|---|---|
| `successful_deliveries` | +2 per delivery (capped contribution) |
| `disputes_won` | +1 per win |
| `disputes_lost` | -5 per loss |
| `cancellations` | -3 per cancellation |
| `identity_verified` (BVN) | +15 baseline bonus |
| `account_age_days` | +0.1 per day (capped at +10) |

### Tiers

| Range | Tier | Color | UI Behavior |
|---|---|---|---|
| 0 – 39 | Low / High Risk | Red | Warning shown to counterparty |
| 40 – 69 | Building / Caution | Yellow | Neutral |
| 70 – 94 | Trusted / Safe | Green | No flags |
| 95 – 100 | Elite | Gold | Eligible for Instant Escrow Release |

### Instant Escrow Release

Users with Trust Score ≥ 95 AND ≥ 10 successful deliveries qualify for Instant Release — escrow funds release immediately upon delivery confirmation without an inspection window.

---

## Behavioral Signals

### Device Fingerprinting (`DeviceFingerprintService.js`)

Uses FingerprintJS open-source v4 to generate stable visitor IDs. Detects:
- Account sharing (same device, different accounts)
- Sock puppets (same person, fake counterparty)
- Device changes mid-transaction

### Anomaly Detection Engine (`AnomalyDetectionEngine.js`)

Additional behavioral analysis layer that tracks:
- Transaction velocity patterns
- Amount distribution anomalies
- Geographic consistency (based on address data)
- Session timing patterns

---

## Data Flow Summary

```
User Action
    │
    ├──► DeviceFingerprintService → fingerprint stored in Turso
    ├──► BehavioralSignalsService → session patterns logged
    ├──► AIRiskService (Stage 1) → rule-based score
    ├──► Flask /api/v1/score (Stage 2) → ML score
    ├──► [Optional] Gemini (Stage 3) → contextual hint
    │
    ▼
Combined Risk Score → logged to `ai_risk_logs` table
    │
    ├── >80 → Transaction BLOCKED
    ├── 50-80 → WARNING shown, user can proceed
    └── <50 → PASS, proceed normally
```
