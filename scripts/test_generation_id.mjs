/**
 * TEST: Async Simulation Generation ID Race Condition Safety
 *
 * Verifies the exact end-to-end scenario lifecycle:
 *   1. Start scenario A.
 *   2. Start asynchronous AI request for Scenario A.
 *   3. Reset simulation.
 *   4. Start scenario B.
 *   5. Resolve old scenario-A AI request.
 *   6. Confirm scenario-B state is completely unchanged.
 */

import { EventBus } from '../modules/simulationEngine.js';
import { DigitalTwinState } from '../modules/digitalTwinState.js';
import { SemanticMiddleware } from '../modules/semanticMiddleware.js';

console.log('🧪 RUNNING GENERATION ID & ASYNC SCENARIO RACE TESTS\n');

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

async function runScenarioRaceTest() {
  const bus = new EventBus();
  const dtState = new DigitalTwinState({ bus });
  const middleware = new SemanticMiddleware({ bus, dtState });

  // ── Step 1: Start Scenario A ──────────────────────────────────────────────
  const genScenarioA = dtState.getGenerationId();
  assert(genScenarioA === 1, `Step 1: Scenario A started with generationId = 1 (got ${genScenarioA})`);

  dtState.setState('ROOM_101', { temperature: 40.0, hazard_level: 'WARNING' }, 'SCENARIO_A', { generationId: genScenarioA });
  assert(dtState.getEntity('ROOM_101').hazard_level === 'WARNING', 'Step 1: ROOM_101 is WARNING in Scenario A');

  // ── Step 2: Start Asynchronous AI Request for Scenario A ──────────────────
  let delayedScenarioAResolution = null;
  const asyncAIRequestPromise = new Promise((resolve) => {
    delayedScenarioAResolution = resolve;
  });

  // Mock an in-flight async AI pipeline resolution captured at generation A
  const pendingCapturedGen = genScenarioA;
  const inFlightPromise = asyncAIRequestPromise.then(() => {
    // Attempt to mutate state when old AI promise resolves
    const patchMap = {
      ROOM_101: { temperature: 95.0, smoke: 0.85, hazard_level: 'CRITICAL' }
    };
    const metaMap = {
      ROOM_101: { timestamp: Date.now(), seq: 99, generationId: pendingCapturedGen },
      generationId: pendingCapturedGen,
    };
    return dtState.applyPatchMap(patchMap, 'MW:ASYNC_GEMINI_SCENARIO_A', metaMap);
  });

  // ── Step 3: Simulation Reset ──────────────────────────────────────────────
  dtState.reset();
  const genPostReset = dtState.getGenerationId();
  assert(genPostReset === 2, `Step 3: Reset advanced generationId to 2 (got ${genPostReset})`);
  assert(dtState.getEntity('ROOM_101').hazard_level === 'NORMAL', 'Step 3: ROOM_101 reset to NORMAL baseline');

  // ── Step 4: Start Scenario B ──────────────────────────────────────────────
  const genScenarioB = dtState.getGenerationId();
  dtState.setState('ROOM_103', { temperature: 55.0, hazard_level: 'CRITICAL' }, 'SCENARIO_B', { generationId: genScenarioB });
  dtState.setState('ROOM_101', { temperature: 27.4, hazard_level: 'NORMAL' }, 'SCENARIO_B', { generationId: genScenarioB });

  assert(dtState.getEntity('ROOM_103').hazard_level === 'CRITICAL', 'Step 4: Scenario B active (ROOM_103 is CRITICAL)');
  assert(dtState.getEntity('ROOM_101').hazard_level === 'NORMAL', 'Step 4: Scenario B active (ROOM_101 is NORMAL)');

  // ── Step 5: Resolve Old Scenario-A Async AI Request ───────────────────────
  delayedScenarioAResolution();
  const appliedCount = await inFlightPromise;

  assert(appliedCount === 0, `Step 5: Old Scenario-A AI response applied 0 updates (got ${appliedCount})`);

  // ── Step 6: Confirm Scenario-B State is Completely Unchanged ──────────────
  const finalRoom101 = dtState.getEntity('ROOM_101');
  const finalRoom103 = dtState.getEntity('ROOM_103');

  assert(finalRoom101.hazard_level === 'NORMAL', 'Step 6: ROOM_101 remains NORMAL in Scenario B (NOT corrupted by Scenario A)');
  assert(finalRoom101.temperature === 27.4, 'Step 6: ROOM_101 temperature remains 27.4°C (NOT overwritten with 95.0°C)');
  assert(finalRoom103.hazard_level === 'CRITICAL', 'Step 6: ROOM_103 remains CRITICAL in Scenario B');

  console.log(`\nResults: ${passed}/${total} assertions passed.\n`);
  if (passed !== total) process.exit(1);
}

runScenarioRaceTest();
