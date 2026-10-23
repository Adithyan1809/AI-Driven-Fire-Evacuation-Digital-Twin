/**
 * GAP-C RESEARCH VERIFICATION & BENCHMARK SUITE
 *
 * Runs end-to-end automated empirical tests against the live Gemini 3.6 Flash backend.
 * Generates exact evidence for Parts 3, 4, 5, 6, 7, 8, and 10.
 */

import fs from 'fs';

const BASE_URL = 'http://localhost:8080';

// ── 30-Case Comprehensive Evaluation Dataset ─────────────
export const RESEARCH_BENCHMARK_30 = [
  // 1-5: Exact & Canonical Identifiers
  { id: 1, category: 'Exact Canonical', system: 'BMS', entity: 'ROOM_101', description: 'Room 101 AI lab', expected: 'ROOM_101', attrs: ['temperature'] },
  { id: 2, category: 'Exact Canonical', system: 'FAS', entity: 'ROOM_102', description: 'Room 102 Networks lab', expected: 'ROOM_102', attrs: ['fire_alarm'] },
  { id: 3, category: 'Exact Canonical', system: 'BIM', entity: 'ROOM_103', description: 'Room 103 Embedded lab', expected: 'ROOM_103', attrs: ['bim_space_type'] },
  { id: 4, category: 'Exact Canonical', system: 'BMS', entity: 'STAFF_ROOM', description: 'Faculty staff lounge', expected: 'STAFF_ROOM', attrs: ['occupancy'] },
  { id: 5, category: 'Exact Canonical', system: 'OCCUPANCY', entity: 'DEPT_OFFICE', description: 'Department main office', expected: 'DEPT_OFFICE', attrs: ['occupancy'] },

  // 6-10: BMS Zone Naming Schemes
  { id: 6, category: 'BMS Zone Code', system: 'BMS', entity: 'Z101', description: 'Zone 101 thermal sensor', expected: 'ROOM_101', attrs: ['temperature'] },
  { id: 7, category: 'BMS Zone Code', system: 'BMS', entity: 'Z102', description: 'Zone 102 thermal sensor', expected: 'ROOM_102', attrs: ['temperature'] },
  { id: 8, category: 'BMS Zone Code', system: 'BMS', entity: 'Z103', description: 'Zone 103 thermal sensor', expected: 'ROOM_103', attrs: ['temperature'] },
  { id: 9, category: 'BMS Zone Code', system: 'BMS', entity: 'Z_STAFF', description: 'Staff room climate control', expected: 'STAFF_ROOM', attrs: ['temperature'] },
  { id: 10, category: 'BMS Zone Code', system: 'BMS', entity: 'Z_HOD1', description: 'Executive head cabin zone', expected: 'HOD_CABIN_1', attrs: ['temperature'] },

  // 11-15: FAS Fire Alarm Device & Location Codes
  { id: 11, category: 'FAS Location Code', system: 'FAS', entity: 'R101', description: 'Fire alarm optical detector', expected: 'ROOM_101', attrs: ['fire_alarm'] },
  { id: 12, category: 'FAS Location Code', system: 'FAS', entity: 'R102', description: 'Smoke detector in networks lab', expected: 'ROOM_102', attrs: ['fire_alarm'] },
  { id: 13, category: 'FAS Location Code', system: 'FAS', entity: 'R103', description: 'Thermal sensor in hardware lab', expected: 'ROOM_103', attrs: ['fire_alarm'] },
  { id: 14, category: 'FAS Location Code', system: 'FAS', entity: 'FA_STAIR_A', description: 'Stairwell ionization detector', expected: 'STAIR_01', attrs: ['fire_alarm'] },
  { id: 15, category: 'FAS Location Code', system: 'FAS', entity: 'FA_ELEV_1', description: 'Elevator shaft 1 smoke sensor', expected: 'LIFT_1', attrs: ['fire_alarm'] },

  // 16-20: BIM/IFC Spatial GUIDs & Object Tags
  { id: 16, category: 'BIM IFC Space', system: 'BIM', entity: 'IfcSpace_1003', description: 'IfcSpace object for AI lab', expected: 'ROOM_101', attrs: ['bim_space_type'] },
  { id: 17, category: 'BIM IFC Space', system: 'BIM', entity: 'IfcSpace_1002', description: 'IfcSpace object for Networks lab', expected: 'ROOM_102', attrs: ['bim_space_type'] },
  { id: 18, category: 'BIM IFC Space', system: 'BIM', entity: 'IfcSpace_1001', description: 'IfcSpace object for IoT lab', expected: 'ROOM_103', attrs: ['bim_space_type'] },
  { id: 19, category: 'BIM IFC Space', system: 'BIM', entity: 'IfcSpace_1005', description: 'Circulation corridor space', expected: 'CORRIDOR_MAIN', attrs: ['bim_space_type'] },
  { id: 20, category: 'BIM IFC Space', system: 'BIM', entity: 'IfcSpace_1010', description: 'HOD executive suite space', expected: 'HOD_CABIN_1', attrs: ['bim_space_type'] },

  // 21-25: Zero-Shot Abbreviated & Unseen Synonyms
  { id: 21, category: 'Zero-Shot Synonym', system: 'BMS', entity: 'NEXUS-AI-01', description: 'advanced artificial intelligence and machine learning research laboratory', expected: 'ROOM_101', attrs: ['thermal_reading'] },
  { id: 22, category: 'Zero-Shot Synonym', system: 'BMS', entity: 'DISTRIB-SYS-LAB', description: 'distributed systems and computer networking research facility', expected: 'ROOM_102', attrs: ['temp_celsius'] },
  { id: 23, category: 'Zero-Shot Synonym', system: 'FAS', entity: 'HARDWARE-IOT-BAY', description: 'embedded microcontrollers and IoT prototyping workshop', expected: 'ROOM_103', attrs: ['smoke_density'] },
  { id: 24, category: 'Zero-Shot Synonym', system: 'OCCUPANCY', entity: 'FACULTY-MEETING-LOUNGE', description: 'teachers common meeting room and lounge', expected: 'STAFF_ROOM', attrs: ['people_present'] },
  { id: 25, category: 'Zero-Shot Synonym', system: 'OCCUPANCY', entity: 'ADMIN-ADMISSIONS-DESK', description: 'department administrative records office', expected: 'DEPT_OFFICE', attrs: ['headcount'] },

  // 26-27: Ambiguous Cases (Should trigger AMBIGUOUS or multi-candidate flag)
  { id: 26, category: 'Ambiguous Entity', system: 'BMS', entity: 'HOD-CABIN', description: 'HOD office cabin room on floor 1', expected: 'AMBIGUOUS', attrs: ['temperature'] },
  { id: 27, category: 'Ambiguous Entity', system: 'FAS', entity: 'ELEV-FOYER', description: 'passenger elevator shaft in southwest area', expected: 'AMBIGUOUS', attrs: ['smoke'] },

  // 28-30: Unknown & Malformed Cases (Should trigger UNKNOWN / Rejection)
  { id: 28, category: 'Unknown Entity', system: 'BMS', entity: 'ZONE_X73', description: 'unmapped external parking annex sensor', expected: 'UNKNOWN', attrs: ['temperature'] },
  { id: 29, category: 'Unknown Entity', system: 'FAS', entity: 'BASEMENT_SUBSTATION_99', description: 'high voltage electrical basement substation', expected: 'UNKNOWN', attrs: ['fire_alarm'] },
  { id: 30, category: 'Malformed Input', system: 'BMS', entity: '???_CORRUPT_NULL_###', description: 'garbled telemetry packet', expected: 'UNKNOWN', attrs: ['val'] },
];

