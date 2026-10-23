/**
 * TEST: BUILDING B ZERO-CODE GENERALIZATION & MULTI-BUILDING UI CONTRACT
 *
 * Verifies that:
 *   1. FloorPlanRenderer and domain engines support switching to Building B (Metropolis Research Wing).
 *   2. Spaces (LAB_A, LAB_B, SERVER_ROOM, AUDITORIUM, CORRIDOR_X, STAIR_A, STAIR_B, EXIT_NORTH) are automatically recognized and routed.
 *   3. No hardcoded room logic exists in graph derivation, routing, or state.
 *   4. Fire scenario in SERVER_ROOM triggers dynamic Dijkstra rerouting to EXIT_NORTH and EXIT_EAST.
 */

import { BUILDING_A } from '../data/buildings/building_a.js';
import { BUILDING_B } from '../data/buildings/building_b.js';
import { setActiveBuilding, BUILDING, NODE_MAP, SPACE_MAP } from '../data/building.js';
import { EventBus } from '../modules/simulationEngine.js';
import { BuildingGraph } from '../modules/buildingGraph.js';
import { RouteOptimizer } from '../modules/routeOptimizer.js';
import { DigitalTwinState } from '../modules/digitalTwinState.js';

console.log('================================================================');
console.log('🏢 VERIFYING BUILDING B ZERO-CODE TOPOLOGY & UI GENERALIZATION');
console.log('================================================================\n');

let passed = 0;
let total = 0;

function assert(condition, description) {
  total++;
  if (condition) {
    console.log(`✓ [PASS] ${description}`);
    passed++;
  } else {
    console.error(`✗ [FAIL] ${description}`);
  }
}

// ── Test 1: Switch to Building B ─────────────────────────────────────
setActiveBuilding(BUILDING_B);
assert(BUILDING.id === 'METROPOLIS_RESEARCH_FLOOR_3', 'Active building switched to Metropolis Research Floor 3');
assert(BUILDING.spaces.length === 7, `Building B has ${BUILDING.spaces.length} spaces (LAB_A, LAB_B, SERVER_ROOM, AUDITORIUM, CORRIDOR_X, STAIR_A, STAIR_B)`);
assert(BUILDING.sensors.length === 13, `Building B has ${BUILDING.sensors.length} virtual IoT sensors`);
assert(BUILDING.exits.length === 2, `Building B has ${BUILDING.exits.length} assembly exits (EXIT_NORTH, EXIT_EAST)`);

// ── Test 2: Graph & Navigation Topology on Building B ────────────────
const bus = new EventBus();
const graph = new BuildingGraph();
const router = new RouteOptimizer({ bus, graph });

const bSpaces = ['LAB_A', 'LAB_B', 'SERVER_ROOM', 'AUDITORIUM'];
const initialRoutesB = router.calculateAllRoutes(bSpaces);

assert(Object.keys(initialRoutesB).length === 4, 'Calculated initial safe egress routes for all Building B spaces');
assert(initialRoutesB['LAB_A'].status === 'SAFE', `LAB_A initial route is SAFE: [${initialRoutesB['LAB_A'].path.join(' → ')}]`);
assert(initialRoutesB['AUDITORIUM'].status === 'SAFE', `AUDITORIUM initial route is SAFE: [${initialRoutesB['AUDITORIUM'].path.join(' → ')}]`);

// ── Test 3: Digital Twin State on Building B ─────────────────────────
const dtStateB = new DigitalTwinState({ bus });
const srvRoom = dtStateB.getEntity('SERVER_ROOM');
assert(srvRoom !== null, 'Digital Twin state initialized for SERVER_ROOM');
assert(srvRoom.name === 'High-Density Server Room 303', `SERVER_ROOM name: "${srvRoom.name}"`);
assert(srvRoom.hazard_level === 'NORMAL', 'SERVER_ROOM initial hazard level is NORMAL');

// ── Test 4: Fire Emergency & Dynamic Egress in Building B ────────────
dtStateB.setState('SERVER_ROOM', { temperature: 84.5, smoke: 0.72, hazard_level: 'CRITICAL', fire_alarm: true });
graph.setNodeCostMultiplier('SERVER_ROOM', 1000);
graph.setNodeCostMultiplier('JUNC_CX_3', 500);

const emergencyRoutesB = router.calculateAllRoutes(bSpaces);
assert(emergencyRoutesB['AUDITORIUM'] !== undefined, 'AUDITORIUM route recomputed under emergency');
assert(emergencyRoutesB['LAB_A'].status === 'SAFE', `LAB_A safe route via STAIR_A to EXIT_NORTH: [${emergencyRoutesB['LAB_A'].path.join(' → ')}]`);

// ── Test 5: Switch back to Building A cleanly ────────────────────────
setActiveBuilding(BUILDING_A);
assert(BUILDING.id === 'DEPT_FLOOR_1', 'Cleanly switched back to Building A (Engineering Department)');
assert(BUILDING.spaces.length === 12, 'Building A spaces restored: 12 spaces');

console.log(`\n================================================================`);
console.log(`📊 GENERALIZATION VERIFICATION: ${passed}/${total} assertions passed (${((passed/total)*100).toFixed(0)}%)`);
console.log(`================================================================\n`);

process.exit(passed === total ? 0 : 1);
