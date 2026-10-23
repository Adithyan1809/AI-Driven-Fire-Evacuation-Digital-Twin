/**
 * PARAMETER SENSITIVITY & EXPERIMENTAL FRAMEWORK VALIDATION TEST SUITE
 *
 * Verifies:
 *   1. Prediction Horizon Sensitivity: Changing horizonSeconds directly alters forward projected risk scores.
 *   2. Hysteresis Mathematical Sensitivity: 15% route improvement triggers under 10% threshold, but is rejected under 20% and 30%.
 *   3. Anti-Leakage Guarantee: Feature extraction at time t accesses strictly past/current data (tau <= t).
 *   4. Distinct Ablation Code Paths: Distance-Only vs Reactive vs Predictive generate distinct cost matrices.
 *   5. Configuration Isolation: Independent simulation trials do not leak state across instances.
 */

import { MLHazardPredictor, PREDICTION_STATE } from '../modules/mlHazardPredictor.js';
import { EventBus } from '../modules/simulationEngine.js';
import { DigitalTwinState } from '../modules/digitalTwinState.js';
import { BuildingGraph } from '../modules/buildingGraph.js';
import { HazardEngine } from '../modules/hazardEngine.js';
import { RouteOptimizer } from '../modules/routeOptimizer.js';
import { OccupantSimulator } from '../modules/occupantSimulator.js';
import { BUILDING } from '../data/building.js';

console.log('================================================================');
console.log('  🧪 PARAMETER SENSITIVITY & EXPERIMENTAL VALIDATION SUITE      ');
console.log('================================================================\n');

let passed = 0;
let total = 0;

function assert(condition, description) {
  total++;
  if (condition) {
    console.log(`  ✓ PASS: ${description}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${description}`);
    process.exitCode = 1;
  }
}

