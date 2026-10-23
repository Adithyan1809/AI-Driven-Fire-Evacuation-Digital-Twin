/**
 * Test Fire Propagation and Attribute Disambiguation in Semantic Middleware
 */

import { EventBus, SimulationEngine, createPRNG } from '../modules/simulationEngine.js';
import { ConfigManager } from '../modules/configManager.js';
import { SensorSimulator } from '../modules/sensorSimulator.js';
import { HeterogeneousMessageGenerator } from '../modules/heterogeneousMessages.js';
import { DigitalTwinState } from '../modules/digitalTwinState.js';
import { SemanticMiddleware } from '../modules/semanticMiddleware.js';
import { HazardEngine } from '../modules/hazardEngine.js';
import { BuildingGraph } from '../modules/buildingGraph.js';
import { BUILDING } from '../data/building.js';

async function test() {
  console.log('Testing Fire Event & Semantic Resolution for Room 101...');

  const bus = new EventBus();
  const rand = createPRNG(42);
  const configManager = new ConfigManager({ bus });

  const dtState = new DigitalTwinState({ bus });
  const graph = new BuildingGraph();
  const sensorSim = new SensorSimulator({ bus, rand, config: configManager });
  const heteroGen = new HeterogeneousMessageGenerator({ bus, sensorSim, config: configManager });
  const middleware = new SemanticMiddleware({ bus, dtState, config: configManager });
  const hazard = new HazardEngine({ bus, dtState, graph, config: configManager });

  // 1. Simulate Fire in Room 101 triggered at tick 100 (10.0s)
  sensorSim._onFireTrigger({ room: 'ROOM_101', tick: 100 });

  // Simulate tick 180 (18.0s into simulation, 8s into fire)
  sensorSim._onTick({ tick: 180, rand });

  const tempReading = sensorSim.getReading('TEMP_101');
  const smokeReading = sensorSim.getReading('SMOKE_101');
  const faReading = sensorSim.getReading('FA_101');

  console.log(`Sensor Readings for Room 101 at 15.0s:`);
  console.log(`  • TEMP_101:  ${tempReading?.value}°C (${tempReading?.status})`);
  console.log(`  • SMOKE_101: ${smokeReading?.value} AQI (${smokeReading?.status})`);
  console.log(`  • FA_101:    ${faReading?.value} (${faReading?.status})`);

  // 2. Generate BMS & FAS messages
  const bmsMsgs = heteroGen._generateBMS();
  const fasMsgs = heteroGen._generateFAS();

  console.log(`\nProcessing BMS and FAS messages through Semantic Middleware...`);
  await middleware._processBatch([...bmsMsgs, ...fasMsgs]);

  // 3. Inspect Room 101 in Digital Twin
  const room101State = dtState.getEntity('ROOM_101');
  console.log(`\nDigital Twin Unified State for ROOM_101:`);
  console.log(`  • Temperature:  ${room101State.temperature}°C`);
  console.log(`  • Smoke:        ${room101State.smoke} AQI`);
  console.log(`  • Fire Alarm:   ${room101State.fire_alarm ? '🚨 ACTIVE' : 'OFF'}`);
  console.log(`  • Hazard Level: ${room101State.hazard_level}`);

  // 4. Also Test Fire in Room 103
  console.log('\nTesting Fire in Room 103...');
  sensorSim._onFireTrigger({ room: 'ROOM_103', tick: 100 });
  sensorSim._onTick({ tick: 180, rand });
  const bms103 = heteroGen._generateBMS();
  const fas103 = heteroGen._generateFAS();
  await middleware._processBatch([...bms103, ...fas103]);

  const room103State = dtState.getEntity('ROOM_103');
  console.log(`\nDigital Twin Unified State for ROOM_103:`);
  console.log(`  • Temperature:  ${room103State.temperature}°C`);
  console.log(`  • Smoke:        ${room103State.smoke} AQI`);
  console.log(`  • Fire Alarm:   ${room103State.fire_alarm ? '🚨 ACTIVE' : 'OFF'}`);
  console.log(`  • Hazard Level: ${room103State.hazard_level}`);

  if (['CRITICAL', 'BLOCKED'].includes(room103State.hazard_level)) {
    console.log(`\n✓ SUCCESS: Room 103 properly transitions to ${room103State.hazard_level}!`);
  } else {
    console.error(`\n❌ FAILURE: Room 103 state is ${room103State.hazard_level}`);
  }
}

test().catch(console.error);
