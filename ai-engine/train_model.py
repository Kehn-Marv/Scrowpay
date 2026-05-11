"""
Isolation Forest Model Training Script for ScrowPay AI Risk Engine

This script trains an Isolation Forest model on synthetic transaction data
for anomaly detection. The model is configured to detect fraudulent transactions
before funds are locked in escrow.

Requirements:
- Precision: ≥80%
- Recall: ≥70%
- Contamination: 0.05 (5% anomalies)
- n_estimators: 100
- random_state: 42
"""

import numpy as np
import pandas as pd
import joblib
import argparse
from sklearn.ensemble import IsolationForest
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    precision_score, 
    recall_score, 
    f1_score, 
    confusion_matrix,
    classification_report
)
from sklearn.preprocessing import StandardScaler
from datetime import datetime
import os


def load_dataset(filepath='synthetic_transactions.csv'):
    """
    Load synthetic transaction dataset from CSV.
    
    Args:
        filepath: Path to the CSV file
        
    Returns:
        Tuple of (features_df, labels_array)
    """
    print(f"Loading dataset from {filepath}...")
    
    if not os.path.exists(filepath):
        raise FileNotFoundError(
            f"Dataset not found: {filepath}\n"
            f"Please run: python generate_synthetic_data.py"
        )
    
    # Load data
    df = pd.read_csv(filepath)
    
    # Validate required columns
    required_features = [
        'transaction_amount',
        'transaction_velocity',
        'account_age_days',
        'device_fingerprint',
        'time_of_day',
        'counterparty_trust_score'
    ]
    
    missing_features = [f for f in required_features if f not in df.columns]
    if missing_features:
        raise ValueError(f"Missing required features: {missing_features}")
    
    if 'is_anomaly' not in df.columns:
        raise ValueError("Missing 'is_anomaly' label column")
    
    # Extract features and labels
    X = df[required_features]
    y = df['is_anomaly'].values
    
    print(f"Dataset loaded successfully")
    print(f"  Total records: {len(df)}")
    print(f"  Normal: {(y == 0).sum()} ({(y == 0).sum()/len(y)*100:.1f}%)")
    print(f"  Anomalies: {(y == 1).sum()} ({(y == 1).sum()/len(y)*100:.1f}%)")
    print()
    
    return X, y


def preprocess_features(X_train, X_test):
    """
    Preprocess features with log transformation and standardization.
    
    Args:
        X_train: Training features
        X_test: Test features
        
    Returns:
        Tuple of (X_train_scaled, X_test_scaled, scaler)
    """
    print("Preprocessing features...")
    
    # Create copies to avoid modifying originals
    X_train_processed = X_train.copy()
    X_test_processed = X_test.copy()
    
    # Log transform transaction amount (reduces skewness)
    X_train_processed['transaction_amount'] = np.log1p(X_train_processed['transaction_amount'])
    X_test_processed['transaction_amount'] = np.log1p(X_test_processed['transaction_amount'])
    
    # Standardize all features (zero mean, unit variance)
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train_processed)
    X_test_scaled = scaler.transform(X_test_processed)
    
    print("  ✓ Log transformation applied to transaction_amount")
    print("  ✓ Standardization applied to all features")
    print()
    
    return X_train_scaled, X_test_scaled, scaler


def train_isolation_forest(X_train, contamination=0.05, n_estimators=100, random_state=42):
    """
    Train Isolation Forest model with specified configuration.
    
    Args:
        X_train: Training features (preprocessed)
        contamination: Expected proportion of anomalies (default 0.05)
        n_estimators: Number of trees (default 100)
        random_state: Random seed for reproducibility (default 42)
        
    Returns:
        Trained IsolationForest model
    """
    print("Training Isolation Forest model...")
    print(f"  Configuration:")
    print(f"    n_estimators: {n_estimators}")
    print(f"    contamination: {contamination}")
    print(f"    random_state: {random_state}")
    print(f"    max_samples: auto")
    print(f"    n_jobs: -1 (use all CPU cores)")
    print()
    
    # Initialize model
    model = IsolationForest(
        n_estimators=n_estimators,
        contamination=contamination,
        max_samples='auto',
        random_state=random_state,
        n_jobs=-1,
        verbose=0
    )
    
    # Train model
    print("  Training in progress...")
    model.fit(X_train)
    print("  ✓ Training complete")
    print()
    
    return model


