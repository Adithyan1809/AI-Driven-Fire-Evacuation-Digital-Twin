/**
 * DIGITAL TWIN STATE MANAGER
 *
 * Single Source of Truth for the authoritative runtime state of the entire building:
 *   {
 *     building,
 *     spaces,
 *     sensors,
 *     occupants,
 *     hazards,
 *     exits,
 *     routes,
 *     simulationTime,
 *     scenarioState,
 *     generationId,
 *     lastUpdated
 *   }
 *
 * All state mutations must go through setState() or applyPatchMap() — never mutate directly.
 * Emits granular change events so UI and downstream services react deterministically.
 */

import { BUILDING, getActiveBuilding } from '../data/building.js';
import { TelemetrySequencer } from './telemetrySequencer.js';

export class DigitalTwinState {
  /**
   * @param {Object}   opts
   * @param {EventBus} opts.bus
   */
  constructor({ bus }) {
    this.bus = bus;
    this._state = {};          // entity_id -> entity state object
    this._generationId = 1;    // simulation generation counter
    this._sequencer = new TelemetrySequencer();
    this._lastUpdated = Date.now();
    this._simulationTime = 0;
    this._scenarioState = { phase: 'IDLE', fireActive: false, fireRooms: [] };

    this._initialise();

    this.bus.on('sim:reset', () => this.reset());
    this.bus.on('sim:tick', e => {
      this._simulationTime = e.time || 0;
    });
    this.bus.on('sim:phase', e => {
      this._scenarioState.phase = e.phase;
    });
    this.bus.on('sim:fire_trigger', e => {
      this._scenarioState.fireActive = true;
      this._scenarioState.fireRooms = e.rooms || [e.room];
    });
  }

  // ── Public API ─────────────────────────────────────────

  /**
   * Get the current simulation generation identifier.
   * Async tasks must compare their captured generationId against this.
   */
  getGenerationId() {
    return this._generationId;
  }

  /**
   * Re-initialise state from the active building model and advance generation ID.
   */
  init(building = null) {
    this._initialise(building);
  }

  /**
   * Reset simulation state and advance generation counter.
   */
  reset(building = null) {
    this._generationId++;
    this._sequencer.reset();
    this._simulationTime = 0;
    this._scenarioState = { phase: 'IDLE', fireActive: false, fireRooms: [] };
    this._initialise(building);
    this.bus.emit('dt:generation_change', { generationId: this._generationId });
  }

  /**
   * Get a copy of a single entity's state.
   */
  getEntity(id) {
    const e = this._state[id];
    return e ? { ...e } : null;
  }

  /**
   * Get all entity states.
   */
  getAll() {
    return Object.fromEntries(
      Object.entries(this._state).map(([k, v]) => [k, { ...v }])
    );
  }

  /**
   * Returns a comprehensive authoritative state snapshot of the entire Digital Twin.
   */
  getStateSnapshot() {
    const activeBld = getActiveBuilding ? getActiveBuilding() : BUILDING;
    const entities = Object.values(this._state);

    return {
      building: {
        id: activeBld.id || 'DEPT_FLOOR_1',
        name: activeBld.name || 'Building',
        floor: activeBld.floor || 1,
      },
      spaces: entities.filter(e => e.type !== 'EXIT'),
      exits: entities.filter(e => e.type === 'EXIT'),
      hazards: entities.filter(e => e.hazard_level && e.hazard_level !== 'NORMAL').map(e => ({
        entityId: e.entity_id,
        hazardLevel: e.hazard_level,
        temperature: e.temperature,
        smoke: e.smoke,
      })),
      simulationTime: this._simulationTime,
      scenarioState: { ...this._scenarioState },
      generationId: this._generationId,
      lastUpdated: this._lastUpdated,
      summary: this.getSummary(),
    };
  }

  /**
   * Apply a partial state patch to an entity with sequencing and generation validation.
   *
   * @param {string} entityId
   * @param {Object} patch      - only the changed fields
   * @param {string} [source]   - source system label for tracing
   * @param {Object} [meta]     - { generationId, timestamp, seq }
   * @returns {boolean} True if patch was accepted and applied
   */
  setState(entityId, patch, source = 'SYSTEM', meta = {}) {
    const metaObj = typeof meta === 'number' ? { generationId: meta } : (meta || {});

    // 1. Generation ID validation: discard stale async responses from prior runs
    if (typeof metaObj.generationId === 'number' && metaObj.generationId !== this._generationId) {
      console.warn(`[DT] Discarded stale state update for ${entityId}: generation ${metaObj.generationId} !== current ${this._generationId}`);
      this.bus.emit('dt:stale_discarded', { entityId, generationId: metaObj.generationId, currentGeneration: this._generationId });
      return false;
    }

    // 2. Timestamp / sequence freshness check if telemetry metadata provided
    if (meta.timestamp || meta.seq) {
      const seqCheck = this._sequencer.evaluate({
        entityId,
        timestamp: meta.timestamp,
        seq: meta.seq,
        source,
      });
      if (!seqCheck.accepted) {
        console.warn(`[DT] ${seqCheck.reason}`);
        this.bus.emit('dt:stale_discarded', { entityId, reason: seqCheck.reason });
        return false;
      }
    }

    if (!this._state[entityId]) {
      console.warn(`[DT] Unknown entity: ${entityId}`);
      return false;
    }

    const prev = { ...this._state[entityId] };
    Object.assign(this._state[entityId], patch);
    this._lastUpdated = Date.now();
    this._state[entityId]._lastModified = this._lastUpdated;
    this._state[entityId]._lastSource = source;
    this._state[entityId]._lastGeneration = this._generationId;

    // Track contributing systems if source is an external feed
    if (source.startsWith('MW:')) {
      const sysName = source.replace('MW:', '');
      if (Array.isArray(this._state[entityId].contributing_systems) && !this._state[entityId].contributing_systems.includes(sysName)) {
        this._state[entityId].contributing_systems.push(sysName);
      }
    }

    const changed = Object.keys(patch).filter(k => prev[k] !== this._state[entityId][k]);
    if (changed.length > 0) {
      const entity = this.getEntity(entityId);
      this.bus.emit('dt:state_change', {
        entityId,
        entity,
        prev,
        changed,
        source,
        generationId: this._generationId,
      });
      this.bus.emit(`dt:${entityId}`, { entity, changed, source, generationId: this._generationId });
    }

    return true;
  }

