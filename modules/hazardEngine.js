/**
 * HAZARD ENGINE — DYNAMIC SAFETY & ML HAZARD INTEGRATION
 *
 * Monitors Digital Twin state changes and:
 *   1. Computes deterministic hazard_level per space (NORMAL -> WARNING -> CRITICAL -> BLOCKED)
 *   2. Generates predictive ML hazard probabilities via MLHazardPredictor (15-30s horizon)
 *   3. Propagates thermodynamic hazard to adjacent spaces with spatial decay (NFPA 72)
 *   4. Updates building graph dynamic edge costs for Dijkstra routing
 *   5. Enforces deterministic hard safety constraints:
 *      - Blocked exits -> Infinity (impassable)
 *      - Active fire origins / blocked zones -> Infinity
 *      - Disabled elevators -> Locked out per NFPA 72
 */

import { BUILDING, getActiveBuilding, SPATIAL_GRAPH_MAPPING } from '../data/building.js';
import { MLHazardPredictor } from './mlHazardPredictor.js';

const DEFAULT_THRESHOLDS = {
  WARNING:  { temp: 38,  smoke: 0.15 },
  CRITICAL: { temp: 60,  smoke: 0.50 },
  BLOCKED:  { temp: 95,  smoke: 0.80 },
};

function buildAdjacency(building) {
  const adj = {};
  if (!building || !building.spaces) return adj;
  building.spaces.forEach(space => {
    let conns = Array.isArray(space.connections) ? [...space.connections] : [];
    if (conns.length === 0 && building.doors) {
      building.doors.forEach(door => {
        if (door.from === space.id) conns.push(door.to);
        if (door.to === space.id) conns.push(door.from);
      });
    }
    adj[space.id] = [...new Set(conns.filter(c => building.spaces.some(s => s.id === c)))];
  });
  return adj;
}

export class HazardEngine {
  /**
   * @param {Object}          opts
   * @param {EventBus}        opts.bus
   * @param {DigitalTwinState}opts.dtState
   * @param {BuildingGraph}   opts.graph
   * @param {Object}          [opts.config]
   */
  constructor(opts = {}) {
    const { bus, dtState, graph, config = null, mlPredictor = null } = opts;
    this.bus         = bus;
    this.dtState     = dtState;
    this.graph       = graph;
    this.config      = config;
    this.sc          = BUILDING.scenario || {};
    this.adjacency   = buildAdjacency(BUILDING);
    this._liftsBlocked = false;

    const initialHorizon = opts.horizonSeconds ?? (typeof config?.get === 'function' ? config.get().routing?.horizonSeconds : config?.routing?.horizonSeconds) ?? 15;
    this._mlPredictor = mlPredictor || new MLHazardPredictor({ horizonSeconds: initialHorizon });
    this._latestMLPredictions = {};
    this._activeFireRooms = [];
    this._fireStartTime = null;

    this.bus.on('dt:state_change', e => this._onDTChange(e));
    this.bus.on('sim:tick',        e => this._onTick(e));
    this.bus.on('sim:fire_trigger', e => this._onFireTrigger(e));
    this.bus.on('sim:hazard_spread', e => this._onHazardSpread(e));
    this.bus.on('sim:reset',       () => this._reset());
    this.bus.on('building:custom_loaded', () => this.rebuild());
    this.bus.on('config:changed',  ({ config }) => {
      if (!(this.config && typeof this.config.get === 'function')) {
        this.config = config;
      }
      this._applyConfigExits();
    });
    this._applyConfigExits();
  }

  rebuild() {
    const activeBld = getActiveBuilding ? getActiveBuilding() : BUILDING;
    this.adjacency = buildAdjacency(activeBld);
    this._liftsBlocked = false;
    this._activeFireRooms = [];
    this._fireStartTime = null;
    this._reset();
  }

  getMLPredictions() {
    return { ...this._latestMLPredictions };
  }

  // ── Internal ───────────────────────────────────────────

  _getConfig() {
    if (this.config && typeof this.config.get === 'function') {
      return this.config.get();
    }
    return this.config || {};
  }

