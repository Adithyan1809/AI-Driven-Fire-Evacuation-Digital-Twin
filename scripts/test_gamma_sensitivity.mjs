/**
 * GAMMA HAZARD PENALTY SENSITIVITY SWEEP (Part 6)
 *
 * Evaluates how varying the hazard penalty multiplier gamma
 * directly modifies graph edge costs, Dijkstra routing choices,
 * evacuation time, unsafe exposure, and reroute frequency.
 */

import { BUILDING, NODE_TO_SPACE_MAP, SPATIAL_GRAPH_MAPPING } from '../data/building.js';
import { EventBus, createPRNG } from '../modules/simulationEngine.js';
import { DigitalTwinState } from '../modules/digitalTwinState.js';
import { BuildingGraph } from '../modules/buildingGraph.js';
import { HazardEngine } from '../modules/hazardEngine.js';
import { RouteOptimizer } from '../modules/routeOptimizer.js';
import { OccupantSimulator } from '../modules/occupantSimulator.js';

function runGammaSensitivity() {
  console.log('========================================================================================');
  console.log('  🔬 PART 6: GAMMA HAZARD PENALTY SENSITIVITY SWEEP & EDGE COST PROOF');
  console.log('========================================================================================\n');

  const gammaValues = [1.5, 2.0, 2.5, 3.5, 5.0, 10.0, 25.0, 2500.0];
  const seed = 42;
  const results = [];

  for (const gamma of gammaValues) {
    const bus = new EventBus();
    const rand = createPRNG(seed);
    const dtState = new DigitalTwinState({ bus, spaces: BUILDING.spaces });
    const graph = new BuildingGraph();
    const customConfig = {
      routing: { hazardPenalty: gamma, smokePenalty: Math.min(2.0, gamma * 0.5) },
      scenario: { fireSpread: true }
    };

    const hazardEngine = new HazardEngine({ bus, dtState, graph, config: customConfig });
    const routeOpt = new RouteOptimizer({ bus, graph });
    const occSim = new OccupantSimulator({
      bus,
      rand,
      routeOptimizer: routeOpt,
      config: customConfig,
      signalComplete: () => {}
    });

    let rerouteCount = 0;
    bus.on('hazard:graph_updated', () => {
      routeOpt.calculateAllRoutes(BUILDING.spaces.map(s => s.id));
      occSim._rerouteAll();
      rerouteCount++;
    });

    const exposureMap = new Map();
    occSim.initialise(rand);
    occSim.getAll().forEach(o => exposureMap.set(o.id, { exposed: false, ticks: 0 }));

    occSim._beginEvacuation();

    // Trigger Fire at tick 20 in Room 101, spread at tick 40 to Corridor
    for (let tick = 1; tick <= 100; tick++) {
      if (tick === 20) {
        dtState.setState('ROOM_101', { temperature: 95.0, smoke: 0.85, fire_alarm: true, hazard_level: 'CRITICAL' }, 'FIRE_INJECTION');
        hazardEngine._updateGraphCosts('ROOM_101', 'CRITICAL');
      }
      if (tick === 40) {
        dtState.setState('CORRIDOR_MAIN', { temperature: 68.0, smoke: 0.65, hazard_level: 'CRITICAL' }, 'HAZARD_SPREAD');
        hazardEngine._updateGraphCosts('CORRIDOR_MAIN', 'CRITICAL');
      }

      occSim._onTick({ tick });

      occSim.getAll().forEach(occ => {
        const activeNode = occ.path[occ.pathIndex] || occ.homeRoom;
        const spaceId = NODE_TO_SPACE_MAP[activeNode] || activeNode;
        const ent = dtState.getEntity(spaceId);
        if (ent && (ent.hazard_level === 'CRITICAL' || ent.hazard_level === 'BLOCKED')) {
          const exp = exposureMap.get(occ.id);
          exp.exposed = true;
          exp.ticks++;
        }
      });
    }

    // Inspect Room 102 path choice under this gamma
    const room102Path = routeOpt.findPath('JUNC_102');
    const junc101EdgeCost = graph.getEdgeCost('JUNC_101', 'JUNC_E');
    const junc102EdgeCost = graph.getEdgeCost('JUNC_102', 'JUNC_101');

    const evacuated = occSim.getAll().filter(o => o.status === 'EVACUATED').length;
    const unsafeCount = Array.from(exposureMap.values()).filter(e => e.exposed).length;
    const totalExposureSec = +(Array.from(exposureMap.values()).reduce((s, e) => s + e.ticks, 0) * 0.1).toFixed(1);

    results.push({
      Gamma: gamma,
      'Corridor Edge Cost': junc101EdgeCost,
      'JUNC_102 Edge Cost': junc102EdgeCost,
      'Room 102 Assigned Exit': room102Path.path[room102Path.path.length - 1],
      'Assigned Route': room102Path.path.join(' → '),
      'Evacuated': evacuated,
      'Unsafe Occupants': unsafeCount,
      'Safe Evacuation Rate': `${(((50 - unsafeCount)/50)*100).toFixed(1)}%`,
      'Total Exposure (s)': totalExposureSec,
      'Reroutes': rerouteCount
    });
  }

  console.table(results);
}

runGammaSensitivity();
