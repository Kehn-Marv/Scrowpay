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
import re
from datetime import datetime

# Resend SDK (lazy-configured below — we don't crash on missing key).
try:
    import resend
    _RESEND_AVAILABLE = True
except ImportError:
    _RESEND_AVAILABLE = False
    print("[WARN] `resend` package not installed; email endpoints will return 503")

# Load .env if present so RESEND_API_KEY etc. work without manual export.
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Resend configuration. The API key is read at startup; the From
# address falls back to Resend's shared sandbox (`onboarding@resend.dev`)
# when the operator hasn't verified a domain yet. This lets the user
# test the full flow on day one without waiting for DNS propagation.
RESEND_API_KEY = os.getenv('RESEND_API_KEY', '').strip()
RESEND_FROM = os.getenv('RESEND_FROM_ADDRESS', 'ScrowPay <onboarding@resend.dev>').strip()
RESEND_REPLY_TO = os.getenv('RESEND_REPLY_TO', '').strip()
_RESEND_CONFIGURED = bool(_RESEND_AVAILABLE and RESEND_API_KEY)
if _RESEND_CONFIGURED:
    resend.api_key = RESEND_API_KEY
    print(f"[Resend] Configured. From: {RESEND_FROM}")
else:
    print("[Resend] NOT configured (RESEND_API_KEY missing). Email endpoints will return 503.")

# Basic email format validator. We don't try to be RFC 5322 perfect —
# the goal is just to reject obviously malformed input before paying
# the Resend API call.
_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')

# In-memory rate-limit tracker: { ip+route: [timestamps...] }. Resend
# itself enforces 2 req/sec at the account level; this catches abuse
# at the per-IP layer before we even leave the service.
_RATE_LIMIT_WINDOW_SEC = 60
_RATE_LIMIT_MAX = {
    'email': 20,   # 20 generic emails per IP per minute
    'otp':   5     # 5 OTP requests per IP per minute
}
_rate_buckets = {}

def _rate_limited(route_key):
    """Return True if the current request should be rejected for rate-limit."""
    ip = request.headers.get('X-Forwarded-For', request.remote_addr or 'unknown').split(',')[0].strip()
    key = f'{ip}:{route_key}'
    now = time.time()
    bucket = [t for t in _rate_buckets.get(key, []) if now - t < _RATE_LIMIT_WINDOW_SEC]
    if len(bucket) >= _RATE_LIMIT_MAX.get(route_key, 30):
        _rate_buckets[key] = bucket
        return True
    bucket.append(now)
    _rate_buckets[key] = bucket
    return False

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


@app.route('/api/v1/notify/email', methods=['POST'])
def notify_email():
    """
    Send a generic transactional email via Resend.

    Body (JSON):
      to:        str  (required)  recipient email
      subject:   str  (required)  subject line
      html:      str  (optional)  HTML body
      text:      str  (optional)  plain-text body (sent if html omitted)
      reply_to:  str  (optional)  override reply-to
      tags:      list (optional)  e.g. [{'name':'category','value':'funding'}]

    At least one of `html` or `text` is required.

    Failure modes:
      400  Invalid input
      429  Rate limited
      503  Resend not configured on this server (operator forgot the API key)
    """
    if not _RESEND_CONFIGURED:
        return jsonify({
            'error': 'Email service not configured',
            'message': 'Set RESEND_API_KEY on the AI engine to enable email delivery.'
        }), 503

    if _rate_limited('email'):
        return jsonify({'error': 'Rate limited', 'message': 'Too many email requests.'}), 429

    data = request.get_json(silent=True) or {}
    to = (data.get('to') or '').strip().lower()
    subject = (data.get('subject') or '').strip()
    html = data.get('html')
    text = data.get('text')
    reply_to = (data.get('reply_to') or RESEND_REPLY_TO or '').strip() or None
    tags = data.get('tags')

    # Validate.
    if not to or not _EMAIL_RE.match(to):
        return jsonify({'error': 'Invalid `to`'}), 400
    if not subject:
        return jsonify({'error': 'Missing `subject`'}), 400
    if not html and not text:
        return jsonify({'error': 'Provide `html` or `text`'}), 400
    if subject and len(subject) > 200:
        return jsonify({'error': '`subject` too long'}), 400

    # Build the payload. Resend's SDK accepts a dict with these keys.
    payload = {
        'from': RESEND_FROM,
        'to': [to],
        'subject': subject
    }
    if html: payload['html'] = html
    if text: payload['text'] = text
    if reply_to: payload['reply_to'] = reply_to
    if isinstance(tags, list):
        # Resend expects [{name, value}, ...]. We accept either that shape
        # OR a flat dict {k:v} for convenience.
        if all(isinstance(t, dict) and 'name' in t and 'value' in t for t in tags):
            payload['tags'] = tags
    elif isinstance(tags, dict):
        payload['tags'] = [{'name': k, 'value': str(v)} for k, v in tags.items()]

    try:
        result = resend.Emails.send(payload)
        return jsonify({
            'success': True,
            'message_id': (result or {}).get('id'),
            'from': RESEND_FROM,
            'to': to
        }), 200
    except Exception as e:
        print(f"[Resend] send failed for {to}: {e}")
        return jsonify({
            'error': 'Email send failed',
            'message': str(e)
        }), 502