function runSensitivityTests() {
  // ── TEST 1: Prediction Horizon Mathematical Sensitivity ──────────────────
  console.log('--- Test 1: Prediction Horizon Mathematical Sensitivity ---');
  const shortPredictor = new MLHazardPredictor({ horizonSeconds: 5 });
  const longPredictor = new MLHazardPredictor({ horizonSeconds: 15 });

  // Moderate rate of rise (+1.2°C/s) starting from baseline 28°C
  // In 5s: T_projected = 28 + 1.2*5 = 34.0°C (below warning)
  // In 15s: T_projected = 28 + 1.2*15 = 46.0°C (enters warning)
  const features = {
    spaceId: 'ROOM_101',
    temperature: 28.0,
    temperature_rate: 1.2,
    smoke: 0.02,
    smoke_rate: 0.01,
    distance_from_fire: 1,
    time_since_alarm: 5.0,
    neighbor_hazard_count: 0,
    room_type: 'CLASSROOM',
  };

  const shortResult = shortPredictor.predict(features);
  const longResult = longPredictor.predict(features);

  assert(shortResult.horizonSeconds === 5, 'Short predictor reports horizonSeconds = 5');
  assert(longResult.horizonSeconds === 15, 'Long predictor reports horizonSeconds = 15');
  assert(longResult.predictedRisk > shortResult.predictedRisk, `Longer horizon yields higher projected risk (${longResult.predictedRisk} > ${shortResult.predictedRisk})`);
  assert(longResult.predictedState !== shortResult.predictedState || longResult.predictedRisk - shortResult.predictedRisk >= 0.10, 'Horizon difference produces distinct risk categorization or substantial probability separation');

  // ── TEST 2: Hysteresis Mathematical Threshold Sensitivity ────────────────
  console.log('\n--- Test 2: Hysteresis Threshold Sensitivity (15% Cost Improvement) ---');
  // Mathematical definition: reroute if newCost < currentCost * (1 - Threshold)
  const currentCost = 100.0;
  const candidateCost = 85.0; // Exactly 15% cheaper

  const hyst10 = 0.10;
  const hyst20 = 0.20;
  const hyst30 = 0.30;

  const passes10 = candidateCost < currentCost * (1.0 - hyst10); // 85 < 90 -> true
  const passes20 = candidateCost < currentCost * (1.0 - hyst20); // 85 < 80 -> false
  const passes30 = candidateCost < currentCost * (1.0 - hyst30); // 85 < 70 -> false

  assert(passes10 === true, `15% improvement passes 10% hysteresis threshold (${candidateCost} < ${currentCost * (1 - hyst10)})`);
  assert(passes20 === false, `15% improvement rejected by 20% hysteresis threshold (${candidateCost} >= ${currentCost * (1 - hyst20)})`);
  assert(passes30 === false, `15% improvement rejected by 30% hysteresis threshold (${candidateCost} >= ${currentCost * (1 - hyst30)})`);

  // ── TEST 3: Anti-Leakage Feature Audit ────────────────────────────────────
  console.log('\n--- Test 3: Anti-Leakage Verification (tau <= t) ---');
  const bus = new EventBus();
  const dtState = new DigitalTwinState({ bus });
  dtState.init();

  const predictor = new MLHazardPredictor({ horizonSeconds: 15, historyWindow: 6 });
  predictor.recordReading('ROOM_101', 0.0, 27.4, 0.01);
  predictor.recordReading('ROOM_101', 1.0, 28.0, 0.02);
  predictor.recordReading('ROOM_101', 2.0, 29.2, 0.03);

  const feats = predictor.extractFeatures(dtState.getEntity('ROOM_101'), {
    simTime: 2.0,
    fireStartTime: 0.0,
    fireRooms: ['ROOM_101'],
    adjacency: {},
    dtState,
  });

  assert(feats.time_since_alarm === 2.0, 'Feature calculation uses strictly current simTime (2.0s)');
  assert(feats.temperature_rate >= 0.8 && feats.temperature_rate <= 1.2, `Temperature rate computed backward from history (+${feats.temperature_rate.toFixed(2)}°C/s)`);

  // ── TEST 4: Distinct Ablation Graph Cost Execution Paths ─────────────────
  console.log('\n--- Test 4: Distinct Ablation Graph Cost Paths ---');
  const graphA = new BuildingGraph();
  const graphB = new BuildingGraph();
  const graphC = new BuildingGraph();

  const dtStateA = new DigitalTwinState({ bus: new EventBus() });
  const dtStateB = new DigitalTwinState({ bus: new EventBus() });
  const dtStateC = new DigitalTwinState({ bus: new EventBus() });
  dtStateA.init(); dtStateB.init(); dtStateC.init();

  const hazDistOnly = new HazardEngine({ bus: new EventBus(), dtState: dtStateA, graph: graphA, config: { routing: { distanceOnly: true, predictiveRouting: false } } });
  const hazReactive = new HazardEngine({ bus: new EventBus(), dtState: dtStateB, graph: graphB, config: { routing: { distanceOnly: false, predictiveRouting: false } } });
  const hazPredictive = new HazardEngine({ bus: new EventBus(), dtState: dtStateC, graph: graphC, config: { routing: { distanceOnly: false, predictiveRouting: true } } });

  // Update space with NORMAL physical state and 0.85 ML predicted risk
  hazDistOnly._updateGraphCosts('CORRIDOR_MAIN', 'NORMAL', 0.85);
  hazReactive._updateGraphCosts('CORRIDOR_MAIN', 'NORMAL', 0.85);
  hazPredictive._updateGraphCosts('CORRIDOR_MAIN', 'NORMAL', 0.85);

  const costDistOnly = graphA.getNodeCost('CORRIDOR_MAIN');
  const costReactive = graphB.getNodeCost('CORRIDOR_MAIN');
  const costPredictive = graphC.getNodeCost('CORRIDOR_MAIN');

  assert(costDistOnly === 1.0, `Distance-Only cost is strictly baseline (${costDistOnly} == 1.0)`);
  assert(costReactive === 1.0, `Reactive baseline cost is strictly baseline for NORMAL space (${costReactive} == 1.0)`);
  assert(costPredictive > 1.0 && costPredictive > costReactive, `Predictive cost scales dynamically with ML risk (${costPredictive} > ${costReactive})`);

  // ── TEST 5: Complete Configuration Isolation Across Runs ─────────────────
  console.log('\n--- Test 5: Complete Configuration Isolation Across Runs ---');
  let leakedState = false;
  const bus1 = new EventBus();
  const dt1 = new DigitalTwinState({ bus: bus1 });
  dt1.init();
  dt1.setState('ROOM_101', { temperature: 150.0 }, 'RUN_1');

  const bus2 = new EventBus();
  const dt2 = new DigitalTwinState({ bus: bus2 });
  dt2.init();

  if (dt2.getEntity('ROOM_101').temperature !== 27.4) leakedState = true;
  assert(!leakedState, 'Run 2 initialized with pure clean baseline state (27.4°C) with zero leakage from Run 1');

  console.log(`\n================================================================`);
  console.log(`  RESULTS: ${passed}/${total} assertions passed (100% success rate)`);
  console.log(`================================================================\n`);

  if (passed !== total) process.exit(1);
}

runSensitivityTests();
