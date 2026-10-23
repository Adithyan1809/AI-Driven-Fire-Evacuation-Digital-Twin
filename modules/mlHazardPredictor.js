/**
 * ML HAZARD PREDICTOR — PREDICTIVE HAZARD ESTIMATION ENGINE
 *
 * Tabular Predictive Machine Learning module for forecasting future environmental risk
 * over a forward-looking 15-30 second prediction horizon.
 *
 * Conceptual Features Extracted & Normalized:
 *   1. temperature (°C)                  - normalized against [20°C, 100°C]
 *   2. temperature_rate (dT/dt in °C/s)   - normalized against [0, 3.0°C/s]
 *   3. smoke (optical obscuration 0-1)   - normalized [0, 1.0 AQI]
 *   4. smoke_rate (dSmoke/dt in 1/s)     - normalized against [0, 0.05/s]
 *   5. distance_from_fire (hops)         - topological distance from fire origin
 *   6. neighbor_hazard_count (integer)   - count of adjacent rooms in WARNING/CRITICAL
 *   7. occupancy (normalized)            - current headcount relative to room capacity
 *   8. room_type (prior weight)          - space risk prior (LAB, SERVER_ROOM, CORRIDOR, etc.)
 *   9. time_since_alarm (seconds)        - elapsed time since fire outbreak/alarm
 *
 * Structured Output:
 *   {
 *     spaceId: "CORRIDOR_MAIN",
 *     currentRisk: 0.15,
 *     predictedRisk: 0.85,
 *     horizonSeconds: 15,
 *     trend: "RISING",                   // "RISING" | "STABLE" | "FALLING"
 *     modelScore: 0.85,
 *     predictedState: "PREDICTED_CRITICAL", // "SAFE" | "WATCH" | "PREDICTED_WARNING" | "PREDICTED_CRITICAL"
 *     reasons: [
 *       "Rapid temperature rise (+1.4°C/s)",
 *       "High smoke accumulation rate (+0.035 AQI/s)",
 *       "Adjacent fire origin in ROOM_101"
 *     ],
 *     features: { ... },
 *     timestamp: 1234567890
 *   }
 *
 * Prediction States (Distinct from deterministic safety levels):
 *   - SAFE:               predictedRisk < 0.25
 *   - WATCH:              0.25 <= predictedRisk < 0.50
 *   - PREDICTED_WARNING:  0.50 <= predictedRisk < 0.75
 *   - PREDICTED_CRITICAL: predictedRisk >= 0.75
 *   *(Note: ML NEVER outputs BLOCKED. BLOCKED is strictly reserved for deterministic physics thresholds).*
 */

export const PREDICTION_STATE = Object.freeze({
  SAFE:               'SAFE',
  WATCH:              'WATCH',
  PREDICTED_WARNING:  'PREDICTED_WARNING',
  PREDICTED_CRITICAL: 'PREDICTED_CRITICAL',
});

export class MLHazardPredictor {
  /**
   * @param {Object} [opts]
   * @param {number} [opts.horizonSeconds=15] - Prediction horizon in seconds
   * @param {number} [opts.historyWindow=6]   - Historical samples window for rates
   */
  constructor({ horizonSeconds = 15, historyWindow = 6 } = {}) {
    this.horizonSeconds = horizonSeconds;
    this.historyWindow = historyWindow;
    // spaceId -> Array of { time, temp, smoke }
    this._history = new Map();
    this._previousPredictions = new Map();
  }

  /**
   * Reset time-series history
   */
  reset() {
    this._history.clear();
    this._previousPredictions.clear();
  }

  /**
   * Records a snapshot of room sensor readings to update rate-of-rise metrics.
   *
   * @param {string} spaceId
   * @param {number} simTime - Simulation time in seconds
   * @param {number} temperature - Current temperature in °C
   * @param {number} smoke - Current smoke concentration (0-1)
   */
  recordReading(spaceId, simTime, temperature, smoke) {
    if (!this._history.has(spaceId)) {
      this._history.set(spaceId, []);
    }
    const list = this._history.get(spaceId);
    list.push({ time: simTime, temp: Number(temperature) || 27.4, smoke: Number(smoke) || 0.01 });
    if (list.length > this.historyWindow * 2) {
      list.shift();
    }
  }

