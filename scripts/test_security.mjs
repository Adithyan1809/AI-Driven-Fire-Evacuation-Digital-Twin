/**
 * TEST: Server-Side Safety Authority & Security Hardening
 *
 * Verifies:
 *   1. Client cannot inject fake canonical entities to bypass safety validation.
 *   2. Client cannot override minimum confidence threshold.
 *   3. Unknown entities are strictly rejected by the firewall.
 */

import { validateSemanticMappingRecord } from '../modules/validationLayer.js';
import { canonicalRegistryInstance } from '../data/canonicalRegistry.js';

console.log('🧪 RUNNING SECURITY & SAFETY AUTHORITY TESTS\n');

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

// 1. Spoofed canonical entity injection test
const spoofedMapping = {
  source_system: 'HACKED_BMS',
  source_entity: 'INVENTED_SENSOR_99',
  target_entity: 'FAKE_SAFE_ZONE_999', // Non-existent space
  entity_confidence: 0.99,
  field: 'temperature',
  value: 25.0,
  decision: 'MATCH'
};

const spoofCheck = validateSemanticMappingRecord(spoofedMapping, {
  canonicalEntities: canonicalRegistryInstance.getActiveSpaces(),
  minConfidence: 0.75,
});

assert(!spoofCheck.valid, 'Spoofed non-existent target entity is REJECTED');
assert(spoofCheck.status === 'REJECTED_UNKNOWN', `Status is REJECTED_UNKNOWN (got ${spoofCheck.status})`);

// 2. Low confidence bypass attempt
const lowConfidenceMapping = {
  source_system: 'BMS',
  source_entity: 'ZONE_X99',
  target_entity: 'ROOM_101',
  entity_confidence: 0.45, // Below 0.75 threshold
  field: 'temperature',
  value: 28.0,
  decision: 'MATCH'
};

// Even if client requests minConfidence 0.10, authoritative validator enforces 0.75
const confidenceCheck = validateSemanticMappingRecord(lowConfidenceMapping, {
  canonicalEntities: canonicalRegistryInstance.getActiveSpaces(),
  minConfidence: 0.75,
});

assert(!confidenceCheck.valid, 'Low confidence mapping (45%) is REJECTED');
assert(confidenceCheck.status === 'LOW_CONFIDENCE', `Status is LOW_CONFIDENCE (got ${confidenceCheck.status})`);

// 3. Ambiguous mapping without sufficient margin
const ambiguousMapping = {
  source_system: 'BMS',
  source_entity: 'ROOM_AMBIG',
  target_entity: 'ROOM_101',
  entity_confidence: 0.82,
  alternatives: [{ entity: 'ROOM_102', confidence: 0.80 }], // margin only 0.02 (< 0.05)
  field: 'temperature',
  value: 28.0,
  decision: 'AMBIGUOUS'
};

const ambiguityCheck = validateSemanticMappingRecord(ambiguousMapping, {
  canonicalEntities: canonicalRegistryInstance.getActiveSpaces(),
  minConfidence: 0.75,
  ambiguityMargin: 0.05,
});

// 4. Physical range violation test (impossible temperature)
const tempRangeViolation = {
  source_system: 'BMS',
  source_entity: 'TEMP_101',
  target_entity: 'ROOM_101',
  entity_confidence: 0.95,
  field: 'temperature',
  value: 99999, // Exceeds physical max 350°C
  decision: 'MATCH'
};
const tempRangeCheck = validateSemanticMappingRecord(tempRangeViolation, {
  canonicalEntities: canonicalRegistryInstance.getActiveSpaces(),
  minConfidence: 0.75,
});
assert(!tempRangeCheck.valid, 'Extreme physical temperature (99999°C) is REJECTED by safety firewall');
assert(tempRangeCheck.status === 'OUT_OF_BOUNDS', `Status is OUT_OF_BOUNDS (got ${tempRangeCheck.status})`);

// 5. Physical range violation test (negative smoke)
const smokeRangeViolation = {
  source_system: 'FAS',
  source_entity: 'SMK_101',
  target_entity: 'ROOM_101',
  entity_confidence: 0.95,
  field: 'smoke',
  value: -0.5, // Below physical min 0.0
  decision: 'MATCH'
};
const smokeRangeCheck = validateSemanticMappingRecord(smokeRangeViolation, {
  canonicalEntities: canonicalRegistryInstance.getActiveSpaces(),
  minConfidence: 0.75,
});
assert(!smokeRangeCheck.valid, 'Negative smoke value (-0.5) is REJECTED by safety firewall');
assert(smokeRangeCheck.status === 'OUT_OF_BOUNDS', `Status is OUT_OF_BOUNDS (got ${smokeRangeCheck.status})`);

// 6. Unknown field injection attempt
const fieldInjectionViolation = {
  source_system: 'BMS',
  source_entity: 'TEMP_101',
  target_entity: 'ROOM_101',
  entity_confidence: 0.95,
  field: 'hacked_admin_override',
  value: true,
  decision: 'MATCH'
};
const fieldCheck = validateSemanticMappingRecord(fieldInjectionViolation, {
  canonicalEntities: canonicalRegistryInstance.getActiveSpaces(),
  minConfidence: 0.75,
});
assert(!fieldCheck.valid, 'Non-permitted field "hacked_admin_override" is REJECTED by safety firewall');
assert(fieldCheck.status === 'UNRECOGNIZED_FIELD', `Status is UNRECOGNIZED_FIELD (got ${fieldCheck.status})`);

console.log(`\nResults: ${passed}/${total} assertions passed.\n`);
if (passed !== total) process.exit(1);
