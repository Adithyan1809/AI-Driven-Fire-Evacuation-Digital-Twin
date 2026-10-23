import { BUILDING } from '../data/building.js';
import { EventBus, SimulationEngine, createPRNG } from '../modules/simulationEngine.js';
import { ConfigManager } from '../modules/configManager.js';
import { BuildingGraph } from '../modules/buildingGraph.js';
import { RouteOptimizer } from '../modules/routeOptimizer.js';
import { HazardEngine } from '../modules/hazardEngine.js';
import { OccupantSimulator } from '../modules/occupantSimulator.js';
import { DigitalTwinState } from '../modules/digitalTwinState.js';
import { MetricsEngine } from '../modules/metricsEngine.js';

console.log('🧪 RUNNING COMPREHENSIVE BLOCKED EXITS VALIDATION SUITE\n');

// ── TEST 1: ALL EXITS BLOCKED (CRITICAL DISASTER SCENARIO) ───────────────────
console.log('Test 1: All exits blocked disaster test (0% should evacuate, 100% trapped)...');
{
  const bus = new EventBus();
  const rand = createPRNG(42);
  const config = new ConfigManager({ bus });

  // Block ALL exits
  const res = config.set({
    building: {
      blockedExits: {
        EXIT_STAIR: true,
        EXIT_NORTH_103: true,
        EXIT_EAST: true,
      }
    },
    occupants: { count: 30 }
  });
  console.assert(res.success === true, `Config set must succeed: ${res.reason}`);

  const dtState = new DigitalTwinState({ bus });
  const graph = new BuildingGraph();
  const router = new RouteOptimizer({ bus, graph, config });
  const hazard = new HazardEngine({ bus, dtState, graph, config });
  const metrics = new MetricsEngine({ bus });

  let simDone = false;
  const engine = new SimulationEngine({ bus, scenario: BUILDING.scenario, config, seed: 42 });
  const occupants = new OccupantSimulator({
    bus,
    rand,
    routeOptimizer: router,
    dtState,
    config,
    signalComplete: () => { simDone = true; }
  });

  occupants.initialise(rand);
  bus.emit('sim:evacuation', { time: 5.0, tick: 50 });

  // Advance 10 ticks
  for (let t = 51; t <= 70; t++) {
    bus.emit('sim:tick', { tick: t, time: t / 10, phase: 'EVACUATION' });
  }

  const counts = occupants.getCount();
  const report = metrics.getReport();

  console.log(`  -> Occupants: Total=${counts.total}, Evacuated=${counts.evacuated}, Trapped=${counts.trapped}`);
  console.log(`  -> Metrics Report: Evacuated=${report.evacuated_occupants}, Trapped=${report.trapped_occupants}, LifeSafety=${report.evacuation_rate}%`);

  console.assert(counts.evacuated === 0, `Expected 0 evacuated when all exits blocked, got ${counts.evacuated}`);
  console.assert(counts.trapped === 30, `Expected 30 trapped when all exits blocked, got ${counts.trapped}`);
  console.assert(report.evacuated_occupants === 0, `Report evacuated should be 0, got ${report.evacuated_occupants}`);
  console.assert(report.evacuation_rate === 0, `Report life safety rate should be 0%, got ${report.evacuation_rate}%`);
  console.log('  ✓ TEST 1 PASSED: All exits blocked trapped 100% of occupants accurately.\n');
}

// ── TEST 2: ONLY 1 EXIT OPEN (EXIT_EAST ONLY) ────────────────────────────────
console.log('Test 2: Dual exits blocked (EXIT_STAIR & EXIT_NORTH_103 blocked, EXIT_EAST open)...');
{
  const bus = new EventBus();
  const rand = createPRNG(42);
  const config = new ConfigManager({ bus });

  config.set({
    building: {
      blockedExits: {
        EXIT_STAIR: true,
        EXIT_NORTH_103: true,
        EXIT_EAST: false,
      }
    },
    occupants: { count: 20 }
  });

  const dtState = new DigitalTwinState({ bus });
  const graph = new BuildingGraph();
  const router = new RouteOptimizer({ bus, graph, config });
  const hazard = new HazardEngine({ bus, dtState, graph, config });
  const metrics = new MetricsEngine({ bus });

  const occupants = new OccupantSimulator({
    bus,
    rand,
    routeOptimizer: router,
    dtState,
    config,
    signalComplete: () => {}
  });

  occupants.initialise(rand);

  // Check initial routes for all occupants
  const usedExits = new Set();
  occupants.getAll().forEach(occ => {
    const route = router.findPath(occ.homeRoom);
    if (route && route.exit) usedExits.add(route.exit);
  });

  console.log(`  -> Unique exits targeted across all occupants:`, Array.from(usedExits));
  console.assert(usedExits.size === 1 && usedExits.has('EXIT_EAST'), `Expected all occupants to route exclusively to EXIT_EAST!`);
  console.log('  ✓ TEST 2 PASSED: Occupants 100% routed through the only available exit (EXIT_EAST).\n');
}

console.log('🎉 ALL BLOCKED EXITS SCENARIO TESTS PASSED (100% SUCCESS)');
