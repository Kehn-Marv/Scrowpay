# Quick Start Guide - AI Risk Engine API

## Prerequisites

- Python 3.11 or higher
- Trained model files (see below)

## Step 1: Install Dependencies

```bash
cd ai-engine
pip install -r requirements.txt
```

## Step 2: Train Model (First Time Only)

If you haven't trained the model yet:

```bash
# Generate synthetic data
python generate_synthetic_data.py

# Train model
python train_model.py
```

This creates model files in `models/`:
- `isolation_forest_model.pkl`
- `feature_scaler.pkl`
- `model_metadata.pkl`

## Step 3: Start the API Server

```bash
python app.py
```

Expected output:
```
============================================================
ScrowPay AI Risk Engine - Flask API
============================================================

Loading AI Risk Engine models...
✓ Model loaded: models/isolation_forest_model.pkl
✓ Scaler loaded: models/feature_scaler.pkl
✓ Metadata loaded: models/model_metadata.pkl
✓ Model version: 1.0.0

Starting Flask server...

Endpoints:
  POST /api/v1/score - Score a transaction
  GET  /health       - Health check

Server running on http://0.0.0.0:5000
```

## Step 4: Test the API

### Option A: Use the Test Suite

In another terminal:

```bash
python test_api.py
```

### Option B: Manual Testing with curl

**Health Check:**
```bash
curl http://localhost:5000/health
```

**Score a Normal Transaction:**
```bash
curl -X POST http://localhost:5000/api/v1/score \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user123",
    "transaction_amount": 50000.00,
    "transaction_velocity": 2,
    "account_age_days": 90,
    "device_fingerprint": 5432,
    "time_of_day": 14,
    "counterparty_trust_score": 70
  }'
```

Expected response:
```json
{
  "risk_score": 23,
  "risk_flag": false,
  "verdict": "pass",
  "anomaly_indicators": [],
  "model_version": "1.0.0",
  "response_time_ms": 23,
  "timestamp": "2024-01-15T14:30:00Z"
}
```

**Score an Anomalous Transaction:**
```bash
curl -X POST http://localhost:5000/api/v1/score \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user456",
    "transaction_amount": 5000000.00,
    "transaction_velocity": 40,
    "account_age_days": 2,
    "device_fingerprint": 50,
    "time_of_day": 3,
    "counterparty_trust_score": 10
  }'
```

Expected response:
```json
{
  "risk_score": 58,
  "risk_flag": false,
  "verdict": "pass",
  "anomaly_indicators": [
    "High transaction amount",
    "High transaction velocity",
    "New account",
    "Unusual transaction time",
    "Low counterparty trust score"
  ],
  "model_version": "1.0.0",
  "response_time_ms": 18,
  "timestamp": "2024-01-15T14:30:00Z"
}
```

### Option C: PowerShell Testing

**Health Check:**
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/health"
```

**Score a Transaction:**
```powershell
$body = @{
    user_id = "user123"
    transaction_amount = 50000.00
    transaction_velocity = 2
    account_age_days = 90
    device_fingerprint = 5432
    time_of_day = 14
    counterparty_trust_score = 70
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/api/v1/score" `
  -Method Post `
  -Body $body `
  -ContentType "application/json"
```

## Step 5: Integrate with Dashboard

See `API_README.md` for complete integration guide.

Basic JavaScript example:

```javascript
async function scoreTransaction(transactionData) {
  const response = await fetch('http://localhost:5000/api/v1/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: transactionData.userId,
      transaction_amount: transactionData.amount,
      transaction_velocity: transactionData.velocity,
      account_age_days: transactionData.accountAge,
      device_fingerprint: transactionData.deviceHash,
      time_of_day: new Date().getHours(),
      counterparty_trust_score: transactionData.trustScore
    })
  });
  
  return await response.json();
}
```

## Troubleshooting

### Error: Model files not found
```
FileNotFoundError: Model file not found: models/isolation_forest_model.pkl
```

**Solution**: Train the model first
```bash
python train_model.py
```

### Error: Port already in use
```
OSError: [Errno 48] Address already in use
```

**Solution**: Kill existing process
```bash
# Find process
lsof -i :5000

# Kill process
kill -9 <PID>
```

### Error: Module not found
```
ModuleNotFoundError: No module named 'flask'
```

**Solution**: Install dependencies
```bash
pip install -r requirements.txt
```

## Next Steps

1. ✅ API is running
2. ✅ Tests pass
3. → Integrate with dashboard (Task 6)
4. → Create Docker container (Task 4.4)
5. → Deploy for hackathon demo

## Documentation

- **API Reference**: See `API_README.md`
- **Task Summary**: See `TASK_4.3_SUMMARY.md`
- **Model Training**: See `TASK_4.2_SUMMARY.md`

## Support

For issues:
1. Check this guide
2. Review `API_README.md`
3. Check server logs
4. Verify model is trained

## Quick Reference

**Endpoints:**
- `POST /api/v1/score` - Score a transaction
- `GET /health` - Health check

**Required Features:**
- `transaction_amount` (float)
- `transaction_velocity` (int)
- `account_age_days` (int)
- `device_fingerprint` (int)
- `time_of_day` (int, 0-23)
- `counterparty_trust_score` (float, 1-100)

**Response:**
- `risk_score` (int, 1-100)
- `verdict` (string, "pass" or "fail")
- `risk_flag` (boolean)
- `anomaly_indicators` (array)

**Verdict Logic:**
- `risk_score > 80` → "fail"
- `risk_score ≤ 80` → "pass"

That's it! You're ready to use the AI Risk Engine API. 🚀