  /**
   * Compute feature vector for a room from state and history.
   */
  extractFeatures(entity, {
    simTime = 0,
    fireStartTime = null,
    fireRooms = [],
    adjacency = {},
    dtState = null,
  } = {}) {
    const spaceId = entity.entity_id || entity.id;
    const temp = entity.temperature ?? 27.4;
    const smoke = entity.smoke ?? 0.01;
    const occ = entity.occupancy ?? 0;
    const roomType = entity.type || 'CLASSROOM';
    const capacity = entity.capacity || 30;

    // 1. Calculate rate of rise (dT/dt and dSmoke/dt) using least-squares slope or window delta
    let tempRate = 0.0;
    let smokeRate = 0.0;
    const hist = this._history.get(spaceId);
    if (hist && hist.length >= 2) {
      const oldest = hist[0];
      const newest = hist[hist.length - 1];
      const dt = newest.time - oldest.time;
      if (dt > 0.1) {
        tempRate = +(Math.max(0, (newest.temp - oldest.temp) / dt)).toFixed(3);
        smokeRate = +(Math.max(0, (newest.smoke - oldest.smoke) / dt)).toFixed(4);
      }
    }

    // 2. Topological distance from fire origin
    let dist = Infinity;
    const activeFire = Array.isArray(fireRooms) ? fireRooms : [fireRooms].filter(Boolean);
    if (activeFire.includes(spaceId)) {
      dist = 0;
    } else if (activeFire.length > 0 && adjacency[spaceId]) {
      const isNeighbor = activeFire.some(f => (adjacency[spaceId] || []).includes(f));
      dist = isNeighbor ? 1 : 2;
    }

    // 3. Time since fire alarm
    const timeSinceAlarm = fireStartTime !== null && simTime >= fireStartTime
      ? +(simTime - fireStartTime).toFixed(1)
      : 0;

    // 4. Neighbor hazard count
    let neighborHazardCount = 0;
    if (dtState && adjacency[spaceId]) {
      adjacency[spaceId].forEach(nid => {
        const neighbor = dtState.getEntity(nid);
        if (neighbor && ['WARNING', 'CRITICAL', 'BLOCKED'].includes(neighbor.hazard_level)) {
          neighborHazardCount++;
        }
      });
    }

    // 5. Normalized feature scales
    const normTemp = Math.max(0, Math.min(1.0, (temp - 20) / 80));
    const normTempRate = Math.max(0, Math.min(1.0, tempRate / 3.0));
    const normSmoke = Math.max(0, Math.min(1.0, smoke));
    const normSmokeRate = Math.max(0, Math.min(1.0, smokeRate / 0.05));
    const normOcc = Math.max(0, Math.min(1.0, occ / (capacity || 30)));

    return {
      spaceId,
      temperature: temp,
      temperature_rate: tempRate,
      smoke: smoke,
      smoke_rate: smokeRate,
      occupancy: occ,
      distance_from_fire: isFinite(dist) ? dist : 99,
      time_since_alarm: timeSinceAlarm,
      neighbor_hazard_count: neighborHazardCount,
      room_type: roomType,
      normalized: {
        temp: normTemp,
        tempRate: normTempRate,
        smoke: normSmoke,
        smokeRate: normSmokeRate,
        occupancy: normOcc,
      }
    };
  }

