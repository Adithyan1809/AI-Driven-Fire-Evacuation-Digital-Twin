/**
 * TEST: ML Hazard Prediction & Dynamic Edge Cost Integration
 *
 * Verifies:
 *   1. Feature engineering extracts rates-of-rise and topological features.
 *   2. ML hazard probability scoring operates deterministically over 15s horizon.
 *   3. Dynamic edge cost multipliers integrate ML risk without violating hard constraints.
 *   4. Hard Safety Constraints Invariants:
 *      - Blocked exits remain strictly impassable (Infinity)
 *      - Fire origin nodes remain prohibitive/impassable (Infinity/penalty)
 *      - Elevators remain grounded and locked out (Infinity)
 *      - ML probability can ONLY modulate finite costs and NEVER override Infinity.
 */

import { MLHazardPredictor } from '../modules/mlHazardPredictor.js';
import { EventBus } from '../modules/simulationEngine.js';
import { DigitalTwinState } from '../modules/digitalTwinState.js';
import { BuildingGraph } from '../modules/buildingGraph.js';
import { HazardEngine } from '../modules/hazardEngine.js';
import { RouteOptimizer } from '../modules/routeOptimizer.js';

console.log('🧪 RUNNING ML HAZARD PREDICTION & HARD SAFETY INVARIANT TESTS\n');

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

const predictor = new MLHazardPredictor({ horizonSeconds: 15 });

// 1. Normal room prediction
const normalFeatures = {
  roomId: 'ROOM_103',
  temperature: 27.4,
  temperature_rate: 0.0,
  smoke: 0.01,
  smoke_rate: 0.0,
  occupancy: 15,
  distance_from_fire: 3,
  time_since_alarm: 0,
  neighbor_hazard_count: 0,
  room_type: 'CLASSROOM',
};

const normalPred = predictor.predict(normalFeatures);
assert(normalPred.predictedRisk < 0.10, `Normal room has low hazard probability (${normalPred.predictedRisk})`);
assert(normalPred.predictedState === 'SAFE', `Normal room risk state is SAFE (got ${normalPred.predictedState})`);

// 2. Escalating fire origin prediction
const fireFeatures = {
  roomId: 'ROOM_101',
  temperature: 78.0,
  temperature_rate: 2.5,
  smoke: 0.65,
  smoke_rate: 0.04,
  occupancy: 5,
  distance_from_fire: 0,
  time_since_alarm: 12,
  neighbor_hazard_count: 1,
  room_type: 'CLASSROOM',
};

const firePred = predictor.predict(fireFeatures);
assert(firePred.predictedRisk >= 0.85, `Fire room has high hazard probability (${firePred.predictedRisk})`);
assert(firePred.predictedState === 'PREDICTED_CRITICAL', `Fire room risk is PREDICTED_CRITICAL (got ${firePred.predictedState})`);

// 3. Proactive corridor with rapid smoke rate of rise
const corridorFeatures = {
  roomId: 'CORRIDOR_MAIN',
  temperature: 38.0,
  temperature_rate: 1.2,
  smoke: 0.22,
  smoke_rate: 0.03,
  occupancy: 2,
  distance_from_fire: 1,
  time_since_alarm: 8,
  neighbor_hazard_count: 1,
  room_type: 'CORRIDOR',
};

const corridorPred = predictor.predict(corridorFeatures);
assert(corridorPred.predictedRisk >= 0.50, `Threatened corridor has elevated hazard probability (${corridorPred.predictedRisk})`);
assert(corridorPred.predictedState === 'PREDICTED_WARNING' || corridorPred.predictedState === 'PREDICTED_CRITICAL', `Threatened corridor predicted risk elevated (${corridorPred.predictedState})`);

// 4. Test Integration with HazardEngine & Dijkstra
const bus = new EventBus();
const dtState = new DigitalTwinState({ bus });
const graph = new BuildingGraph();
const hazard = new HazardEngine({ bus, dtState, graph });
const router = new RouteOptimizer({ bus, graph });

// Trigger fire in Room 101
bus.emit('sim:fire_trigger', { room: 'ROOM_101', time: 5.0 });

// Hard Invariant 1: Fire origin cost is prohibitive
const fireCost = graph.getNodeCost('ROOM_101');
assert(!isFinite(fireCost) || fireCost >= 1000, `Hard Invariant 1: Fire origin cost is prohibitive (got ${fireCost})`);

// Hard Invariant 2: Dijkstra strictly avoids fire origin
const pathResult = router.findPath('ROOM_102');
assert(pathResult !== null && pathResult.path.length > 0, 'Dijkstra finds valid evacuation route from ROOM_102');
assert(!pathResult.path.includes('ROOM_101'), 'Hard Invariant 2: Dijkstra route strictly avoids fire origin ROOM_101');

// Hard Invariant 3: Grounded elevators remain impassable (Infinity)
const liftCost = graph.getNodeCost('LIFT_1');
const liftState = dtState.getEntity('LIFT_1');
assert(liftCost === Infinity, `Hard Invariant 3: Elevator LIFT_1 cost is Infinity (got ${liftCost})`);
assert(liftState && liftState.accessible === false, 'Hard Invariant 3: Elevator LIFT_1 is inaccessible');

// Hard Invariant 4: Blocked exit remains impassable even if ML prediction claims low risk
hazard._updateGraphCosts('EXIT_MAIN', 'BLOCKED', 0.0);
const exitMainCost = graph.getNodeCost('EXIT_MAIN');
assert(exitMainCost === Infinity, `Hard Invariant 4: BLOCKED exit cost remains Infinity despite 0.0 ML prob (got ${exitMainCost})`);

// Hard Invariant 5: ML modulation only scales finite weights
hazard._updateGraphCosts('ROOM_103', 'NORMAL', 0.80);
const modulatedRoomCost = graph.getNodeCost('ROOM_103');
assert(isFinite(modulatedRoomCost) && modulatedRoomCost > 1.0 && modulatedRoomCost <= 10.0, `Hard Invariant 5: ML scaled finite cost appropriately (got ${modulatedRoomCost})`);

console.log(`\nResults: ${passed}/${total} assertions passed.\n`);
if (passed !== total) process.exit(1);
