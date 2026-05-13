"""
Flask REST API for ScrowPay AI Risk Engine

This API provides transaction risk scoring using the trained Isolation Forest model.
It accepts transaction features and returns a risk score, verdict, and anomaly indicators.

Endpoints:
- POST /api/v1/score - Score a transaction for anomaly detection
- GET /health - Health check endpoint

Requirements:
- Response time: <3 seconds
- Risk score: 1-100
- Verdict: "pass" or "fail" (fail if risk_score > 80)
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import numpy as np
import time
import os
from datetime import datetime

# Initialize Flask app
app = Flask(__name__)

# Permissive CORS — the frontend (vanilla JS, served from a different
# origin in dev and from nginx in prod) needs to POST /api/v1/score
# directly. We restrict to the relevant routes to avoid leaking other
# endpoints if any are added later.
CORS(app, resources={
    r"/api/v1/*": {"origins": "*"},
    r"/health":   {"origins": "*"}
})

# Engine version — bumped here AND in AnomalyDetectionEngine.js so we can
# correlate decisions across services.
ENGINE_API_VERSION = '2.0.0'

# Global variables for model and scaler
model = None
scaler = None
metadata = None

# Model configuration
MODEL_DIR = 'models'
MODEL_VERSION = '1.0.0'
RISK_THRESHOLD = 80  # Verdict is "fail" if risk_score > 80


def load_models():
    """Load trained model, scaler, and metadata at startup."""
    global model, scaler, metadata
    
    try:
        print("Loading AI Risk Engine models...")
        
        model_path = os.path.join(MODEL_DIR, 'isolation_forest_model.pkl')
        scaler_path = os.path.join(MODEL_DIR, 'feature_scaler.pkl')
        metadata_path = os.path.join(MODEL_DIR, 'model_metadata.pkl')
        
        # Check if files exist
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model file not found: {model_path}")
        if not os.path.exists(scaler_path):
            raise FileNotFoundError(f"Scaler file not found: {scaler_path}")
        if not os.path.exists(metadata_path):
            raise FileNotFoundError(f"Metadata file not found: {metadata_path}")
        
        # Load files
        model = joblib.load(model_path)
        scaler = joblib.load(scaler_path)
        metadata = joblib.load(metadata_path)
        
        print(f"✓ Model loaded: {model_path}")
        print(f"✓ Scaler loaded: {scaler_path}")
        print(f"✓ Metadata loaded: {metadata_path}")
        print(f"✓ Model version: {metadata['model_version']}")
        print(f"✓ Trained at: {metadata['trained_at']}")
        print()
        
        return True
        
    except Exception as e:
        print(f"✗ Error loading models: {e}")
        return False


def preprocess_features(features_dict):
    """
    Preprocess transaction features for model input.
    
    Args:
        features_dict: Dictionary with transaction features
        
    Returns:
        Preprocessed numpy array ready for model prediction
    """
    # Extract features in correct order
    features = np.array([[
        features_dict['transaction_amount'],
        features_dict['transaction_velocity'],
        features_dict['account_age_days'],
        features_dict['device_fingerprint'],
        features_dict['time_of_day'],
        features_dict['counterparty_trust_score']
    ]])
    
    # Apply log transformation to transaction_amount
    features[0, 0] = np.log1p(features[0, 0])
    
    # Standardize all features
    features_scaled = scaler.transform(features)
    
    return features_scaled


def calculate_risk_score(anomaly_score):
    """
    Convert Isolation Forest anomaly score to risk score (1-100).
    
    Isolation Forest anomaly scores are negative values:
    - Normal transactions: ~-0.3 to -0.5
    - Anomalous transactions: ~-0.6 to -1.0 (more negative = more anomalous)
    
    We map this to a 1-100 scale where:
    - Low risk (normal): 1-40
    - Medium risk: 41-80
    - High risk (anomaly): 81-100
    
    Args:
        anomaly_score: Raw anomaly score from Isolation Forest
        
    Returns:
        Risk score between 1 and 100
    """
    # Anomaly scores typically range from -0.2 (very normal) to -1.0 (very anomalous)
    # We'll map this to 1-100 scale
    
    # Clamp anomaly score to reasonable range
    clamped_score = max(-1.0, min(-0.2, anomaly_score))
    
    # Map to 1-100 scale (more negative = higher risk)
    # -0.2 -> 1 (very low risk)
    # -0.6 -> 50 (medium risk)
    # -1.0 -> 100 (very high risk)
    risk_score = int(((-clamped_score - 0.2) / 0.8) * 99 + 1)
    
    # Ensure within bounds
    risk_score = max(1, min(100, risk_score))
    
    return risk_score


def identify_anomaly_indicators(features_dict, risk_score):
    """
    Identify specific anomaly indicators based on feature values.
    
    Args:
        features_dict: Dictionary with transaction features
        risk_score: Calculated risk score
        
    Returns:
        List of anomaly indicator strings
    """
    indicators = []
    
    # High transaction amount (>500k)
    if features_dict['transaction_amount'] > 500000:
        indicators.append("High transaction amount")
    
    # High transaction velocity (>10 transactions/day)
    if features_dict['transaction_velocity'] > 10:
        indicators.append("High transaction velocity")
    
    # New account (<7 days)
    if features_dict['account_age_days'] < 7:
        indicators.append("New account")
    
    # Unusual transaction time (late night: 2-5 AM)
    if features_dict['time_of_day'] in [2, 3, 4, 5]:
        indicators.append("Unusual transaction time")
    
    # Low counterparty trust score (<30)
    if features_dict['counterparty_trust_score'] < 30:
        indicators.append("Low counterparty trust score")
    
    # Very high risk score
    if risk_score > 90:
        indicators.append("Extremely high risk pattern detected")
    
    return indicators


@app.route('/health', methods=['GET'])
def health_check():
    """
    Health check endpoint.
    
    Returns:
        JSON response with health status and model information
    """
    return jsonify({
        'status': 'healthy',
        'model_loaded': model is not None,
        'model_version': MODEL_VERSION,
        'timestamp': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
    }), 200


@app.route('/api/v1/score', methods=['POST'])
def score_transaction():
    """
    Score a transaction for anomaly detection.
    
    Request body (JSON):
    {
        "user_id": "string",
        "transaction_amount": 50000.00,
        "transaction_velocity": 3,
        "account_age_days": 45,
        "device_fingerprint": 5432,
        "time_of_day": 14,
        "counterparty_trust_score": 75
    }
    
    Response (JSON):
    {
        "risk_score": 23,
        "risk_flag": false,
        "verdict": "pass",
        "anomaly_indicators": [],
        "model_version": "1.0.0",
        "response_time_ms": 15,
        "timestamp": "2024-01-15T14:30:00Z"
    }
    
    Error response:
    {
        "error": "Error type",
        "message": "Error description",
        "timestamp": "2024-01-15T14:30:00Z"
    }
    """
    start_time = time.time()
    
    try:
        # Check if model is loaded
        if model is None or scaler is None:
            return jsonify({
                'error': 'Model unavailable',
                'message': 'AI engine is not ready. Model not loaded.',
                'timestamp': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
            }), 503
        
        # Parse request body
        data = request.get_json()
        
        if not data:
            return jsonify({
                'error': 'Invalid request',
                'message': 'Request body must be JSON',
                'timestamp': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
            }), 400
        
        # Validate required fields
        required_fields = [
            'transaction_amount',
            'transaction_velocity',
            'account_age_days',
            'device_fingerprint',
            'time_of_day',
            'counterparty_trust_score'
        ]
        
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return jsonify({
                'error': 'Missing required fields',
                'message': f'Missing fields: {", ".join(missing_fields)}',
                'timestamp': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
            }), 400
        
        # Validate field types and ranges
        try:
            transaction_amount = float(data['transaction_amount'])
            transaction_velocity = int(data['transaction_velocity'])
            account_age_days = int(data['account_age_days'])
            device_fingerprint = int(data['device_fingerprint'])
            time_of_day = int(data['time_of_day'])
            counterparty_trust_score = float(data['counterparty_trust_score'])
            
            # Validate ranges
            if transaction_amount < 0:
                raise ValueError("transaction_amount must be non-negative")
            if transaction_velocity < 0:
                raise ValueError("transaction_velocity must be non-negative")
            if account_age_days < 0:
                raise ValueError("account_age_days must be non-negative")
            if not (0 <= time_of_day <= 23):
                raise ValueError("time_of_day must be between 0 and 23")
            if not (0 <= counterparty_trust_score <= 100):
                raise ValueError("counterparty_trust_score must be between 0 and 100")
                
        except (ValueError, TypeError) as e:
            return jsonify({
                'error': 'Invalid field values',
                'message': str(e),
                'timestamp': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
            }), 400
        
        # Prepare features dictionary
        features_dict = {
            'transaction_amount': transaction_amount,
            'transaction_velocity': transaction_velocity,
            'account_age_days': account_age_days,
            'device_fingerprint': device_fingerprint,
            'time_of_day': time_of_day,
            'counterparty_trust_score': counterparty_trust_score
        }
        
        # Preprocess features
        features_scaled = preprocess_features(features_dict)
        
        # Make prediction
        prediction = model.predict(features_scaled)[0]
        anomaly_score = model.score_samples(features_scaled)[0]
        
        # Calculate risk score (1-100)
        risk_score = calculate_risk_score(anomaly_score)
        
        # Determine verdict (fail if risk_score > 80)
        verdict = "fail" if risk_score > RISK_THRESHOLD else "pass"
        risk_flag = risk_score > RISK_THRESHOLD
        
        # Identify anomaly indicators
        anomaly_indicators = identify_anomaly_indicators(features_dict, risk_score)

        # ----- Optional behavioral-signal boost (v2 callers) -----
        # The umbrella AnomalyDetectionEngine on the frontend may pass a
        # `behavioral_signals` dict alongside the standard 6-feature
        # vector. We don't retrain on these (the model is fixed) —
        # instead, we apply explicit, auditable additive boosts so the
        # ML sub-score reflects strong behavioral cues. The umbrella
        # then re-combines this with its own behavioral score, which is
        # fine: we don't double-count because the JS layer applies the
        # same boosts independently and the engine takes a weighted
        # average, not a sum.
        bx = data.get('behavioral_signals') or {}
        ml_boost = 0
        if isinstance(bx, dict):
            if int(bx.get('pin_paste_count') or 0) > 0:
                ml_boost += 15
                anomaly_indicators.append('PIN paste detected')
            if int(bx.get('fingerprint_distinct_users') or 0) >= 3:
                ml_boost += 20
                anomaly_indicators.append('Shared device across multiple accounts')
            if int(bx.get('session_age_sec') or 9999) < 30 and float(features_dict['transaction_amount']) > 200000:
                ml_boost += 10
                anomaly_indicators.append('Funded immediately after login')
        if ml_boost > 0:
            risk_score = max(1, min(100, risk_score + ml_boost))
            verdict = "fail" if risk_score > RISK_THRESHOLD else verdict
            risk_flag = risk_score > RISK_THRESHOLD

        # Calculate response time
        response_time_ms = int((time.time() - start_time) * 1000)
        
        # Build response
        response = {
            'risk_score': risk_score,
            'risk_flag': risk_flag,
            'verdict': verdict,
            'anomaly_indicators': anomaly_indicators,
            'model_version': MODEL_VERSION,
            'engine_api_version': ENGINE_API_VERSION,
            'ml_boost_applied': ml_boost,
            'response_time_ms': response_time_ms,
            'timestamp': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
        }
        
        # Log request (optional, for debugging)
        if app.debug:
            print(f"[Score Request] user_id={data.get('user_id', 'unknown')}, "
                  f"risk_score={risk_score}, verdict={verdict}, "
                  f"response_time={response_time_ms}ms")
        
        return jsonify(response), 200
        
    except Exception as e:
        # Log error
        print(f"[Error] Scoring failed: {e}")
        
        # Calculate response time
        response_time_ms = int((time.time() - start_time) * 1000)
        
        return jsonify({
            'error': 'Scoring failed',
            'message': str(e),
            'response_time_ms': response_time_ms,
            'timestamp': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
        }), 500


@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors."""
    return jsonify({
        'error': 'Not found',
        'message': 'The requested endpoint does not exist',
        'timestamp': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
    }), 404


