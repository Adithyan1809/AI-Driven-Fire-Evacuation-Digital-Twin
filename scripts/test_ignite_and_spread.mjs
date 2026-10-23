/**
 * TEST: Interactive Multi-Origin Fire & Dynamic Spread Physics
 */

import { EventBus, createPRNG } from '../modules/simulationEngine.js';
import { ConfigManager } from '../modules/configManager.js';
import { SensorSimulator } from '../modules/sensorSimulator.js';
import { HazardEngine } from '../modules/hazardEngine.js';
import { DigitalTwinState } from '../modules/digitalTwinState.js';
import { BuildingGraph } from '../modules/buildingGraph.js';
import { BUILDING } from '../data/building.js';

console.log('🧪 TESTING INTERACTIVE IGNITION & DYNAMIC SPREAD PHYSICS\n');

// Test 1: ConfigManager helpers
const bus = new EventBus();
const cfgMgr = new ConfigManager({ bus });

cfgMgr.setFireSpreadRate(2.5);
if (cfgMgr.get().scenario.spreadRateMultiplier === 2.5) {
  console.log('✓ TEST 1 PASSED: setFireSpreadRate correctly updated scenario config to 2.5x');
} else {
  console.error('✗ TEST 1 FAILED');
  process.exit(1);
}

cfgMgr.setSmokeConvectionFactor(0.8);
if (cfgMgr.get().scenario.adjacentSmokeFactor === 0.8) {
  console.log('✓ TEST 2 PASSED: setSmokeConvectionFactor correctly updated scenario config to 0.8');
} else {
  console.error('✗ TEST 2 FAILED');
  process.exit(1);
}

// Test 3: Sensor Simulator Ramp with Variable Spread Rate
const rand = createPRNG(42);
const simSlow = new SensorSimulator({ bus, rand, config: { scenario: { spreadRateMultiplier: 0.5 } } });
const simFast = new SensorSimulator({ bus, rand, config: { scenario: { spreadRateMultiplier: 3.0 } } });

simSlow._onFireTrigger({ room: 'ROOM_101', tick: 50 });
simFast._onFireTrigger({ room: 'ROOM_101', tick: 50 });

const readingSlow = simSlow._computeReading({ id: 'TEMP_101', room: 'ROOM_101', type: 'TEMPERATURE' }, 70);
const readingFast = simFast._computeReading({ id: 'TEMP_101', room: 'ROOM_101', type: 'TEMPERATURE' }, 70);

console.log(`  • 20 ticks at 0.5x spread: ${readingSlow.value}°C`);
console.log(`  • 20 ticks at 3.0x spread: ${readingFast.value}°C`);

if (readingFast.value > readingSlow.value) {
  console.log('✓ TEST 3 PASSED: Fast spread rate accelerates temperature ramp significantly');
} else {
  console.error('✗ TEST 3 FAILED: Temperature did not accelerate with higher spread rate');
  process.exit(1);
}

// Test 4: Dynamic Multi-Origin Trigger in HazardEngine
const dtState = new DigitalTwinState({ bus });
const graph = new BuildingGraph(BUILDING.graph);

const hazard = new HazardEngine({ bus, dtState, graph, config: cfgMgr });

bus.emit('sim:fire_trigger', {
  rooms: ['ROOM_102', 'STAFF_ROOM'],
  manualTrigger: true
});

const ent102 = dtState.getEntity('ROOM_102');
const entStaff = dtState.getEntity('STAFF_ROOM');

if (ent102?.hazard_level === 'CRITICAL' && entStaff?.hazard_level === 'CRITICAL') {
  console.log('✓ TEST 4 PASSED: Multi-origin in-flight fire ignited both ROOM_102 and STAFF_ROOM to CRITICAL');
} else {
  console.error('✗ TEST 4 FAILED: In-flight multi-origin ignition did not set both spaces to CRITICAL');
  process.exit(1);
}

console.log('\n🎉 ALL INTERACTIVE IGNITION & SPREAD TESTS PASSED (100% SUCCESS)');