@app.route('/api/v1/notify/otp', methods=['POST'])
def notify_otp():
    """
    Send an OTP email. This is a narrower endpoint than /notify/email
    because:
      • The caller does NOT pick the body — we own the wording so a
        compromised frontend can't phish via this channel.
      • We hard-cap length (always a 6-digit code).
      • Subject/from are templated so emails arrive consistent.

    The OTP STORAGE (hash + expiry) is the frontend's responsibility —
    this endpoint only deals with delivery. That keeps the Python
    service stateless and means we don't need a Turso client here.

    Body (JSON):
      to:      str  (required)  recipient email
      code:    str  (required)  the 6-digit code to deliver
      purpose: str  (optional)  'signup' | 'password_reset' | 'sensitive'
                                 affects subject + copy
      name:    str  (optional)  recipient first name for personalization
    """
    if not _RESEND_CONFIGURED:
        return jsonify({
            'error': 'Email service not configured',
            'message': 'Set RESEND_API_KEY on the AI engine to enable email delivery.'
        }), 503

    if _rate_limited('otp'):
        return jsonify({'error': 'Rate limited', 'message': 'Too many OTP requests. Try again in a minute.'}), 429

    data = request.get_json(silent=True) or {}
    to = (data.get('to') or '').strip().lower()
    code = (data.get('code') or '').strip()
    purpose = (data.get('purpose') or 'signup').strip()
    name = (data.get('name') or '').strip()

    if not to or not _EMAIL_RE.match(to):
        return jsonify({'error': 'Invalid `to`'}), 400
    if not re.fullmatch(r'\d{4,8}', code):
        return jsonify({'error': '`code` must be 4-8 digits'}), 400
    if purpose not in ('signup', 'password_reset', 'sensitive', 'reverify'):
        purpose = 'signup'

    subject_map = {
        'signup':         'Your ScrowPay verification code',
        'password_reset': 'Reset your ScrowPay password',
        'sensitive':      'Confirm your ScrowPay action',
        'reverify':       'Verify it’s really you'
    }
    intro_map = {
        'signup':         'Welcome to ScrowPay! Use the code below to finish setting up your account:',
        'password_reset': 'Use this code to reset your password:',
        'sensitive':      'Use this code to authorize the action you just initiated:',
        'reverify':       'We need to confirm it’s you. Use the code below:'
    }
    subject = subject_map[purpose]
    intro = intro_map[purpose]
    greeting = f'Hi {name},' if name else 'Hi,'

    html = f"""
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0b0f17;color:#e6e9ef;padding:32px 16px;">
      <div style="max-width:520px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:14px;padding:32px;">
        <div style="text-align:center;font-size:22px;font-weight:700;color:#10b981;margin-bottom:24px;">ScrowPay</div>
        <p style="margin:0 0 12px;font-size:15px;">{greeting}</p>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#cbd5e1;">{intro}</p>
        <div style="text-align:center;background:#0f172a;border:1px dashed #334155;border-radius:10px;padding:18px 0;margin:8px 0 24px;">
          <div style="font-size:32px;letter-spacing:10px;font-weight:700;color:#10b981;">{code}</div>
        </div>
        <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;">This code expires in <strong>10 minutes</strong>. Don’t share it with anyone — not even someone claiming to be from ScrowPay support.</p>
        <p style="margin:24px 0 0;font-size:12px;color:#64748b;">If you didn’t request this, you can safely ignore the email.</p>
      </div>
      <div style="text-align:center;font-size:11px;color:#475569;margin-top:18px;">© ScrowPay · Secure escrow for digital commerce</div>
    </div>
    """
    text = f"{greeting}\n\n{intro}\n\nYour code: {code}\n\nThis code expires in 10 minutes. Don't share it with anyone.\n\nIf you didn't request this, ignore this email.\n\n— ScrowPay"

    try:
        result = resend.Emails.send({
            'from': RESEND_FROM,
            'to': [to],
            'subject': subject,
            'html': html,
            'text': text,
            'tags': [
                {'name': 'category', 'value': 'otp'},
                {'name': 'purpose', 'value': purpose}
            ]
        })
        return jsonify({
            'success': True,
            'message_id': (result or {}).get('id'),
            'purpose': purpose
        }), 200
    except Exception as e:
        print(f"[Resend] OTP send failed for {to}: {e}")
        return jsonify({'error': 'Email send failed', 'message': str(e)}), 502


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
