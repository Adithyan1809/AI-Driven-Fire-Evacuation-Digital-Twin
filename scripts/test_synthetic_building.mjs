import { setActiveBuilding, buildGraphFromSpaces } from '../data/building.js';
import { EventBus, SimulationEngine, createPRNG } from '../modules/simulationEngine.js';
import { HazardEngine } from '../modules/hazardEngine.js';
import { OccupantSimulator } from '../modules/occupantSimulator.js';
import { DigitalTwinState } from '../modules/digitalTwinState.js';
import { BuildingGraph } from '../modules/buildingGraph.js';
import { RouteOptimizer } from '../modules/routeOptimizer.js';

// Define the synthetic building
const SYNTHETIC_BUILDING = {
  id: "BLD_SYN",
  name: "Synthetic Test Building",
  scenario: {
    fire_room: "ROOM_A",
    fireStartSeconds: 2,
    adjacent_smoke_factor: 0.4,
    cost_dangerous: 10,
    cost_smoke: 2
  },
  spaces: [
    { id: "ROOM_A", name: "Room A", type: "CLASSROOM", capacity: 30, x: 0, y: 0, width: 10, height: 10, connections: ["CORRIDOR_SYN"] },
    { id: "ROOM_B", name: "Room B", type: "OFFICE", capacity: 10, x: 20, y: 0, width: 10, height: 10, connections: ["CORRIDOR_SYN"] },
    { id: "CORRIDOR_SYN", name: "Corridor", type: "CORRIDOR", x: 10, y: 0, width: 10, height: 10, connections: ["ROOM_A", "ROOM_B"] }
  ],
  doors: [
    { id: "DOOR_A", from: "ROOM_A", to: "CORRIDOR_SYN", status: "OPEN" },
    { id: "DOOR_B", from: "ROOM_B", to: "CORRIDOR_SYN", status: "OPEN" }
  ],
  sensors: [
    { id: "TEMP_A", type: "temperature", location: "ROOM_A", space_id: "ROOM_A" },
    { id: "TEMP_B", type: "temperature", location: "ROOM_B", space_id: "ROOM_B" }
  ],
  exits: [
    { id: "EXIT_MAIN", name: "Main Exit", connected_node: "EXIT_MAIN" }
  ],
  sensor_baselines: {
    occupancy: { ROOM_A: 0, ROOM_B: 0, CORRIDOR_SYN: 0 }
  },
  graph: { nodes: [], edges: [] }
};

let passed = true;
function assert(condition, message) {
  if (condition) {
    console.log(`✓ ${message}`);
  } else {
    console.log(`✗ ${message}`);
    passed = false;
  }
}

// 3. Verify buildGraphFromSpaces
const graphData = buildGraphFromSpaces(SYNTHETIC_BUILDING.spaces);
SYNTHETIC_BUILDING.graph.nodes = [...graphData.nodes, {id: "EXIT_MAIN", x: 15, y: -5}];
SYNTHETIC_BUILDING.graph.edges = [...graphData.edges, {id: "E_CORR_EXIT", from: "CORRIDOR_SYN", to: "EXIT_MAIN", base_cost: 1}];

assert(graphData.nodes.length === 3, "buildGraphFromSpaces generates valid graph from spaces array");

// Swap building
setActiveBuilding(SYNTHETIC_BUILDING);

const bus = new EventBus();
const dtState = new DigitalTwinState({ bus, initialBuilding: SYNTHETIC_BUILDING });
const graph = new BuildingGraph({ bus, buildingData: SYNTHETIC_BUILDING });

const hazardEngine = new HazardEngine({ bus, dtState, graph });

// 2. Verify buildAdjacency
assert(hazardEngine.adjacency["ROOM_A"].includes("CORRIDOR_SYN"), "buildAdjacency correctly derives adjacency from doors/connections");

const routeOptimizer = new RouteOptimizer({ bus, graph, dtState });
const rand = createPRNG(999);
const sim = new SimulationEngine({ bus, scenario: SYNTHETIC_BUILDING.scenario, seed: 999 });

const occupantSim = new OccupantSimulator({ bus, rand, routeOptimizer, signalComplete: () => {} });

// 1. Verify buildDistributionWeights
assert(
  occupantSim.distributionWeights["ROOM_A"] === 0.75 && 
  occupantSim.distributionWeights["ROOM_B"] === 0.25, 
  "buildDistributionWeights correctly derives weights from capacity"
);

// Verify Dynamic Routing diff from Static
const pathBefore = routeOptimizer.findPath("ROOM_A", ["EXIT_MAIN"]);
graph.setNodeCostMultiplier("CORRIDOR_SYN", Infinity);
const pathAfter = routeOptimizer.findPath("ROOM_A", ["EXIT_MAIN"]);
assert(pathBefore.path.includes("CORRIDOR_SYN") && (!pathAfter || !pathAfter.path.includes("CORRIDOR_SYN") || pathAfter.status === 'BLOCKED'), "Dynamic routing differs from static routing when a corridor is blocked");
graph.setNodeCostMultiplier("CORRIDOR_SYN", 1); // reset

const configObj = {
  scenario: SYNTHETIC_BUILDING.scenario,
  simulation: { autoPauseOnMilestones: false, simSpeed: 1 },
  occupants: { count: 40, walkingSpeedMultiplier: 1.0, reactionDelaySeconds: 0 }
};
const configWrapper = { get: () => configObj };

sim.config = configWrapper;
hazardEngine.config = configWrapper;
occupantSim.config = configWrapper;
occupantSim.initialise(rand);

// Fire trigger manually or by sim:fire_trigger
bus.on('sim:fire_trigger', (data) => {
  if (data.room === 'ROOM_A') {
    dtState.setState('ROOM_A', { temperature: 100, smoke: 0.9 }, 'TEST_FIRE');
  }
});

// Run for 200 ticks
sim.start();
for (let i = 0; i < 200; i++) {
  sim._tick();
}

const roomA = dtState.getEntity('ROOM_A');
const corridor = dtState.getEntity('CORRIDOR_SYN');

assert(
  roomA.hazard_level === 'CRITICAL' || roomA.hazard_level === 'BLOCKED', 
  "After fire, ROOM_A hazard_level becomes CRITICAL or BLOCKED"
);

assert(
  corridor.hazard_level === 'WARNING' || corridor.hazard_level === 'CRITICAL' || corridor.hazard_level === 'BLOCKED' || corridor.smoke > 0 || corridor.temperature > 0, 
  "Hazard propagates to CORRIDOR_SYN (adjacent via door)"
);

process.exit(passed ? 0 : 1);
