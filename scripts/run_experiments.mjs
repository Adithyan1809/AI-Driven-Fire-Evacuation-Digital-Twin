/**
 * FULL SCIENTIFIC EXPERIMENT BENCHMARK & ABLATION SUITE (PHASE 4)
 *
 * Runs paired, reproducible simulation trials across:
 *   1. Standard Scenario Benchmark (9 Presets: Reactive Baseline vs Predictive Proactive)
 *   2. 3-Way Routing Ablation (Distance-Only vs Reactive Baseline vs Predictive Proactive)
 *   3. Prediction Horizon Sensitivity Sweep (5s, 10s, 15s, 20s, 30s)
 *   4. Route Stability / Hysteresis Sensitivity Sweep (10%, 20%, 30%)
 *
 * Outputs:
 *   - experiments/experiment_results.json
 *   - experiments/experiment_results.csv
 *   - experiments/ablation_study.json
 *   - experiments/horizon_sensitivity.json
 *   - experiments/hysteresis_sensitivity.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { SCENARIO_PRESETS } from '../data/scenarioPresets.js';
import { EventBus } from '../modules/simulationEngine.js';
import { DigitalTwinState } from '../modules/digitalTwinState.js';
import { BuildingGraph } from '../modules/buildingGraph.js';
import { HazardEngine } from '../modules/hazardEngine.js';
import { RouteOptimizer } from '../modules/routeOptimizer.js';
import { OccupantSimulator } from '../modules/occupantSimulator.js';
import { SensorSimulator } from '../modules/sensorSimulator.js';
import { MLHazardPredictor } from '../modules/mlHazardPredictor.js';
import { BUILDING } from '../data/building.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXPERIMENTS_DIR = path.resolve(__dirname, '../experiments');

if (!fs.existsSync(EXPERIMENTS_DIR)) {
  fs.mkdirSync(EXPERIMENTS_DIR, { recursive: true });
}

function createRNG(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function() {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Runs a single deterministic headless simulation trial.
 *
 * @param {Object} preset               - Scenario preset configuration
 * @param {Object} options              - Execution options
 * @param {string} [options.routingMode] - 'PREDICTIVE' | 'REACTIVE' | 'DISTANCE_ONLY'
 * @param {number} [options.horizonSeconds] - Forecast horizon in seconds (default 15)
 * @param {number} [options.hysteresisThreshold] - Reroute threshold (default 0.20)
 * @returns {Object} Comprehensive trial metrics
 */