  _onTick({ time, tick }) {
    if (tick % 2 === 0) {
      // Periodically update ML hazard forecasts for all spaces
      this._latestMLPredictions = this._mlPredictor.predictAll(this.dtState, {
        simTime: time,
        fireStartTime: this._fireStartTime,
        fireRooms: this._activeFireRooms,
        adjacency: this.adjacency,
      });

      const currentGen = this.dtState ? this.dtState.getGenerationId() : 1;

      // Update Digital Twin State and emit granular domain events
      for (const [spaceId, pred] of Object.entries(this._latestMLPredictions)) {
        const entity = this.dtState.getEntity(spaceId);
        if (entity) {
          const oldPredState = entity.predicted_state;
          const predictionEvent = {
            spaceId,
            oldPrediction: oldPredState,
            newPrediction: pred.predictedState,
            probability: pred.predictedRisk,
            horizon: pred.horizonSeconds,
            reason: pred.reasons[0] || 'Stable physical readings',
            reasons: pred.reasons,
            timestamp: Date.now(),
            generationId: currentGen,
          };

          this.dtState.setState(spaceId, {
            predicted_state:    pred.predictedState,
            predicted_risk:     pred.predictedRisk,
            prediction_horizon: pred.horizonSeconds,
            prediction_trend:   pred.trend,
            prediction_reasons: pred.reasons,
          }, 'ML_PREDICTOR', { generationId: currentGen });

          this.bus.emit('hazard:prediction', {
            spaceId,
            prediction: pred,
            timestamp: Date.now(),
            generationId: currentGen,
          });

          this.bus.emit('hazard:prediction-updated', predictionEvent);

          if (oldPredState !== pred.predictedState && (pred.predictedState === 'PREDICTED_WARNING' || pred.predictedState === 'PREDICTED_CRITICAL')) {
            this.bus.emit('hazard:prediction_escalated', predictionEvent);
            this.bus.emit('hazard:prediction-escalated', predictionEvent);

            this.bus.emit('log', {
              tag: 'hazard',
              msg: `🔮 Predicted Risk Escalation in ${spaceId} → ${pred.predictedState} (${(pred.predictedRisk * 100).toFixed(0)}% in ${pred.horizonSeconds}s)`,
              priority: 'medium',
            });
          }

          this._updateGraphCosts(spaceId, entity.hazard_level, pred.predictedRisk);
        }
      }

      this.bus.emit('hazard:ml_forecast', {
        predictions: this._latestMLPredictions,
        simTime: time,
        tick,
        generationId: currentGen,
      });
    }
  }

  _onDTChange({ entityId, entity, prev }) {
    if (!entity) return;
    const newLevel = this._computeHazardLevel(entity);
    if (newLevel !== entity.hazard_level) {
      this.dtState.setState(entityId, { hazard_level: newLevel }, 'HAZARD_ENGINE');
      this.bus.emit('hazard:level_change', { entityId, prev: entity.hazard_level, next: newLevel });
      const mlProb = this._latestMLPredictions[entityId]?.predictedRisk ?? this._latestMLPredictions[entityId]?.hazardProbability ?? 0;
      this._updateGraphCosts(entityId, newLevel, mlProb);
      this._checkExitAccessibility(entityId, newLevel);
    } else if (prev && prev.hazard_level !== entity.hazard_level) {
      const mlProb = this._latestMLPredictions[entityId]?.predictedRisk ?? this._latestMLPredictions[entityId]?.hazardProbability ?? 0;
      this._updateGraphCosts(entityId, entity.hazard_level, mlProb);
      this._checkExitAccessibility(entityId, entity.hazard_level);
    }
  }

  _computeHazardLevel(entity) {
    if (entity.accessible === false) return 'BLOCKED';
    const { temperature: t = 28, smoke: s = 0.01, fire_alarm: fa = false } = entity;
    const cfg = this._getConfig();
    const ct = cfg.sensors?.customThresholds;

    const warnTemp = ct?.tempWarning ?? DEFAULT_THRESHOLDS.WARNING.temp;
    const critTemp = ct?.tempCritical ?? DEFAULT_THRESHOLDS.CRITICAL.temp;
    const warnSmoke = ct?.smokeWarning ?? DEFAULT_THRESHOLDS.WARNING.smoke;
    const critSmoke = ct?.smokeCritical ?? DEFAULT_THRESHOLDS.CRITICAL.smoke;
    const blockTemp = ct?.tempBlocked ?? DEFAULT_THRESHOLDS.BLOCKED.temp;
    const blockSmoke = ct?.smokeBlocked ?? DEFAULT_THRESHOLDS.BLOCKED.smoke;

    if (t >= blockTemp || s >= blockSmoke) return 'BLOCKED';
    if (t >= critTemp || s >= critSmoke || fa) return 'CRITICAL';
    if (t >= warnTemp || s >= warnSmoke) return 'WARNING';
    return 'NORMAL';
  }

