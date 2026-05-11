"""
Synthetic Transaction Data Generator for ScrowPay AI Risk Engine

This script generates synthetic transaction data for training the Isolation Forest
anomaly detection model. The dataset contains realistic normal transactions and
clear anomalous patterns for effective model training.

Requirements:
- 5,000-10,000 total records
- 95% normal transactions, 5% anomalies
- Features: transaction_amount, transaction_velocity, account_age_days,
  device_fingerprint, time_of_day, counterparty_trust_score
"""

import numpy as np
import pandas as pd
import argparse
from datetime import datetime


def generate_normal_transactions(n=9500):
    """
    Generate normal transaction records with realistic distributions.
    
    Normal transaction characteristics:
    - Amounts: Log-normal distribution (most transactions are moderate, few are large)
    - Velocity: Poisson distribution with average 2 transactions per day
    - Account age: Gamma distribution (most accounts are established)
    - Device fingerprint: Random but consistent device IDs
    - Time of day: Business hours (8 AM - 10 PM)
    - Trust score: Normal distribution around 70
    
    Args:
        n: Number of normal transactions to generate
        
    Returns:
        DataFrame with normal transaction features
    """
    np.random.seed(42)  # For reproducibility
    
    # Transaction amounts: Log-normal distribution
    # Mean of log: 10 (₦22,026), Std of log: 1.5
    # This creates amounts mostly between ₦1,000 - ₦100,000
    amounts = np.random.lognormal(mean=10, sigma=1.5, size=n)
    # Clip to valid range (₦100 - ₦10,000,000)
    amounts = np.clip(amounts, 100, 10_000_000)
    
    # Transaction velocity: Poisson distribution (average 2 per day)
    # Most users have 1-3 transactions per day
    velocity = np.random.poisson(lam=2, size=n)
    
    # Account age: Gamma distribution
    # Shape=30, Scale=3 gives mean of 90 days with right skew
    # Most accounts are 30-180 days old
    account_age = np.random.gamma(shape=30, scale=3, size=n)
    account_age = np.clip(account_age, 7, 365)  # At least 7 days old
    
    # Device fingerprint: Random device IDs (1000-9999)
    # Represents consistent device usage
    device_fingerprint = np.random.randint(1000, 10000, size=n)
    
    # Time of day: Business hours (8-22)
    # Weighted towards afternoon/evening (12-20)
    time_weights = [0.05, 0.05, 0.05, 0.05, 0.1, 0.15, 0.2, 0.15, 0.1, 0.05, 0.03, 0.02]
    time_of_day = np.random.choice(range(8, 20), size=n, p=time_weights)
    
    # Counterparty trust score: Normal distribution around 70
    # Most counterparties have decent trust scores
    trust_score = np.random.normal(loc=70, scale=15, size=n)
    trust_score = np.clip(trust_score, 1, 100)
    
    return pd.DataFrame({
        'transaction_amount': amounts,
        'transaction_velocity': velocity,
        'account_age_days': account_age,
        'device_fingerprint': device_fingerprint,
        'time_of_day': time_of_day,
        'counterparty_trust_score': trust_score
    })


