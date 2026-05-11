# ScrowPay AI Risk Engine - Flask REST API

## Overview

The AI Risk Engine is a Flask-based REST API that provides real-time transaction risk scoring using a trained Isolation Forest machine learning model. It analyzes transaction features to detect anomalies before funds are locked in escrow, preventing fraudulent transactions proactively.

## Features

- **Real-time Risk Scoring**: Analyzes transactions in <3 seconds
- **Anomaly Detection**: Uses Isolation Forest algorithm to identify suspicious patterns
- **Risk Indicators**: Provides specific reasons for high-risk verdicts
- **Health Monitoring**: Built-in health check endpoint
- **Error Handling**: Comprehensive validation and error responses
- **Production Ready**: Timeout protection, concurrent request handling

## API Endpoints

### 1. POST /api/v1/score

Score a transaction for anomaly detection.

**Request:**
```json
{
  "user_id": "string",
  "transaction_amount": 50000.00,
  "transaction_velocity": 3,
  "account_age_days": 45,
  "device_fingerprint": 5432,
  "time_of_day": 14,
  "counterparty_trust_score": 75
}
```

**Request Fields:**
- `user_id` (string, optional): User identifier for logging
- `transaction_amount` (float, required): Transaction amount in Naira (₦)
- `transaction_velocity` (int, required): Number of transactions in last 24 hours
- `account_age_days` (int, required): Days since account creation
- `device_fingerprint` (int, required): Hash of device metadata
- `time_of_day` (int, required): Hour of transaction (0-23)
- `counterparty_trust_score` (float, required): Trust score of other party (1-100)

**Success Response (200 OK):**
```json
{
  "risk_score": 23,
  "risk_flag": false,
  "verdict": "pass",
  "anomaly_indicators": [],
  "model_version": "1.0.0",
  "response_time_ms": 15,
  "timestamp": "2024-01-15T14:30:00Z"
}
```

**Response Fields:**
- `risk_score` (int): Risk score from 1-100 (higher = more risky)
- `risk_flag` (boolean): True if risk_score > 80
- `verdict` (string): "pass" or "fail" (fail if risk_score > 80)
- `anomaly_indicators` (array): List of specific risk factors detected
- `model_version` (string): Version of the ML model used
- `response_time_ms` (int): Processing time in milliseconds
- `timestamp` (string): ISO 8601 timestamp of response

**Possible Anomaly Indicators:**
- "High transaction amount" - Amount > ₦500,000
- "High transaction velocity" - More than 10 transactions/day
- "New account" - Account age < 7 days
- "Unusual transaction time" - Late night (2-5 AM)
- "Low counterparty trust score" - Trust score < 30
- "Extremely high risk pattern detected" - Risk score > 90

**Error Response (400 Bad Request):**
```json
{
  "error": "Missing required fields",
  "message": "Missing fields: transaction_velocity, account_age_days",
  "timestamp": "2024-01-15T14:30:00Z"
}
```

**Error Response (500 Internal Server Error):**
```json
{
  "error": "Scoring failed",
  "message": "Error description",
  "response_time_ms": 10,
  "timestamp": "2024-01-15T14:30:00Z"
}
```

**Error Response (503 Service Unavailable):**
```json
{
  "error": "Model unavailable",
  "message": "AI engine is not ready. Model not loaded.",
  "timestamp": "2024-01-15T14:30:00Z"
}
```

### 2. GET /health

Health check endpoint to verify API and model status.

**Success Response (200 OK):**
```json
{
  "status": "healthy",
  "model_loaded": true,
  "model_version": "1.0.0",
  "timestamp": "2024-01-15T14:30:00Z"
}
```

## Installation

### Prerequisites

- Python 3.11 or higher
- pip package manager
- Trained model files (see Training section)

### Install Dependencies

```bash
cd ai-engine
pip install -r requirements.txt
```

### Train Model (First Time Only)

Before running the API, you must train the model:

```bash
# Generate synthetic data
python generate_synthetic_data.py

# Train model
python train_model.py
```