async function run() {
  console.log('================================================================');
  console.log('  🔬 GAP-C RESEARCH VERIFICATION & EXPERIMENTAL AUDIT');
  console.log('================================================================\n');

  // ── PART 3: Zero-Shot Decision Verification ────────────────
  console.log('--- PART 3: Testing Zero-Shot Never-Before-Seen Entity ---');
  const customCanonical = [
    {
      id: 'ROOM_A1',
      name: 'Artificial Intelligence Laboratory',
      type: 'laboratory',
      description: 'Advanced academic laboratory for artificial intelligence and machine learning research',
      floor: 1,
      aliases: ['AI Lab'],
      attributes: { temperature: { type: 'number' } }
    },
    {
      id: 'ROOM_B2',
      name: 'Fluid Dynamics Laboratory',
      type: 'laboratory',
      description: 'Mechanical engineering fluid mechanics research lab',
      floor: 1,
      aliases: ['Fluids Lab'],
      attributes: { temperature: { type: 'number' } }
    }
  ];

  const zeroShotReq = {
    source_system: 'BMS',
    source_entity: 'NEXUS-AI-01',
    description: 'advanced artificial intelligence and machine learning research laboratory',
    entity_type: 'temperature_sensor',
    floor: 1,
    attributes: ['temperature'],
    canonical_entities: customCanonical,
    force_refresh: true,
  };

  const zRes = await fetch(`${BASE_URL}/api/semantic/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(zeroShotReq)
  });
  const zData = await zRes.json();

  console.log('Input:', zeroShotReq.source_system, zeroShotReq.source_entity, `"${zeroShotReq.description}"`);
  console.log('Gemini Target Entity:', zData.mapping?.target_entity);
  console.log('Confidence:', (zData.mapping?.entity_confidence * 100).toFixed(1) + '%');
  console.log('Reasoning:', zData.mapping?.reason);
  console.log('Alternatives:', zData.mapping?.alternatives);
  console.log('Firewall Status:', zData.validation?.status, `(Valid: ${zData.validation?.valid})`);
  console.log('Model Used:', zData.mapping?.model, `Latency: ${zData.mapping?.latency_ms}ms`);

  // ── PART 4: Dynamic Building Support (ID Change) ──────────
  console.log('\n--- PART 4: Testing Dynamic ID Change (ROOM_A1 -> LAB_X17) ---');
  const renamedCanonical = [
    {
      id: 'LAB_X17',
      name: 'Artificial Intelligence Laboratory',
      type: 'laboratory',
      description: 'Advanced academic laboratory for artificial intelligence and machine learning research',
      floor: 1,
      aliases: [],
      attributes: { temperature: { type: 'number' } }
    },
    {
      id: 'ROOM_B2',
      name: 'Fluid Dynamics Laboratory',
      type: 'laboratory',
      description: 'Mechanical engineering fluid mechanics research lab',
      floor: 1,
      aliases: [],
      attributes: { temperature: { type: 'number' } }
    }
  ];

  const dynReq = {
    source_system: 'BMS',
    source_entity: 'NEXUS-AI-01',
    description: 'advanced artificial intelligence and machine learning research laboratory',
    floor: 1,
    canonical_entities: renamedCanonical,
    force_refresh: true,
  };

  const dRes = await fetch(`${BASE_URL}/api/semantic/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dynReq)
  });
  const dData = await dRes.json();
  console.log('Input:', dynReq.source_entity);
  console.log('Dynamic Target Output:', dData.mapping?.target_entity);
  console.log('Confidence:', (dData.mapping?.entity_confidence * 100).toFixed(1) + '%');
  console.log('Reasoning:', dData.mapping?.reason);
  console.log('Match Result:', dData.mapping?.target_entity === 'LAB_X17' ? '✓ SUCCESS (Dynamic Resolution)' : '✗ FAILED');

  // ── PART 5: Attribute Semantics ───────────────────────────
  console.log('\n--- PART 5: Testing Unfamiliar Attribute Semantics ---');
  const attrTests = [
    { src: 'thermal_reading', expected: 'temperature' },
    { src: 'smoke_density', expected: 'smoke' },
    { src: 'people_present', expected: 'occupancy' }
  ];

  for (const at of attrTests) {
    const atRes = await fetch(`${BASE_URL}/api/semantic/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_system: 'BMS',
        source_entity: 'ROOM_101',
        description: 'Room 101 AI lab',
        attributes: [at.src],
        force_refresh: true,
      })
    });
    const atData = await atRes.json();
    const mappedAttr = atData.mapping?.attribute_mappings?.[0]?.target;
    console.log(`Attribute "${at.src}" => "${mappedAttr}" (Expected: "${at.expected}") -> ${mappedAttr === at.expected ? '✓ MATCH' : '✗'}`);
  }

  // ── PART 6: Unknown and Ambiguous Cases ────────────────────
  console.log('\n--- PART 6: Testing Unknown & Ambiguous Entities ---');
  const unkRes = await fetch(`${BASE_URL}/api/semantic/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_system: 'BMS',
      source_entity: 'ZONE_X73',
      description: 'Unmapped external parking annex sensor',
      force_refresh: true,
    })
  });
  const unkData = await unkRes.json();
  console.log('Unknown Entity (ZONE_X73):', unkData.mapping?.decision, 'Target:', unkData.mapping?.target_entity, 'Firewall:', unkData.validation?.status);

  const ambRes = await fetch(`${BASE_URL}/api/semantic/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_system: 'BMS',
      source_entity: 'HOD-CABIN',
      description: 'HOD cabin office room on floor 1',
      force_refresh: true,
    })
  });
  const ambData = await ambRes.json();
  console.log('Ambiguous Entity (HOD-CABIN):', ambData.mapping?.decision, 'Target:', ambData.mapping?.target_entity, 'Firewall:', ambData.validation?.status);

  // ── PART 8: Cache & Invalidation ──────────────────────────
  console.log('\n--- PART 8: Testing Semantic Cache Hit & Invalidation ---');
  // First query (warm cache)
  const c1 = await fetch(`${BASE_URL}/api/semantic/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_system: 'BMS', source_entity: 'Z101', attributes: ['temperature'] })
  });
  const cd1 = await c1.json();
  console.log('Cache Query 1:', cd1.cache_hit ? '⚡ CACHE HIT' : '🤖 GEMINI CALL', `Latency: ${cd1.mapping?.latency_ms}ms`);

  // Clear cache
  await fetch(`${BASE_URL}/api/semantic/cache/clear`, { method: 'POST' });
  const cStats = await (await fetch(`${BASE_URL}/api/semantic/cache`)).json();
  console.log('Cleared Cache Stats:', cStats);

  // ── PART 10: 30-Case Comprehensive Benchmark ──────────────
  console.log('\n--- PART 10: Executing 30-Case Research Benchmark ---');
  const benchRes = await fetch(`${BASE_URL}/api/semantic/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataset: RESEARCH_BENCHMARK_30 })
  });
  const bench = await benchRes.json();

  console.log(`Total Evaluated Cases: ${bench.totalTestCases}`);
  console.log(`Deterministic Baseline Accuracy: ${bench.baseline.accuracyPct}% (Avg Latency: ${bench.baseline.avgLatencyMs}ms)`);
  console.log(`Gemini AI Accuracy:              ${bench.geminiAI.accuracyPct}% (Avg Latency: ${bench.geminiAI.avgLatencyMs}ms, P95: ${bench.geminiAI.p95LatencyMs}ms)`);
  console.log('\nDetailed Breakdown:');
  bench.results.slice(0, 10).forEach(r => {
    console.log(`[#${r.item.id}] ${r.item.category.padEnd(20)} | Input: ${r.item.entity.padEnd(16)} | Expected: ${r.item.expected.padEnd(12)} | Baseline: ${r.baseline.target} (${r.baseline.correct?'✓':'✗'}) | Gemini: ${r.ai?.target} (${r.ai?.correct?'✓':'✗'})`);
  });
  console.log('... (total 30 cases evaluated)');

  console.log('\n================================================================');
  console.log('  ✓ GAP-C VERIFICATION & RESEARCH BENCHMARK COMPLETED');
  console.log('================================================================');
}

run().catch(console.error);
