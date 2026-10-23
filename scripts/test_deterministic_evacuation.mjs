/**
 * DETERMINISTIC SINGLE-SCENARIO EVACUATION DEBUG TEST (Part 4)
 *
 * Seed: 42
 * Timeline:
 *   t = 0.0s: Normal baseline evacuation start
 *   t = 2.0s: Fire ignites in Room 101 (95°C, 0.85 AQI, Fire Alarm = TRUE)
 *   t = 4.0s: Hazard spreads to Corridor (CORRIDOR_MAIN = CRITICAL, JUNC_101 & JUNC_102 cost x2500)
 *
 * Tracks individual occupants under STATIC_NEAREST vs DYNAMIC_DT to visibly demonstrate
 * route divergence and hazard avoidance.
 */

import { BUILDING, NODE_TO_SPACE_MAP, SPATIAL_GRAPH_MAPPING } from '../data/building.js';
import { EventBus, createPRNG } from '../modules/simulationEngine.js';
import { DigitalTwinState } from '../modules/digitalTwinState.js';
import { BuildingGraph } from '../modules/buildingGraph.js';
import { HazardEngine } from '../modules/hazardEngine.js';
import { RouteOptimizer } from '../modules/routeOptimizer.js';
import { OccupantSimulator } from '../modules/occupantSimulator.js';

