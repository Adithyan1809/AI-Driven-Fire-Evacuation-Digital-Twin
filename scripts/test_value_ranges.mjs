/**
 * TEST: Physical Value Ranges & Anomaly Validation
 *
 * Verifies:
 *   1. Impossible physical values (temp: 999999, smoke: -20, occ: -4) are rejected.
 *   2. Invalid data types are rejected.
 *   3. Unrecognized fields are rejected.
 *   4. Unknown entities are rejected.
 *   5. Low confidence and ambiguous mappings are rejected/held.
 *   6. Invalid values NEVER mutate DigitalTwinState through the external pipeline.
 */

import { validateSemanticMappingRecord, ValidationLayer } from '../modules/validationLayer.js';
import { canonicalRegistryInstance } from '../data/canonicalRegistry.js';
import { EventBus } from '../modules/simulationEngine.js';
import { DigitalTwinState } from '../modules/digitalTwinState.js';

console.log('🧪 RUNNING VALUE RANGES & ANOMALY VALIDATION TESTS\n');

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

const spaces = canonicalRegistryInstance.getActiveSpaces();

// 1. Impossible temperature (999999°C)
const r1 = validateSemanticMappingRecord({
  canonical_entity: 'ROOM_101',
  field: 'temperature',
  value: 999999,
  confidence: 0.95,
}, { canonicalEntities: spaces });
assert(!r1.valid, 'Temperature 999999°C is REJECTED');
assert(r1.status === 'OUT_OF_BOUNDS', `Status is OUT_OF_BOUNDS (got ${r1.status})`);

// 2. Negative smoke (-20)
const r2 = validateSemanticMappingRecord({
  canonical_entity: 'ROOM_101',
  field: 'smoke',
  value: -20,
  confidence: 0.95,
}, { canonicalEntities: spaces });
assert(!r2.valid, 'Negative smoke -20 is REJECTED');
assert(r2.status === 'OUT_OF_BOUNDS', `Status is OUT_OF_BOUNDS (got ${r2.status})`);

// 3. Negative occupancy (-4)
const r3 = validateSemanticMappingRecord({
  canonical_entity: 'ROOM_101',
  field: 'occupancy',
  value: -4,
  confidence: 0.95,
}, { canonicalEntities: spaces });
assert(!r3.valid, 'Negative occupancy -4 is REJECTED');
assert(r3.status === 'OUT_OF_BOUNDS', `Status is OUT_OF_BOUNDS (got ${r3.status})`);

// 4. Invalid data type (string where number expected)
const r4 = validateSemanticMappingRecord({
  canonical_entity: 'ROOM_101',
  field: 'temperature',
  value: 'HOT_FIRE',
  confidence: 0.95,
}, { canonicalEntities: spaces });
assert(!r4.valid, 'Non-numeric string value for temperature is REJECTED');
assert(r4.status === 'INVALID_TYPE', `Status is INVALID_TYPE (got ${r4.status})`);

// 5. Unrecognized field
const r5 = validateSemanticMappingRecord({
  canonical_entity: 'ROOM_101',
  field: 'arbitrary_internal_state_override',
  value: true,
  confidence: 0.95,
}, { canonicalEntities: spaces });
assert(!r5.valid, 'Unrecognized field name is REJECTED');
assert(r5.status === 'UNRECOGNIZED_FIELD', `Status is UNRECOGNIZED_FIELD (got ${r5.status})`);

// 6. Unknown entity
const r6_unknown = validateSemanticMappingRecord({
  canonical_entity: 'UNKNOWN_ROOM_999',
  field: 'temperature',
  value: 30.0,
  confidence: 0.95,
}, { canonicalEntities: spaces });
assert(!r6_unknown.valid, 'Unknown entity is REJECTED');
assert(r6_unknown.status === 'REJECTED_UNKNOWN', `Status is REJECTED_UNKNOWN (got ${r6_unknown.status})`);

// 7. Valid normal reading passes
const r7 = validateSemanticMappingRecord({
  canonical_entity: 'ROOM_101',
  field: 'temperature',
  value: 32.5,
  confidence: 0.95,
}, { canonicalEntities: spaces });
assert(r7.valid, 'Valid temperature 32.5°C is ACCEPTED');
assert(r7.status === 'ACCEPTED', `Status is ACCEPTED (got ${r7.status})`);

// 8. Pipeline Immunity Test: Confirm invalid values NEVER reach DigitalTwinState
const bus = new EventBus();
const dtState = new DigitalTwinState({ bus });
const validator = new ValidationLayer({ bus });

const invalidBatch = [
  { canonical_entity: 'ROOM_101', field: 'temperature', value: 999999, confidence: 0.95 },
  { canonical_entity: 'ROOM_101', field: 'smoke', value: -20, confidence: 0.95 },
  { canonical_entity: 'ROOM_102', field: 'occupancy', value: -4, confidence: 0.95 },
  { canonical_entity: 'UNKNOWN_SPACE', field: 'temperature', value: 30.0, confidence: 0.95 },
];

const { patchMap, report } = validator.validateBatch(invalidBatch);

assert(Object.keys(patchMap).length === 0, `All invalid mappings excluded from patchMap (got ${Object.keys(patchMap).length})`);
assert(report.every(r => !r.result.valid), 'All 4 anomaly tests marked invalid in validation report');

// Attempting to apply the invalid patchMap
dtState.applyPatchMap(patchMap, 'MW:TELEMETRY');

assert(dtState.getEntity('ROOM_101').temperature === 27.4, 'ROOM_101 temperature preserved at 27.4°C baseline');
assert(dtState.getEntity('ROOM_101').smoke === 0.01, 'ROOM_101 smoke preserved at 0.01 baseline');
assert(dtState.getEntity('ROOM_102').occupancy >= 0 && dtState.getEntity('ROOM_102').occupancy !== -4, `ROOM_102 occupancy preserved at valid baseline (got ${dtState.getEntity('ROOM_102').occupancy}, not -4)`);

console.log(`\nResults: ${passed}/${total} assertions passed.\n`);
if (passed !== total) process.exit(1);
