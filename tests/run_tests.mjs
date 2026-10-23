/**
 * MASTER TEST SUITE RUNNER
 *
 * Executes all unit, integration, security, and regression tests.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const TEST_FILES = [
  'tests/test_security.mjs',
  'tests/test_stale_telemetry.mjs',
  'tests/test_generation_id.mjs',
  'tests/test_value_ranges.mjs',
  'tests/test_ml_hazard.mjs',
  'tests/test_predictive_evacuation_e2e.mjs',
  'tests/test_ml_adversarial_cases.mjs',
  'tests/test_parameter_sensitivity.mjs',
  'tests/test_tenability_and_paths.mjs',
  'tests/test_deep_complex_scenarios.mjs',
  'tests/test_hard_reset.mjs',
  'tests/test_fire_propagation.mjs',
  'tests/test_deterministic_evacuation.mjs',
  'tests/test_building_b_generalization.mjs',
  'tests/test_blocked_exits_scenarios.mjs',
];

console.log('================================================================');
console.log('  🧪 FIRE EVACUATION DIGITAL TWIN — FULL TEST SUITE RUNNER      ');
console.log('================================================================\n');

let passedTests = 0;
let failedTests = 0;
const results = [];

async function runTest(file) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const child = spawn('node', [path.join(ROOT, file)], { stdio: 'pipe', cwd: ROOT });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      if (code === 0) {
        passedTests++;
        results.push({ file, status: 'PASSED', duration, output: stdout });
        console.log(`✓ [PASSED] (${duration}ms) ${file}`);
      } else {
        failedTests++;
        results.push({ file, status: 'FAILED', duration, output: stdout, error: stderr });
        console.error(`✗ [FAILED] (${duration}ms) ${file}\n${stderr || stdout}`);
      }
      resolve();
    });
  });
}

async function main() {
  for (const file of TEST_FILES) {
    await runTest(file);
  }

  console.log('\n================================================================');
  console.log('  📊 TEST EXECUTION SUMMARY                                     ');
  console.log('================================================================');
  console.log(`  Total Test Suites: ${TEST_FILES.length}`);
  console.log(`  Passed:            ${passedTests}`);
  console.log(`  Failed:            ${failedTests}`);
  console.log(`  Success Rate:      ${((passedTests / TEST_FILES.length) * 100).toFixed(1)}%`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

main();