function runDeterministicTest() {
  console.log('========================================================================================');
  console.log('  🔬 PART 4: DETERMINISTIC SINGLE-SCENARIO EVACUATION ROUTE DIVERGENCE TEST');
  console.log('========================================================================================\n');

  const seed = 42;
  const gamma = 2500;

  // 1. SETUP STATIC SIMULATION
  const busStatic = new EventBus();
  const randStatic = createPRNG(seed);
  const dtStatic = new DigitalTwinState({ bus: busStatic, spaces: BUILDING.spaces });
  const graphStatic = new BuildingGraph();
  const routeOptStatic = new RouteOptimizer({ bus: busStatic, graph: graphStatic });
  const occSimStatic = new OccupantSimulator({
    bus: busStatic,
    rand: randStatic,
    routeOptimizer: routeOptStatic,
    signalComplete: () => {}
  });

  occSimStatic.initialise(randStatic);

  // 2. SETUP DYNAMIC SIMULATION
  const busDynamic = new EventBus();
  const randDynamic = createPRNG(seed);
  const dtDynamic = new DigitalTwinState({ bus: busDynamic, spaces: BUILDING.spaces });
  const graphDynamic = new BuildingGraph();
  const customConfig = {
    routing: { hazardPenalty: gamma, smokePenalty: 20.0 },
    scenario: { fireSpread: true }
  };
  const hazardDynamic = new HazardEngine({ bus: busDynamic, dtState: dtDynamic, graph: graphDynamic, config: customConfig });
  const routeOptDynamic = new RouteOptimizer({ bus: busDynamic, graph: graphDynamic });
  const occSimDynamic = new OccupantSimulator({
    bus: busDynamic,
    rand: randDynamic,
    routeOptimizer: routeOptDynamic,
    config: customConfig,
    signalComplete: () => {}
  });

  occSimDynamic.initialise(randDynamic);

  // Hook dynamic rerouting to hazard updates
  busDynamic.on('hazard:graph_updated', () => {
    routeOptDynamic.calculateAllRoutes(BUILDING.spaces.map(s => s.id));
    occSimDynamic._rerouteAll();
  });

  // Track exposure
  const staticExposure = new Map();
  const dynamicExposure = new Map();

  occSimStatic.getAll().forEach(o => staticExposure.set(o.id, { exposed: false, ticks: 0 }));
  occSimDynamic.getAll().forEach(o => dynamicExposure.set(o.id, { exposed: false, ticks: 0 }));

  // Start Evacuation
  occSimStatic._beginEvacuation();
  occSimDynamic._beginEvacuation();

  console.log(`Initialized 50 occupants identically across Static and Dynamic modes with Seed ${seed}.\n`);

  // Target occupants to trace closely:
  // OCC_001: Starts in Room 103 (Western end)
  // OCC_015: Starts in Room 101 (Fire room)
  // OCC_035: Starts in Dept Office (Lower room near JUNC_102)
  const trackedIds = ['OCC_001', 'OCC_015', 'OCC_035'];

  const timelineLogs = [];

  for (let tick = 1; tick <= 100; tick++) {
    const timeS = +(tick * 0.1).toFixed(1);

    // Hazard events
    if (tick === 20) { // t = 2.0s
      console.log(`\n🔥 [t = 2.0s / Tick 20] Fire ignites in Room 101!`);
      dtDynamic.setState('ROOM_101', { temperature: 95.0, smoke: 0.85, fire_alarm: true, hazard_level: 'CRITICAL' }, 'FIRE_INJECTION');
      hazardDynamic._updateGraphCosts('ROOM_101', 'CRITICAL');
    }

    if (tick === 40) { // t = 4.0s
      console.log(`\n⚠️ [t = 4.0s / Tick 40] Hazard spreads to CORRIDOR_MAIN! Corridor becomes CRITICAL.`);
      dtDynamic.setState('CORRIDOR_MAIN', { temperature: 68.0, smoke: 0.65, hazard_level: 'CRITICAL' }, 'HAZARD_SPREAD');
      hazardDynamic._updateGraphCosts('CORRIDOR_MAIN', 'CRITICAL');
    }

    // Step simulators
    occSimStatic._onTick({ tick });
    occSimDynamic._onTick({ tick });

    // Track real-time hazard exposure
    occSimStatic.getAll().forEach(occ => {
      const activeNode = occ.path[occ.pathIndex] || occ.homeRoom;
      const spaceId = NODE_TO_SPACE_MAP[activeNode] || activeNode;
      const ent = dtDynamic.getEntity(spaceId);
      if (ent && (ent.hazard_level === 'CRITICAL' || ent.hazard_level === 'BLOCKED')) {
        const exp = staticExposure.get(occ.id);
        exp.exposed = true;
        exp.ticks++;
      }
    });

    occSimDynamic.getAll().forEach(occ => {
      const activeNode = occ.path[occ.pathIndex] || occ.homeRoom;
      const spaceId = NODE_TO_SPACE_MAP[activeNode] || activeNode;
      const ent = dtDynamic.getEntity(spaceId);
      if (ent && (ent.hazard_level === 'CRITICAL' || ent.hazard_level === 'BLOCKED')) {
        const exp = dynamicExposure.get(occ.id);
        exp.exposed = true;
        exp.ticks++;
      }
    });

    // Capture logs at key decision ticks
    if ([10, 20, 25, 40, 42, 50, 60, 80].includes(tick)) {
      console.log(`\n----------------------------------------------------------------------------------------`);
      console.log(`⏱️  TIMELINE TRACE AT t = ${timeS}s (Tick ${tick})`);
      console.log(`----------------------------------------------------------------------------------------`);
      console.log(`Corridor JUNC_101 Edge Cost: Static = ${graphStatic.getEdgeCost('JUNC_101', 'JUNC_E')} | Dynamic = ${graphDynamic.getEdgeCost('JUNC_101', 'JUNC_E')}`);

      trackedIds.forEach(id => {
        const sOcc = occSimStatic.getAll().find(o => o.id === id);
        const dOcc = occSimDynamic.getAll().find(o => o.id === id);

        const sTarget = sOcc.path[sOcc.pathIndex] || 'NONE';
        const dTarget = dOcc.path[dOcc.pathIndex] || 'NONE';

        const sSpace = NODE_TO_SPACE_MAP[sTarget] || sTarget;
        const dSpace = NODE_TO_SPACE_MAP[dTarget] || dTarget;

        const sHazard = dtDynamic.getEntity(sSpace)?.hazard_level || 'SAFE';
        const dHazard = dtDynamic.getEntity(dSpace)?.hazard_level || 'SAFE';

        console.log(`\n[${id}] Home: ${sOcc.homeRoom}`);
        console.log(`  STATIC:  Pos=(${sOcc.svgX.toFixed(1)}, ${sOcc.svgY.toFixed(1)}) | Target=${sTarget} | Status=${sOcc.status} | Route=[${sOcc.path.slice(sOcc.pathIndex).join(' → ')}] | ZoneHazard=${sHazard}`);
        console.log(`  DYNAMIC: Pos=(${dOcc.svgX.toFixed(1)}, ${dOcc.svgY.toFixed(1)}) | Target=${dTarget} | Status=${dOcc.status} | Route=[${dOcc.path.slice(dOcc.pathIndex).join(' → ')}] | ZoneHazard=${dHazard}`);
      });
    }
  }

  // Summary Metrics
  const staticEvacuated = occSimStatic.getAll().filter(o => o.status === 'EVACUATED').length;
  const dynamicEvacuated = occSimDynamic.getAll().filter(o => o.status === 'EVACUATED').length;

  const staticUnsafeCount = Array.from(staticExposure.values()).filter(e => e.exposed).length;
  const dynamicUnsafeCount = Array.from(dynamicExposure.values()).filter(e => e.exposed).length;

  const staticTotalExposureTicks = Array.from(staticExposure.values()).reduce((s, e) => s + e.ticks, 0);
  const dynamicTotalExposureTicks = Array.from(dynamicExposure.values()).reduce((s, e) => s + e.ticks, 0);

  console.log('\n========================================================================================');
  console.log('  📊 SUMMARY OF DETERMINISTIC TRACE EXPERIMENT (Seed 42)');
  console.log('========================================================================================');
  console.table({
    'Static Routing': {
      TotalOccupants: 50,
      Evacuated: staticEvacuated,
      UnsafeOccupants: staticUnsafeCount,
      SafeEvacuationRate: `${(((50 - staticUnsafeCount)/50)*100).toFixed(1)}%`,
      TotalHazardExposureSeconds: (staticTotalExposureTicks * 0.1).toFixed(1)
    },
    'Dynamic DT Routing': {
      TotalOccupants: 50,
      Evacuated: dynamicEvacuated,
      UnsafeOccupants: dynamicUnsafeCount,
      SafeEvacuationRate: `${(((50 - dynamicUnsafeCount)/50)*100).toFixed(1)}%`,
      TotalHazardExposureSeconds: (dynamicTotalExposureTicks * 0.1).toFixed(1)
    }
  });
}

runDeterministicTest();
