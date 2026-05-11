# Quick Start Guide - Synthetic Data Generator

## 🚀 Get Started in 3 Steps

### Step 1: Install Dependencies

```bash
cd ai-engine
pip install -r requirements.txt
```

### Step 2: Generate Data

```bash
python generate_synthetic_data.py
```

This creates `synthetic_transactions.csv` with 10,000 transaction records.

### Step 3: Validate Data

```bash
python validate_dataset.py synthetic_transactions.csv
```

## 📊 What You Get

A CSV file with 6 transaction features:

| Feature | Description | Range |
|---------|-------------|-------|
| transaction_amount | Transaction value in ₦ | 100 - 10,000,000 |
| transaction_velocity | Transactions per day | 0 - 50 |
| account_age_days | Days since account creation | 0 - 365+ |
| device_fingerprint | Device identifier | 1 - 10,000 |
| time_of_day | Hour of transaction | 0 - 23 |
| counterparty_trust_score | Other party's trust score | 1 - 100 |

Plus labels:
- `is_anomaly`: 0 (normal) or 1 (anomaly)
- `generated_at`: Timestamp

## 🎯 Common Use Cases

### Generate Training Data (10,000 records)
```bash
python generate_synthetic_data.py --size 10000 --output training_data.csv
```

### Generate Test Data (2,000 records)
```bash
python generate_synthetic_data.py --size 2000 --output test_data.csv
```

### Generate with Higher Anomaly Rate (10%)
```bash
python generate_synthetic_data.py --anomaly-rate 0.10
```

## 📈 Expected Output

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
  ...

============================================================
Dataset saved to: synthetic_transactions.csv
============================================================
```

## ✅ Validation Checklist

Run the validator to ensure your dataset meets requirements:

```bash
python validate_dataset.py synthetic_transactions.csv
```

The validator checks:
- ✓ Total records: 5,000-10,000
- ✓ Anomaly rate: 4-6%
- ✓ All 6 features present
- ✓ Valid value ranges
- ✓ Realistic distributions
- ✓ No missing values

## 🔧 Troubleshooting

### "ModuleNotFoundError: No module named 'numpy'"
```bash
pip install -r requirements.txt
```

### "Permission denied" when saving
```bash
python generate_synthetic_data.py --output ~/data/transactions.csv
```

### Need help?
Check the full documentation:
- `README.md` - Complete documentation
- `INSTALLATION.md` - Detailed installation guide

## 📝 Next Steps

After generating data:

1. **Review the CSV**: Open in Excel or pandas to inspect
2. **Train Model**: Use the data to train Isolation Forest
3. **Evaluate**: Check precision (≥80%) and recall (≥70%)
4. **Deploy**: Integrate with Flask API for real-time scoring

## 💡 Pro Tips

- Use `--size 5000` for faster generation during development
- Use `--size 10000` for final training dataset
- Keep anomaly rate at 5% (matches real-world fraud rates)
- Generate separate train/test splits for proper evaluation

## 📚 Requirements Met

This generator satisfies:
- ✅ Requirement 15.1: 5,000-10,000 records
- ✅ Requirement 15.2: 5% anomalies (250-500)
- ✅ Requirement 15.3: All 6 features
- ✅ Requirement 15.7: Realistic distributions
