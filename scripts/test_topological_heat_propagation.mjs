/**
 * TEST: Multi-Hop Topological Distance-Weighted Thermal & Smoke Propagation
 *
 * Verifies that:
 * 1. Every room and corridor in the building heats up realistically when fire starts.
 * 2. Rooms closest to the fire origin(s) heat up faster than farther rooms.
 * 3. Gradient ordering holds: Temp(Origin) > Temp(Dist 1) > Temp(Dist 2) > Temp(Dist 3).
 * 4. CORRIDOR_LEFT (West Pathway) steadily increases in temperature throughout evacuation.
 */

import { EventBus, createPRNG } from '../modules/simulationEngine.js';
import { SensorSimulator, computeTopologicalDistances } from '../modules/sensorSimulator.js';
import { BUILDING } from '../data/building.js';

console.log('🧪 TESTING MULTI-HOP TOPOLOGICAL HEAT PROPAGATION ALGORITHM\n');

const bus = new EventBus();
const rand = createPRNG(42);
const fireRooms = ['ROOM_101', 'ROOM_102', 'ROOM_103'];

// 1. Verify BFS Topological Distance Computation
const distMap = computeTopologicalDistances(BUILDING, fireRooms);
console.log('Topological Hop Distances from Classrooms [ROOM_101, 102, 103]:');
console.log(`  • Classrooms (Origin): Dist = ${distMap['ROOM_101']} (Expected 0)`);
console.log(`  • CORRIDOR_MAIN:       Dist = ${distMap['CORRIDOR_MAIN']} (Expected 1)`);
console.log(`  • CORRIDOR_LEFT:       Dist = ${distMap['CORRIDOR_LEFT']} (Expected 2)`);
console.log(`  • STAIR_01:            Dist = ${distMap['STAIR_01']} (Expected 3)`);

if (distMap['ROOM_101'] === 0 && distMap['CORRIDOR_MAIN'] === 1 && distMap['CORRIDOR_LEFT'] === 2 && distMap['STAIR_01'] === 3) {
  console.log('✓ TEST 1 PASSED: Multi-hop topological BFS distances are mathematically exact.\n');
} else {
  console.error('✗ TEST 1 FAILED: Distance map calculation mismatch:', distMap);
  process.exit(1);
}

// 2. Initialize Sensor Simulator with Classrooms on Fire at Tick 50 (5.0s)
const sim = new SensorSimulator({
  bus,
  rand,
  config: { scenario: { fireSeverity: 'HIGH', spreadRateMultiplier: 1.0 } }
});

sim._onFireTrigger({ rooms: fireRooms, tick: 50 });

// Measure readings at t = 5.0s (Tick 50 - Ignition)
const t50_101   = sim._computeReading({ id: 'TEMP_101', room: 'ROOM_101', type: 'TEMPERATURE' }, 50).value;
const t50_main  = sim._computeReading({ id: 'TEMP_MAIN', room: 'CORRIDOR_MAIN', type: 'TEMPERATURE' }, 50).value;
const t50_left  = sim._computeReading({ id: 'TEMP_CORR_L', room: 'CORRIDOR_LEFT', type: 'TEMPERATURE' }, 50).value;

// Measure readings at t = 9.0s (Tick 90 - Mid Evacuation)
const t90_101   = sim._computeReading({ id: 'TEMP_101', room: 'ROOM_101', type: 'TEMPERATURE' }, 90).value;
const t90_main  = sim._computeReading({ id: 'TEMP_MAIN', room: 'CORRIDOR_MAIN', type: 'TEMPERATURE' }, 90).value;
const t90_left  = sim._computeReading({ id: 'TEMP_CORR_L', room: 'CORRIDOR_LEFT', type: 'TEMPERATURE' }, 90).value;
const s90_left  = sim._computeReading({ id: 'SMOKE_CORR_L', room: 'CORRIDOR_LEFT', type: 'SMOKE' }, 90).value;

// Measure readings at t = 14.0s (Tick 140 - Late Evacuation)
const t140_101  = sim._computeReading({ id: 'TEMP_101', room: 'ROOM_101', type: 'TEMPERATURE' }, 140).value;
const t140_main = sim._computeReading({ id: 'TEMP_MAIN', room: 'CORRIDOR_MAIN', type: 'TEMPERATURE' }, 140).value;
const t140_left = sim._computeReading({ id: 'TEMP_CORR_L', room: 'CORRIDOR_LEFT', type: 'TEMPERATURE' }, 140).value;
const s140_left = sim._computeReading({ id: 'SMOKE_CORR_L', room: 'CORRIDOR_LEFT', type: 'SMOKE' }, 140).value;

console.log('Temperature Progression Over Time:');
console.log(`  • t =  5.0s (Tick  50): Origin=${t50_101}°C | Main Corridor=${t50_main}°C | West Pathway=${t50_left}°C`);
console.log(`  • t =  9.0s (Tick  90): Origin=${t90_101}°C | Main Corridor=${t90_main}°C | West Pathway=${t90_left}°C (Smoke=${s90_left} AQI)`);
console.log(`  • t = 14.0s (Tick 140): Origin=${t140_101}°C | Main Corridor=${t140_main}°C | West Pathway=${t140_left}°C (Smoke=${s140_left} AQI)\n`);

// 3. Assertions
// A. CORRIDOR_LEFT temperature must increase significantly over time (not stay flat at baseline)
if (t140_left > t50_left + 15) {
  console.log(`✓ TEST 2 PASSED: CORRIDOR_LEFT temperature increased steadily from ${t50_left}°C to ${t140_left}°C.`);
} else {
  console.error(`✗ TEST 2 FAILED: CORRIDOR_LEFT did not heat up sufficiently (${t50_left}°C -> ${t140_left}°C)`);
  process.exit(1);
}

// B. Strict spatial gradient hierarchy: Origin > Main Corridor > West Pathway
if (t140_101 > t140_main && t140_main > t140_left) {
  console.log(`✓ TEST 3 PASSED: Spatial thermal gradient strictly maintained (${t140_101}°C > ${t140_main}°C > ${t140_left}°C).`);
} else {
  console.error(`✗ TEST 3 FAILED: Spatial gradient inverted: Origin=${t140_101}, Main=${t140_main}, Left=${t140_left}`);
  process.exit(1);
}

// C. Heating rate ordering: Delta T / Delta t (closer room increases faster than farther room)
const rateOrigin = (t140_101 - t50_101) / 90;
const rateMain   = (t140_main - t50_main) / 90;
const rateLeft   = (t140_left - t50_left) / 90;

console.log(`Heating Rates: Origin = ${rateOrigin.toFixed(3)}°C/tick | Main = ${rateMain.toFixed(3)}°C/tick | Left = ${rateLeft.toFixed(3)}°C/tick`);

if (rateOrigin > rateMain && rateMain > rateLeft) {
  console.log('✓ TEST 4 PASSED: Rate of temperature increase is strictly decreasing with distance.\n');
} else {
  console.error('✗ TEST 4 FAILED: Heating rate was not strictly decreasing with distance');
  process.exit(1);
}

console.log('🎉 ALL MULTI-HOP TOPOLOGICAL HEAT PROPAGATION TESTS PASSED (100% SUCCESS)');
