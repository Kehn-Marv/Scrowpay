"""
Dataset Validation Script

This script validates that a generated synthetic dataset meets the requirements
specified in the ScrowPay design document.

Requirements to validate:
- 15.1: Dataset contains 5,000-10,000 records
- 15.2: Dataset contains 5% anomalous transactions (250-500 anomalies)
- 15.3: Dataset includes all 6 required features
- 15.7: Realistic distributions for normal transactions and clear outliers for anomalies
"""

import pandas as pd
import sys


def validate_dataset(csv_file):
    """
    Validate a synthetic transaction dataset.
    
    Args:
        csv_file: Path to the CSV file to validate
        
    Returns:
        Boolean indicating if validation passed
    """
    print(f"Validating dataset: {csv_file}")
    print("=" * 70)
    
    try:
        # Load dataset
        df = pd.read_csv(csv_file)
        print(f"✓ Successfully loaded dataset")
        
        # Validation checks
        all_passed = True
        
        # Check 1: Total records (5,000-10,000)
        print(f"\n1. Checking total records...")
        total_records = len(df)
        print(f"   Total records: {total_records}")
        if 5000 <= total_records <= 10000:
            print(f"   ✓ PASS: Within range 5,000-10,000")
        else:
            print(f"   ✗ FAIL: Outside range 5,000-10,000")
            all_passed = False
        
        # Check 2: Required columns
        print(f"\n2. Checking required features...")
        required_features = [
            'transaction_amount',
            'transaction_velocity',
            'account_age_days',
            'device_fingerprint',
            'time_of_day',
            'counterparty_trust_score'
        ]
        
        missing_features = [f for f in required_features if f not in df.columns]
        if not missing_features:
            print(f"   ✓ PASS: All 6 required features present")
        else:
            print(f"   ✗ FAIL: Missing features: {missing_features}")
            all_passed = False
        
        # Check 3: Anomaly label exists
        print(f"\n3. Checking anomaly labels...")
        if 'is_anomaly' in df.columns:
            print(f"   ✓ PASS: Anomaly label column present")
        else:
            print(f"   ✗ FAIL: Missing 'is_anomaly' column")
            all_passed = False
            return all_passed
        
        # Check 4: Anomaly rate (4-6% acceptable range)
        print(f"\n4. Checking anomaly rate...")
        n_anomalies = (df['is_anomaly'] == 1).sum()
        n_normal = (df['is_anomaly'] == 0).sum()
        anomaly_rate = n_anomalies / total_records
        
        print(f"   Normal transactions: {n_normal} ({n_normal/total_records*100:.1f}%)")
        print(f"   Anomalous transactions: {n_anomalies} ({anomaly_rate*100:.1f}%)")
        
        if 0.04 <= anomaly_rate <= 0.06:
            print(f"   ✓ PASS: Anomaly rate within acceptable range (4-6%)")
        else:
            print(f"   ✗ FAIL: Anomaly rate outside acceptable range (4-6%)")
            all_passed = False
        
        # Check 5: Feature value ranges
        print(f"\n5. Checking feature value ranges...")
        
        # Transaction amount: ₦100 - ₦10,000,000
        amount_min = df['transaction_amount'].min()
        amount_max = df['transaction_amount'].max()
        print(f"   Transaction amount: ₦{amount_min:,.2f} - ₦{amount_max:,.2f}")
        if amount_min >= 100 and amount_max <= 10_000_000:
            print(f"   ✓ PASS: Within valid range (₦100 - ₦10,000,000)")
        else:
            print(f"   ✗ FAIL: Outside valid range")
            all_passed = False
        
        # Transaction velocity: 0-50
        velocity_min = df['transaction_velocity'].min()
        velocity_max = df['transaction_velocity'].max()
        print(f"   Transaction velocity: {velocity_min} - {velocity_max} txns/day")
        if velocity_min >= 0 and velocity_max <= 50:
            print(f"   ✓ PASS: Within valid range (0-50)")
        else:
            print(f"   ✗ FAIL: Outside valid range")
            all_passed = False
        
        # Account age: 0-365+
        age_min = df['account_age_days'].min()
        age_max = df['account_age_days'].max()
        print(f"   Account age: {age_min:.0f} - {age_max:.0f} days")
        if age_min >= 0:
            print(f"   ✓ PASS: Valid range (≥0 days)")
        else:
            print(f"   ✗ FAIL: Invalid range")
            all_passed = False
        
        # Time of day: 0-23
        time_min = df['time_of_day'].min()
        time_max = df['time_of_day'].max()
        print(f"   Time of day: {time_min}:00 - {time_max}:00")
        if time_min >= 0 and time_max <= 23:
            print(f"   ✓ PASS: Within valid range (0-23)")
        else:
            print(f"   ✗ FAIL: Outside valid range")
            all_passed = False
        
        # Trust score: 1-100
        trust_min = df['counterparty_trust_score'].min()
        trust_max = df['counterparty_trust_score'].max()
        print(f"   Trust score: {trust_min:.1f} - {trust_max:.1f}")
        if trust_min >= 1 and trust_max <= 100:
            print(f"   ✓ PASS: Within valid range (1-100)")
        else:
            print(f"   ✗ FAIL: Outside valid range")
            all_passed = False
        
        # Check 6: Distribution characteristics
        print(f"\n6. Checking distribution characteristics...")
        
        normal_df = df[df['is_anomaly'] == 0]
        anomaly_df = df[df['is_anomaly'] == 1]
        
        # Normal transactions should have lower amounts on average
        normal_mean_amount = normal_df['transaction_amount'].mean()
        anomaly_mean_amount = anomaly_df['transaction_amount'].mean()
        print(f"   Normal mean amount: ₦{normal_mean_amount:,.2f}")
        print(f"   Anomaly mean amount: ₦{anomaly_mean_amount:,.2f}")
        if anomaly_mean_amount > normal_mean_amount * 2:
            print(f"   ✓ PASS: Anomalies have significantly higher amounts")
        else:
            print(f"   ⚠ WARNING: Anomaly amounts not significantly higher")
        
        # Anomalies should have higher velocity
        normal_mean_velocity = normal_df['transaction_velocity'].mean()
        anomaly_mean_velocity = anomaly_df['transaction_velocity'].mean()
        print(f"   Normal mean velocity: {normal_mean_velocity:.2f} txns/day")
        print(f"   Anomaly mean velocity: {anomaly_mean_velocity:.2f} txns/day")
        if anomaly_mean_velocity > normal_mean_velocity * 2:
            print(f"   ✓ PASS: Anomalies have significantly higher velocity")
        else:
            print(f"   ⚠ WARNING: Anomaly velocity not significantly higher")
        
        # Anomalies should have lower account age
        normal_mean_age = normal_df['account_age_days'].mean()
        anomaly_mean_age = anomaly_df['account_age_days'].mean()
        print(f"   Normal mean account age: {normal_mean_age:.1f} days")
        print(f"   Anomaly mean account age: {anomaly_mean_age:.1f} days")
        if anomaly_mean_age < normal_mean_age * 0.5:
            print(f"   ✓ PASS: Anomalies have significantly lower account age")
        else:
            print(f"   ⚠ WARNING: Anomaly account age not significantly lower")
        
        # Anomalies should have lower trust scores
        normal_mean_trust = normal_df['counterparty_trust_score'].mean()
        anomaly_mean_trust = anomaly_df['counterparty_trust_score'].mean()
        print(f"   Normal mean trust score: {normal_mean_trust:.1f}")
        print(f"   Anomaly mean trust score: {anomaly_mean_trust:.1f}")
        if anomaly_mean_trust < normal_mean_trust * 0.5:
            print(f"   ✓ PASS: Anomalies have significantly lower trust scores")
        else:
            print(f"   ⚠ WARNING: Anomaly trust scores not significantly lower")
        
        # Check 7: No missing values
        print(f"\n7. Checking for missing values...")
        missing_counts = df.isnull().sum()
        total_missing = missing_counts.sum()
        if total_missing == 0:
            print(f"   ✓ PASS: No missing values")
        else:
            print(f"   ✗ FAIL: Found {total_missing} missing values")
            print(f"   Missing by column:")
            for col, count in missing_counts[missing_counts > 0].items():
                print(f"     - {col}: {count}")
            all_passed = False
        
        # Final result
        print("\n" + "=" * 70)
        if all_passed:
            print("✓ VALIDATION PASSED: Dataset meets all requirements")
            print("=" * 70)
            return True
        else:
            print("✗ VALIDATION FAILED: Dataset does not meet all requirements")
            print("=" * 70)
            return False
        
    except FileNotFoundError:
        print(f"✗ ERROR: File not found: {csv_file}")
        return False
    except Exception as e:
        print(f"✗ ERROR: {str(e)}")
        return False


def main():
    """Main entry point."""
    if len(sys.argv) < 2:
        print("Usage: python validate_dataset.py <csv_file>")
        print("Example: python validate_dataset.py synthetic_transactions.csv")
        sys.exit(1)
    
    csv_file = sys.argv[1]
    passed = validate_dataset(csv_file)
    
    sys.exit(0 if passed else 1)


if __name__ == '__main__':
    main()
