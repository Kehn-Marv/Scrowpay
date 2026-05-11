# ScrowPay AI Risk Engine - Synthetic Data Generator

This directory contains the synthetic data generation script for training the Isolation Forest anomaly detection model used in ScrowPay's pre-transaction risk scoring system.

## Overview

The synthetic data generator creates realistic transaction data with the following characteristics:

- **Total Records**: 5,000 - 10,000 transactions
- **Normal Transactions**: 95% of dataset
- **Anomalous Transactions**: 5% of dataset
- **Features**: 6 transaction features for model training

## Features

The generated dataset includes the following features:

1. **transaction_amount** (float): Transaction value in Nigerian Naira (₦100 - ₦10,000,000)
2. **transaction_velocity** (int): Number of transactions in last 24 hours (0-50)
3. **account_age_days** (int): Days since account creation (0-365+)
4. **device_fingerprint** (int): Hash of device metadata (1-10000)
5. **time_of_day** (int): Hour of transaction (0-23)
6. **counterparty_trust_score** (float): Trust score of other party (1-100)

## Normal Transaction Patterns

Normal transactions follow realistic distributions:

- **Amounts**: Log-normal distribution (most transactions ₦1,000 - ₦100,000)
- **Velocity**: Poisson distribution (average 2 transactions/day)
- **Account Age**: Gamma distribution (most accounts 30-180 days old)
- **Time of Day**: Business hours (8 AM - 10 PM), weighted towards afternoon
- **Trust Score**: Normal distribution around 70

## Anomalous Transaction Patterns

Anomalies exhibit suspicious characteristics across 5 types:

### Type 1: High Amount + New Account
- Very high amounts (₦500k - ₦10M)
- New accounts (<7 days)
- Late night transactions (2-5 AM)
- Low trust scores (<30)

### Type 2: High Velocity + Low Trust
- Moderate to high amounts (₦50k - ₦500k)
- Very high velocity (15-50 transactions/day)
- Low trust counterparties (<20)

### Type 3: Late Night + High Amount
- High amounts (₦300k - ₦5M)
- Very new accounts (<5 days)
- Late night only (2-4 AM)

### Type 4: Extreme Velocity
- Extreme transaction frequency (25-50/day)
- Suspicious device patterns
- Very low trust scores

### Type 5: All Red Flags
- Extreme amounts (₦1M - ₦10M)
- Extreme velocity (30-50/day)
- Brand new accounts (0-3 days)
- Late night (2-5 AM)
- Very low trust (1-15)

## Installation

1. Install Python 3.11 or higher
2. Install dependencies:

```bash
pip install -r requirements.txt
```

## Usage

### Basic Usage

Generate a dataset with default settings (10,000 records, 5% anomalies):

```bash
python generate_synthetic_data.py
```

This creates `synthetic_transactions.csv` in the current directory.

### Custom Dataset Size

Generate a specific number of transactions:

```bash
python generate_synthetic_data.py --size 5000
```

### Custom Anomaly Rate

Generate with a different anomaly proportion:

```bash
python generate_synthetic_data.py --anomaly-rate 0.10
```

### Custom Output File

Specify a different output file:

```bash
python generate_synthetic_data.py --output data/training_data.csv
```

### Combined Options

```bash
python generate_synthetic_data.py --size 8000 --anomaly-rate 0.05 --output training_data.csv
```

## Output Format

The generated CSV file contains the following columns:

- `transaction_amount`: Float (₦)
- `transaction_velocity`: Integer (transactions/day)
- `account_age_days`: Float (days)
- `device_fingerprint`: Integer (device ID)
- `time_of_day`: Integer (0-23)
- `counterparty_trust_score`: Float (1-100)
- `is_anomaly`: Integer (0=normal, 1=anomaly) - **Label for evaluation only**
- `generated_at`: String (ISO timestamp)

**Note**: The `is_anomaly` label is included for model evaluation but should NOT be used as a training feature. The Isolation Forest algorithm is unsupervised and learns patterns without labels.

## Example Output

```
Generating synthetic dataset...
Total records: 10000
Normal transactions: 9500 (95.0%)
Anomalous transactions: 500 (5.0%)

Generating normal transactions...
Generating anomalous transactions...
Combining and shuffling data...
Saving dataset to synthetic_transactions.csv...

============================================================
Dataset Statistics
============================================================

Total records: 10000
Normal: 9500 (95.0%)
Anomalies: 500 (5.0%)

Feature Statistics:
------------------------------------------------------------

Normal Transactions:
  Transaction Amount:
    Mean: ₦45,234.67
    Median: ₦22,345.89
    Range: ₦100.00 - ₦987,654.32
  Transaction Velocity:
    Mean: 2.01 txns/day
    Range: 0 - 8
  Account Age:
    Mean: 89.3 days
    Range: 7 - 365 days
  Time of Day:
    Mean: 14.5:00
    Range: 8:00 - 22:00
  Counterparty Trust Score:
    Mean: 70.2
    Range: 35.4 - 99.8

Anomaly Transactions:
  Transaction Amount:
    Mean: ₦1,234,567.89
    Median: ₦678,901.23
    Range: ₦50,000.00 - ₦10,000,000.00
  Transaction Velocity:
    Mean: 25.4 txns/day
    Range: 2 - 50
  Account Age:
    Mean: 5.2 days
    Range: 0 - 30 days
  Time of Day:
    Mean: 3.8:00
    Range: 0:00 - 23:00
  Counterparty Trust Score:
    Mean: 18.7
    Range: 1.0 - 35.0

============================================================
Dataset saved to: synthetic_transactions.csv
============================================================
```

## Next Steps

After generating the synthetic data:

1. **Train the Model**: Use `train_model.py` to train the Isolation Forest model
2. **Evaluate Performance**: Check precision (≥80%) and recall (≥70%) metrics
3. **Deploy API**: Use the trained model in the Flask API for real-time scoring

## Requirements Validation

This generator satisfies the following requirements from the spec:

- ✅ **Requirement 15.1**: 5,000-10,000 transaction records
- ✅ **Requirement 15.2**: 5% anomalous transactions (250-500 anomalies)
- ✅ **Requirement 15.3**: All 6 required features included
- ✅ **Requirement 15.7**: Realistic distributions for normal transactions and clear outliers for anomalies

## Technical Details

### Random Seed

The generator uses fixed random seeds (42 for normal, 43 for anomalies) to ensure reproducibility. This means running the script multiple times with the same parameters will produce identical datasets.

### Distribution Choices

- **Log-normal for amounts**: Reflects real-world transaction patterns where most transactions are small/medium with a long tail of large transactions
- **Poisson for velocity**: Models discrete event counts (transactions per day)
- **Gamma for account age**: Creates right-skewed distribution with most accounts being established
- **Normal for trust scores**: Assumes trust scores cluster around average with some variation

### Anomaly Diversity

The generator creates 5 distinct anomaly types to ensure the model learns multiple suspicious patterns rather than overfitting to a single anomaly signature.

## Troubleshooting

### Import Errors

If you get import errors, ensure all dependencies are installed:

```bash
pip install -r requirements.txt
```

### Memory Issues

For very large datasets (>100,000 records), consider generating in batches or increasing available RAM.

### File Permission Errors

Ensure you have write permissions in the output directory.

## License

This code is part of the ScrowPay hackathon project.