def generate_anomalous_transactions(n=500):
    """
    Generate anomalous transaction records with suspicious patterns.
    
    Anomalous transaction characteristics:
    - Amounts: Very high (₦500,000 - ₦10,000,000)
    - Velocity: High frequency (15-50 transactions per day)
    - Account age: New accounts (<7 days)
    - Device fingerprint: Suspicious/changing devices (low IDs)
    - Time of day: Late night (2-5 AM)
    - Trust score: Low trust (<30)
    
    Args:
        n: Number of anomalous transactions to generate
        
    Returns:
        DataFrame with anomalous transaction features
    """
    np.random.seed(43)  # Different seed for variety
    
    # Create different types of anomalies for diversity
    n_per_type = n // 5
    
    # Type 1: High amount + new account
    type1 = pd.DataFrame({
        'transaction_amount': np.random.uniform(500_000, 10_000_000, n_per_type),
        'transaction_velocity': np.random.randint(2, 8, n_per_type),
        'account_age_days': np.random.randint(0, 7, n_per_type),
        'device_fingerprint': np.random.randint(1, 1000, n_per_type),
        'time_of_day': np.random.choice([2, 3, 4, 5], n_per_type),
        'counterparty_trust_score': np.random.uniform(1, 30, n_per_type)
    })
    
    # Type 2: High velocity + low trust
    type2 = pd.DataFrame({
        'transaction_amount': np.random.uniform(50_000, 500_000, n_per_type),
        'transaction_velocity': np.random.randint(15, 50, n_per_type),
        'account_age_days': np.random.randint(7, 30, n_per_type),
        'device_fingerprint': np.random.randint(1, 500, n_per_type),
        'time_of_day': np.random.choice([2, 3, 4, 5, 22, 23], n_per_type),
        'counterparty_trust_score': np.random.uniform(1, 20, n_per_type)
    })
    
    # Type 3: Late night + high amount + new account
    type3 = pd.DataFrame({
        'transaction_amount': np.random.uniform(300_000, 5_000_000, n_per_type),
        'transaction_velocity': np.random.randint(5, 15, n_per_type),
        'account_age_days': np.random.randint(0, 5, n_per_type),
        'device_fingerprint': np.random.randint(1, 200, n_per_type),
        'time_of_day': np.random.choice([2, 3, 4], n_per_type),
        'counterparty_trust_score': np.random.uniform(5, 35, n_per_type)
    })
    
    # Type 4: Extreme velocity + suspicious device
    type4 = pd.DataFrame({
        'transaction_amount': np.random.uniform(100_000, 1_000_000, n_per_type),
        'transaction_velocity': np.random.randint(25, 50, n_per_type),
        'account_age_days': np.random.randint(1, 14, n_per_type),
        'device_fingerprint': np.random.randint(1, 100, n_per_type),
        'time_of_day': np.random.choice(range(0, 24), n_per_type),
        'counterparty_trust_score': np.random.uniform(1, 25, n_per_type)
    })
    
    # Type 5: All red flags (extreme anomaly)
    type5_size = n - (4 * n_per_type)  # Remaining records
    type5 = pd.DataFrame({
        'transaction_amount': np.random.uniform(1_000_000, 10_000_000, type5_size),
        'transaction_velocity': np.random.randint(30, 50, type5_size),
        'account_age_days': np.random.randint(0, 3, type5_size),
        'device_fingerprint': np.random.randint(1, 50, type5_size),
        'time_of_day': np.random.choice([2, 3, 4, 5], type5_size),
        'counterparty_trust_score': np.random.uniform(1, 15, type5_size)
    })
    
    # Combine all anomaly types
    anomalies = pd.concat([type1, type2, type3, type4, type5], ignore_index=True)
    
    return anomalies