  _propagateToAdjacentSpaces(sourceId, sourceLevel) {
    const cfg = this._getConfig();
    if (cfg.scenario?.fireSpread === false) return;

    const srcEntity = this.dtState.getEntity(sourceId);
    if (!srcEntity) return;

    const srcTemp = srcEntity.temperature || 28;
    const srcSmoke = srcEntity.smoke || 0.01;
    if (!srcEntity.fire_alarm && srcTemp < 50.0 && srcSmoke < 0.30) return;

    const smokeFactor = cfg.scenario?.adjacentSmokeFactor ?? (this.sc.adjacent_smoke_factor || 0.45);
    const tempFactor  = cfg.scenario?.adjacentTempFactor ?? 0.32;

    const adj = this.adjacency[sourceId] || [];
    adj.forEach(adjId => {
      const adjEntity = this.dtState.getEntity(adjId);
      if (!adjEntity || adjEntity.fire_alarm) return;

      const propSmoke = srcSmoke * smokeFactor;
      const propTemp  = Math.max(adjEntity.temperature || 28, (srcTemp * tempFactor) + ((adjEntity.temperature || 28) * (1 - tempFactor)));

      if (propSmoke > (adjEntity.smoke || 0.01) || propTemp > (adjEntity.temperature || 28)) {
        this.dtState.setState(adjId, {
          smoke:       +Math.max(adjEntity.smoke || 0.01, propSmoke).toFixed(3),
          temperature: +Math.max(adjEntity.temperature || 28, propTemp).toFixed(1),
        }, 'HAZARD_SPREAD');
      }
    });
  }

  _updateGraphCosts(entityId, hazardLevel, mlHazardProbability = 0, predObj = null) {
    const cfg = this._getConfig();
    const smokePen = cfg.scenario?.smokePenaltyFactor ?? (this.sc.cost_smoke || 20);
    const hazPen   = cfg.scenario?.hazardPenaltyFactor ?? (this.sc.cost_dangerous || 10000);

    let multiplier;
    switch (hazardLevel) {
      case 'WARNING':  multiplier = smokePen; break;
      case 'CRITICAL': multiplier = hazPen;   break;
      case 'BLOCKED':  multiplier = Infinity; break;
      default:         multiplier = 1.0;      break;
    }

    const isPredictive = cfg.routing?.predictiveRouting ?? this.predictiveRouting ?? true;

    // Predictive ML hazard cost scaling (ONLY when predictive routing is active and costs are finite)
    if (isPredictive && isFinite(multiplier)) {
      const pred = predObj || this._latestMLPredictions[entityId] || {};
      const horizon = pred.horizonSeconds || 15;
      const feats = pred.features || {};
      const tempRate = feats.temperature_rate || 0;
      const smokeRate = feats.smoke_rate || 0;
      const rateNorm = Math.max(0, tempRate / 1.0, smokeRate / 0.02);
      const timeToHazard = Math.max(1.0, horizon / (1.0 + 2.5 * rateNorm));
      const timeUrgency = Math.min(2.5, Math.max(0.8, horizon / timeToHazard));

      if (hazardLevel === 'NORMAL') {
        if (mlHazardProbability >= 0.80) {
          // High predicted risk: strong finite penalty to encourage proactive reroute
          multiplier = +(1.0 + (mlHazardProbability - 0.30) * 7.5 * timeUrgency).toFixed(2);
        } else if (mlHazardProbability >= 0.60) {
          // Moderate predicted risk: noticeable penalty
          multiplier = +(1.0 + (mlHazardProbability - 0.30) * 4.0 * timeUrgency).toFixed(2);
        } else if (mlHazardProbability >= 0.30) {
          // Mild predicted risk: gentle advisory bias
          multiplier = +(1.0 + (mlHazardProbability - 0.30) * 1.8 * timeUrgency).toFixed(2);
        }
      } else if (hazardLevel === 'WARNING') {
        multiplier = +(multiplier * (1.0 + mlHazardProbability * 1.5 * timeUrgency)).toFixed(2);
      }
    }

    // 1. Direct node match
    this.graph.setNodeCostMultiplier(entityId, multiplier);

    // 2. Spatial mapping match: If entityId is a space, update constituent nodes
    const mapping = SPATIAL_GRAPH_MAPPING[entityId];
    if (mapping && mapping.nodes) {
      mapping.nodes.forEach(nid => {
        this.graph.setNodeCostMultiplier(nid, multiplier);
      });
    }

    this.bus.emit('hazard:graph_updated', { entityId, hazardLevel, multiplier, mlHazardProbability });
  }

  _checkExitAccessibility(entityId, hazardLevel) {
    const activeBld = getActiveBuilding ? getActiveBuilding() : BUILDING;
    (activeBld.exits || []).forEach(exit => {
      if (exit.connected_node === entityId || exit.id === entityId) {
        const isCompromised = hazardLevel === 'BLOCKED' || hazardLevel === 'CRITICAL';
        const accessible = !isCompromised;
        this.dtState.setState(exit.id, { accessible, hazard_level: hazardLevel }, 'HAZARD_ENGINE');
        if (isCompromised) {
          this.graph.setNodeCostMultiplier(exit.id, Infinity);
        } else {
          this.graph.setNodeCostMultiplier(exit.id, 1.0);
        }
        this.bus.emit('hazard:exit_status', { exitId: exit.id, accessible, hazardLevel });
      }
    });
  }

