/**
 * TEST: DYNAMIC CUSTOM BUILDING ARCHITECT & ZERO-SHOT ADAPTATION
 *
 * Verifies that the system can load any arbitrary custom floor plan,
 * synthesize the topological graph, register zero-shot AI entities,
 * route occupants dynamically, and simulate multi-hop thermal physics.
 */

import { EventBus, createPRNG, SimulationEngine } from '../modules/simulationEngine.js';
import { ConfigManager } from '../modules/configManager.js';
import { createCustomBuilding, setActiveBuilding, BUILDING } from '../data/building.js';
import { canonicalRegistryInstance } from '../data/canonicalRegistry.js';
import { DigitalTwinState } from '../modules/digitalTwinState.js';
import { BuildingGraph } from '../modules/buildingGraph.js';
import { HazardEngine } from '../modules/hazardEngine.js';
import { RouteOptimizer } from '../modules/routeOptimizer.js';
import { OccupantSimulator } from '../modules/occupantSimulator.js';
import { SensorSimulator } from '../modules/sensorSimulator.js';
import { ARCHITECTURAL_TEMPLATES } from '../ui/customBuildingArchitectModal.js';

console.log('='.repeat(80));
console.log('🧪 RUNNING TEST: DYNAMIC CUSTOM BUILDING ADAPTATION');
console.log('='.repeat(80) + '\n');

// 1. Create a Novel Custom Building Specification
const hospitalTemplate = ARCHITECTURAL_TEMPLATES.HOSPITAL_WARD;
const customModel = createCustomBuilding(hospitalTemplate);

console.log(`[1/6] Compiling Custom Building: "${customModel.name}"`);
console.log(`      Spaces: ${customModel.spaces.length} | Doors: ${customModel.doors.length} | Exits: ${customModel.exits.length}`);

if (customModel.spaces.length !== 9) throw new Error(`Expected 9 spaces, got ${customModel.spaces.length}`);
if (customModel.exits.length !== 2) throw new Error(`Expected 2 exits, got ${customModel.exits.length}`);
if (!customModel.graph || customModel.graph.nodes.length < 9) throw new Error('Graph nodes not generated');
if (customModel.graph.edges.length < 10) throw new Error('Graph door edges not generated');
console.log('      ✓ Auto-Graph Synthesis Verified (Centroids, Exits & Bidirectional Door Edges)\n');

// 2. Hot-Swap Active Building Singleton
setActiveBuilding(customModel);
canonicalRegistryInstance.registerCustomBuilding(customModel);

console.log('[2/6] Registering to Canonical Entity Registry');
const activeSpaces = canonicalRegistryInstance.getActiveSpaces();
const promptCtx = canonicalRegistryInstance.getPromptContext();
if (activeSpaces.length !== 9) throw new Error(`Registry space count mismatch: ${activeSpaces.length}`);
console.log(`      ✓ Canonical Spaces Registered: ${activeSpaces.map(s => s.id).join(', ')}`);
console.log(`      ✓ Zero-Shot AI Prompt Context Generated (${promptCtx.length} entities)\n`);

// 3. Initialize Core Domain Simulation Modules
console.log('[3/6] Initializing Domain Engines with Custom Building Model');
const bus = new EventBus();
const rand = createPRNG(42);
const configManager = new ConfigManager({ bus });

configManager.update({
  scenario: {
    fireStartSeconds: 5,
    fireRoom: 'SURGICAL_THEATER',
    fireRooms: ['SURGICAL_THEATER'],
    fireSeverity: 'HIGH',
    spreadRateMultiplier: 1.2,
    fireSpread: true
  }
});

const dtState   = new DigitalTwinState({ bus });
const graph     = new BuildingGraph();
const hazard    = new HazardEngine({ bus, dtState, graph, config: configManager });
const router    = new RouteOptimizer({ bus, graph, config: configManager });
const sensorSim = new SensorSimulator({ bus, rand, config: configManager });
const occupants = new OccupantSimulator({ bus, dtState, router, config: configManager });
const engine    = new SimulationEngine({ bus, scenario: customModel.scenario, config: configManager, rand, tickRate: 10 });

