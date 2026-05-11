"""
Quick test script to verify the trained model works correctly.
Tests both normal and anomalous transaction predictions.
"""

import joblib
import numpy as np

def test_model():
    """Test the trained Isolation Forest model."""
    
    print("="*60)
    print("Testing Trained Isolation Forest Model")
    print("="*60)
    print()
    
    # Load model and scaler
    print("Loading model files...")
    model = joblib.load('models/isolation_forest_model.pkl')
    scaler = joblib.load('models/feature_scaler.pkl')
    metadata = joblib.load('models/model_metadata.pkl')
    
    print(f"✓ Model version: {metadata['model_version']}")
    print(f"✓ Trained at: {metadata['trained_at']}")
    print(f"✓ Configuration: n_estimators={metadata['configuration']['n_estimators']}, contamination={metadata['configuration']['contamination']}")
    print()
    
    # Test cases
    test_cases = [
        {
            'name': 'Normal Transaction #1',
            'features': [50000, 2, 90, 5432, 14, 70],
            'expected': 'normal',
            'description': 'Moderate amount, low velocity, established account, business hours, good trust'
        },
        {
            'name': 'Normal Transaction #2',
            'features': [25000, 1, 120, 7890, 16, 75],
            'expected': 'normal',
            'description': 'Low amount, very low velocity, old account, afternoon, high trust'
        },
        {
            'name': 'Anomalous Transaction #1',
            'features': [5000000, 40, 2, 50, 3, 10],
            'expected': 'anomaly',
            'description': 'Very high amount, extreme velocity, new account, late night, low trust'
        },
        {
            'name': 'Anomalous Transaction #2',
            'features': [8000000, 35, 1, 25, 4, 5],
            'expected': 'anomaly',
            'description': 'Extreme amount, high velocity, brand new account, late night, very low trust'
        },
        {
            'name': 'Edge Case: High Amount Only',
            'features': [1000000, 2, 90, 5432, 14, 70],
            'expected': 'normal',
            'description': 'High amount but otherwise normal - model considers context, not single feature'
        },
        {
            'name': 'Edge Case: New Account Only',
            'features': [50000, 2, 3, 5432, 14, 70],
            'expected': 'normal',
            'description': 'New account but otherwise normal - model requires multiple red flags'
        }
    ]
    
    print("Running test cases...")
    print("-"*60)
    print()
    
    passed = 0
    failed = 0
    
    for i, test in enumerate(test_cases, 1):
        print(f"Test {i}: {test['name']}")
        print(f"  Description: {test['description']}")
        print(f"  Features: {test['features']}")
        
        # Prepare features
        features = np.array([test['features']])
        
        # Preprocess
        features_scaled = scaler.transform(features)
        
        # Predict
        prediction = model.predict(features_scaled)[0]
        anomaly_score = model.score_samples(features_scaled)[0]
        
        # Convert prediction to label
        predicted_label = 'normal' if prediction == 1 else 'anomaly'
        
        # Check result
        is_correct = predicted_label == test['expected']
        status = '✓ PASS' if is_correct else '✗ FAIL'
        
        if is_correct:
            passed += 1
        else:
            failed += 1
        
        print(f"  Prediction: {predicted_label} (score: {anomaly_score:.4f})")
        print(f"  Expected: {test['expected']}")
        print(f"  Result: {status}")
        print()
    
    # Summary
    print("="*60)
    print("Test Summary")
    print("="*60)
    print(f"Total tests: {len(test_cases)}")
    print(f"Passed: {passed} ✓")
    print(f"Failed: {failed} ✗")
    print(f"Success rate: {passed/len(test_cases)*100:.1f}%")
    print()
    
    if failed == 0:
        print("✓ ALL TESTS PASSED - Model is working correctly!")
    else:
        print("⚠ SOME TESTS FAILED - Review model behavior")
    
    print("="*60)
    
    return failed == 0


if __name__ == '__main__':
    success = test_model()
    exit(0 if success else 1)