  _blockLifts() {
    if (this._liftsBlocked) return;
    this._liftsBlocked = true;

    const activeBld = getActiveBuilding ? getActiveBuilding() : BUILDING;
    (activeBld.spaces || []).filter(s => s.type === 'LIFT').forEach(lift => {
      this.graph.setNodeCostMultiplier(lift.id, Infinity);
      this.dtState.setState(lift.id, { accessible: false, hazard_level: 'BLOCKED' }, 'LIFT_BLOCKED');
      this.bus.emit('hazard:lift_blocked', { liftId: lift.id, reason: 'Fire — lifts disabled per NFPA 72 safety standard' });
    });
    this.bus.emit('hazard:lift_blocked', { reason: 'Fire — lifts disabled per NFPA 72 safety standard' });

    this.bus.emit('log', {
      tag: 'hazard',
      msg: '🛗 Emergency elevator recall activated: Lifts grounded and locked out of evacuation graph per NFPA 72.'
    });
  }

  _onFireTrigger(e = {}) {
    this._blockLifts();
    const rooms = e.rooms || (Array.isArray(e.room) ? e.room : (typeof e.room === 'string' && e.room.includes(',') ? e.room.split(',') : [e.room || 'ROOM_101']));
    this._activeFireRooms = [...new Set([...this._activeFireRooms, ...rooms])];
    this._fireStartTime = e.time || 5.0;

    rooms.forEach(r => {
      if (r) {
        this.dtState.setState(r, { hazard_level: 'CRITICAL', fire_alarm: true, temperature: 75.0, smoke: 0.55 }, 'FIRE_TRIGGER');
        this._updateGraphCosts(r, 'CRITICAL', 1.0);
        this._checkExitAccessibility(r, 'CRITICAL');
      }
    });
  }

  _onHazardSpread() {
    const activeBld = getActiveBuilding ? getActiveBuilding() : BUILDING;
    (activeBld.spaces || []).forEach(space => {
      const entity = this.dtState.getEntity(space.id);
      if (entity && (entity.fire_alarm || (entity.temperature || 0) >= 65.0)) {
        this._propagateToAdjacentSpaces(space.id, entity.hazard_level);
      }
    });
  }

  _applyConfigExits() {
    const cfg = this._getConfig();
    const blockedExits = cfg.building?.blockedExits || {};
    const exitsConfig = cfg.building?.exits || {};
    const activeBld = getActiveBuilding ? getActiveBuilding() : BUILDING;

    (activeBld.exits || []).forEach(exit => {
      const isBlocked = blockedExits[exit.id] === true || (exitsConfig[exit.id] && exitsConfig[exit.id].enabled === false);
      if (isBlocked) {
        this.graph.setNodeCostMultiplier(exit.id, Infinity);
        this.dtState.setState(exit.id, { accessible: false, hazard_level: 'BLOCKED' }, 'CONFIG_BLOCKED');
        this.bus.emit('hazard:exit_status', { exitId: exit.id, accessible: false, hazardLevel: 'BLOCKED' });
      } else {
        const entity = this.dtState.getEntity(exit.id);
        const accessible = !entity || entity.hazard_level !== 'BLOCKED';
        if (accessible) {
          this.graph.setNodeCostMultiplier(exit.id, 1.0);
          this.dtState.setState(exit.id, { accessible: true, hazard_level: 'NORMAL' }, 'CONFIG_UNBLOCKED');
          this.bus.emit('hazard:exit_status', { exitId: exit.id, accessible: true, hazardLevel: 'NORMAL' });
        }
      }
    });
  }

  _reset() {
    this._liftsBlocked = false;
    this._activeFireRooms = [];
    this._fireStartTime = null;
    this._latestMLPredictions = {};
    this._mlPredictor.reset();

    if (this.graph && typeof this.graph.resetCosts === 'function') {
      this.graph.resetCosts();
    }
    const activeBld = getActiveBuilding ? getActiveBuilding() : BUILDING;
    (activeBld.spaces || []).filter(s => s.type === 'LIFT').forEach(lift => {
      this.dtState.setState(lift.id, { accessible: true, hazard_level: 'NORMAL' }, 'RESET');
      this.graph.setNodeCostMultiplier(lift.id, 1.0);
    });
    this._applyConfigExits();
  }
}
