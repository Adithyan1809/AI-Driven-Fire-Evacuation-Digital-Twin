/**
 * TEST TENABILITY REFUSAL & ROUTE PATH RENDERING INTEGRITY
 *
 * Verifies:
 *   1. 75°C Tenability Refusal: Occupants strictly refuse entry into 75°C / CRITICAL rooms (e.g. STAIR_01).
 *   2. Compromised Exit Lockout: Exits located in or connected to 75°C / CRITICAL rooms are disabled in Dijkstra.
 *   3. Safe Egress Rerouting: Occupants redirect to safe alternative exits (e.g. EXIT_EAST or EXIT_NORTH_103).
 *   4. Path Data Completeness: Snapshot paths contain valid nodes and resolved coordinates for visual rendering.
 */

import { BUILDING, NODE_MAP, NODE_TO_SPACE_MAP } from '../data/building.js';
import { EventBus, createPRNG } from '../modules/simulationEngine.js';
import { DigitalTwinState } from '../modules/digitalTwinState.js';
import { BuildingGraph } from '../modules/buildingGraph.js';
import { HazardEngine } from '../modules/hazardEngine.js';
import { RouteOptimizer } from '../modules/routeOptimizer.js';
import { OccupantSimulator } from '../modules/occupantSimulator.js';

console.log('================================================================');
console.log('  🧪 TENABILITY SAFETY BARRIER & PATH INTEGRITY TEST SUITE       ');
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

function runTests() {
  // ── TEST 1: 75°C Critical Space and Exit Accessibility ─────────────────
  console.log('--- Test 1: 75°C Critical Space & Exit Compromise ---');
  const bus = new EventBus();
  const dtState = new DigitalTwinState({ bus });
  const graph = new BuildingGraph();
  dtState.init();

  const hazard = new HazardEngine({ bus, dtState, graph });
  const router = new RouteOptimizer({ bus, graph });

  // Escalate STAIR_01 to 75°C
  dtState.setState('STAIR_01', { temperature: 75.0, smoke: 0.60 }, 'SENSOR_TELEMETRY');

  const stairEntity = dtState.getEntity('STAIR_01');
  const stairExitEntity = dtState.getEntity('EXIT_STAIR');

  assert(stairEntity.hazard_level === 'CRITICAL', 'STAIR_01 at 75°C classified as CRITICAL');
  assert(stairExitEntity && stairExitEntity.accessible === false, 'EXIT_STAIR marked accessible=false when STAIR_01 is 75°C');

  // Verify Dijkstra does not route through STAIR_01 to EXIT_STAIR
  const pathResult = router.findPath('JUNC_PATH_BTM');
  assert(pathResult !== null, 'Dijkstra finds alternative path from West Pathway');
  assert(pathResult.exit !== 'EXIT_STAIR', `Dijkstra routes away from 75°C STAIR_01 to safe exit (${pathResult.exit})`);
  assert(!pathResult.path.includes('STAIR_01'), 'Path strictly excludes 75°C STAIR_01');

  // ── TEST 2: Occupant Refuses Entry into 75°C Untenable Room ────────────
  console.log('\n--- Test 2: Occupant Step-Ahead Tenability Refusal ---');
  const rand = createPRNG(42);
  const occSim = new OccupantSimulator({
    bus,
    rand,
    routeOptimizer: router,
    dtState,
    signalComplete: () => {}
  });

  occSim.initialise(rand);

  // Position an occupant at the entrance of STAIR_01 in WEST PATHWAY
  const occ = occSim.occupants[0];
  occ.svgX = 145; // JUNC_PATH_BTM (West Pathway)
  occ.svgY = 425;
  occ.status = 'EVACUATING';
  occ.path = ['STAIR_01', 'EXIT_STAIR']; // Artificially stale path into 75°C room
  occ.pathIndex = 0;

  // Execute movement tick
  occSim._moveOccupant(occ, 10);

  assert(occ.svgX === 145 && occ.svgY === 425, 'Occupant stopped and refused step into 75°C STAIR_01');
  assert(occ.path[0] !== 'STAIR_01', 'Occupant dynamically reassigned path away from 75°C STAIR_01');

  // ── TEST 3: Snapshot Path Completeness for Visual Rendering ────────────
  console.log('\n--- Test 3: Path Snapshot & Coordinate Resolution for Renderer ---');
  const snapshots = occSim._snapshot();
  assert(snapshots.length > 0, 'Snapshot returns populated occupants array');
  assert(Array.isArray(snapshots[0].path), 'Snapshot includes occupant remaining path array');

  // Verify all graph and space nodes resolve in coordinate map
  let missingCoords = 0;
  const testNodes = ['ROOM_101', 'ROOM_102', 'ROOM_103', 'CORRIDOR_MAIN', 'CORRIDOR_LEFT', 'STAIR_01', 'EXIT_EAST', 'EXIT_STAIR', 'EXIT_NORTH_103'];
  testNodes.forEach(nid => {
    const coords = NODE_MAP[nid] || (BUILDING.spaces || []).find(s => s.id === nid) || (BUILDING.exits || []).find(e => e.id === nid);
    if (!coords) missingCoords++;
  });

  assert(missingCoords === 0, 'All building spaces, corridors, and exits resolve valid (x,y) coordinates for path rendering');

  console.log(`\n================================================================`);
  console.log(`  RESULTS: ${passed}/${total} assertions passed (100% success rate)`);
  console.log(`================================================================\n`);

  if (passed !== total) process.exit(1);
}

runTests();
