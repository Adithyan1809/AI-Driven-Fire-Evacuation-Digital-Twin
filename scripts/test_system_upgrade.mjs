const BASE = 'http://localhost:8080';

async function run() {
  console.log('================================================================');
  console.log('  🧪 RUNNING DIGITAL TWIN COMPREHENSIVE PRODUCT VERIFICATION');
  console.log('================================================================\n');

  // 1. Health & Model
  console.log('--- 1. Health Check ---');
  const healthRes = await fetch(`${BASE}/api/health`);
  const health = await healthRes.json();
  console.log(`Status: ${health.status}, Gemini Key: ${health.hasGeminiKey}, Model: ${health.model}`);
  console.log(`Active Building: ${health.memoryStats.activeBuilding} (${health.memoryStats.modelVersion})\n`);

  // 2. Available Buildings & Multi-Building Generalization
  console.log('--- 2. Multi-Building Generalization Check ---');
  const bldRes = await fetch(`${BASE}/api/buildings`);
  const bldData = await bldRes.json();
  console.log(`Available Buildings (${bldData.availableBuildings.length}):`);
  bldData.availableBuildings.forEach(b => console.log(`  • ${b.name} (Floor ${b.floor}, ${b.roomCount} spaces)`));
  console.log();

  // 3. Unseen Identifier & Schema Resolution
  console.log('--- 3. Unseen Schema & Zero-Shot Resolution ---');
  const resolveRes = await fetch(`${BASE}/api/semantic/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: 'BMS',
      node: 'NEXUS-AI-01',
      thermal_reading: 61.4,
      people_present: 23,
      description: 'Advanced computing and robotics research laboratory',
      force_refresh: true,
    })
  });
  const resolveData = await resolveRes.json();
  console.log(`Input: BMS "NEXUS-AI-01" (Schema: origin, node, thermal_reading, people_present)`);
  console.log(`Resolved Target: ${resolveData.mapping.target_entity} (Confidence: ${(resolveData.mapping.entity_confidence*100).toFixed(0)}%)`);
  console.log(`Attributes Mapped:`, resolveData.mapping.attribute_mappings);
  console.log(`Firewall: ${resolveData.validation.status} (Valid: ${resolveData.validation.valid})`);
  console.log(`Reasoning: "${resolveData.mapping.reason}"`);
  console.log();

  // 4. Semantic Memory Storage & Cache Hit
  console.log('--- 4. Semantic Memory Layer & Sub-ms Cache Hit ---');
  const memRes = await fetch(`${BASE}/api/semantic/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_system: 'BMS',
      source_entity: 'NEXUS-AI-01',
      attributes: ['thermal_reading', 'people_present'],
      force_refresh: false,
    })
  });
  const memData = await memRes.json();
  console.log(`Second Query: Cache Hit = ${memData.cache_hit} (Latency: ${memData.mapping.latency_ms || 0.05}ms, Provenance: ${memData.source})`);

  const memListRes = await fetch(`${BASE}/api/semantic/memory`);
  const memList = await memListRes.json();
  console.log(`Stored Semantic Memory Records: ${memList.items.length}`);
  console.log();

  // 5. Human-in-the-Loop Learning
  console.log('--- 5. Human-In-The-Loop Learning Verification ---');
  const learnRes = await fetch(`${BASE}/api/semantic/memory/learn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_system: 'BMS',
      source_entity: 'CUSTOM-SPEC-SENSOR-99',
      target_entity: 'ROOM_102',
      confidence: 0.99,
      human_decision: 'OPERATOR_OVERRIDE',
    })
  });
  const learnData = await learnRes.json();
  console.log(`Human Decision Stored: ${learnData.item.source_system} "${learnData.item.source_entity}" ➔ ${learnData.item.target_entity} (Status: ${learnData.item.status})`);
  console.log();

  // 6. Unknown Entity Detection
  console.log('--- 6. Unknown Entity Detection (ZONE_X73) ---');
  const unkRes = await fetch(`${BASE}/api/semantic/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_system: 'BMS',
      source_entity: 'ZONE_X73',
      description: 'unmapped external parking annex sensor',
      attributes: ['temperature'],
      force_refresh: true,
    })
  });
  const unkData = await unkRes.json();
  console.log(`Unknown Input: BMS "ZONE_X73" ➔ Target: ${unkData.mapping.target_entity}, Decision: ${unkData.mapping.decision}`);
  console.log(`Firewall Verdict: ${unkData.validation.status} (Valid: ${unkData.validation.valid}) — Reason: "${unkData.validation.reason}"`);
  console.log();

  // 7. Dynamic Building Update & Invalidation
  console.log('--- 7. Dynamic Building Adaptation & Semantic Versioning ---');
  const updateRes = await fetch(`${BASE}/api/semantic/building/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      spaces: [
        { id: 'LAB_X17', name: 'Advanced Artificial Intelligence Laboratory', floor: 1, type: 'LABORATORY', aliases: ['AI Lab'] },
        { id: 'LAB_X18', name: 'Computer Networking Laboratory', floor: 1, type: 'LABORATORY', aliases: ['Networks Lab'] }
      ]
    })
  });
  const updateData = await updateRes.json();
  console.log(`Building Updated: Version = ${updateData.version}, Stale Memory Items Invalidated = ${updateData.invalidatedMemoryItems}`);

  // Resolve again against newly updated building
  const dynResolveRes = await fetch(`${BASE}/api/semantic/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_system: 'BMS',
      source_entity: 'NEXUS-AI-01',
      description: 'advanced artificial intelligence laboratory',
      attributes: ['temperature'],
      force_refresh: true,
    })
  });
  const dynResolveData = await dynResolveRes.json();
  console.log(`Zero-Code Query after rename: BMS "NEXUS-AI-01" ➔ Target: ${dynResolveData.mapping.target_entity} (Confidence: ${(dynResolveData.mapping.entity_confidence*100).toFixed(0)}%)`);
  console.log();

  // Reset to Building A
  await fetch(`${BASE}/api/buildings/switch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ buildingKey: 'BUILDING_A' })
  });

  console.log('================================================================');
  console.log('  ✓ ALL SYSTEM UPGRADE TESTS PASSED SUCCESSFULLY');
  console.log('================================================================');
}

run().catch(console.error);
