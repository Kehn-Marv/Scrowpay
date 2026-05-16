# AI / Data Intelligence — Deep Dive

ScrowPay combines **(A) anomaly / risk scoring** (rules + classical ML) with **(B) automated dispute resolution** (Gemini multimodal). This document tracks **what the code does today** vs aspirational copy still found in some marketing surfaces.

---

## Overview

| Feature | Technology | Where it runs | Notes |
|---|---|---|---|
| Anomaly umbrella | `AnomalyDetectionEngine.js` | Browser | Merges **rules + ML**; thresholds in-code (`BLOCK_THRESHOLD` / `REVIEW_THRESHOLD`) |
| Rules layer | `RiskEngineService.js` | Browser | Deterministic heuristics; **no Gemini** in this path (legacy listing check removed) |
| ML layer | `IsolationForestService.js` → Flask `ai-engine` | Browser + Docker | Isolation Forest **`/api/v1/score`**; fail-open if offline |
| Device ID | `DeviceFingerprintService.js` | Browser | FingerprintJS visitor ID for ML features + audit |
| Dispute agent | `DisputeAgentService.js` (Gemini 2.0 Flash) | Browser → Gemini | Multimodal verdict JSON |
| Face re-verify | `FaceVerificationService.js` (Gemini) | Browser → Gemini | Large withdrawals vs optional signup reference |
| Trust engine | `TrustEngineService.js` | Browser → Turso | Deterministic `computeScore`; ingests **`last_anomaly_score`** from post-fund evaluations |

---

## Pillar 1: Anomaly detection (rules + Isolation Forest)

### Architecture

`AnomalyDetectionEngine.evaluate({ transaction, actor, counterparty, userContext })`:

1. Optionally fingerprints via **`DeviceFingerprintService`**
2. Runs **`RiskEngineService.evaluate`** (rules) → partial score + flags
3. Runs **`IsolationForestService.scoreTransaction`** → ML score (or null if engine down)
4. Combines with **fixed weights** (v2.1: **0.6** rules / **0.4** ML, re-normalised if a layer is missing)
5. Emits **`pass` / `review` / `block`** plus `compositeScore`, persists audit rows when DB is wired

### When it runs in production code today

**`dashboard.html` (fund success path):** `anomalyEngine.evaluate()` is invoked **after** funding succeeds, then **`trustEngine.onAnomalyEvaluated`** stores the composite and recalculates trust. This is **non-blocking** for UX — see **`FRAUD_DETECTION_FLOW.md`**.

**Roadmap / product copy:** a **pre-fund** gate (block fund click on `block`) is straightforward to add but **is not the active behaviour** at the time of this doc refresh.

### No “Stage 3 Gemini” on pre-fund scoring

Older drafts described sending listing text to Gemini for borderline fraud hints. **`RiskEngineService`** no longer performs that call — disputes and withdrawals consume Gemini instead.

### Isolation Forest service (`ai-engine/`)

**Model:** scikit-learn `IsolationForest`  
**Training data:** synthetic Nigerian-ish transaction generator (order of **10k** rows in project docs)  
**Features (typical payload):** amount, velocity, account age, device token/hash, hour-of-day, counterparty trust, etc. — see `IsolationForestService.extractFeatures` + `ai-engine/app.py` for the live contract.

**API endpoint**

```
POST /api/v1/score
Content-Type: application/json
```

**Response time:** usually sub-second on a warm container; allow a few seconds under load.

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
  confidence > 0.70? ──YES──► `ai_assisted` (admin path with AI rec)
       NO
       │
       ▼
  Manual review
  (low / no confidence)
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

`computeScore` starts from a **50** baseline and adds/subtracts using **counters on the `users` row** (deliveries, dispute wins/losses, cancellations, volume, idle decay, failed join attempts, …) plus a **penalty from `last_anomaly_score`** (composite anomaly 0–100 maps to up **-20** points). See the function body for exact coefficients — do not rely on older markdown tables that listed `identity_verified` bonuses that are not in the current formula.

### Tiers (`tierFor`)

| Range | Label (engine) | Marketing mapping on `web.html` |
|---|---|---|
| 0 – 39 | **Low** | “High Risk” band |
| 40 – 69 | **Building** | “Proceed with Caution” |
| 70 – 94 | **Trusted** | “Safe to Proceed” |
| 95 – 100 | **Elite** | “Safe to Proceed” + instant-release eligibility |

### Instant Escrow Release

`isInstantReleaseEligible`: score **≥ 95**, successful deliveries **≥ 10**, disputes lost **≤ 0** (constants at top of `TrustEngineService.js`).

---

## Risk & device signals

### Device Fingerprinting (`DeviceFingerprintService.js`)

FingerprintJS OSS v4 → stable `visitorId`, persisted for audit + ML features. CDN-block fallback marks degraded fingerprints for downstream de-weighting.

### Anomaly Detection Engine (`AnomalyDetectionEngine.js`)

Orchestrates **`RiskEngineService`** + **`IsolationForestService`**. **`behavioral_score`** is always **`null`** in v2.1 (column retained for legacy rows).

---

## Data flow summary (current wiring)

```
Fund succeeds (dashboard)
    │
    ├──► DeviceFingerprintService.identify() (best effort)
    ├──► RiskEngineService.evaluate(...)
    ├──► IsolationForestService.scoreTransaction(...)  →  Flask /api/v1/score
    │
    ▼
AnomalyDetectionEngine → compositeScore + decision
    │
    ├──► Persist anomaly_decisions / ai_risk_logs (when DB layer succeeds)
    └──► TrustEngineService.onAnomalyEvaluated(...)  →  last_anomaly_score + trust_score recalc
```

**Important:** this diagram reflects the **post-fund** pipeline. A future **pre-fund** variant would insert the same `evaluate()` call *before* `transitionState(..., 'Funded_Locked')` and optionally hard-stop the UI.