  /**
   * Bulk apply patches from validation layer with optional per-entity metadata.
   *
   * @param {Object} patchMap  - entityId -> patch object
   * @param {string} source    - source system label
   * @param {Object} [metaMap] - entityId -> meta object OR global meta object
   */
  applyPatchMap(patchMap, source = 'SEMANTIC_MIDDLEWARE', metaMap = {}) {
    let appliedCount = 0;
    const globalGen = metaMap && typeof metaMap === 'object' && metaMap.generationId ? metaMap.generationId : this._generationId;

    for (const [entityId, patch] of Object.entries(patchMap)) {
      let entityMeta = { generationId: globalGen };
      if (metaMap && typeof metaMap === 'object') {
        if (metaMap[entityId] && typeof metaMap[entityId] === 'object' && ('timestamp' in metaMap[entityId] || 'seq' in metaMap[entityId])) {
          entityMeta = { ...entityMeta, ...metaMap[entityId] };
        } else if ('timestamp' in metaMap || 'seq' in metaMap) {
          entityMeta = { ...entityMeta, ...metaMap };
        }
      }

      if (this.setState(entityId, patch, source, entityMeta)) {
        appliedCount++;
      }
    }
    return appliedCount;
  }

  /**
   * Compute a summary of current DT state.
   */
  getSummary() {
    const entities = Object.values(this._state);
    return {
      total_entities:           entities.length,
      hazardous_rooms:          entities.filter(e => ['WARNING','CRITICAL','BLOCKED'].includes(e.hazard_level)).length,
      critical_rooms:           entities.filter(e => e.hazard_level === 'CRITICAL').length,
      predicted_warning_rooms:  entities.filter(e => e.predicted_state === 'PREDICTED_WARNING').length,
      predicted_critical_rooms: entities.filter(e => e.predicted_state === 'PREDICTED_CRITICAL').length,
      blocked_exits:            entities.filter(e => e.type === 'EXIT' && !e.accessible).length,
      fire_alarms_active:       entities.filter(e => e.fire_alarm).length,
      total_occupancy:          entities.reduce((s, e) => s + (e.occupancy || 0), 0),
      generationId:             this._generationId,
    };
  }

  getSequencerStats() {
    return this._sequencer.getStats();
  }

  // ── Internal ───────────────────────────────────────────

  _initialise(activeBuilding = null) {
    const building = activeBuilding || (getActiveBuilding ? getActiveBuilding() : BUILDING);
    this._state = {};

    // Initialise from building spaces
    (building.spaces || []).forEach(space => {
      const baseOcc = building.sensor_baselines?.occupancy?.[space.id]?.base ?? Math.round((space.capacity || 20) * 0.35);
      this._state[space.id] = {
        entity_id:          space.id,
        type:               space.type,
        name:               space.name || space.id,
        floor:              space.floor || building.floor || 1,
        ifc_id:             space.ifc_id || null,
        temperature:        27.4,
        smoke:              0.01,
        fire_alarm:         false,
        occupancy:          baseOcc,
        hazard_level:       'NORMAL',
        predicted_state:    'SAFE',
        predicted_risk:     0.0,
        prediction_horizon: 15,
        prediction_trend:   'STABLE',
        prediction_reasons: [],
        accessible:         true,
        contributing_systems: ['BMS', 'FAS', 'BIM', 'OCCUPANCY'],
        _lastModified:      Date.now(),
        _lastSource:        'INIT',
        _lastGeneration:    this._generationId,
      };
    });

    // Initialise exits
    (building.exits || []).forEach(exit => {
      this._state[exit.id] = {
        entity_id:   exit.id,
        type:        'EXIT',
        name:        exit.name || exit.id,
        floor:       building.floor || 1,
        ifc_id:      null,
        temperature: 26.0,
        smoke:       0.0,
        fire_alarm:  false,
        occupancy:   0,
        hazard_level:'NORMAL',
        accessible:  true,
        contributing_systems: ['BIM'],
        _lastModified: Date.now(),
        _lastSource:   'INIT',
        _lastGeneration: this._generationId,
      };
    });

    this._lastUpdated = Date.now();
    this.bus.emit('dt:initialised', {
      entities: this.getAll(),
      generationId: this._generationId,
      buildingId: building.id,
    });
  }
}