def evaluate_model(model, X_test, y_test):
    """
    Evaluate model performance on test set.
    
    Args:
        model: Trained IsolationForest model
        X_test: Test features (preprocessed)
        y_test: Test labels (0=normal, 1=anomaly)
        
    Returns:
        Dictionary of evaluation metrics
    """
    print("Evaluating model on test set...")
    print()
    
    # Make predictions
    # IsolationForest returns: 1 for inliers (normal), -1 for outliers (anomaly)
    predictions = model.predict(X_test)
    
    # Convert to binary labels: 0=normal, 1=anomaly
    y_pred = (predictions == -1).astype(int)
    
    # Calculate metrics
    precision = precision_score(y_test, y_pred)
    recall = recall_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred)
    
    # Confusion matrix
    tn, fp, fn, tp = confusion_matrix(y_test, y_pred).ravel()
    
    # Calculate additional metrics
    accuracy = (tp + tn) / (tp + tn + fp + fn)
    specificity = tn / (tn + fp) if (tn + fp) > 0 else 0
    
    # Print results
    print("="*60)
    print("Model Performance Metrics")
    print("="*60)
    print()
    print(f"Precision:   {precision:.2%}  {'✓ PASS' if precision >= 0.80 else '✗ FAIL'} (target: ≥80%)")
    print(f"Recall:      {recall:.2%}  {'✓ PASS' if recall >= 0.70 else '✗ FAIL'} (target: ≥70%)")
    print(f"F1 Score:    {f1:.2%}")
    print(f"Accuracy:    {accuracy:.2%}")
    print(f"Specificity: {specificity:.2%}")
    print()
    
    print("Confusion Matrix:")
    print("-"*60)
    print(f"                 Predicted Normal  Predicted Anomaly")
    print(f"Actual Normal    {tn:>16}  {fp:>17}")
    print(f"Actual Anomaly   {fn:>16}  {tp:>17}")
    print()
    
    print("Interpretation:")
    print(f"  True Positives (TP):  {tp:>5} - Correctly identified anomalies")
    print(f"  True Negatives (TN):  {tn:>5} - Correctly identified normal transactions")
    print(f"  False Positives (FP): {fp:>5} - Normal flagged as anomaly (false alarm)")
    print(f"  False Negatives (FN): {fn:>5} - Anomaly missed (dangerous!)")
    print()
    
    # Classification report
    print("Detailed Classification Report:")
    print("-"*60)
    print(classification_report(
        y_test, 
        y_pred, 
        target_names=['Normal', 'Anomaly'],
        digits=4
    ))
    
    # Check if requirements are met
    requirements_met = precision >= 0.80 and recall >= 0.70
    
    if requirements_met:
        print("="*60)
        print("✓ MODEL MEETS REQUIREMENTS")
        print("="*60)
    else:
        print("="*60)
        print("✗ MODEL DOES NOT MEET REQUIREMENTS")
        print("="*60)
        if precision < 0.80:
            print(f"  Precision is {precision:.2%}, needs to be ≥80%")
        if recall < 0.70:
            print(f"  Recall is {recall:.2%}, needs to be ≥70%")
    
    print()
    
    # Return metrics
    return {
        'precision': precision,
        'recall': recall,
        'f1_score': f1,
        'accuracy': accuracy,
        'specificity': specificity,
        'confusion_matrix': {
            'tn': int(tn),
            'fp': int(fp),
            'fn': int(fn),
            'tp': int(tp)
        },
        'requirements_met': requirements_met
    }


