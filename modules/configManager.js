/**
 * CONFIGURATION MANAGER
 *
 * Centralized, schema-validated configuration system for the Digital Twin application.
 * Manages presets, custom parameters, localStorage persistence, JSON export/import,
 * live validation, and event-driven updates.
 */

import { BUILDING } from '../data/building.js';

export const PRESETS = Object.freeze({
  PROFESSOR_DEMO: {
    id: 'PROFESSOR_DEMO',
    name: '🎓 Professor Demo (Recommended)',
    description: 'Deliberate, human-paced demonstration focusing on AI Semantic Interoperability and dynamic safety evacuation.',
    config: {
      simulation: {
        simSpeed: 1,
        presSpeed: 'SLOW',
        presMode: 'DEMO',
        autoStart: false,
        autoPauseOnMilestones: false,
      },
      scenario: {
        type: 'FIRE',
        fireRoom: 'ROOM_101',
        fireRooms: ['ROOM_101'],
        fireStartSeconds: 10,
        fireSeverity: 'HIGH',
        tempGrowthRate: 0.95,
        smokeGrowthRate: 0.015,
        fireSpread: true,
        spreadRateMultiplier: 1.0,
        adjacentSmokeFactor: 0.4,
        adjacentTempFactor: 0.3,
        propagationDelaySeconds: 2.0,
      },
      sensors: {
        noiseLevelPct: 2,
        failureSimulation: {
          enabled: false,
          targetSensor: 'TEMP_101',
          failureType: 'OFFLINE',
        },
        customThresholds: {
          tempWarning: 38,
          tempCritical: 60,
          smokeWarning: 0.15,
          smokeCritical: 0.50,
        },
      },
      building: {
        buildingName: 'Engineering Department Building',
        floorName: 'Floor 1',
        enabledSpaces: Object.fromEntries(BUILDING.spaces.map(s => [s.id, true])),
        exits: Object.fromEntries(BUILDING.exits.map(e => [e.id, { name: e.name, enabled: true }])),
      },
      routing: {
        algorithm: 'DIJKSTRA',
        strategy: 'SAFEST',
        hazardPenalty: 1000,
        smokePenalty: 20,
        crowdingPenalty: 3,
        allowLiftDuringEmergency: false,
        recalcTrigger: 'HAZARD_UPDATE',
      },
      occupants: {
        count: 50,
        distribution: 'ROOM_BASED',
        reactionDelaySeconds: 1.0,
        walkingSpeedMultiplier: 1.0,
        speedVariationPct: 15,
        behavior: 'ADAPTIVE',
        roomAllocation: {
          ROOM_103: 15,
          ROOM_102: 15,
          ROOM_101: 10,
          STAFF_ROOM: 4,
          DEPT_OFFICE: 4,
          HOD_CABIN_2: 1,
          HOD_CABIN_1: 1,
        },
      },
      semantic: {
        mode: 'DETERMINISTIC',
        confidenceThreshold: 0.75,
        unknownEntityHandling: 'FLAG_FOR_REVIEW',
        validationEnabled: true,
        showReasoning: true,
        showNormalization: true,
        showSynonymMatching: true,
      },
      heterogeneous: {
        activeSystems: {
          BMS: true,
          FAS: true,
          BIM: true,
          OCCUPANCY: true,
        },
        messageDelayMs: 0,
        packetLossPct: 0,
        duplicateMessages: false,
        malformedRatePct: 0,
      },
      visualization: {
        showSensors: true,
        showOccupants: true,
        showRoutes: true,
        showHazardHeatmap: true,
        showSensorValues: true,
        showEntityIds: true,
        showSourceSystems: true,
        showConfidence: true,
        showEventTimeline: true,
        showGraph: false,
        showExitLabels: true,
        showDoors: true,
        zoomLevel: 100,
        timelineMaxEvents: 8,
        timelineDisplayMode: 'GROUPED',
      },
    },
  },

  AI_SEMANTIC_DEMO: {
    id: 'AI_SEMANTIC_DEMO',
    name: '🤖 AI Semantic Middleware Focus',
    description: 'Highlights multi-system schema mapping, entity resolution, confidence scoring, and validation firewall.',
    config: {
      simulation: { simSpeed: 1, presSpeed: 'NORMAL', presMode: 'DEMO', autoStart: false, autoPauseOnMilestones: true },
      scenario: { type: 'FIRE', fireRoom: 'ROOM_101', fireStartSeconds: 5, fireSeverity: 'HIGH', tempGrowthRate: 1.2, smokeGrowthRate: 0.02, fireSpread: true, propagationDelaySeconds: 1.5 },
      sensors: { noiseLevelPct: 0, failureSimulation: { enabled: false, targetSensor: 'TEMP_101', failureType: 'OFFLINE' }, customThresholds: { tempWarning: 38, tempCritical: 60, smokeWarning: 0.15, smokeCritical: 0.5 } },
      building: { buildingName: 'Engineering Department Building', floorName: 'Floor 1', enabledSpaces: { ROOM_103:true, ROOM_102:true, ROOM_101:true, STAFF_ROOM:true, DEPT_OFFICE:true, HOD_CABIN_2:true, HOD_CABIN_1:true, LIFT_1:true, LIFT_2:true, STAIR_01:true }, exits: { EXIT_STAIR: { name: 'Main Staircase Exit', enabled: true }, EXIT_NORTH_103: { name: 'North Fire Door', enabled: true }, EXIT_EAST: { name: 'East Corridor Exit', enabled: true } } },
      routing: { algorithm: 'DIJKSTRA', strategy: 'SAFEST', hazardPenalty: 1000, smokePenalty: 20, crowdingPenalty: 3, allowLiftDuringEmergency: false, recalcTrigger: 'HAZARD_UPDATE' },
      occupants: { count: 30, distribution: 'ROOM_BASED', reactionDelaySeconds: 0.5, walkingSpeedMultiplier: 1.0, speedVariationPct: 10, behavior: 'ADAPTIVE', roomAllocation: { ROOM_103: 8, ROOM_102: 8, ROOM_101: 8, STAFF_ROOM: 2, DEPT_OFFICE: 2, HOD_CABIN_2: 1, HOD_CABIN_1: 1 } },
      semantic: { mode: 'DETERMINISTIC', confidenceThreshold: 0.80, unknownEntityHandling: 'FLAG_FOR_REVIEW', validationEnabled: true, showReasoning: true, showNormalization: true, showSynonymMatching: true },
      heterogeneous: { activeSystems: { BMS: true, FAS: true, BIM: true, OCCUPANCY: true }, messageDelayMs: 0, packetLossPct: 0, duplicateMessages: false, malformedRatePct: 0 },
      visualization: { showSensors: true, showOccupants: true, showRoutes: true, showHazardHeatmap: true, showSensorValues: true, showEntityIds: true, showSourceSystems: true, showConfidence: true, showEventTimeline: true, showGraph: false, showExitLabels: true, showDoors: true, zoomLevel: 100, timelineMaxEvents: 8, timelineDisplayMode: 'GROUPED' },
    },
  },

  ROUTING_DEMO: {
    id: 'ROUTING_DEMO',
    name: '↺ Dynamic Routing & Dijkstra Benchmark',
    description: 'Stresses dynamic path recalculation away from expanding hazard zones and blocked exits.',
    config: {
      simulation: { simSpeed: 2, presSpeed: 'NORMAL', presMode: 'DEMO', autoStart: false, autoPauseOnMilestones: false },
      scenario: { type: 'FIRE', fireRoom: 'ROOM_102', fireStartSeconds: 6, fireSeverity: 'HIGH', tempGrowthRate: 1.5, smokeGrowthRate: 0.025, fireSpread: true, propagationDelaySeconds: 1.5 },
      sensors: { noiseLevelPct: 1, failureSimulation: { enabled: false, targetSensor: 'TEMP_101', failureType: 'OFFLINE' }, customThresholds: { tempWarning: 38, tempCritical: 60, smokeWarning: 0.15, smokeCritical: 0.5 } },
      building: { buildingName: 'Engineering Department Building', floorName: 'Floor 1', enabledSpaces: Object.fromEntries(BUILDING.spaces.map(s => [s.id, true])), exits: Object.fromEntries(BUILDING.exits.map(e => [e.id, { name: e.name, enabled: true }])) },
      routing: { algorithm: 'DIJKSTRA', strategy: 'SAFEST', hazardPenalty: 2000, smokePenalty: 50, crowdingPenalty: 10, allowLiftDuringEmergency: false, recalcTrigger: 'IMMEDIATE' },
      occupants: { count: 75, distribution: 'ROOM_BASED', reactionDelaySeconds: 0.8, walkingSpeedMultiplier: 1.1, speedVariationPct: 20, behavior: 'ADAPTIVE', roomAllocation: { ROOM_103: 20, ROOM_102: 20, ROOM_101: 15, STAFF_ROOM: 8, DEPT_OFFICE: 8, HOD_CABIN_2: 2, HOD_CABIN_1: 2 } },
      semantic: { mode: 'DETERMINISTIC', confidenceThreshold: 0.75, unknownEntityHandling: 'FLAG_FOR_REVIEW', validationEnabled: true, showReasoning: true, showNormalization: true, showSynonymMatching: true },
      heterogeneous: { activeSystems: { BMS: true, FAS: true, BIM: true, OCCUPANCY: true }, messageDelayMs: 0, packetLossPct: 0, duplicateMessages: false, malformedRatePct: 0 },
      visualization: { showSensors: true, showOccupants: true, showRoutes: true, showHazardHeatmap: true, showSensorValues: true, showEntityIds: true, showSourceSystems: true, showConfidence: true, showEventTimeline: true, showGraph: true, showExitLabels: true, showDoors: true, zoomLevel: 100, timelineMaxEvents: 8, timelineDisplayMode: 'GROUPED' },
    },
  },

  SENSOR_FAILURE_DEMO: {
    id: 'SENSOR_FAILURE_DEMO',
    name: '⚠️ Sensor Failure & Robustness',
    description: 'Demonstrates Digital Twin state resilience when IoT sensors go offline or send corrupted values.',
    config: {
      simulation: { simSpeed: 1, presSpeed: 'NORMAL', presMode: 'DEMO', autoStart: false, autoPauseOnMilestones: false },
      scenario: { type: 'SENSOR_FAILURE', fireRoom: 'ROOM_101', fireStartSeconds: 10, fireSeverity: 'MEDIUM', tempGrowthRate: 0.8, smokeGrowthRate: 0.012, fireSpread: true, propagationDelaySeconds: 2.5 },
      sensors: { noiseLevelPct: 15, failureSimulation: { enabled: true, targetSensor: 'TEMP_101', failureType: 'OFFLINE' }, customThresholds: { tempWarning: 38, tempCritical: 60, smokeWarning: 0.15, smokeCritical: 0.5 } },
      building: { buildingName: 'Engineering Department Building', floorName: 'Floor 1', enabledSpaces: Object.fromEntries(BUILDING.spaces.map(s => [s.id, true])), exits: Object.fromEntries(BUILDING.exits.map(e => [e.id, { name: e.name, enabled: true }])) },
      routing: { algorithm: 'DIJKSTRA', strategy: 'SAFEST', hazardPenalty: 1000, smokePenalty: 20, crowdingPenalty: 3, allowLiftDuringEmergency: false, recalcTrigger: 'HAZARD_UPDATE' },
      occupants: { count: 50, distribution: 'ROOM_BASED', reactionDelaySeconds: 1.0, walkingSpeedMultiplier: 1.0, speedVariationPct: 15, behavior: 'ADAPTIVE', roomAllocation: { ROOM_103: 15, ROOM_102: 15, ROOM_101: 10, STAFF_ROOM: 4, DEPT_OFFICE: 4, HOD_CABIN_2: 1, HOD_CABIN_1: 1 } },
      semantic: { mode: 'DETERMINISTIC', confidenceThreshold: 0.75, unknownEntityHandling: 'FLAG_FOR_REVIEW', validationEnabled: true, showReasoning: true, showNormalization: true, showSynonymMatching: true },
      heterogeneous: { activeSystems: { BMS: true, FAS: false, BIM: true, OCCUPANCY: true }, messageDelayMs: 50, packetLossPct: 5, duplicateMessages: true, malformedRatePct: 2 },
      visualization: { showSensors: true, showOccupants: true, showRoutes: true, showHazardHeatmap: true, showSensorValues: true, showEntityIds: true, showSourceSystems: true, showConfidence: true, showEventTimeline: true, showGraph: false, showExitLabels: true, showDoors: true, zoomLevel: 100, timelineMaxEvents: 8, timelineDisplayMode: 'GROUPED' },
    },
  },

  FULL_SIMULATION: {
    id: 'FULL_SIMULATION',
    name: '⚡ Full Speed Benchmark',
    description: 'High-throughput 100-occupant stress test with real-time logging and immediate evacuation analytics.',
    config: {
      simulation: { simSpeed: 5, presSpeed: 'FAST', presMode: 'REALTIME', autoStart: true, autoPauseOnMilestones: false },
      scenario: { type: 'FIRE', fireRoom: 'ROOM_101', fireStartSeconds: 5, fireSeverity: 'HIGH', tempGrowthRate: 1.2, smokeGrowthRate: 0.02, fireSpread: true, propagationDelaySeconds: 1.0 },
      sensors: { noiseLevelPct: 2, failureSimulation: { enabled: false, targetSensor: 'TEMP_101', failureType: 'OFFLINE' }, customThresholds: { tempWarning: 38, tempCritical: 60, smokeWarning: 0.15, smokeCritical: 0.5 } },
      building: { buildingName: 'Engineering Department Building', floorName: 'Floor 1', enabledSpaces: Object.fromEntries(BUILDING.spaces.map(s => [s.id, true])), exits: Object.fromEntries(BUILDING.exits.map(e => [e.id, { name: e.name, enabled: true }])) },
      routing: { algorithm: 'DIJKSTRA', strategy: 'SAFEST', hazardPenalty: 1000, smokePenalty: 20, crowdingPenalty: 3, allowLiftDuringEmergency: false, recalcTrigger: 'HAZARD_UPDATE' },
      occupants: { count: 100, distribution: 'ROOM_BASED', reactionDelaySeconds: 0.5, walkingSpeedMultiplier: 1.2, speedVariationPct: 20, behavior: 'ADAPTIVE', roomAllocation: { ROOM_103: 25, ROOM_102: 25, ROOM_101: 20, STAFF_ROOM: 10, DEPT_OFFICE: 12, HOD_CABIN_2: 4, HOD_CABIN_1: 4 } },
      semantic: { mode: 'DETERMINISTIC', confidenceThreshold: 0.75, unknownEntityHandling: 'FLAG_FOR_REVIEW', validationEnabled: true, showReasoning: true, showNormalization: true, showSynonymMatching: true },
      heterogeneous: { activeSystems: { BMS: true, FAS: true, BIM: true, OCCUPANCY: true }, messageDelayMs: 0, packetLossPct: 0, duplicateMessages: false, malformedRatePct: 0 },
      visualization: { showSensors: true, showOccupants: true, showRoutes: true, showHazardHeatmap: true, showSensorValues: true, showEntityIds: true, showSourceSystems: true, showConfidence: true, showEventTimeline: true, showGraph: false, showExitLabels: true, showDoors: true, zoomLevel: 100, timelineMaxEvents: 20, timelineDisplayMode: 'GROUPED' },
    },
  },
});

