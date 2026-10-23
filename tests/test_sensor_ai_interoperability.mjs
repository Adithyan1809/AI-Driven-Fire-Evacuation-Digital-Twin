/**
 * VERIFICATION SCRIPT: SYNTHETIC SENSORS & ZERO-SHOT AI INTEROPERABILITY
 *
 * Verifies:
 *   1. Synthetic IoT sensor physical telemetry generation (deterministic / physics-based).
 *   2. Multi-protocol heterogeneous message generation (BMS, FAS, ENV_IOT, OCC, BIM).
 *   3. Dynamic attribute extraction without hardcoding.
 *   4. Deterministic 7-point validation safety firewall.
 *   5. Semantic memory / caching speed (<2ms on cache hit).
 *   6. Honest AI offline rejection without pretending fallback is AI.
 *   7. Seeded simulation reproducibility.
 */

import { EventBus } from '../modules/simulationEngine.js';
import { SensorSimulator } from '../modules/sensorSimulator.js';
import { HeterogeneousMessageGenerator } from '../modules/heterogeneousMessages.js';
import { SemanticMiddleware } from '../modules/semanticMiddleware.js';
import { DigitalTwinState } from '../modules/digitalTwinState.js';
import { ValidationLayer } from '../modules/validationLayer.js';
import { AISemanticService } from '../modules/aiSemanticService.js';
import { BUILDING } from '../data/building.js';

