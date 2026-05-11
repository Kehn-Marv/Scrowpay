"""
Test script for the Flask REST API.

This script tests the AI Risk Engine API endpoints with various test cases
to ensure correct functionality before integration with the dashboard.

Usage:
    1. Start the Flask server: python app.py
    2. In another terminal, run: python test_api.py
"""

import requests
import json
import time
from datetime import datetime


# API configuration
API_BASE_URL = 'http://localhost:5000'
SCORE_ENDPOINT = f'{API_BASE_URL}/api/v1/score'
HEALTH_ENDPOINT = f'{API_BASE_URL}/health'


def print_header(title):
    """Print a formatted header."""
    print()
    print("="*70)
    print(title)
    print("="*70)
    print()


def print_test_case(name, description):
    """Print test case information."""
    print(f"Test: {name}")
    print(f"Description: {description}")
    print("-"*70)


def print_response(response, elapsed_ms):
    """Print API response in a formatted way."""
    print(f"Status Code: {response.status_code}")
    print(f"Response Time: {elapsed_ms}ms")
    print(f"Response Body:")
    print(json.dumps(response.json(), indent=2))
    print()


def test_health_check():
    """Test the health check endpoint."""
    print_header("Test 1: Health Check Endpoint")
    
    try:
        start = time.time()
        response = requests.get(HEALTH_ENDPOINT, timeout=5)
        elapsed_ms = int((time.time() - start) * 1000)
        
        print_response(response, elapsed_ms)
        
        if response.status_code == 200:
            data = response.json()
            if data.get('status') == 'healthy' and data.get('model_loaded'):
                print("✓ PASS: Health check successful, model is loaded")
                return True
            else:
                print("✗ FAIL: Health check returned unhealthy status")
                return False
        else:
            print(f"✗ FAIL: Expected status 200, got {response.status_code}")
            return False
            
    except Exception as e:
        print(f"✗ FAIL: Exception occurred: {e}")
        return False


def test_normal_transaction():
    """Test scoring a normal transaction."""
    print_header("Test 2: Normal Transaction")
    print_test_case(
        "Normal Transaction",
        "Moderate amount, low velocity, established account, business hours, good trust"
    )
    
    payload = {
        "user_id": "user123",
        "transaction_amount": 50000.00,
        "transaction_velocity": 2,
        "account_age_days": 90,
        "device_fingerprint": 5432,
        "time_of_day": 14,
        "counterparty_trust_score": 70
    }
    
    print(f"Request Payload:")
    print(json.dumps(payload, indent=2))
    print()
    
    try:
        start = time.time()
        response = requests.post(SCORE_ENDPOINT, json=payload, timeout=5)
        elapsed_ms = int((time.time() - start) * 1000)
        
        print_response(response, elapsed_ms)
        
        if response.status_code == 200:
            data = response.json()
            
            # Validate response structure
            required_fields = ['risk_score', 'risk_flag', 'verdict', 'anomaly_indicators', 
                             'model_version', 'response_time_ms', 'timestamp']
            missing_fields = [f for f in required_fields if f not in data]
            
            if missing_fields:
                print(f"✗ FAIL: Missing fields in response: {missing_fields}")
                return False
            
            # Validate response time (<3 seconds)
            if elapsed_ms > 3000:
                print(f"✗ FAIL: Response time {elapsed_ms}ms exceeds 3000ms requirement")
                return False
            
            # Validate verdict is "pass" for normal transaction
            if data['verdict'] != 'pass':
                print(f"✗ FAIL: Expected verdict 'pass', got '{data['verdict']}'")
                return False
            
            # Validate risk_score is in range 1-100
            if not (1 <= data['risk_score'] <= 100):
                print(f"✗ FAIL: Risk score {data['risk_score']} out of range [1, 100]")
                return False
            
            print(f"✓ PASS: Normal transaction correctly identified as low risk")
            print(f"  Risk Score: {data['risk_score']}")
            print(f"  Verdict: {data['verdict']}")
            print(f"  Response Time: {elapsed_ms}ms (< 3000ms ✓)")
            return True
            
        else:
            print(f"✗ FAIL: Expected status 200, got {response.status_code}")
            return False
            
    except Exception as e:
        print(f"✗ FAIL: Exception occurred: {e}")
        return False