@app.errorhandler(405)
def method_not_allowed(error):
    """Handle 405 errors."""
    return jsonify({
        'error': 'Method not allowed',
        'message': 'The HTTP method is not allowed for this endpoint',
        'timestamp': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
    }), 405


@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors."""
    return jsonify({
        'error': 'Internal server error',
        'message': 'An unexpected error occurred',
        'timestamp': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
    }), 500


def main():
    """Main entry point for the Flask application."""
    print("="*60)
    print("ScrowPay AI Risk Engine - Flask API")
    print("="*60)
    print()
    
    # Load models at startup
    if not load_models():
        print("✗ Failed to load models. Exiting.")
        print()
        print("Please ensure you have trained the model first:")
        print("  python train_model.py")
        print()
        return 1
    
    print("Starting Flask server...")
    print()
    print("Endpoints:")
    print("  POST /api/v1/score - Score a transaction")
    print("  GET  /health       - Health check")
    print()
    print("Server configuration:")
    print("  Host: 0.0.0.0 (all interfaces)")
    print("  Port: 5000")
    print("  Debug: False (production mode)")
    print()
    print("="*60)
    print()
    
    # Run Flask app
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=False,
        threaded=True  # Handle concurrent requests
    )
    
    return 0


if __name__ == '__main__':
    exit(main())