export function runSimulationTrial(preset, options = {}) {
  const routingMode = options.routingMode || 'PREDICTIVE';
  const horizonSeconds = options.horizonSeconds ?? 15;
  const hysteresisThreshold = options.hysteresisThreshold ?? 0.20;
  const rand = createRNG(preset.seed);

  const bus = new EventBus();
  const dtState = new DigitalTwinState({ bus });
  const graph = new BuildingGraph();
  const router = new RouteOptimizer({ bus, graph });
  const predictor = new MLHazardPredictor({ horizonSeconds });

  const customConfig = {
    routing: {
      predictiveRouting: routingMode === 'PREDICTIVE',
      distanceOnly: routingMode === 'DISTANCE_ONLY',
      hysteresisThreshold,
      routeCommitmentSeconds: 2.0,
    },
    occupants: {
      count: preset.occupantsCount || 50,
      walkingSpeedMultiplier: 1.0,
      speedVariationPct: 15,
      reactionDelaySeconds: 0.8,
      maxAsetSeconds: 45.0,
    },
    scenario: {
      spreadRateMultiplier: preset.spreadRateMultiplier || 1.0,
      smokePenaltyFactor: routingMode === 'DISTANCE_ONLY' ? 1.0 : 20.0,
      hazardPenaltyFactor: routingMode === 'DISTANCE_ONLY' ? 1.0 : 1000.0,
    },
    building: {
      blockedExits: preset.blockedExits || {},
    },
  };

  const hazard = new HazardEngine({
    bus,
    dtState,
    graph,
    config: customConfig,
    mlPredictor: predictor,
  });

  const sensorSim = new SensorSimulator({
    bus,
    config: customConfig,
    noiseLevel: preset.noiseLevel || 0,
    packetDropRate: preset.packetDropRate || 0,
    delayedPacketRate: preset.delayedPacketRate || 0,
    failedSensors: preset.failedSensors || {},
  });

  const occSim = new OccupantSimulator({
    bus,
    rand,
    routeOptimizer: router,
    dtState,
    config: customConfig,
  });

  dtState.init();
  occSim.initialise(rand);

  let evacuationStarted = false;
  let firstRerouteTime = null;
  let proactiveReroutes = 0;
  let reactiveReroutes = 0;
  let firstPredictedWarningTime = null;
  let firstActualCriticalTime = null;
  let simTime = 0.0;
  const dt = 0.1; // 100ms per tick

  bus.on('hazard:prediction_escalated', () => {
    if (firstPredictedWarningTime === null) firstPredictedWarningTime = simTime;
  });

  bus.on('hazard:level_change', (e) => {
    if ((e.next === 'CRITICAL' || e.next === 'BLOCKED') && firstActualCriticalTime === null) {
      firstActualCriticalTime = simTime;
    }
  });

  bus.on('route:proactive_reroute', () => {
    proactiveReroutes++;
    if (firstRerouteTime === null) firstRerouteTime = simTime;
  });

  // Execute simulation ticks up to 70.0 seconds maximum
  const maxTicks = 700;
  for (let tick = 0; tick < maxTicks; tick++) {
    simTime = +(tick * dt).toFixed(1);

    // Fire trigger check
    if (preset.fireRooms && preset.fireRooms.length > 0 && simTime >= preset.fireStartSeconds && !evacuationStarted) {
      evacuationStarted = true;
      bus.emit('sim:fire_trigger', { rooms: preset.fireRooms, room: preset.fireRooms[0], time: simTime, tick });
      bus.emit('sim:evacuation');
    }

    // Step sub-systems
    sensorSim._onTick({ tick, rand });

    // Synchronously sync sensor readings to Digital Twin State
    const readings = sensorSim.readings || {};
    const patches = {};
    for (const [sensorId, r] of Object.entries(readings)) {
      const sensor = (BUILDING.sensors || []).find(s => s.id === sensorId);
      if (sensor && sensor.room) {
        patches[sensor.room] = patches[sensor.room] || {};
        if (sensor.type === 'TEMPERATURE') patches[sensor.room].temperature = r.value;
        else if (sensor.type === 'SMOKE') patches[sensor.room].smoke = r.value;
        else if (sensor.type === 'OCCUPANCY') patches[sensor.room].occupancy = r.value;
      }
    }
    dtState.applyPatchMap(patches, 'SENSOR_TELEMETRY');

    hazard._onTick({ time: simTime, tick });
    occSim._onTick({ tick });

    const counts = occSim.getCount();
    if (evacuationStarted && counts.remaining === 0) {
      break;
    }
  }

  const finalCounts = occSim.getCount();
  const totalOccupants = occSim.occupants.length;
  let totalExposureTicks = 0;
  let totalWarningTimeSeconds = 0;
  let totalCriticalTimeSeconds = 0;
  let totalPredictedHazardTimeSeconds = 0;
  let maxTempObserved = 20.0;
  let maxSmokeObserved = 0.0;
  let totalDistanceTravelled = 0;
  let totalReroutes = 0;

  occSim.occupants.forEach(o => {
    totalExposureTicks += (o.unsafeExposureTicks || 0);
    totalWarningTimeSeconds += (o.timeInWarning || 0);
    totalCriticalTimeSeconds += (o.timeInCritical || 0);
    totalPredictedHazardTimeSeconds += (o.timeInPredictedHazard || 0);
    maxTempObserved = Math.max(maxTempObserved, o.maxTemp || 20.0);
    maxSmokeObserved = Math.max(maxSmokeObserved, o.maxSmoke || 0.0);
    totalDistanceTravelled += (o.distanceTravelled || 0);
    totalReroutes += (o.rerouteCount || 0);
    reactiveReroutes += (o.reactiveReroutes || 0);
  });

  const predictionLeadTime = (firstPredictedWarningTime !== null && firstActualCriticalTime !== null && firstActualCriticalTime >= firstPredictedWarningTime)
    ? +(firstActualCriticalTime - firstPredictedWarningTime).toFixed(1)
    : 0.0;

  return {
    scenarioId: preset.id,
    scenarioName: preset.name,
    seed: preset.seed,
    mode: routingMode,
    horizonSeconds,
    hysteresisThreshold,
    totalOccupants,
    evacuated: finalCounts.evacuated,
    trapped: finalCounts.trapped,
    elapsedSimTimeSeconds: +simTime.toFixed(1),
    completionTimeSeconds: +simTime.toFixed(1),
    totalExposureTicks,
    cumulativeWarningOccupantSeconds: +totalWarningTimeSeconds.toFixed(1),
    cumulativeCriticalOccupantSeconds: +totalCriticalTimeSeconds.toFixed(1),
    cumulativePredictedHazardOccupantSeconds: +totalPredictedHazardTimeSeconds.toFixed(1),
    totalWarningTimeSeconds: +totalWarningTimeSeconds.toFixed(1),
    totalCriticalTimeSeconds: +totalCriticalTimeSeconds.toFixed(1),
    totalPredictedHazardTimeSeconds: +totalPredictedHazardTimeSeconds.toFixed(1),
    maxTempObserved: +maxTempObserved.toFixed(1),
    maxSmokeObserved: +maxSmokeObserved.toFixed(2),
    avgDistanceTravelled: +(totalDistanceTravelled / totalOccupants).toFixed(1),
    totalReroutes,
    proactiveReroutes,
    reactiveReroutes,
    firstRerouteTimeSeconds: firstRerouteTime !== null ? +firstRerouteTime.toFixed(1) : null,
    predictionLeadTimeSeconds: predictionLeadTime,
  };
}