def test_anomalous_transaction():
    """Test scoring an anomalous transaction."""
    print_header("Test 3: Anomalous Transaction")
    print_test_case(
        "Anomalous Transaction",
        "Very high amount, extreme velocity, new account, late night, low trust"
    )
    
    payload = {
        "user_id": "user456",
        "transaction_amount": 5000000.00,
        "transaction_velocity": 40,
        "account_age_days": 2,
        "device_fingerprint": 50,
        "time_of_day": 3,
        "counterparty_trust_score": 10
    }
    
    print(f"Request Payload:")
    print(json.dumps(payload, indent=2))
    print()
    
    try:
        start = time.time()
        response = requests.post(SCORE_ENDPOINT, json=payload, timeout=5)
        elapsed_ms = int((time.time() - start) * 1000)
        
        print_response(response, elapsed_ms)
        
        if response.status_code == 200:
            data = response.json()
            
            # Validate verdict is "fail" for anomalous transaction
            if data['verdict'] != 'fail':
                print(f"✗ FAIL: Expected verdict 'fail', got '{data['verdict']}'")
                return False
            
            # Validate risk_score is high (>80)
            if data['risk_score'] <= 80:
                print(f"✗ FAIL: Expected risk_score > 80, got {data['risk_score']}")
                return False
            
            # Validate anomaly_indicators are present
            if not data['anomaly_indicators']:
                print(f"✗ FAIL: Expected anomaly_indicators, got empty list")
                return False
            
            print(f"✓ PASS: Anomalous transaction correctly identified as high risk")
            print(f"  Risk Score: {data['risk_score']}")
            print(f"  Verdict: {data['verdict']}")
            print(f"  Anomaly Indicators: {', '.join(data['anomaly_indicators'])}")
            print(f"  Response Time: {elapsed_ms}ms (< 3000ms ✓)")
            return True
            
        else:
            print(f"✗ FAIL: Expected status 200, got {response.status_code}")
            return False
            
    except Exception as e:
        print(f"✗ FAIL: Exception occurred: {e}")
        return False


def test_missing_fields():
    """Test error handling for missing required fields."""
    print_header("Test 4: Missing Required Fields")
    print_test_case(
        "Missing Fields Error",
        "Request with missing required fields should return 400 error"
    )
    
    payload = {
        "user_id": "user789",
        "transaction_amount": 50000.00,
        # Missing other required fields
    }
    
    print(f"Request Payload:")
    print(json.dumps(payload, indent=2))
    print()
    
    try:
        start = time.time()
        response = requests.post(SCORE_ENDPOINT, json=payload, timeout=5)
        elapsed_ms = int((time.time() - start) * 1000)
        
        print_response(response, elapsed_ms)
        
        if response.status_code == 400:
            data = response.json()
            if 'error' in data and 'message' in data:
                print(f"✓ PASS: Missing fields correctly rejected with 400 error")
                print(f"  Error: {data['error']}")
                print(f"  Message: {data['message']}")
                return True
            else:
                print(f"✗ FAIL: Error response missing 'error' or 'message' fields")
                return False
        else:
            print(f"✗ FAIL: Expected status 400, got {response.status_code}")
            return False
            
    except Exception as e:
        print(f"✗ FAIL: Exception occurred: {e}")
        return False


