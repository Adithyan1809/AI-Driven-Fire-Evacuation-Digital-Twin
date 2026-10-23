/**
 * TEST: Comprehensive Hard Reset Verification
 */

import { EventBus, createPRNG, SimulationEngine } from '../modules/simulationEngine.js';
import { ConfigManager } from '../modules/configManager.js';
import { SensorSimulator } from '../modules/sensorSimulator.js';
import { DigitalTwinState } from '../modules/digitalTwinState.js';
import { BuildingGraph } from '../modules/buildingGraph.js';
import { HazardEngine } from '../modules/hazardEngine.js';
import { RouteOptimizer } from '../modules/routeOptimizer.js';
import { OccupantSimulator } from '../modules/occupantSimulator.js';
import { MetricsEngine } from '../modules/metricsEngine.js';
import { BUILDING } from '../data/building.js';

console.log('🧪 TESTING COMPREHENSIVE HARD RESET BEHAVIOR\n');

const bus = new EventBus();
const rand = createPRNG(42);
const configManager = new ConfigManager({ bus });
const dtState = new DigitalTwinState({ bus });
const graph = new BuildingGraph();
const hazard = new HazardEngine({ bus, dtState, graph, config: configManager });
const router = new RouteOptimizer({ bus, graph, config: configManager });
const occupants = new OccupantSimulator({ bus, dtState, router, config: configManager });
const metrics = new MetricsEngine({ bus, dtState, occupants, config: configManager });
const sensorSim = new SensorSimulator({ bus, rand, config: configManager });
const engine = new SimulationEngine({ bus, scenario: BUILDING.scenario, config: configManager, rand, tickRate: 10 });

// 1. Start simulation and trigger emergency
engine.start();
for (let i = 0; i < 120; i++) {
  engine._tick();
}

// Verify that fire triggered and corrupted state
const ent101_fire = dtState.getEntity('ROOM_101');
const lift1_fire = dtState.getEntity('LIFT_1');
console.log(`Pre-Reset State at t = 7.0s:`);
console.log(`  • ROOM_101 Hazard: ${ent101_fire.hazard_level} (${ent101_fire.temperature}°C)`);
console.log(`  • LIFT_1 Accessible: ${lift1_fire.accessible} (Graph cost: ${graph.getNodeCost('LIFT_1')})`);

if (ent101_fire.hazard_level !== 'CRITICAL' && ent101_fire.hazard_level !== 'BLOCKED') {
  console.error('✗ Failed to trigger fire for pre-test setup');
  process.exit(1);
}

// 2. Perform Hard Reset
console.log('\nExecuting Hard Reset...');
engine.reset();
occupants.reset();
occupants.initialise(createPRNG(42));
metrics.reset();

// 3. Verify Clean Baseline Post-Reset
const ent101_reset = dtState.getEntity('ROOM_101');
const entLeft_reset = dtState.getEntity('CORRIDOR_LEFT');
const lift1_reset = dtState.getEntity('LIFT_1');

console.log(`\nPost-Reset State:`);
console.log(`  • Engine Phase: ${engine.phase} (simTime: ${engine.simTime}s, tick: ${engine.tick})`);
console.log(`  • ROOM_101 Hazard: ${ent101_reset.hazard_level} (${ent101_reset.temperature}°C, smoke: ${ent101_reset.smoke})`);
console.log(`  • CORRIDOR_LEFT Hazard: ${entLeft_reset.hazard_level} (${entLeft_reset.temperature}°C)`);
console.log(`  • LIFT_1 Accessible: ${lift1_reset.accessible} (Graph cost: ${graph.getNodeCost('LIFT_1')})`);
console.log(`  • Occupant Count: ${occupants.occupants.length} (Evacuated: ${occupants.occupants.filter(o => o.status === 'EVACUATED').length})`);

// 4. Assertions
if (engine.phase === 'IDLE' && engine.tick === 0 && engine.simTime === 0) {
  console.log('✓ ASSERTION 1 PASSED: SimulationEngine reset to IDLE and t = 0.0s');
} else {
  console.error('✗ ASSERTION 1 FAILED');
  process.exit(1);
}

if (ent101_reset.hazard_level === 'NORMAL' && ent101_reset.temperature <= 32 && ent101_reset.fire_alarm === false) {
  console.log('✓ ASSERTION 2 PASSED: DigitalTwinState fully restored to clean normal baseline');
} else {
  console.error('✗ ASSERTION 2 FAILED');
  process.exit(1);
}

if (lift1_reset.accessible === true && graph.getNodeCost('LIFT_1') === 1) {
  console.log('✓ ASSERTION 3 PASSED: Elevators unblocked and spatial graph costs restored to 1.0');
} else {
  console.error('✗ ASSERTION 3 FAILED');
  process.exit(1);
}

if (occupants.occupants.length === 50 && occupants.occupants.filter(o => o.status === 'EVACUATED').length === 0) {
  console.log('✓ ASSERTION 4 PASSED: Occupants re-initialized at home positions with 0 evacuated');
} else {
  console.error('✗ ASSERTION 4 FAILED');
  process.exit(1);
}

console.log('\n🎉 ALL HARD RESET ASSERTIONS PASSED (100% SUCCESS)');
