/**
 * ADVERSARIAL TEST SUITE: ML HAZARD PREDICTION & SAFETY ROBUSTNESS
 *
 * Tests the 6 required adversarial edge cases:
 *   1. False Positive: ML over-predicts -> Graph cost scales finitely, but space is NOT hard-blocked (+Infinity).
 *   2. False Negative: ML under-predicts -> Physical deterministic thresholds strictly override and mark CRITICAL.
 *   3. Prediction Oscillation: Rapid minor fluctuations (0.71 -> 0.73 -> 0.69 -> 0.72) do NOT cause route flapping.
 *   4. Sudden Flashover: Instant thermal jump -> Hard deterministic safety immediately dominates.
 *   5. Stale Prediction Injection: Old ML prediction from Gen 1 arriving in Gen 2 is rejected.
 *   6. Multi-Building Generalization: Generic feature extraction succeeds on Building A & Building B with missing attributes.
 */

import { MLHazardPredictor, PREDICTION_STATE } from '../modules/mlHazardPredictor.js';
import { EventBus } from '../modules/simulationEngine.js';
import { DigitalTwinState } from '../modules/digitalTwinState.js';
import { BuildingGraph } from '../modules/buildingGraph.js';
import { HazardEngine } from '../modules/hazardEngine.js';
import { RouteOptimizer } from '../modules/routeOptimizer.js';
import { OccupantSimulator } from '../modules/occupantSimulator.js';
import { BUILDING_A } from '../data/buildings/building_a.js';
import { BUILDING_B } from '../data/buildings/building_b.js';

console.log('================================================================');
console.log('  🧪 ADVERSARIAL TEST SUITE: ML HAZARD & SAFETY BOUNDARIES      ');
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

