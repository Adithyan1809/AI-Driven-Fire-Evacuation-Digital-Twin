/**
 * ML MODEL SCIENTIFIC EVALUATION & LEAD-TIME BENCHMARK
 *
 * Evaluates the runtime predictive hazard scoring model against the
 * unseen test scenarios from the deterministic synthetic dataset.
 *
 * Metrics Computed:
 *   - Accuracy, Precision, Recall, F1-Score, ROC-AUC
 *   - Confusion Matrix (TN, FP, FN, TP)
 *   - Critical False Negative Rate (FNR = FN / (TP + FN))
 *   - Lead-Time Metrics (Mean, Median, Min, Max seconds of early warning before deterministic hazard)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MLHazardPredictor, PREDICTION_STATE } from '../modules/mlHazardPredictor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function evaluateModel() {
  const datasetPath = path.join(__dirname, '..', 'data', 'datasets', 'synthetic_hazard_dataset.json');
  if (!fs.existsSync(datasetPath)) {
    console.error(`Dataset not found at ${datasetPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(datasetPath, 'utf8');
  const dataset = JSON.parse(raw);
  const testData = dataset.test || [];

  const predictor = new MLHazardPredictor({ horizonSeconds: 15 });

  let tp = 0, fp = 0, tn = 0, fn = 0;
  const probabilities = [];
  const actuals = [];

  testData.forEach(r => {
    const features = {
      spaceId: r.space_id,
      temperature: r.temperature,
      temperature_rate: r.temperature_rate,
      smoke: r.smoke,
      smoke_rate: r.smoke_rate,
      occupancy: r.occupancy,
      distance_from_fire: r.distance_from_fire,
      time_since_alarm: r.time_since_alarm,
      neighbor_hazard_count: r.neighbor_hazard_count,
      room_type: r.room_type,
    };

    const pred = predictor.predict(features);
    const predBinary = (pred.predictedState === PREDICTION_STATE.PREDICTED_WARNING || pred.predictedState === PREDICTION_STATE.PREDICTED_CRITICAL || pred.predictedRisk >= 0.50) ? 1 : 0;
    const actual = r.ground_truth_future_hazard_15s;

    probabilities.push({ score: pred.predictedRisk, actual });
    actuals.push(actual);

    if (predBinary === 1 && actual === 1) tp++;
    else if (predBinary === 1 && actual === 0) fp++;
    else if (predBinary === 0 && actual === 0) tn++;
    else if (predBinary === 0 && actual === 1) fn++;
  });

  const total = tp + fp + tn + fn;
  const accuracy = (tp + tn) / total;
  const precision = tp / (tp + fp) || 0;
  const recall = tp / (tp + fn) || 0;
  const f1 = (2 * precision * recall) / (precision + recall) || 0;
  const fnr = fn / (tp + fn) || 0;

  // Calculate ROC-AUC via trapezoidal integration of sorted true positive / false positive rates
  probabilities.sort((a, b) => b.score - a.score);
  let numPos = actuals.filter(a => a === 1).length;
  let numNeg = actuals.filter(a => a === 0).length;

  let auc = 0.5;
  if (numPos > 0 && numNeg > 0) {
    let tpCount = 0;
    let fpCount = 0;
    let prevFp = 0;
    let prevTp = 0;
    let area = 0;

    for (const p of probabilities) {
      if (p.actual === 1) tpCount++;
      else fpCount++;

      const tpr = tpCount / numPos;
      const fpr = fpCount / numNeg;
      area += (fpr - prevFp) * (tpr + prevTp) / 2;
      prevFp = fpr;
      prevTp = tpr;
    }
    auc = area;
  }

  // ── Lead-Time Metric Calculation ───────────────────────────────────────
  // For each scenario in test set, calculate the time of first PREDICTED_WARNING vs actual deterministic CRITICAL
  const leadTimes = [];
  const scenarioGroups = {};

  testData.forEach(r => {
    scenarioGroups[r.scenario_id] = scenarioGroups[r.scenario_id] || {};
    scenarioGroups[r.scenario_id][r.space_id] = scenarioGroups[r.scenario_id][r.space_id] || [];
    scenarioGroups[r.scenario_id][r.space_id].push(r);
  });

  for (const [scId, spaces] of Object.entries(scenarioGroups)) {
    for (const [spId, timeSeries] of Object.entries(spaces)) {
      timeSeries.sort((a, b) => a.timestamp - b.timestamp);

      let predWarningTime = null;
      let actualHazardTime = null;

      for (const pt of timeSeries) {
        const feats = {
          spaceId: spId,
          temperature: pt.temperature,
          temperature_rate: pt.temperature_rate,
          smoke: pt.smoke,
          smoke_rate: pt.smoke_rate,
          distance_from_fire: pt.distance_from_fire,
          time_since_alarm: pt.time_since_alarm,
          neighbor_hazard_count: pt.neighbor_hazard_count,
          room_type: pt.room_type,
        };
        const p = predictor.predict(feats);
        if (predWarningTime === null && (p.predictedState === PREDICTION_STATE.PREDICTED_WARNING || p.predictedState === PREDICTION_STATE.PREDICTED_CRITICAL)) {
          predWarningTime = pt.timestamp;
        }
        if (actualHazardTime === null && (pt.temperature >= 50.0 || pt.smoke >= 0.25)) {
          actualHazardTime = pt.timestamp;
        }
      }

      if (predWarningTime !== null && actualHazardTime !== null && actualHazardTime >= predWarningTime) {
        const lead = actualHazardTime - predWarningTime;
        leadTimes.push(lead);
      }
    }
  }

  leadTimes.sort((a, b) => a - b);
  const meanLeadTime = leadTimes.length ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : 0;
  const medianLeadTime = leadTimes.length ? leadTimes[Math.floor(leadTimes.length / 2)] : 0;
  const minLeadTime = leadTimes.length ? leadTimes[0] : 0;
  const maxLeadTime = leadTimes.length ? leadTimes[leadTimes.length - 1] : 0;

  const report = {
    model_architecture: "Calibrated Tabular Logit-Sigmoid Predictive Hazard Engine (Runtime)",
    prediction_horizon_seconds: 15,
    evaluation_split: "Unseen Test Scenarios 26-35 (Zero Temporal Leakage)",
    test_sample_count: total,
    metrics: {
      accuracy: +accuracy.toFixed(4),
      precision: +precision.toFixed(4),
      recall: +recall.toFixed(4),
      f1_score: +f1.toFixed(4),
      roc_auc: +auc.toFixed(4),
      false_negative_rate: +fnr.toFixed(4),
    },
    confusion_matrix: {
      true_negatives: tn,
      false_positives: fp,
      false_negatives: fn,
      true_positives: tp,
    },
    lead_time_seconds: {
      sample_count: leadTimes.length,
      mean: +meanLeadTime.toFixed(2),
      median: +medianLeadTime.toFixed(2),
      min: +minLeadTime.toFixed(2),
      max: +maxLeadTime.toFixed(2),
    },
    safety_boundary_audit: {
      advisory_only: true,
      hard_safety_override: "PROHIBITED — Deterministic safety rules maintain authoritative control over BLOCKED states (+Infinity).",
    }
  };

  const outDir = path.join(__dirname, '..', 'experiments');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'model_evaluation_report.json');
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

  console.log('================================================================');
  console.log('  📊 ML PREDICTIVE HAZARD SCIENTIFIC EVALUATION REPORT          ');
  console.log('================================================================');
  console.log(JSON.stringify(report, null, 2));
  console.log('================================================================\n');

  return report;
}

if (process.argv[1] && process.argv[1].endsWith('evaluate_ml_model.mjs')) {
  evaluateModel();
}
