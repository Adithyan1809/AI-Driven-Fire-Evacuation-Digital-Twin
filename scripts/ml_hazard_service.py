"""
ML HAZARD VALIDATION & EVALUATION SERVICE (Python / Gradient Boosting)
----------------------------------------------------------------------
Trains an offline reference tabular gradient boosted tree classifier
on synthetic sensor time-series data using scenario-level train/val/test splits.

Evaluates:
  - Accuracy, Precision, Recall, F1, ROC-AUC
  - Full Confusion Matrix (TN, FP, FN, TP)
  - Critical Life-Safety False Negative Rate (FNR)
  - Feature Importances
"""

import sys
import os
import json
import numpy as np

def train_and_evaluate_model():
    try:
        from sklearn.ensemble import GradientBoostingClassifier
        from sklearn.metrics import (
            accuracy_score, precision_score, recall_score, f1_score,
            roc_auc_score, confusion_matrix
        )
    except ImportError:
        print("[ML Service] sklearn not available, skipping Python training.")
        return None

    dataset_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'datasets', 'synthetic_hazard_dataset.json')
    if not os.path.exists(dataset_path):
        print(f"[ML Service] Dataset file not found at {dataset_path}, run synthetic_dataset_generator.mjs first.")
        return None

    with open(dataset_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    train_data = data.get('train', [])
    val_data = data.get('val', [])
    test_data = data.get('test', [])

    feature_keys = [
        'temperature', 'temperature_rate', 'smoke', 'smoke_rate',
        'occupancy', 'distance_from_fire', 'time_since_alarm', 'neighbor_hazard_count'
    ]

    def extract_xy(records):
        X = []
        y = []
        for r in records:
            feats = [
                float(r['temperature']),
                float(r['temperature_rate']),
                float(r['smoke']),
                float(r['smoke_rate']),
                float(r['occupancy']),
                float(r['distance_from_fire']),
                float(r['time_since_alarm']),
                float(r['neighbor_hazard_count']),
            ]
            X.append(feats)
            y.append(int(r['ground_truth_future_hazard_15s']))
        return np.array(X), np.array(y)

    X_train, y_train = extract_xy(train_data)
    X_val, y_val = extract_xy(val_data)
    X_test, y_test = extract_xy(test_data)

    print(f"[ML Service] Training on {len(X_train)} samples across 20 training scenarios...")
    clf = GradientBoostingClassifier(
        n_estimators=60,
        max_depth=4,
        learning_rate=0.1,
        random_state=42
    )
    clf.fit(X_train, y_train)

    print(f"[ML Service] Evaluating on {len(X_test)} unseen test samples across 10 distinct test scenarios...")
    test_preds = clf.predict(X_test)
    test_probs = clf.predict_proba(X_test)[:, 1]

    acc = accuracy_score(y_test, test_preds)
    prec = precision_score(y_test, test_preds, zero_division=0)
    rec = recall_score(y_test, test_preds, zero_division=0)
    f1 = f1_score(y_test, test_preds, zero_division=0)
    auc = roc_auc_score(y_test, test_probs)

    cm = confusion_matrix(y_test, test_preds)
    tn, fp, fn, tp = cm.ravel()
    fnr = fn / (tp + fn) if (tp + fn) > 0 else 0.0

    importances = dict(zip(feature_keys, [round(float(v), 4) for v in clf.feature_importances_]))

    result = {
        "model_architecture": "GradientBoostingClassifier (Scikit-Learn Offline Reference)",
        "prediction_horizon_seconds": 15,
        "dataset_split_methodology": "Scenario-Level Disjoint Partitioning (Zero Temporal Leakage)",
        "training_samples": len(X_train),
        "validation_samples": len(X_val),
        "unseen_test_samples": len(X_test),
        "metrics": {
            "accuracy": round(float(acc), 4),
            "precision": round(float(prec), 4),
            "recall": round(float(rec), 4),
            "f1_score": round(float(f1), 4),
            "roc_auc": round(float(auc), 4),
            "false_negative_rate": round(float(fnr), 4),
        },
        "confusion_matrix": {
            "true_negatives": int(tn),
            "false_positives": int(fp),
            "false_negatives": int(fn),
            "true_positives": int(tp)
        },
        "feature_importances": importances,
        "safety_audit": {
            "false_negatives_comment": f"{int(fn)} false negatives observed out of {int(tp + fn)} actual hazardous instances ({round(fnr * 100, 2)}% FNR).",
            "runtime_safety_guarantee": "Deterministic HazardEngine overrides ML predictions if physical thresholds are breached."
        }
    }

    print("\n" + "=" * 64)
    print("  📊 OFFLINE ML MODEL EVALUATION REPORT (UNSEEN TEST SCENARIOS)")
    print("=" * 64)
    print(json.dumps(result, indent=2))
    print("=" * 64 + "\n")
    return result

if __name__ == "__main__":
    train_and_evaluate_model()