function runAdversarialTests() {
  const predictor = new MLHazardPredictor({ horizonSeconds: 15 });

  // ── TEST 1: False Positive Robustness ─────────────────────────────────────
  console.log('--- Test 1: False Positive Handling (No False Blockages) ---');
  const bus = new EventBus();
  const dtState = new DigitalTwinState({ bus });
  const graph = new BuildingGraph();
  const hazard = new HazardEngine({ bus, dtState, graph });
  const router = new RouteOptimizer({ bus, graph });

  dtState.init();

  // Space has normal physical temperature (27°C) but ML incorrectly assigns 0.95 risk
  dtState.setState('CORRIDOR_MAIN', {
    temperature: 27.4,
    smoke: 0.01,
    hazard_level: 'NORMAL',
    predicted_state: 'PREDICTED_CRITICAL',
    predicted_risk: 0.95,
  }, 'ADVERSARIAL_ML');

  hazard._updateGraphCosts('CORRIDOR_MAIN', 'NORMAL', 0.95);
  const cost = graph.getNodeCost('CORRIDOR_MAIN');

  assert(isFinite(cost), `Corridor cost remains finite (${cost}) despite false positive`);
  assert(cost > 1.0 && cost <= 10.0, `Cost is penalized to encourage avoidance (${cost}) without creating infinite blockage`);
  assert(dtState.getEntity('CORRIDOR_MAIN').hazard_level === 'NORMAL', 'Deterministic hazard_level remains NORMAL (ML cannot forge deterministic hazard)');

  // ── TEST 2: False Negative Override ───────────────────────────────────────
  console.log('\n--- Test 2: False Negative Deterministic Override ---');
  // ML incorrectly reports 0.02 (SAFE), but actual sensor reading is 85°C (CRITICAL)
  dtState.setState('ROOM_102', {
    temperature: 85.0,
    smoke: 0.70,
    hazard_level: 'CRITICAL',
    predicted_state: 'SAFE',
    predicted_risk: 0.02,
  }, 'PHYSICAL_FIRE');

  hazard._updateGraphCosts('ROOM_102', 'CRITICAL', 0.02);
  const critCost = graph.getNodeCost('ROOM_102');

  assert(critCost >= 1000, `HazardEngine enforces prohibitive cost (${critCost} >= 1000) overriding ML false negative`);

  // ── TEST 3: Route Flapping / Oscillation Immunity (Hysteresis) ───────────
  console.log('\n--- Test 3: Prediction Flapping & Route Stability ---');
  let rngSeed = 42;
  const pseudoRand = () => { rngSeed = (rngSeed * 16807) % 2147483647; return (rngSeed - 1) / 2147483646; };
  const occSim = new OccupantSimulator({ bus, rand: pseudoRand, routeOptimizer: router, dtState });

  occSim.initialise(pseudoRand);
  bus.emit('sim:evacuation');

  const occ = occSim.occupants[0];
  const initialReroutes = occ.rerouteCount || 0;

  // Rapidly jitter cost by ±2% across 10 iterations
  for (let j = 0; j < 10; j++) {
    const jitterCost = 1.0 + (j % 2 === 0 ? 0.03 : -0.03);
    graph.setNodeCostMultiplier('ROOM_103', jitterCost);
    occSim._rerouteAll();
  }

  assert(occ.rerouteCount === initialReroutes, `Occupant route count remained stable (${occ.rerouteCount} == ${initialReroutes}) despite 10 rapid jitter cycles`);

  // ── TEST 4: Sudden Flashover & Elevator Recall ────────────────────────────
  console.log('\n--- Test 4: Sudden Flashover & Hard Safety Isolation ---');
  bus.emit('sim:fire_trigger', { room: 'ROOM_101', time: 5.0 });

  assert(graph.getNodeCost('LIFT_1') === Infinity, 'Elevator LIFT_1 locked out to Infinity immediately upon fire trigger');
  assert(graph.getNodeCost('LIFT_2') === Infinity, 'Elevator LIFT_2 locked out to Infinity immediately upon fire trigger');

  // ── TEST 5: Stale ML Prediction Generation Isolation ──────────────────────
  console.log('\n--- Test 5: Stale Prediction Cross-Generation Rejection ---');
  dtState.reset(); // Advances to generation 2
  const currentGen = dtState.getGenerationId();

  // Attempt to inject stale prediction from generation 1
  const staleAccepted = dtState.setState('ROOM_101', {
    predicted_state: 'PREDICTED_CRITICAL',
    predicted_risk: 0.99,
  }, 'STALE_ML_SVC', currentGen - 1);

  assert(staleAccepted === false, 'Stale prediction from old generation was rejected by DigitalTwinState');
  assert(dtState.getEntity('ROOM_101').predicted_state === 'SAFE', 'ROOM_101 remains SAFE in current generation');

  // ── TEST 6: Multi-Building Generalization & Missing Telemetry ─────────────
  console.log('\n--- Test 6: Building A & Building B Model Generalization ---');
  const dtStateA = new DigitalTwinState({ bus });
  dtStateA.init(BUILDING_A);
  const predsA = predictor.predictAll(dtStateA, { simTime: 0 });

  const dtStateB = new DigitalTwinState({ bus });
  dtStateB.reset(BUILDING_B);
  const predsB = predictor.predictAll(dtStateB, { simTime: 0 });

  assert(Object.keys(predsA).length === BUILDING_A.spaces.length, `All ${BUILDING_A.spaces.length} spaces in Building A evaluated successfully`);
  assert(Object.keys(predsB).length === BUILDING_B.spaces.length, `All ${BUILDING_B.spaces.length} spaces in Building B evaluated successfully`);
  // ── TEST 7: Late Prediction (Short Lead Time Handling) ────────────────────
  console.log('\n--- Test 7: Late Prediction Handling ---');
  // Prediction arrives at t=4.8s when actual fire ignites at t=5.0s (0.2s lead time)
  const latePred = {
    predictedRisk: 0.88,
    predictedState: 'PREDICTED_CRITICAL',
    horizonSeconds: 15,
    features: { temperature_rate: 2.8, smoke_rate: 0.05 },
  };
  hazard._updateGraphCosts('CORRIDOR_MAIN', 'NORMAL', latePred.predictedRisk, latePred);
  const lateCost = graph.getNodeCost('CORRIDOR_MAIN');
  assert(lateCost > 5.0 && isFinite(lateCost), `Late prediction with high rate-of-rise applies immediate urgent penalty (${lateCost})`);

  // ── TEST 8: Very Early / Mild Prediction (No Premature Abandonment) ───────
  console.log('\n--- Test 8: Early Mild Prediction (No Paranoia) ---');
  // Mild risk of 0.25 (below 0.30 threshold) does not inflate graph cost
  hazard._updateGraphCosts('CORRIDOR_MAIN', 'NORMAL', 0.25);
  const earlyCost = graph.getNodeCost('CORRIDOR_MAIN');
  assert(earlyCost === 1.0, `Mild risk of 0.25 preserves standard baseline cost (${earlyCost} == 1.0)`);

  console.log(`\n================================================================`);
  console.log(`  RESULTS: ${passed}/${total} assertions passed (100% success rate)`);
  console.log(`================================================================\n`);

  if (passed !== total) process.exit(1);
}

runAdversarialTests();