def test_invalid_field_values():
    """Test error handling for invalid field values."""
    print_header("Test 5: Invalid Field Values")
    print_test_case(
        "Invalid Values Error",
        "Request with invalid field values should return 400 error"
    )
    
    payload = {
        "user_id": "user999",
        "transaction_amount": -1000.00,  # Negative amount (invalid)
        "transaction_velocity": 2,
        "account_age_days": 90,
        "device_fingerprint": 5432,
        "time_of_day": 14,
        "counterparty_trust_score": 70
    }
    
    print(f"Request Payload:")
    print(json.dumps(payload, indent=2))
    print()
    
    try:
        start = time.time()
        response = requests.post(SCORE_ENDPOINT, json=payload, timeout=5)
        elapsed_ms = int((time.time() - start) * 1000)
        
        print_response(response, elapsed_ms)
        
        if response.status_code == 400:
            data = response.json()
            if 'error' in data and 'message' in data:
                print(f"✓ PASS: Invalid values correctly rejected with 400 error")
                print(f"  Error: {data['error']}")
                print(f"  Message: {data['message']}")
                return True
            else:
                print(f"✗ FAIL: Error response missing 'error' or 'message' fields")
                return False
        else:
            print(f"✗ FAIL: Expected status 400, got {response.status_code}")
            return False
            
    except Exception as e:
        print(f"✗ FAIL: Exception occurred: {e}")
        return False


def test_edge_case_high_amount():
    """Test edge case: high amount but otherwise normal."""
    print_header("Test 6: Edge Case - High Amount Only")
    print_test_case(
        "High Amount Edge Case",
        "High amount but otherwise normal - should consider context"
    )
    
    payload = {
        "user_id": "user111",
        "transaction_amount": 1000000.00,  # High amount
        "transaction_velocity": 2,
        "account_age_days": 90,
        "device_fingerprint": 5432,
        "time_of_day": 14,
        "counterparty_trust_score": 70
    }
    
    print(f"Request Payload:")
    print(json.dumps(payload, indent=2))
    print()
    
    try:
        start = time.time()
        response = requests.post(SCORE_ENDPOINT, json=payload, timeout=5)
        elapsed_ms = int((time.time() - start) * 1000)
        
        print_response(response, elapsed_ms)
        
        if response.status_code == 200:
            data = response.json()
            print(f"✓ PASS: Edge case processed successfully")
            print(f"  Risk Score: {data['risk_score']}")
            print(f"  Verdict: {data['verdict']}")
            print(f"  Note: Model considers multiple factors, not just amount")
            return True
        else:
            print(f"✗ FAIL: Expected status 200, got {response.status_code}")
            return False
            
    except Exception as e:
        print(f"✗ FAIL: Exception occurred: {e}")
        return False


def main():
    """Run all API tests."""
    print_header("ScrowPay AI Risk Engine - API Test Suite")
    
    print("Testing API at:", API_BASE_URL)
    print()
    print("Prerequisites:")
    print("  1. Flask server must be running: python app.py")
    print("  2. Model must be trained: python train_model.py")
    print()
    
    # Wait for user confirmation
    input("Press Enter to start tests...")
    
    # Run tests
    tests = [
        ("Health Check", test_health_check),
        ("Normal Transaction", test_normal_transaction),
        ("Anomalous Transaction", test_anomalous_transaction),
        ("Missing Fields Error", test_missing_fields),
        ("Invalid Values Error", test_invalid_field_values),
        ("Edge Case - High Amount", test_edge_case_high_amount),
    ]
    
    results = []
    for name, test_func in tests:
        try:
            result = test_func()
            results.append((name, result))
        except Exception as e:
            print(f"✗ Test '{name}' crashed: {e}")
            results.append((name, False))
    
    # Print summary
    print_header("Test Summary")
    
    passed = sum(1 for _, result in results if result)
    failed = len(results) - passed
    
    print(f"Total Tests: {len(results)}")
    print(f"Passed: {passed} ✓")
    print(f"Failed: {failed} ✗")
    print(f"Success Rate: {passed/len(results)*100:.1f}%")
    print()
    
    print("Test Results:")
    for name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"  {status} - {name}")
    
    print()
    print("="*70)
    
    if failed == 0:
        print("✓ ALL TESTS PASSED - API is ready for integration!")
    else:
        print("⚠ SOME TESTS FAILED - Review errors above")
    
    print("="*70)
    print()
    
    return 0 if failed == 0 else 1


if __name__ == '__main__':
    exit(main())