def generate_synthetic_dataset(n_total=10000, anomaly_rate=0.05, output_file='synthetic_transactions.csv'):
    """
    Generate complete synthetic dataset with normal and anomalous transactions.
    
    Args:
        n_total: Total number of transactions to generate (5000-10000)
        anomaly_rate: Proportion of anomalous transactions (default 0.05 = 5%)
        output_file: Path to save the CSV file
        
    Returns:
        Tuple of (features_df, labels_array)
    """
    # Calculate split
    n_anomalies = int(n_total * anomaly_rate)
    n_normal = n_total - n_anomalies
    
    print(f"Generating synthetic dataset...")
    print(f"Total records: {n_total}")
    print(f"Normal transactions: {n_normal} ({(1-anomaly_rate)*100:.1f}%)")
    print(f"Anomalous transactions: {n_anomalies} ({anomaly_rate*100:.1f}%)")
    print()
    
    # Generate data
    print("Generating normal transactions...")
    normal_data = generate_normal_transactions(n_normal)
    
    print("Generating anomalous transactions...")
    anomalous_data = generate_anomalous_transactions(n_anomalies)
    
    # Combine datasets
    print("Combining and shuffling data...")
    combined_data = pd.concat([normal_data, anomalous_data], ignore_index=True)
    
    # Create labels (0 = normal, 1 = anomaly)
    labels = np.concatenate([
        np.zeros(n_normal, dtype=int),
        np.ones(n_anomalies, dtype=int)
    ])
    
    # Shuffle data and labels together
    shuffle_indices = np.random.permutation(n_total)
    combined_data = combined_data.iloc[shuffle_indices].reset_index(drop=True)
    labels = labels[shuffle_indices]
    
    # Add labels to dataframe for saving
    combined_data['is_anomaly'] = labels
    
    # Add metadata
    combined_data['generated_at'] = datetime.now().isoformat()
    
    # Save to CSV
    print(f"Saving dataset to {output_file}...")
    combined_data.to_csv(output_file, index=False)
    
    # Print statistics
    print("\n" + "="*60)
    print("Dataset Statistics")
    print("="*60)
    print(f"\nTotal records: {len(combined_data)}")
    print(f"Normal: {(labels == 0).sum()} ({(labels == 0).sum()/len(labels)*100:.1f}%)")
    print(f"Anomalies: {(labels == 1).sum()} ({(labels == 1).sum()/len(labels)*100:.1f}%)")
    
    print("\nFeature Statistics:")
    print("-" * 60)
    
    # Statistics by class
    for label, label_name in [(0, 'Normal'), (1, 'Anomaly')]:
        subset = combined_data[combined_data['is_anomaly'] == label]
        print(f"\n{label_name} Transactions:")
        print(f"  Transaction Amount:")
        print(f"    Mean: ₦{subset['transaction_amount'].mean():,.2f}")
        print(f"    Median: ₦{subset['transaction_amount'].median():,.2f}")
        print(f"    Range: ₦{subset['transaction_amount'].min():,.2f} - ₦{subset['transaction_amount'].max():,.2f}")
        
        print(f"  Transaction Velocity:")
        print(f"    Mean: {subset['transaction_velocity'].mean():.2f} txns/day")
        print(f"    Range: {subset['transaction_velocity'].min():.0f} - {subset['transaction_velocity'].max():.0f}")
        
        print(f"  Account Age:")
        print(f"    Mean: {subset['account_age_days'].mean():.1f} days")
        print(f"    Range: {subset['account_age_days'].min():.0f} - {subset['account_age_days'].max():.0f} days")
        
        print(f"  Time of Day:")
        print(f"    Mean: {subset['time_of_day'].mean():.1f}:00")
        print(f"    Range: {subset['time_of_day'].min():.0f}:00 - {subset['time_of_day'].max():.0f}:00")
        
        print(f"  Counterparty Trust Score:")
        print(f"    Mean: {subset['counterparty_trust_score'].mean():.1f}")
        print(f"    Range: {subset['counterparty_trust_score'].min():.1f} - {subset['counterparty_trust_score'].max():.1f}")
    
    print("\n" + "="*60)
    print(f"Dataset saved to: {output_file}")
    print("="*60)
    
    # Return features and labels separately (without metadata columns)
    features = combined_data.drop(['is_anomaly', 'generated_at'], axis=1)
    return features, labels


def main():
    """Main entry point for the script."""
    parser = argparse.ArgumentParser(
        description='Generate synthetic transaction data for AI Risk Engine training'
    )
    parser.add_argument(
        '--size',
        type=int,
        default=10000,
        help='Total number of transactions to generate (default: 10000)'
    )
    parser.add_argument(
        '--anomaly-rate',
        type=float,
        default=0.05,
        help='Proportion of anomalous transactions (default: 0.05)'
    )
    parser.add_argument(
        '--output',
        type=str,
        default='synthetic_transactions.csv',
        help='Output CSV file path (default: synthetic_transactions.csv)'
    )
    
    args = parser.parse_args()
    
    # Validate inputs
    if args.size < 1000 or args.size > 100000:
        print("Error: Size must be between 1,000 and 100,000")
        return
    
    if args.anomaly_rate < 0.01 or args.anomaly_rate > 0.5:
        print("Error: Anomaly rate must be between 0.01 and 0.5")
        return
    
    # Generate dataset
    generate_synthetic_dataset(
        n_total=args.size,
        anomaly_rate=args.anomaly_rate,
        output_file=args.output
    )


if __name__ == '__main__':
    main()