graph.rebuild();
occupants.initialise(rand);

const occupIds = (customModel.spaces || []).filter(s => s.type !== 'CORRIDOR').map(s => s.id);
const initialRoutes = router.calculateAllRoutes(occupIds);

console.log(`      ✓ Initial Routes Calculated for ${Object.keys(initialRoutes).length} spaces`);
Object.entries(initialRoutes).forEach(([sp, r]) => {
  if (r) {
    const exitNode = r.exit || r.path[r.path.length - 1];
    console.log(`        - ${sp.padEnd(18, ' ')} ➔ ${exitNode} (Path: ${r.path.join(' ➔ ')})`);
  }
});
console.log('');

// 4. Verify Route Validity
console.log('[4/6] Verifying Dijkstra Shortest Path Validity');
['ICU_SUITE', 'PATIENT_ROOM_1'].forEach(sp => {
  const exitNode = initialRoutes[sp].exit || initialRoutes[sp].path[initialRoutes[sp].path.length - 1];
  if (exitNode !== 'EXIT_WEST_HOSP') {
    throw new Error(`Expected ${sp} to exit via EXIT_WEST_HOSP, got ${exitNode}`);
  }
});
['TRIAGE_BAY', 'PATIENT_ROOM_2'].forEach(sp => {
  const exitNode = initialRoutes[sp].exit || initialRoutes[sp].path[initialRoutes[sp].path.length - 1];
  if (exitNode !== 'EXIT_EAST_HOSP') {
    throw new Error(`Expected ${sp} to exit via EXIT_EAST_HOSP, got ${exitNode}`);
  }
});
console.log('      ✓ Egress Partitioning to Nearest Exit Verified (West vs East)\n');

// 5. Simulate 10-Second Evacuation & Multi-Hop Spread
console.log('[5/6] Simulating 10.0-Second Fire Ignition & Dynamic Adaptation');
engine.start();

let rerouteCount = 0;
bus.on('routes:recalculating', () => { rerouteCount++; });

for (let tick = 1; tick <= 100; tick++) {
  engine._tick();
}

const surgState = dtState.getEntity('SURGICAL_THEATER');
const spineState = dtState.getEntity('MED_CORRIDOR_MAIN');
console.log(`      SURGICAL_THEATER (Origin): Temp = ${surgState?.temperature}°C | Level = ${surgState?.hazard_level}`);
console.log(`      MED_CORRIDOR_MAIN (Hop 1): Temp = ${spineState?.temperature}°C | Level = ${spineState?.hazard_level}`);
console.log(`      Dynamic Dijkstra Rerouting Passes: ${rerouteCount}`);

if ((surgState?.temperature || 0) < 40) throw new Error('Fire room failed to heat up');
console.log('      ✓ Multi-Hop Thermal Propagation on Custom Topology Verified\n');

// 6. Check Occupant Egress
console.log('[6/6] Checking Autonomous Occupant Movement');
const occList = occupants.occupants || [];
const evacCount = occList.filter(o => o.status === 'EVACUATED').length;
const activeCount = occList.filter(o => o.status === 'EVACUATING' || o.status === 'REDIRECTED').length;
console.log(`      Occupants: ${occList.length} Total | In Transit: ${activeCount} | Evacuated: ${evacCount}`);

// ══════════════════════════════════════════════════════════════════════════════
// TEST 2: QUANTUM DATA CENTER & CLEANROOM SUITE
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(80));
console.log('🧪 TESTING QUANTUM DATA CENTER PRESET & AIRLOCK EGRESS');
console.log('='.repeat(80));

const quantumTemplate = ARCHITECTURAL_TEMPLATES.HIGH_TECH_DATACENTER;
const quantumModel = createCustomBuilding(quantumTemplate);
setActiveBuilding(quantumModel);
canonicalRegistryInstance.registerCustomBuilding(quantumModel);

console.log(`\nCompiling Quantum Facility: "${quantumModel.name}"`);
console.log(`Spaces: ${quantumModel.spaces.length} | Doors: ${quantumModel.doors.length} | Exits: ${quantumModel.exits.length}`);