This creates the following files in `models/`:
- `isolation_forest_model.pkl` - Trained model
- `feature_scaler.pkl` - Feature preprocessor
- `model_metadata.pkl` - Model metadata

## Usage

### Start the API Server

```bash
python app.py
```

The server will start on `http://0.0.0.0:5000`

**Expected Output:**
```
============================================================
ScrowPay AI Risk Engine - Flask API
============================================================

Loading AI Risk Engine models...
✓ Model loaded: models/isolation_forest_model.pkl
✓ Scaler loaded: models/feature_scaler.pkl
✓ Metadata loaded: models/model_metadata.pkl
✓ Model version: 1.0.0
✓ Trained at: 2024-01-15T10:30:00

Starting Flask server...

Endpoints:
  POST /api/v1/score - Score a transaction
  GET  /health       - Health check

Server configuration:
  Host: 0.0.0.0 (all interfaces)
  Port: 5000
  Debug: False (production mode)

============================================================

 * Running on http://0.0.0.0:5000
```

### Test the API

In another terminal, run the test suite:

```bash
python test_api.py
```

Or test manually with curl:

```bash
# Health check
curl http://localhost:5000/health

# Score a normal transaction
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

# Score an anomalous transaction
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

## Integration with Dashboard

### JavaScript Example

```javascript
// AIRiskService.js
class AIRiskService {
  constructor(config) {
    this.aiEngineUrl = config.aiEngine.url; // e.g., 'http://localhost:5000'
    this.timeout = 5000; // 5 seconds
  }
  
