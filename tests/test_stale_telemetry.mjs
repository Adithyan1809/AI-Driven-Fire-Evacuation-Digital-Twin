/**
 * TEST: Telemetry Ordering & Freshness Sequencing
 *
 * Verifies:
 *   1. Stale timestamp packets are rejected.
 *   2. Monotonic sequence numbering is enforced.
 *   3. Out-of-order packets do not corrupt Digital Twin state.
 */

import { TelemetrySequencer } from '../modules/telemetrySequencer.js';
import { EventBus } from '../modules/simulationEngine.js';
import { DigitalTwinState } from '../modules/digitalTwinState.js';

console.log('🧪 RUNNING TELEMETRY SEQUENCING & FRESHNESS TESTS\n');

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

const sequencer = new TelemetrySequencer();

// 1. First packet establishes baseline
const p1 = sequencer.evaluate({ entityId: 'ROOM_101', timestamp: 1000, seq: 1 });
assert(p1.accepted, 'Packet 1 (t=1000, seq=1) accepted as initial watermark');

// 2. Newer packet is accepted
const p2 = sequencer.evaluate({ entityId: 'ROOM_101', timestamp: 2000, seq: 2 });
assert(p2.accepted, 'Packet 2 (t=2000, seq=2) accepted');

// 3. Stale packet with older timestamp is REJECTED
const p3 = sequencer.evaluate({ entityId: 'ROOM_101', timestamp: 1500, seq: 3 });
assert(!p3.accepted, 'Packet 3 (t=1500 < 2000) is REJECTED as stale');
assert(p3.reason.includes('Stale telemetry rejected'), 'Descriptive rejection reason provided');

// 4. Equal timestamp with lower/equal sequence is REJECTED
const p4 = sequencer.evaluate({ entityId: 'ROOM_101', timestamp: 2000, seq: 2 });
assert(!p4.accepted, 'Packet 4 (t=2000, seq=2 <= 2) is REJECTED as duplicate/stale sequence');

// 5. Verification on DigitalTwinState integration
const bus = new EventBus();
const dtState = new DigitalTwinState({ bus });

const updated1 = dtState.setState('ROOM_101', { temperature: 35.0 }, 'MW:BMS', { timestamp: 5000, seq: 10 });
assert(updated1, 'DT state accepted first telemetry update at t=5000');
assert(dtState.getEntity('ROOM_101').temperature === 35.0, 'ROOM_101 temperature updated to 35.0°C');

const updated2 = dtState.setState('ROOM_101', { temperature: 20.0 }, 'MW:BMS', { timestamp: 3000, seq: 11 });
assert(!updated2, 'DT state REJECTED stale telemetry update from t=3000');
assert(dtState.getEntity('ROOM_101').temperature === 35.0, 'ROOM_101 temperature remained 35.0°C (not overwritten)');

// 6. Batch Telemetry Sequence Granularity Regression Test
// Given a batch containing:
//   ROOM_101 -> seq 101
//   ROOM_102 -> seq 102
//   ROOM_103 -> seq 103
// The DigitalTwinState/sequencer must preserve the exact sequence metadata for each entity.

import { ValidationLayer } from '../modules/validationLayer.js';

const batchValidator = new ValidationLayer({ bus });
const batchMessages = [
  { canonical_entity: 'ROOM_101', field: 'temperature', value: 29.1, confidence: 0.95, ts: 6000, seq: 101, source_entity: 'TEMP_101' },
  { canonical_entity: 'ROOM_102', field: 'temperature', value: 28.5, confidence: 0.95, ts: 6000, seq: 102, source_entity: 'TEMP_102' },
  { canonical_entity: 'ROOM_103', field: 'temperature', value: 27.8, confidence: 0.95, ts: 6000, seq: 103, source_entity: 'TEMP_103' },
];

const { patchMap, metaMap } = batchValidator.validateBatch(batchMessages);

assert(metaMap['ROOM_101'].seq === 101, 'ROOM_101 metaMap preserved seq 101');
assert(metaMap['ROOM_102'].seq === 102, 'ROOM_102 metaMap preserved seq 102');
assert(metaMap['ROOM_103'].seq === 103, 'ROOM_103 metaMap preserved seq 103');

dtState.applyPatchMap(patchMap, 'MW:TELEMETRY', metaMap);

const wm101 = dtState._sequencer.getWatermark('ROOM_101');
const wm102 = dtState._sequencer.getWatermark('ROOM_102');
const wm103 = dtState._sequencer.getWatermark('ROOM_103');

assert(wm101 && wm101.lastSeq === 101, `ROOM_101 sequencer watermark preserved seq 101 (got ${wm101?.lastSeq})`);
assert(wm102 && wm102.lastSeq === 102, `ROOM_102 sequencer watermark preserved seq 102 (got ${wm102?.lastSeq})`);
assert(wm103 && wm103.lastSeq === 103, `ROOM_103 sequencer watermark preserved seq 103 (got ${wm103?.lastSeq})`);

// An update with seq 101 for ROOM_102 (older than 102 at timestamp 6000) must now be REJECTED
const rejectedFor102 = dtState.setState('ROOM_102', { temperature: 30.0 }, 'MW:BMS', { timestamp: 6000, seq: 101 });
assert(!rejectedFor102, 'Out-of-order seq 101 for ROOM_102 (whose mark is 102) was REJECTED');

console.log(`\nResults: ${passed}/${total} assertions passed.\n`);
if (passed !== total) process.exit(1);