const STORAGE_KEY = 'dt_user_configuration_v2';

export class ConfigManager {
  /**
   * @param {Object} opts
   * @param {EventBus} opts.bus
   */
  constructor({ bus }) {
    this.bus = bus;
    this.activePreset = 'PROFESSOR_DEMO';
    this.current = this._clone(PRESETS.PROFESSOR_DEMO.config);
    this.isLocked = false;

    this._normalizeConfig(this.current);
    this._initSensorsMap();
    this._loadFromStorage();
  }

  _normalizeSemanticMode(mode) {
    const normalized = String(mode || '').trim().toUpperCase();
    if (!normalized) return 'AI_GEMINI';
    if (normalized === 'DETERMINISTIC') return 'DETERMINISTIC_BASELINE';
    if (normalized === 'AI') return 'AI_GEMINI';
    if (normalized === 'OFFLINE') return 'AI_UNAVAILABLE';
    return normalized;
  }

  _normalizeConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return cfg;
    if (cfg.semantic && typeof cfg.semantic === 'object') {
      cfg.semantic.mode = this._normalizeSemanticMode(cfg.semantic.mode);
    }
    return cfg;
  }

  _initSensorsMap() {
    this.current.sensors.enabledMap = {};
    BUILDING.sensors.forEach(s => {
      this.current.sensors.enabledMap[s.id] = true;
    });
  }

  // ── Public API ──────────────────────────────────────────

  get() {
    this._normalizeConfig(this.current);
    return this.current;
  }

  set(partialConfig) {
    if (this.isLocked) {
      console.warn('[ConfigManager] Configuration is locked during active simulation.');
      return { success: false, reason: 'Simulation is currently running. Please RESET before modifying parameters.' };
    }

    const candidate = this._clone(this.current);
    this._deepMerge(candidate, partialConfig);
    this._normalizeConfig(candidate);

    const validation = this.validate(candidate);
    if (!validation.valid) {
      return { success: false, reason: validation.error };
    }

    this._deepMerge(this.current, partialConfig);
    this._normalizeConfig(this.current);
    this.activePreset = 'CUSTOM';
    this._saveToStorage();
    this.bus.emit('config:changed', { config: this.current, preset: this.activePreset });
    return { success: true };
  }

  update(partialConfig) {
    return this.set(partialConfig);
  }

  setFireSpreadRate(multiplier) {
    const mult = Math.max(0.1, Math.min(10.0, Number(multiplier) || 1.0));
    return this.set({ scenario: { spreadRateMultiplier: mult } });
  }

  setSmokeConvectionFactor(factor) {
    const f = Math.max(0.05, Math.min(1.0, Number(factor) || 0.4));
    return this.set({ scenario: { adjacentSmokeFactor: f } });
  }

  setFireRooms(rooms) {
    const list = Array.isArray(rooms) ? rooms : (typeof rooms === 'string' ? rooms.split(',') : ['ROOM_101']);
    return this.set({ scenario: { fireRooms: list, fireRoom: list[0] } });
  }

  loadPreset(presetId) {
    const preset = PRESETS[presetId];
    if (!preset) return { success: false, reason: `Unknown preset "${presetId}".` };

    if (this.isLocked) {
      return { success: false, reason: 'Simulation is running. Reset to change presets.' };
    }

    this.activePreset = presetId;
    this.current = this._clone(preset.config);
    this._normalizeConfig(this.current);
    this._initSensorsMap();
    this._saveToStorage();
    this.bus.emit('config:changed', { config: this.current, preset: this.activePreset });
    return { success: true, preset };
  }

  resetToDefault() {
    return this.loadPreset('PROFESSOR_DEMO');
  }

  exportJSON() {
    return JSON.stringify({
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      preset: this.activePreset,
      config: this.current,
    }, null, 2);
  }

  importJSON(jsonString) {
    if (this.isLocked) {
      return { success: false, reason: 'Simulation is running. Reset to import configuration.' };
    }
    if (typeof jsonString !== 'string' || jsonString.length > 500000) {
      return { success: false, reason: 'Configuration payload too large (max 500KB).' };
    }
    try {
      const parsed = JSON.parse(jsonString);
      const conf = parsed.config || parsed;
      const validation = this.validate(conf);
      if (!validation.valid) {
        return { success: false, reason: `Validation error: ${validation.error}` };
      }
      this.current = this._clone(conf);
      this.activePreset = parsed.preset || 'CUSTOM';
      this._saveToStorage();
      this.bus.emit('config:changed', { config: this.current, preset: this.activePreset });
      return { success: true };
    } catch (e) {
      return { success: false, reason: `Invalid JSON format: ${e.message}` };
    }
  }

  setLocked(locked) {
    this.isLocked = locked;
    this.bus.emit('config:locked', { locked });
  }

  validate(cfg = this.current) {
    // Occupants validation
    if (cfg.occupants?.count !== undefined && (cfg.occupants.count <= 0 || cfg.occupants.count > 500)) {
      return { valid: false, error: 'Occupant count must be between 1 and 500.' };
    }

    // Confidence threshold validation
    if (cfg.semantic?.confidenceThreshold !== undefined &&
        (cfg.semantic.confidenceThreshold < 0 || cfg.semantic.confidenceThreshold > 1)) {
      return { valid: false, error: 'Semantic confidence threshold must be between 0% and 100% (0.0 to 1.0).' };
    }

    // Fire start seconds validation
    if (cfg.scenario?.fireStartSeconds !== undefined && cfg.scenario.fireStartSeconds < 0) {
      return { valid: false, error: 'Fire start time cannot be negative.' };
    }

    return { valid: true };
  }

  // ── Internal ───────────────────────────────────────────

  _saveToStorage() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          preset: this.activePreset,
          config: this.current,
        }));
      }
    } catch (e) {}
  }

  _loadFromStorage() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.config) {
            this.activePreset = parsed.preset || 'CUSTOM';
            this._deepMerge(this.current, parsed.config);
          }
        }
      }
    } catch (e) {}
  }

  _clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  _deepMerge(target, source) {
    for (const key of Object.keys(source)) {
      if (source[key] instanceof Object && key in target && target[key] instanceof Object && !Array.isArray(source[key])) {
        this._deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }
}
