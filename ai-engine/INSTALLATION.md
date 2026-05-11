# Installation Guide for AI Risk Engine

## Prerequisites

- Python 3.11 or higher
- pip (Python package manager)

## Installation Steps

### 1. Create Virtual Environment (Recommended)

```bash
# Navigate to the ai-engine directory
cd ai-engine

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

This will install:
- numpy (1.26.2) - Numerical computing
- pandas (2.1.4) - Data manipulation
- scikit-learn (1.3.2) - Machine learning
- joblib (1.3.2) - Model persistence
- flask (3.0.0) - Web framework

### 3. Verify Installation

```bash
python -c "import numpy, pandas, sklearn; print('All dependencies installed successfully!')"
```

### 4. Generate Synthetic Data

```bash
# Generate default dataset (10,000 records)
python generate_synthetic_data.py

# Or with custom parameters
python generate_synthetic_data.py --size 5000 --anomaly-rate 0.05 --output training_data.csv
```

## Quick Start

After installation, generate your first dataset:

```bash
python generate_synthetic_data.py --size 5000
```

This will create `synthetic_transactions.csv` with 5,000 transaction records (4,750 normal, 250 anomalies).

## Troubleshooting

### Issue: "ModuleNotFoundError: No module named 'numpy'"

**Solution**: Install dependencies using pip:
```bash
pip install -r requirements.txt
```

### Issue: "Permission denied" when saving CSV

**Solution**: Ensure you have write permissions in the current directory, or specify a different output path:
```bash
python generate_synthetic_data.py --output ~/data/transactions.csv
```

### Issue: Virtual environment not activating

**Solution**: 
- On Windows, you may need to enable script execution:
  ```powershell
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```
- Then try activating again:
  ```bash
  venv\Scripts\activate
  ```

## Next Steps

After generating synthetic data:

1. Review the generated CSV file to understand the data structure
2. Proceed to train the Isolation Forest model (see `train_model.py`)
3. Deploy the Flask API for real-time risk scoring

## System Requirements

- **RAM**: Minimum 2GB (4GB recommended for datasets >10,000 records)
- **Disk Space**: ~50MB for dependencies, ~10MB per 10,000 records
- **CPU**: Any modern processor (multi-core recommended for faster generation)