  async scoreTransaction(transactionData, userContext) {
    try {
      // Extract features
      const features = this.extractFeatures(transactionData, userContext);
      
      // Call API
      const response = await fetch(`${this.aiEngineUrl}/api/v1/score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(features),
        signal: AbortSignal.timeout(this.timeout)
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const result = await response.json();
      
      return {
        risk_score: result.risk_score,
        verdict: result.verdict,
        anomaly_indicators: result.anomaly_indicators,
        risk_flag: result.risk_flag
      };
      
    } catch (error) {
      console.error('[AIRiskService] Scoring failed:', error);
      
      // Default to "fail" verdict on error (safe default)
      return {
        risk_score: 100,
        verdict: 'fail',
        anomaly_indicators: ['AI engine unavailable'],
        risk_flag: true
      };
    }
  }
  
  extractFeatures(transactionData, userContext) {
    return {
      user_id: userContext.userId,
      transaction_amount: transactionData.price,
      transaction_velocity: userContext.transactionVelocity,
      account_age_days: userContext.accountAgeDays,
      device_fingerprint: userContext.deviceFingerprint,
      time_of_day: new Date().getHours(),
      counterparty_trust_score: transactionData.counterpartyTrustScore
    };
  }
}
```

### Python Example

```python
import requests

def score_transaction(transaction_data):
    """Score a transaction using the AI Risk Engine."""
    
    url = 'http://localhost:5000/api/v1/score'
    
    payload = {
        'user_id': transaction_data['user_id'],
        'transaction_amount': transaction_data['amount'],
        'transaction_velocity': transaction_data['velocity'],
        'account_age_days': transaction_data['account_age'],
        'device_fingerprint': transaction_data['device_hash'],
        'time_of_day': transaction_data['hour'],
        'counterparty_trust_score': transaction_data['trust_score']
    }
    
    try:
        response = requests.post(url, json=payload, timeout=5)
        response.raise_for_status()
        
        result = response.json()
        
        if result['verdict'] == 'fail':
            print(f"⚠ High risk transaction detected!")
            print(f"  Risk Score: {result['risk_score']}")
            print(f"  Indicators: {', '.join(result['anomaly_indicators'])}")
            return False
        else:
            print(f"✓ Transaction approved (risk score: {result['risk_score']})")
            return True
            
    except requests.exceptions.Timeout:
        print("✗ AI engine timeout - blocking transaction for safety")
        return False
    except Exception as e:
        print(f"✗ AI engine error: {e} - blocking transaction for safety")
        return False
```

## Performance

### Response Time
- **Target**: <3 seconds (requirement)
- **Typical**: 10-50ms
- **Maximum**: 3000ms (enforced by timeout)

### Throughput
- **Single prediction**: <1ms
- **Concurrent requests**: Handled via threading
- **Scalability**: Can handle 100+ requests/second on standard hardware

### Resource Usage
- **Memory**: ~150MB (model + Flask)
- **CPU**: Minimal (<5% on modern CPU)
- **Disk**: ~2MB (model files)

## Error Handling

### Client-Side Timeout
If the API doesn't respond within 5 seconds, the dashboard should:
1. Default to "fail" verdict (safe default)
2. Display "Risk scoring unavailable. Transaction blocked for security."
3. Log the timeout for investigation

### API Unavailable
If the API is unreachable:
1. Default to "fail" verdict (safe default)
2. Display "AI engine unavailable. Transaction blocked for security."
3. Retry with exponential backoff (optional)

### Invalid Response
If the API returns an unexpected response:
1. Default to "fail" verdict (safe default)
2. Log the response for debugging
3. Display generic error message to user

## Deployment

### Development
```bash
python app.py
```

### Production (with Gunicorn)
```bash
pip install gunicorn

gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

### Docker (see Task 4.4)
```bash
docker build -t scrowpay-ai-engine .
docker run -p 5000:5000 scrowpay-ai-engine
```

## Troubleshooting

### Issue: Model files not found
**Error**: `FileNotFoundError: Model file not found`

**Solution**: Train the model first
```bash
python train_model.py
```

### Issue: Import errors
**Error**: `ModuleNotFoundError: No module named 'flask'`

**Solution**: Install dependencies
```bash
pip install -r requirements.txt
```

### Issue: Port already in use
**Error**: `OSError: [Errno 48] Address already in use`

**Solution**: Kill existing process or use different port
```bash
# Find process using port 5000
lsof -i :5000

# Kill process
kill -9 <PID>

# Or use different port
python app.py --port 5001
```

### Issue: Slow response times
**Possible causes**:
- Model not loaded (loads on first request)
- CPU overload
- Network latency

**Solution**:
- Ensure model loads at startup (check logs)
- Monitor CPU usage
- Use local deployment for testing

## Security Considerations

### Input Validation
- All inputs are validated for type and range
- Negative values are rejected
- Out-of-range values are rejected

### Error Messages
- Generic error messages to users
- Detailed errors only in server logs
- No sensitive information in responses

### Rate Limiting
- Implement rate limiting at reverse proxy level
- Recommended: 100 requests/minute per IP

### HTTPS
- Use HTTPS in production
- Configure SSL/TLS certificates
- Disable HTTP in production

## Monitoring

### Health Checks
```bash
# Check if API is running
curl http://localhost:5000/health

# Expected response
{
  "status": "healthy",
  "model_loaded": true,
  "model_version": "1.0.0",
  "timestamp": "2024-01-15T14:30:00Z"
}
```

### Logging
- All requests are logged (if debug=True)
- Errors are logged to stderr
- Response times are included in responses

### Metrics to Monitor
- Response time (should be <3 seconds)
- Error rate (should be <1%)
- Request volume
- Risk score distribution
- Verdict distribution (pass/fail ratio)

## API Versioning

Current version: **v1**

Endpoint: `/api/v1/score`

Future versions will use `/api/v2/score`, etc.

## Support

For issues or questions:
1. Check this README
2. Review test_api.py for examples
3. Check server logs for errors
4. Verify model is trained correctly

## License

Part of the ScrowPay hackathon project.

## Changelog

### Version 1.0.0 (2024-01-15)
- Initial release
- POST /api/v1/score endpoint
- GET /health endpoint
- Isolation Forest model integration
- Comprehensive error handling
- Response time <3 seconds
- Risk score 1-100 scale
- Anomaly indicator identification
