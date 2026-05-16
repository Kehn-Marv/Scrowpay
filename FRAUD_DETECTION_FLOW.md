# Fraud Detection & Anomaly Detection Flow

## Quick Answer: **AFTER** the transaction is funded (non-blocking)

Your fraud detection and anomaly detection systems run **AFTER** the transaction has been funded, not before. They operate in the background and update the trust score without blocking the funding process.

---

## The Complete Flow

### 1. **Transaction Funding (Blocking)**
When a buyer clicks "Fund Escrow":
- ✅ Balance check happens
- ✅ Funds are deducted from buyer's demo_balance
- ✅ Transaction state transitions to `Funded_Locked`
- ✅ Success modal is shown to the user

### 2. **Fraud Detection (Non-Blocking, Background)**
**AFTER** funding succeeds, the system runs:

```javascript
// This runs AFTER funding is complete
if (anomalyEngine && trustEngine) {
  (async () => {
    try {
      // Step 1: Run the Anomaly Detection Engine
      const verdict = await anomalyEngine.evaluate({
        transaction: currentTransaction,
        actor: { id: currentUserId },
        counterparty: { id: currentTransaction.seller_id },
        userContext: { userId: currentUserId }
      });
      
      // Step 2: Update Trust Score based on anomaly results
      await trustEngine.onAnomalyEvaluated({
        userId: currentUserId,
        compositeScore: verdict.compositeScore,
        transactionId: currentTransaction.transaction_id,
        decision: verdict.decision,
        metadata: { trigger: 'post_fund', subScores: verdict.subScores }
      });
    } catch (e) {
      console.warn('Post-fund anomaly→trust pipeline failed (non-fatal):', e);
    }
  })();
}
```

---

## What Gets Evaluated?

### The **AnomalyDetectionEngine** runs **2** sub-detectors in parallel:

1. **RiskEngineService** (Rules Engine)
   - Deterministic, in-browser checks
   - Checks counterparty trust score
   - Checks transaction amount vs. account age
   - Checks time of day patterns
   - Returns: 0-100 risk score + flags

2. **IsolationForestService** (ML Engine)
   - Calls Python Isolation Forest model at `localhost:5000`
   - Extracts features: amount, velocity, account age, device fingerprint, time of day
   - Returns: 0-100 risk score + anomaly indicators
   - **Fail-OPEN**: If the Python engine is offline, it returns score=0 (pass)

### Composite Score Calculation
The engine combines both scores with weighted averages (weights re-normalize if one layer is offline):
- **Rules**: 60% weight
- **ML**: 40% weight

`behavioral_score` in `anomaly_decisions` remains **NULL** for new rows (column kept for older data / schema compatibility).

**Decision Thresholds:**
- `composite_score >= 75` → **BLOCK**
- `composite_score 40-74` → **REVIEW** (warn + require acknowledgment)
- `composite_score < 40` → **PASS**

---

## How Trust Score Gets Updated

After the anomaly engine runs, it calls:

```javascript
trustEngine.onAnomalyEvaluated({
  userId: currentUserId,
  compositeScore: verdict.compositeScore,
  transactionId: currentTransaction.transaction_id,
  decision: verdict.decision,
  metadata: { trigger: 'post_fund', subScores: verdict.subScores }
});
```

The **TrustEngineService** then:
1. Writes **`last_anomaly_score`** on the user row (overwrite)
2. Calls **`applySignal`** so `computeScore` runs with the new anomaly input
3. Persists the updated **`trust_score`** and **`trust_score_history`**

---

## Where Results Are Stored

### 1. **anomaly_decisions** table
Stores every evaluation:
- `transaction_id`
- `user_id`
- `decision` (pass/review/block)
- `composite_score`
- `rules_score`, `ml_score`, `behavioral_score`
- `flags` (JSON array)
- `layers_active` (which detectors ran)
- `fingerprint_id`
- `engine_version`

### 2. **transactions** table (cached)
The verdict is cached on the transaction row:
- `risk_profile_score` (composite score)
- `risk_profile_flags` (JSON)
- `anomaly_decision` (pass/review/block)
- `anomaly_engine_version`
- `risk_profile_evaluated_at`

### 3. **ai_risk_logs** table
Logs from the ML engine:
- `transaction_id`
- `user_id`
- `risk_score`
- `verdict` (pass/fail)
- `anomaly_indicators` (JSON)
- `features` (JSON - input features)
- `model_version`
- `response_time_ms`

### 4. **trust_scores** table
Updated trust scores:
- `user_id`
- `score` (1-100)
- `total_transactions`
- `successful_transactions`
- `disputed_transactions`
- `last_calculated_at`

---

## Why It Runs AFTER Funding

**Design Decision: Fail-OPEN for better UX**

The system used to fail-CLOSED (block funding if AI engine was offline), but this caused problems:
- During development, the Python AI engine at `localhost:5000` is often offline
- This would brick ALL funding operations
- The **RiskEngineService** (deterministic rules) already runs in-browser and shows risk warnings

**Current Approach:**
- Funding proceeds immediately (better UX)
- Fraud detection runs in background
- Results update the trust score for **future** transactions
- High-risk patterns accumulate penalties over time
- Admins can review flagged transactions in the admin panel

---

## Summary

| **When** | **What Happens** | **Blocking?** |
|----------|------------------|---------------|
| **Before Funding** | Balance check, validation | ✅ Yes (blocks if insufficient funds) |
| **During Funding** | Deduct balance, transition state | ✅ Yes (blocks if state transition fails) |
| **After Funding** | Anomaly detection (3 engines) | ❌ No (runs in background) |
| **After Funding** | Trust score update | ❌ No (updates database) |

**The fraud detection does NOT prevent the transaction from being funded.**  
**It updates the trust score AFTER funding, which affects FUTURE transactions.**

---

## How to Make It Run BEFORE Funding

If you want fraud detection to **block** funding, you would need to:

1. Move the `anomalyEngine.evaluate()` call **before** the state transition
2. Check the `verdict.decision` result
3. Throw an error if `decision === 'block'`

Example modification:

```javascript
// BEFORE funding
if (anomalyEngine) {
  const verdict = await anomalyEngine.evaluate({
    transaction: currentTransaction,
    actor: { id: currentUserId },
    counterparty: { id: currentTransaction.seller_id },
    userContext: { userId: currentUserId }
  });
  
  if (verdict.decision === 'block') {
    throw new Error('Transaction blocked due to high fraud risk: ' + 
      verdict.flags.map(f => f.message).join(', '));
  }
  
  if (verdict.decision === 'review') {
    // Show warning and require user acknowledgment
    // (you'd need to add UI for this)
  }
}

// THEN proceed with funding
await transactionService.updateBuyer(...);
await stateMachineService.transitionState(...);
```

But the current design intentionally runs it **after** to avoid blocking legitimate transactions when the AI engine is unavailable.