def save_model(model, scaler, metrics, output_dir='models'):
    """
    Save trained model, scaler, and metadata to disk.
    
    Args:
        model: Trained IsolationForest model
        scaler: Fitted StandardScaler
        metrics: Dictionary of evaluation metrics
        output_dir: Directory to save files (default: 'models')
    """
    print(f"Saving model to {output_dir}/...")
    
    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    # Save model
    model_path = os.path.join(output_dir, 'isolation_forest_model.pkl')
    joblib.dump(model, model_path)
    print(f"  ✓ Model saved: {model_path}")
    
    # Save scaler
    scaler_path = os.path.join(output_dir, 'feature_scaler.pkl')
    joblib.dump(scaler, scaler_path)
    print(f"  ✓ Scaler saved: {scaler_path}")
    
    # Save metadata
    metadata = {
        'model_version': '1.0.0',
        'trained_at': datetime.now().isoformat(),
        'configuration': {
            'n_estimators': model.n_estimators,
            'contamination': model.contamination,
            'random_state': model.random_state,
            'max_samples': model.max_samples
        },
        'performance': metrics,
        'features': [
            'transaction_amount',
            'transaction_velocity',
            'account_age_days',
            'device_fingerprint',
            'time_of_day',
            'counterparty_trust_score'
        ],
        'preprocessing': {
            'log_transform': ['transaction_amount'],
            'standardization': 'all_features'
        }
    }
    
    metadata_path = os.path.join(output_dir, 'model_metadata.pkl')
    joblib.dump(metadata, metadata_path)
    print(f"  ✓ Metadata saved: {metadata_path}")
    print()


def main():
    """Main entry point for the training script."""
    parser = argparse.ArgumentParser(
        description='Train Isolation Forest model for transaction anomaly detection'
    )
    parser.add_argument(
        '--data',
        type=str,
        default='synthetic_transactions.csv',
        help='Path to synthetic dataset CSV (default: synthetic_transactions.csv)'
    )
    parser.add_argument(
        '--output',
        type=str,
        default='models',
        help='Output directory for model files (default: models)'
    )
    parser.add_argument(
        '--test-size',
        type=float,
        default=0.2,
        help='Proportion of data for testing (default: 0.2)'
    )
    parser.add_argument(
        '--contamination',
        type=float,
        default=0.05,
        help='Expected anomaly rate (default: 0.05)'
    )
    parser.add_argument(
        '--n-estimators',
        type=int,
        default=100,
        help='Number of trees (default: 100)'
    )
    parser.add_argument(
        '--random-state',
        type=int,
        default=42,
        help='Random seed (default: 42)'
    )
    
    args = parser.parse_args()
    
    print("="*60)
    print("ScrowPay AI Risk Engine - Model Training")
    print("="*60)
    print()
    
    try:
        # Step 1: Load dataset
        X, y = load_dataset(args.data)
        
        # Step 2: Split into train/test sets
        print(f"Splitting data (train: {1-args.test_size:.0%}, test: {args.test_size:.0%})...")
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, 
            test_size=args.test_size, 
            random_state=args.random_state,
            stratify=y  # Maintain class distribution
        )
        print(f"  Train set: {len(X_train)} records")
        print(f"  Test set:  {len(X_test)} records")
        print()
        
        # Step 3: Preprocess features
        X_train_scaled, X_test_scaled, scaler = preprocess_features(X_train, X_test)
        
        # Step 4: Train model
        model = train_isolation_forest(
            X_train_scaled,
            contamination=args.contamination,
            n_estimators=args.n_estimators,
            random_state=args.random_state
        )
        
        # Step 5: Evaluate model
        metrics = evaluate_model(model, X_test_scaled, y_test)
        
        # Step 6: Save model
        save_model(model, scaler, metrics, args.output)
        
        # Final summary
        print("="*60)
        print("Training Complete")
        print("="*60)
        print()
        print("Next steps:")
        print("  1. Review model performance metrics above")
        print("  2. If requirements are met, proceed to Task 4.3 (Flask API)")
        print("  3. If not, consider:")
        print("     - Generating more training data")
        print("     - Adjusting contamination parameter")
        print("     - Tuning n_estimators")
        print()
        print(f"Model files saved in: {args.output}/")
        print("  - isolation_forest_model.pkl")
        print("  - feature_scaler.pkl")
        print("  - model_metadata.pkl")
        print()
        
        # Exit with appropriate code
        if metrics['requirements_met']:
            print("✓ Ready for deployment!")
            return 0
        else:
            print("⚠ Model needs improvement before deployment")
            return 1
            
    except Exception as e:
        print(f"\n✗ Error: {e}")
        return 1


if __name__ == '__main__':
    exit(main())