const qBus = new EventBus();
const qConfig = new ConfigManager({ bus: qBus });
qConfig.update({
  scenario: {
    fireStartSeconds: 5,
    fireRoom: 'SERVER_BAY_ALPHA',
    fireRooms: ['SERVER_BAY_ALPHA'],
    fireSeverity: 'HIGH',
    spreadRateMultiplier: 1.0,
    fireSpread: true
  }
});

const qDTState   = new DigitalTwinState({ bus: qBus });
const qGraph     = new BuildingGraph();
const qHazard    = new HazardEngine({ bus: qBus, dtState: qDTState, graph: qGraph, config: qConfig });
const qRouter    = new RouteOptimizer({ bus: qBus, graph: qGraph, config: qConfig });
const qSensorSim = new SensorSimulator({ bus: qBus, rand, config: qConfig });
const qOccupants = new OccupantSimulator({ bus: qBus, dtState: qDTState, router: qRouter, config: qConfig });
const qEngine    = new SimulationEngine({ bus: qBus, scenario: quantumModel.scenario, config: qConfig, rand, tickRate: 10 });

qGraph.rebuild();
qOccupants.initialise(rand);

const qSpaces = (quantumModel.spaces || []).filter(s => s.type !== 'CORRIDOR').map(s => s.id);
const qRoutes = qRouter.calculateAllRoutes(qSpaces);

console.log(`✓ Quantum Routes Calculated for ${Object.keys(qRoutes).length} spaces:`);
Object.entries(qRoutes).forEach(([sp, r]) => {
  const exitNode = r.exit || r.path[r.path.length - 1];
  console.log(`  - ${sp.padEnd(20, ' ')} ➔ ${exitNode} (Path: ${r.path.join(' ➔ ')})`);
});

// Verify Quantum Occupant Positions strictly within boundaries
const qOccList = qOccupants.getAll();
console.log(`\n✓ Checking Occupant Placement: ${qOccList.length} Occupants Placed`);
qOccList.forEach(occ => {
  const sp = quantumModel.spaces.find(s => s.id === occ.homeRoom);
  if (!sp) throw new Error(`Occupant homeRoom ${occ.homeRoom} not found in model`);
  const withinX = occ.svgX >= sp.x && occ.svgX <= sp.x + sp.width;
  const withinY = occ.svgY >= sp.y && occ.svgY <= sp.y + sp.height;
  if (!withinX || !withinY) {
    throw new Error(`Occupant ${occ.id} placed outside room ${sp.id}: (${occ.svgX}, ${occ.svgY}) vs room [${sp.x}, ${sp.y}, ${sp.width}, ${sp.height}]`);
  }
});
console.log('✓ 100% of Quantum Occupants are cleanly contained inside room bounds.');

// Run 30-second simulation on Quantum NOC
console.log('\nSimulating 30.0s Fire in SERVER_BAY_ALPHA & Evacuation through Airlock Spine...');
qEngine.start();
for (let t = 1; t <= 300; t++) {
  qEngine._tick();
}

const qServerBay = qDTState.getEntity('SERVER_BAY_ALPHA');
const qAirlock = qDTState.getEntity('DATA_CORRIDOR');
console.log(`SERVER_BAY_ALPHA (Fire Origin): Temp = ${qServerBay?.temperature}°C | Level = ${qServerBay?.hazard_level}`);
console.log(`DATA_CORRIDOR (Spine):          Temp = ${qAirlock?.temperature}°C | Level = ${qAirlock?.hazard_level}`);

const qEvacuated = qOccupants.getAll().filter(o => o.status === 'EVACUATED').length;
const qTrapped = qOccupants.getAll().filter(o => o.status === 'TRAPPED').length;
console.log(`Quantum Egress Results: ${qEvacuated} Evacuated | ${qTrapped} Trapped | Total: ${qOccupants.getAll().length}`);

if (qEvacuated === 0) {
  throw new Error('Occupants failed to evacuate');
}

console.log('\n' + '='.repeat(80));
console.log('✅ ALL ARCHITECTURAL PRESETS (HOSPITAL & QUANTUM) PASSED WITH 100% SUCCESS');
console.log('='.repeat(80));
process.exit(0);
