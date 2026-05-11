# ScrowPay AI Risk Engine - Overview

## Architecture

The AI Risk Engine is a Python microservice that provides pre-transaction anomaly detection for the ScrowPay escrow platform. It uses the Isolation Forest algorithm to identify suspicious transactions before funds are locked.

```
┌─────────────────────────────────────────────────────────┐
│                   AI Risk Engine                        │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Synthetic  │  │    Model     │  │   Flask API  │ │
│  │     Data     │→ │   Training   │→ │   Endpoint   │ │
│  │  Generator   │  │  (Isolation  │  │  /api/v1/    │ │
│  │              │  │   Forest)    │  │    score     │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│       Task 4.1         Task 4.2          Task 4.3      │
└─────────────────────────────────────────────────────────┘
                           │
                           ↓
                    ┌──────────────┐
                    │   Docker     │
                    │  Container   │
                    │              │
                    └──────────────┘
                       Task 4.4
```

## Components

### 1. Synthetic Data Generator (Task 4.1) ✅ COMPLETE

**Purpose**: Generate realistic training data for the Isolation Forest model

**Files**:
- `generate_synthetic_data.py` - Main generator script
- `validate_dataset.py` - Dataset validation
- `requirements.txt` - Python dependencies
- Documentation: README.md, QUICKSTART.md, INSTALLATION.md

**Output**: CSV file with 5,000-10,000 transaction records (95% normal, 5% anomalies)

**Features Generated**:
1. transaction_amount (₦100 - ₦10M)
2. transaction_velocity (0-50 txns/day)
3. account_age_days (0-365+ days)
4. device_fingerprint (1-10000)
5. time_of_day (0-23)
6. counterparty_trust_score (1-100)

**Status**: ✅ Complete and ready for use

### 2. Model Training (Task 4.2) 🔄 NEXT

**Purpose**: Train Isolation Forest model on synthetic data

**Requirements**:
- Load synthetic data from CSV
- Configure Isolation Forest (n_estimators=100, contamination=0.05)
- Train model
- Evaluate: Precision ≥80%, Recall ≥70%
- Save model to pickle file

**Expected Output**: `isolation_forest_model.pkl`

### 3. Flask REST API (Task 4.3) 🔄 PENDING

**Purpose**: Provide HTTP endpoint for real-time risk scoring

**Endpoints**:
- `POST /api/v1/score` - Score a transaction
- `GET /health` - Health check

**Request Format**:
```json
{
  "user_id": "string",
  "transaction_amount": 50000.00,
  "transaction_velocity": 3,
  "account_age_days": 45,
  "device_fingerprint": "hash_string",
  "time_of_day": 14,
  "counterparty_trust_score": 75
}
```

**Response Format**:
```json
{
  "risk_score": 23.5,
  "risk_flag": false,
  "verdict": "pass",
  "anomaly_indicators": [],
  "model_version": "1.0.0",
  "timestamp": "2024-01-15T14:30:00Z"
}
```

### 4. Docker Container (Task 4.4) 🔄 PENDING

**Purpose**: Containerize AI engine for easy deployment

**Dockerfile Requirements**:
- Base: python:3.11-slim
- Install dependencies
- Copy training script and model
- Expose port 5000
- Run Flask app

## Data Flow

```
1. Generate Data
   └─> generate_synthetic_data.py
       └─> synthetic_transactions.csv

2. Train Model
   └─> train_model.py
       └─> isolation_forest_model.pkl

3. Deploy API
   └─> app.py (Flask)
       └─> Loads model
       └─> Exposes /api/v1/score endpoint

4. Frontend Integration
   └─> AIRiskService.js
       └─> POST to /api/v1/score
       └─> Receives risk verdict
       └─> Blocks or allows transaction
```

## Integration with Dashboard

The AI Risk Engine integrates with the ScrowPay dashboard through the `AIRiskService.js`:

```javascript
// Frontend calls AI engine before funding
const riskResult = await aiRiskService.scoreTransaction({
  user_id: userId,
  transaction_amount: amount,
  transaction_velocity: velocity,
  account_age_days: accountAge,
  device_fingerprint: deviceHash,
  time_of_day: new Date().getHours(),
  counterparty_trust_score: sellerTrustScore
});

if (riskResult.verdict === 'fail') {
  // Block transaction
  showError('Transaction blocked due to high risk');
} else {
  // Proceed to Squad API funding
  await fundTransaction();
}
```

## Performance Requirements

From the design document:

- **Response Time**: <3 seconds (AI scoring)
- **Timeout**: 5 seconds (frontend timeout)
- **Fallback**: Default to "fail" verdict if AI unavailable
- **Precision**: ≥80% on test set
- **Recall**: ≥70% on test set

## Security Considerations

1. **Input Validation**: Validate all features before scoring
2. **Rate Limiting**: Prevent abuse of scoring endpoint
3. **Logging**: Log all requests for audit trail
4. **Error Handling**: Graceful degradation on failures
5. **HTTPS**: All communication over secure channel

## Deployment Options

### Development (Hackathon)
```bash
# Run locally
python app.py
# Access at http://localhost:5000
```

### Production (Future)
```bash
# Docker container
docker build -t scrowpay-ai-engine .
docker run -p 5000:5000 scrowpay-ai-engine

# Or cloud deployment (AWS, GCP, Azure)
```

## Environment Variables

```bash
# Flask configuration
FLASK_ENV=production
FLASK_DEBUG=False

# Model configuration
MODEL_PATH=isolation_forest_model.pkl
CONTAMINATION=0.05

# API configuration
API_PORT=5000
API_HOST=0.0.0.0

# Logging
LOG_LEVEL=INFO
LOG_FILE=ai_engine.log
```

## Testing Strategy

### Unit Tests
- Test feature extraction
- Test model loading
- Test API endpoints
- Test error handling

### Integration Tests
- Test end-to-end scoring flow
- Test timeout handling
- Test fallback behavior

### Performance Tests
- Test response time (<3 seconds)
- Test concurrent requests
- Test memory usage

## Monitoring

Key metrics to monitor:

1. **Request Rate**: Requests per second
2. **Response Time**: Average, p95, p99
3. **Error Rate**: Failed requests percentage
4. **Model Performance**: Precision, recall over time
5. **Anomaly Rate**: Percentage of transactions flagged

## Current Status

| Component | Status | Progress |
|-----------|--------|----------|
| Synthetic Data Generator | ✅ Complete | 100% |
| Model Training | 🔄 In Progress | 0% |
| Flask API | 🔄 Pending | 0% |
| Docker Container | 🔄 Pending | 0% |

## Next Steps

1. **Immediate**: Complete Task 4.2 (Model Training)
   - Create `train_model.py`
   - Train Isolation Forest
   - Evaluate performance
   - Save model

2. **Then**: Complete Task 4.3 (Flask API)
   - Create `app.py`
   - Implement `/api/v1/score` endpoint
   - Add error handling
   - Test integration

3. **Finally**: Complete Task 4.4 (Docker)
   - Create Dockerfile
   - Build container
   - Test deployment

## Resources

- **Scikit-learn Docs**: https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.IsolationForest.html
- **Flask Docs**: https://flask.palletsprojects.com/
- **Docker Docs**: https://docs.docker.com/

## Support

For questions or issues:
1. Check documentation in this directory
2. Review design document: `.kiro/specs/escrow-dashboard/design.md`
3. Review requirements: `.kiro/specs/escrow-dashboard/requirements.md`

---

**Last Updated**: Task 4.1 completed
**Next Task**: Task 4.2 - Model Training