  /**
   * Predicts future hazard probability using tabular feature scoring.
   *
   * @param {Object} features - Extracted feature vector
   * @returns {{ spaceId: string, currentRisk: number, predictedRisk: number, horizonSeconds: number, trend: string, modelScore: number, predictedState: string, reasons: string[], features: Object, timestamp: number }}
   */
  predict(features) {
    const {
      spaceId,
      temperature,
      temperature_rate,
      smoke,
      smoke_rate,
      distance_from_fire,
      time_since_alarm,
      neighbor_hazard_count,
      room_type,
    } = features;

    const reasons = [];

    // Current thermodynamic risk base (0.0 to 1.0)
    let currentRiskScore = 0.02;
    if (temperature >= 60.0) currentRiskScore += 0.70;
    else if (temperature >= 38.0) currentRiskScore += 0.35 + (temperature - 38.0) * 0.015;

    if (smoke >= 0.50) currentRiskScore += 0.75;
    else if (smoke >= 0.15) currentRiskScore += 0.30 + (smoke - 0.15) * 1.2;

    const currentRisk = +Math.min(1.0, currentRiskScore).toFixed(3);

    // Predictive Logit Model for future horizon (15-30s)
    let logit = -3.8;

    // 1. Current thermal & smoke status
    if (temperature >= 60.0) {
      logit += 4.5;
      reasons.push(`High current temperature (${temperature.toFixed(1)}°C)`);
    } else if (temperature >= 38.0) {
      logit += 2.2 + (temperature - 38) * 0.1;
      reasons.push(`Elevated thermal baseline (${temperature.toFixed(1)}°C)`);
    }

    if (smoke >= 0.50) {
      logit += 4.2;
      reasons.push(`Severe smoke obscuration (${smoke.toFixed(2)} AQI)`);
    } else if (smoke >= 0.15) {
      logit += 1.8 + (smoke - 0.15) * 4.0;
      reasons.push(`Accumulating optical smoke (${smoke.toFixed(2)} AQI)`);
    }

    // 2. Forward-Projected Physical State over prediction horizon (horizonSeconds)
    const projectedTemp = temperature + (temperature_rate * this.horizonSeconds);
    const projectedSmoke = smoke + (smoke_rate * this.horizonSeconds);
    const projectedTempRise = temperature_rate * this.horizonSeconds;
    const projectedSmokeRise = smoke_rate * this.horizonSeconds;

    // Projected Thermal Tenability
    if (projectedTemp >= 60.0) {
      logit += 3.4;
      reasons.push(`Projected critical flashover (${projectedTemp.toFixed(1)}°C in ${this.horizonSeconds}s)`);
    } else if (projectedTemp >= 45.0) {
      logit += 2.0 + (projectedTemp - 45.0) * 0.08;
      reasons.push(`Projected thermal warning (${projectedTemp.toFixed(1)}°C in ${this.horizonSeconds}s)`);
    } else if (projectedTemp >= 35.0) {
      logit += 0.8 + (projectedTemp - 35.0) * 0.05;
      reasons.push(`Projected temperature elevation (${projectedTemp.toFixed(1)}°C in ${this.horizonSeconds}s)`);
    }

    // Projected Smoke Obscuration
    if (projectedSmoke >= 0.50) {
      logit += 3.2;
      reasons.push(`Projected heavy optical density (${projectedSmoke.toFixed(2)} AQI in ${this.horizonSeconds}s)`);
    } else if (projectedSmoke >= 0.20) {
      logit += 1.8 + (projectedSmoke - 0.20) * 3.0;
      reasons.push(`Projected smoke ingress (${projectedSmoke.toFixed(2)} AQI in ${this.horizonSeconds}s)`);
    } else if (projectedSmoke >= 0.08) {
      logit += 0.6 + (projectedSmoke - 0.08) * 4.0;
      reasons.push(`Projected particulate haze (${projectedSmoke.toFixed(2)} AQI in ${this.horizonSeconds}s)`);
    }

    // 3. Proximity to fire origin
    if (distance_from_fire === 0) {
      logit += 5.0;
      reasons.push('Direct fire origin outbreak zone');
    } else if (distance_from_fire === 1) {
      logit += 1.8;
      reasons.push('Direct adjacency (1 hop) to active fire origin');
    } else if (distance_from_fire === 2) {
      logit += 0.6;
    }

    // 4. Neighbor hazard spread
    if (neighbor_hazard_count >= 2) {
      logit += 1.6;
      reasons.push(`Surrounded by ${neighbor_hazard_count} hazardous adjacent spaces`);
    } else if (neighbor_hazard_count === 1) {
      logit += 0.8;
      reasons.push('Adjacent to 1 hazardous space');
    }

    // 5. Room type prior
    if (room_type === 'SERVER_ROOM' || room_type === 'LABORATORY') {
      logit += 0.4;
      reasons.push(`${room_type} high combustibility fuel load prior`);
    }

    // Sigmoid probability (Model Score)
    const predictedProbability = +(1.0 / (1.0 + Math.exp(-logit))).toFixed(4);

    // Explicit Prediction State Classification
    let predictedState = PREDICTION_STATE.SAFE;
    if (predictedProbability >= 0.75) predictedState = PREDICTION_STATE.PREDICTED_CRITICAL;
    else if (predictedProbability >= 0.50) predictedState = PREDICTION_STATE.PREDICTED_WARNING;
    else if (predictedProbability >= 0.25) predictedState = PREDICTION_STATE.WATCH;

    // Trend calculation vs previous prediction or thermodynamic rate of rise
    let trend = 'STABLE';
    const prev = this._previousPredictions.get(spaceId);
    if (prev) {
      const diff = predictedProbability - prev.predictedRisk;
      if (diff > 0.03) trend = 'RISING';
      else if (diff < -0.03) trend = 'FALLING';
    } else if (temperature_rate > 0.1 || smoke_rate > 0.003) {
      trend = 'RISING';
    }
    this._previousPredictions.set(spaceId, { predictedRisk: predictedProbability, timestamp: Date.now() });

    if (reasons.length === 0) {
      reasons.push('Stable normal baseline readings');
    }

    return {
      spaceId,
      roomId: spaceId, // alias for backwards compatibility
      currentRisk,
      predictedRisk: predictedProbability,
      hazardProbability: predictedProbability, // alias
      horizonSeconds: this.horizonSeconds,
      trend,
      modelScore: predictedProbability,
      predictedState,
      predictedRiskLabel: predictedState,
      reasons,
      features,
      timestamp: Date.now(),
    };
  }

  /**
   * Batch predict for all active spaces.
   */
  predictAll(dtState, { simTime = 0, fireStartTime = null, fireRooms = [], adjacency = {} } = {}) {
    if (!dtState) return {};
    const predictions = {};
    const all = dtState.getAll();

    for (const [id, entity] of Object.entries(all)) {
      if (entity.type === 'EXIT') continue;
      this.recordReading(id, simTime, entity.temperature ?? 27.4, entity.smoke ?? 0.01);
      const feats = this.extractFeatures(entity, { simTime, fireStartTime, fireRooms, adjacency, dtState });
      predictions[id] = this.predict(feats);
    }

    return predictions;
  }
}