/**
 * Runs the master suite: benchmark, ablation, horizon, and hysteresis experiments.
 */
export function runAllExperiments() {
  console.log('================================================================');
  console.log('  🧪 RUNNING FULL SCIENTIFIC EXPERIMENT BENCHMARK SUITE (PHASE 4.5)');
  console.log('================================================================\n');

  // ── 1. Standard Paired Benchmark across 9 Presets ──────────────────────────
  console.log('▶ [1/4] Running Standard Paired Presets (Reactive vs Predictive)...');
  const benchmarkPairs = [];

  for (const preset of Object.values(SCENARIO_PRESETS)) {
    process.stdout.write(`   Scenario: ${preset.name}... `);
    const baseline = runSimulationTrial(preset, { routingMode: 'REACTIVE' });
    const predictive = runSimulationTrial(preset, { routingMode: 'PREDICTIVE' });

    const exposureDelta = predictive.totalExposureTicks - baseline.totalExposureTicks;
    const timeDelta = +(predictive.completionTimeSeconds - baseline.completionTimeSeconds).toFixed(1);

    console.log(`Done! [Lead Time: ${predictive.predictionLeadTimeSeconds}s | Proactive: ${predictive.proactiveReroutes} | Exposure Δ: ${exposureDelta >= 0 ? '+' : ''}${exposureDelta} ticks]`);

    benchmarkPairs.push({
      scenarioId: preset.id,
      scenarioName: preset.name,
      seed: preset.seed,
      baseline,
      predictive,
      comparison: {
        exposureReductionTicks: -exposureDelta,
        completionTimeDeltaSeconds: timeDelta,
        proactiveReroutes: predictive.proactiveReroutes,
        predictionLeadTimeSeconds: predictive.predictionLeadTimeSeconds,
      },
    });
  }

  // ── 2. 3-Way Routing Ablation ──────────────────────────────────────────────
  console.log('\n▶ [2/4] Running 3-Way Routing Ablation (Flagship Scenario: PREDICTIVE_REROUTE)...');
  const flagshipPreset = SCENARIO_PRESETS.PREDICTIVE_REROUTE;
  const ablationDistanceOnly = runSimulationTrial(flagshipPreset, { routingMode: 'DISTANCE_ONLY' });
  const ablationReactive = runSimulationTrial(flagshipPreset, { routingMode: 'REACTIVE' });
  const ablationPredictive = runSimulationTrial(flagshipPreset, { routingMode: 'PREDICTIVE' });

  const ablationResults = {
    scenarioId: flagshipPreset.id,
    scenarioName: flagshipPreset.name,
    modes: {
      distanceOnly: ablationDistanceOnly,
      reactive: ablationReactive,
      predictive: ablationPredictive,
    },
  };

  console.log(`   Distance-Only: Evacuated: ${ablationDistanceOnly.evacuated}/50 | Exposure: ${ablationDistanceOnly.totalExposureTicks} ticks | Time: ${ablationDistanceOnly.completionTimeSeconds}s`);
  console.log(`   Reactive:      Evacuated: ${ablationReactive.evacuated}/50 | Exposure: ${ablationReactive.totalExposureTicks} ticks | Time: ${ablationReactive.completionTimeSeconds}s`);
  console.log(`   Predictive:    Evacuated: ${ablationPredictive.evacuated}/50 | Exposure: ${ablationPredictive.totalExposureTicks} ticks | Time: ${ablationPredictive.completionTimeSeconds}s (Proactive Reroutes: ${ablationPredictive.proactiveReroutes})`);

  // ── 3. Prediction Horizon Sensitivity Sweep ────────────────────────────────
  console.log('\n▶ [3/4] Running Prediction Horizon Sensitivity (5s, 10s, 15s, 20s, 30s)...');
  const horizons = [5, 10, 15, 20, 30];
  const horizonResults = [];

  for (const h of horizons) {
    const res = runSimulationTrial(flagshipPreset, { routingMode: 'PREDICTIVE', horizonSeconds: h });
    horizonResults.push({ horizonSeconds: h, ...res });
    console.log(`   Horizon ${h}s: Evacuated: ${res.evacuated}/50 | Lead Time: ${res.predictionLeadTimeSeconds}s | Exposure: ${res.totalExposureTicks} ticks | Proactive: ${res.proactiveReroutes}`);
  }

  // ── 4. Route Stability / Hysteresis Sensitivity Sweep ──────────────────────
  console.log('\n▶ [4/4] Running Hysteresis Sensitivity (10%, 20%, 30%)...');
  const hysteresisValues = [0.10, 0.20, 0.30];
  const hysteresisResults = [];

  for (const hyst of hysteresisValues) {
    const res = runSimulationTrial(flagshipPreset, { routingMode: 'PREDICTIVE', hysteresisThreshold: hyst });
    hysteresisResults.push({ hysteresisThreshold: hyst, ...res });
    console.log(`   Hysteresis ${(hyst * 100).toFixed(0)}%: Total Reroutes: ${res.totalReroutes} | Proactive: ${res.proactiveReroutes} | Exposure: ${res.totalExposureTicks} ticks | Time: ${res.completionTimeSeconds}s`);
  }

  // ── Write Artifacts ────────────────────────────────────────────────────────
  const jsonPath = path.join(EXPERIMENTS_DIR, 'experiment_results.json');
  const csvPath = path.join(EXPERIMENTS_DIR, 'experiment_results.csv');
  const ablationPath = path.join(EXPERIMENTS_DIR, 'ablation_study.json');
  const horizonPath = path.join(EXPERIMENTS_DIR, 'horizon_sensitivity.json');
  const hysteresisPath = path.join(EXPERIMENTS_DIR, 'hysteresis_sensitivity.json');

  fs.writeFileSync(jsonPath, JSON.stringify({ benchmark: benchmarkPairs, timestamp: new Date().toISOString() }, null, 2));
  fs.writeFileSync(ablationPath, JSON.stringify(ablationResults, null, 2));
  fs.writeFileSync(horizonPath, JSON.stringify(horizonResults, null, 2));
  fs.writeFileSync(hysteresisPath, JSON.stringify(hysteresisResults, null, 2));

  // Generate CSV rows with explicit cumulative labeling
  const csvHeader = [
    'ScenarioID', 'ScenarioName', 'Seed', 'Mode', 'HorizonSec', 'Hysteresis',
    'TotalOccupants', 'Evacuated', 'Trapped', 'ElapsedSimTimeSec',
    'TotalExposureTicks', 'CumulativeWarningOccupantSec', 'CumulativeCriticalOccupantSec', 'CumulativePredictedHazardOccupantSec',
    'MaxTemp', 'MaxSmoke', 'AvgDistance', 'TotalReroutes', 'ProactiveReroutes', 'ReactiveReroutes', 'LeadTimeSec'
  ].join(',');

  const csvRows = [csvHeader];
  for (const pair of benchmarkPairs) {
    for (const res of [pair.baseline, pair.predictive]) {
      csvRows.push([
        res.scenarioId, `"${res.scenarioName}"`, res.seed, res.mode, res.horizonSeconds, res.hysteresisThreshold,
        res.totalOccupants, res.evacuated, res.trapped, res.elapsedSimTimeSeconds,
        res.totalExposureTicks, res.cumulativeWarningOccupantSeconds, res.cumulativeCriticalOccupantSeconds, res.cumulativePredictedHazardOccupantSeconds,
        res.maxTempObserved, res.maxSmokeObserved, res.avgDistanceTravelled, res.totalReroutes, res.proactiveReroutes, res.reactiveReroutes, res.predictionLeadTimeSeconds
      ].join(','));
    }
  }
  fs.writeFileSync(csvPath, csvRows.join('\n'));

  console.log('\n================================================================');
  console.log('✓ All experiment suites complete! Artifacts saved:');
  console.log(`  • Benchmark:  ${jsonPath}`);
  console.log(`  • CSV Table:  ${csvPath}`);
  console.log(`  • Ablation:   ${ablationPath}`);
  console.log(`  • Horizon:    ${horizonPath}`);
  console.log(`  • Hysteresis: ${hysteresisPath}`);
  console.log('================================================================\n');

  return { benchmarkPairs, ablationResults, horizonResults, hysteresisResults };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAllExperiments();
}