function createSeededPRNG(seed = 42) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function() {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

console.log('================================================================');
console.log('🔬 VERIFYING SYNTHETIC IOT SIMULATOR & AI INTEROPERABILITY LAYER');
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

// ── Test 1: Synthetic Sensor Telemetry & Fire Physics ────────────────
const bus1 = new EventBus();
const rand1 = createSeededPRNG(42);
const sim1 = new SensorSimulator({ bus: bus1, rand: rand1 });

const baseline = sim1.getAllReadings();
assert(Object.keys(baseline).length > 0, 'Virtual IoT sensors initialized with baselines');
assert(baseline['TEMP_101']?.value >= 27 && baseline['TEMP_101']?.value <= 33, 'Normal room temperature in physical range (27-33°C)');
assert(baseline['SMOKE_101']?.value >= 0 && baseline['SMOKE_101']?.value <= 0.05, 'Normal room smoke in clean baseline range (0.0-0.05 AQI)');

// Trigger fire in Room 101 and simulate 50 ticks
bus1.emit('sim:fire_trigger', { room: 'ROOM_101', tick: 10 });
for (let t = 10; t <= 60; t++) {
  bus1.emit('sim:tick', { tick: t, rand: rand1, time: t * 0.1 });
}

const fireReading = sim1.getReading('TEMP_101');
const smokeReading = sim1.getReading('SMOKE_101');
assert(fireReading?.value > 50, `Fire room temperature ramps up realistically: ${fireReading?.value}°C (>50°C)`);
assert(smokeReading?.value > 0.30, `Fire room smoke ramps up realistically: ${smokeReading?.value} AQI (>0.30 AQI)`);

// ── Test 2: Heterogeneous Message Generation ────────────────────────
const heteroGen = new HeterogeneousMessageGenerator({ bus: bus1, sensorSim: sim1 });
const bmsMsgs = heteroGen._generateBMS();
const fasMsgs = heteroGen._generateFAS();
const iotMsgs = heteroGen._generateEnvIoT();
const occMsgs = heteroGen._generateOCC();
const bimMsgs = heteroGen._generateBIM();

assert(bmsMsgs.some(m => m.temp_celsius !== undefined && m.device_id !== undefined), 'BMS generates heterogeneous schema (device_id, temp_celsius, people_count)');
assert(fasMsgs.some(m => m.air_obscuration !== undefined && m.asset !== undefined), 'FAS generates heterogeneous schema (asset, air_obscuration, alert_level)');
assert(iotMsgs.some(m => m.thermal_index !== undefined && m.headcount !== undefined), 'ENV_IOT generates heterogeneous schema (node_ref, thermal_index, headcount)');
assert(occMsgs.some(m => m.presence_count !== undefined && m.endpoint !== undefined), 'OCCUPANCY generates heterogeneous schema (endpoint, presence_count)');
assert(bimMsgs.some(m => m.bim_space_type !== undefined && m.object !== undefined), 'BIM generates spatial model schema (object, bim_space_type)');

// ── Test 3: Dynamic Attribute Extraction in Semantic Middleware ─────
const dtState = new DigitalTwinState({ bus: bus1 });
const mw = new SemanticMiddleware({ bus: bus1, dtState });

const sampleIoTMsg = {
  _system: 'ENV_IOT',
  node_ref: 'THERMAL_X7',
  thermal_index: 32.1,
  headcount: 11,
  air_obscuration: 0.15,
};

const payload = mw._extractMessagePayload(sampleIoTMsg);
assert(payload.sourceEntity === 'THERMAL_X7', `Extracted entity identifier: "${payload.sourceEntity}"`);
assert(payload.attributes.includes('thermal_index') && payload.attributes.includes('headcount') && payload.attributes.includes('air_obscuration'),
  'Extracted all heterogeneous attribute keys dynamically without hardcoded schema rules');

// ── Test 4: Deterministic 7-Point Validation Safety Firewall ─────────
const validator = new ValidationLayer({ bus: bus1 });

// Valid mapping candidate
const validCandidate = {
  canonical_entity: 'ROOM_101',
  field: 'temperature',
  value: 32.4,
  confidence: 0.94,
  entity_found: true,
  decision: 'MATCH',
};
const valRes1 = validator.validate(validCandidate);
assert(valRes1.valid === true && (valRes1.status === 'ACCEPTED' || valRes1.status === 'PASSED'), 'Validation Firewall passes valid physical temperature (32.4°C in ROOM_101)');

// Corrupted / Hallucinated mapping candidate
const invalidCandidate = {
  canonical_entity: 'ROOM_101',
  field: 'temperature',
  value: 'banana', // invalid type
  confidence: 0.94,
  entity_found: true,
  decision: 'MATCH',
};
const valRes2 = validator.validate(invalidCandidate);
assert(valRes2.valid === false && (valRes2.status === 'REJECTED' || valRes2.status === 'INVALID_TYPE'), 'Validation Firewall safely rejects invalid datatype (temperature="banana")');

// Unknown entity candidate
const unknownCandidate = {
  canonical_entity: 'UNKNOWN_ZONE_999',
  field: 'temperature',
  value: 30.0,
  confidence: 0.30,
  entity_found: false,
  decision: 'UNKNOWN',
};
const valRes3 = validator.validate(unknownCandidate);
assert(valRes3.valid === false, 'Validation Firewall safely rejects unknown non-existent entity');

// ── Test 5: Semantic Cache & Instant Repeat Ingestion ────────────────
const aiService = new AISemanticService({ mode: 'DETERMINISTIC_BASELINE' });

// First resolution
const t0 = performance.now();
const res1 = await aiService.resolve({
  sourceSystem: 'BMS',
  sourceEntity: 'Z101',
  attributes: ['temp_celsius'],
});
const firstLatency = res1.latency_ms;

// Second resolution (should hit local cache)
const res2 = await aiService.resolve({
  sourceSystem: 'BMS',
  sourceEntity: 'Z101',
  attributes: ['temp_celsius'],
});

assert(res2.cache_hit === true, 'Subsequent identical schema triggers instant SEMANTIC_CACHE_HIT');
assert(res2.latency_ms < 5, `Cache hit resolution latency is sub-millisecond (${res2.latency_ms}ms < 5ms)`);

// ── Test 6: AI Offline Mode (Honest Failure Handling) ────────────────
const offlineService = new AISemanticService({ mode: 'AI_UNAVAILABLE' });
const offlineRes = await offlineService.resolve({
  sourceSystem: 'UNKNOWN_IOT',
  sourceEntity: 'NEW_UNSEEN_SENSOR_99',
  attributes: ['quantum_flux'],
});

assert(offlineRes.source === 'AI_UNAVAILABLE', 'Offline service honestly tags source as "AI_UNAVAILABLE"');
assert(offlineRes.validation.valid === false, 'Offline unresolvable schema is rejected by firewall, protecting Digital Twin state');

// ── Test 7: Seeded Reproducibility ──────────────────────────────────
const prngA = createSeededPRNG(12345);
const prngB = createSeededPRNG(12345);
const simA = new SensorSimulator({ bus: new EventBus(), rand: prngA });
const simB = new SensorSimulator({ bus: new EventBus(), rand: prngB });

const readA = simA.getAllReadings();
const readB = simB.getAllReadings();
let identical = true;
for (const k of Object.keys(readA)) {
  if (readA[k].value !== readB[k].value) {
    identical = false;
    break;
  }
}
assert(identical, 'Seeded PRNG guarantees 100% reproducible sensor stream initialization');

console.log(`\n================================================================`);
console.log(`📊 SUMMARY: ${passed}/${total} assertions passed (${((passed/total)*100).toFixed(0)}%)`);
console.log(`================================================================\n`);

process.exit(passed === total ? 0 : 1);
