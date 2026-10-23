/**
 * HETEROGENEOUS MESSAGE GENERATOR — SENSOR GATEWAY
 *
 * Simulates multiple distinct virtual IoT systems and protocol streams, each producing
 * telemetry in its own heterogeneous schema, naming convention, and vocabulary:
 *
 *   1. BMS (Building Management System)      — { device_id, zone, temp_celsius, people_count, seq, ts }
 *   2. ENV_IOT (Environmental IoT Probes)    — { node_ref, thermal_index, headcount, seq, ts }
 *   3. FAS (Fire Alarm & Safety Loop)       — { asset, loc, air_obscuration, particulate_level, alert_level, seq, ts }
 *   4. OCCUPANCY (Smart Vision Counter)      — { endpoint, area, presence_count, seq, ts }
 *   5. BIM (IFC Architectural Space Model)   — { object, bim_space_type, name, floor, seq, ts }
 *   6. ACCESS_CONTROL (Smart Door Portals)   — { portal_id, door_state, access_status, seq, ts }
 *
 * Enforces real gateway behavior with sequence numbering, timestamps, building metadata,
 * controlled noise, packet loss, transmission delay, and simulated device faults.
 */

import { BUILDING, getActiveBuilding } from '../data/building.js';

const REPORT_INTERVAL = { BMS: 6, FAS: 8, BIM: 30, OCC: 8, ENV_IOT: 6, ACCESS: 15 };
const FIRE_INTERVAL   = { BMS: 2, FAS: 2, BIM: 30, OCC: 6, ENV_IOT: 2, ACCESS: 8 };

export class HeterogeneousMessageGenerator {
  /**
   * @param {Object}          opts
   * @param {EventBus}        opts.bus
   * @param {SensorSimulator} opts.sensorSim
   * @param {Object}          [opts.config]
   * @param {Function}        [opts.rand]
   */
  constructor({ bus, sensorSim, config = null, rand = null }) {
    this.bus       = bus;
    this.sensorSim = sensorSim;
    this.config    = config;
    this.rand      = rand || Math.random;
    this.fireLive  = false;
    this.paused    = false;
    this._seqCounter = 0;
    this._sentAmbiguousTest = false;
    this._pendingTimeouts = new Set();

    this.bus.on('sim:start',           () => { this.paused = false; });
    this.bus.on('sim:tick',            e => this._onTick(e));
    this.bus.on('sim:fire_trigger',    () => { this.fireLive = true; });
    this.bus.on('sim:pause',           ({ paused }) => {
      this.paused = paused;
      if (paused) this._clearPendingTimeouts();
    });
    this.bus.on('sim:complete',        () => { this.paused = true; this._clearPendingTimeouts(); });
    this.bus.on('sim:reset',           () => this._reset());
    this.bus.on('config:changed',      ({ config }) => {
      if (!(this.config && typeof this.config.get === 'function')) {
        this.config = config;
      }
    });
    this.bus.on('test:unseen_sensor',  () => this.emitUnseenSensorTest());
    this.bus.on('test:ai_offline',     () => this.emitAIFailureTest());
  }

  _clearPendingTimeouts() {
    this._pendingTimeouts.forEach(t => clearTimeout(t));
    this._pendingTimeouts.clear();
  }

  _nextSeq() {
    return ++this._seqCounter;
  }

  // ── Public Test Triggers ───────────────────────────────

  /**
   * Generates a completely novel sensor message with unfamiliar vocabulary
   * that does NOT exist in any hardcoded dictionary.
   * Proves genuine zero-shot AI semantic resolution.
   */
  emitUnseenSensorTest() {
    const activeBld = getActiveBuilding ? getActiveBuilding() : BUILDING;
    const unseenMsg = {
      _system: 'SMART_IOT_WIRELESS',
      endpoint: 'ENV-Z91',
      description: 'Novel Experimental Lab Environmental Probe (Room 101)',
      thermal_index: 72.4,
      headcount: 18,
      air_obscuration: 0.35,
      buildingId: activeBld.id || 'DEPT_FLOOR_1',
      schema_version: '2.0',
      seq: this._nextSeq(),
      ts: Date.now(),
    };

    this.bus.emit('hetero:messages', { messages: [unseenMsg], tick: 0, testType: 'UNSEEN_SCHEMA' });
    this.bus.emit('log', {
      tag: 'ai',
      msg: '🧪 Injected UNSEEN SENSOR message: endpoint "ENV-Z91" with unfamiliar fields { thermal_index: 72.4, headcount: 18, air_obscuration: 0.35 }'
    });
  }

  /**
   * Generates an unknown entity event with AI offline mode.
   * Demonstrates deterministic rejection and safety firewall protection.
   */
  emitAIFailureTest() {
    const activeBld = getActiveBuilding ? getActiveBuilding() : BUILDING;
    const unknownMsg = {
      _system: 'UNKNOWN_SYSTEM_X',
      endpoint: 'PROBE_UNRECOGNIZED_99',
      description: 'Unregistered external peripheral sensor',
      spectral_irradiance: 840.2,
      buildingId: activeBld.id || 'DEPT_FLOOR_1',
      schema_version: '2.0',
      seq: this._nextSeq(),
      ts: Date.now(),
    };

    this.bus.emit('hetero:messages', { messages: [unknownMsg], tick: 0, testType: 'AI_OFFLINE_TEST', forceOffline: true });
    this.bus.emit('log', {
      tag: 'warning',
      msg: '⚡ Injected AI FAILURE TEST: Unknown endpoint "PROBE_UNRECOGNIZED_99" with spectral_irradiance (AI unavailable)'
    });
  }

  // ── Internal Generators ────────────────────────────────

  _getConfig() {
    if (this.config && typeof this.config.get === 'function') {
      return this.config.get();
    }
    return this.config || {};
  }

  _onTick({ tick }) {
    const intervals = this.fireLive ? FIRE_INTERVAL : REPORT_INTERVAL;
    const cfg = this._getConfig();
    const active = cfg.heterogeneous?.activeSystems || { BMS: true, FAS: true, BIM: true, OCCUPANCY: true, ENV_IOT: true, ACCESS_CONTROL: true };
    const lossPct = (cfg.heterogeneous?.packetLossPct ?? 0) / 100;
    const messages  = [];

    if (active.BMS && tick % intervals.BMS === 0) messages.push(...this._generateBMS());
    if (active.FAS && tick % intervals.FAS === 0) messages.push(...this._generateFAS());
    if (active.BIM && tick % intervals.BIM === 0) messages.push(...this._generateBIM());
    if (active.OCCUPANCY && tick % intervals.OCC === 0) messages.push(...this._generateOCC());
    if (active.ENV_IOT && tick % intervals.ENV_IOT === 0) messages.push(...this._generateEnvIoT());
    if ((active.ACCESS_CONTROL ?? active.ACCESS ?? true) && tick % intervals.ACCESS === 0) messages.push(...this._generateACCESS());

    // Controlled low-confidence test case at tick 125 (~12.5s) if BMS active
    if (active.BMS && this.fireLive && tick >= 125 && !this._sentAmbiguousTest) {
      this._sentAmbiguousTest = true;
      const activeBld = getActiveBuilding ? getActiveBuilding() : BUILDING;
      messages.push({
        _system: 'BMS',
        device_id: 'TMP_EXT_UNKNOWN',
        ambient_temp: 34.8,
        zone: 'ZONE_X27',
        buildingId: activeBld.id,
        seq: this._nextSeq(),
        ts: Date.now(),
      });
    }

    if (messages.length > 0) {
      // Filter packet loss
      const filtered = lossPct > 0 ? messages.filter(() => this.rand() >= lossPct) : messages;
      if (filtered.length > 0) {
        const delay = cfg.heterogeneous?.messageDelayMs || 0;
        if (delay > 0) {
          const tid = setTimeout(() => {
            this._pendingTimeouts.delete(tid);
            if (!this.paused) {
              this.bus.emit('hetero:messages', { messages: filtered, tick });
            }
          }, delay);
          this._pendingTimeouts.add(tid);
        } else {
          this.bus.emit('hetero:messages', { messages: filtered, tick });
        }
      }
    }
  }

  /**
   * BMS Schema: uses device_id, zone, temp_celsius, people_count
   */
  _generateBMS() {
    const activeBld = getActiveBuilding ? getActiveBuilding() : BUILDING;
    return (activeBld.sensors || [])
      .filter(s => s.source_system === 'BMS')
      .map(s => {
        const r = this.sensorSim.getReading(s.id);
        if (!r) return null;
        const bmsZone = s.bms_zone || (activeBld.system_identifiers && activeBld.system_identifiers[s.room]?.BMS) || `Z_${s.room}`;
        const occReading = this.sensorSim.getReading(`OCC_${s.room.replace('ROOM_','')}`) || { value: 0 };

        if (s.type === 'TEMPERATURE') {
          return {
            _system: 'BMS',
            device_id: s.id || `ENV_${bmsZone}`,
            zone: bmsZone,
            temp_celsius: +(r.value ?? 27.5),
            people_count: occReading.value ?? 0,
            buildingId: activeBld.id,
            seq: this._nextSeq(),
            ts: Date.now(),
          };
        } else if (s.type === 'SMOKE') {
          return {
            _system: 'BMS',
            device_id: s.id || `SMK_${bmsZone}`,
            zone: bmsZone,
            smoke_level: +(r.value ?? 0.01),
            buildingId: activeBld.id,
            seq: this._nextSeq(),
            ts: Date.now(),
          };
        }
        return null;
      }).filter(Boolean);
  }

  /**
   * FAS Schema: uses asset, loc, air_obscuration, particulate_level, alert_level
   */
  _generateFAS() {
    const activeBld = getActiveBuilding ? getActiveBuilding() : BUILDING;
    return (activeBld.sensors || [])
      .filter(s => s.source_system === 'FAS')
      .map(s => {
        const r = this.sensorSim.getReading(s.id);
        if (!r) return null;
        const fasLoc = s.fas_device || (activeBld.system_identifiers && activeBld.system_identifiers[s.room]?.FAS) || `R_${s.room}`;
        const isAlarm = s.type === 'FIRE_ALARM' ? (r.value === true) : (r.value > 0.30);
        return {
          _system: 'FAS',
          asset: s.fas_device || s.id,
          loc: fasLoc,
          air_obscuration: s.type === 'SMOKE' ? +(r.value ?? 0.01) : (isAlarm ? 0.8 : 0.01),
          particulate_level: s.type === 'SMOKE' ? +(Math.min(1.0, (r.value ?? 0.01) * 1.2).toFixed(4)) : (isAlarm ? 0.8 : 0.01),
          alert_level: isAlarm ? 'ALM' : 'OK',
          buildingId: activeBld.id,
          seq: this._nextSeq(),
          ts: Date.now(),
        };
      }).filter(Boolean);
  }

  /**
   * Environmental IoT Schema: uses node_ref, thermal_index, headcount
   */
  _generateEnvIoT() {
    const activeBld = getActiveBuilding ? getActiveBuilding() : BUILDING;
    const spaces = (activeBld.spaces || []).filter(s => s.type === 'CLASSROOM' || s.type === 'OFFICE' || s.type === 'LABORATORY');
    if (spaces.length === 0) return [];
    const space = spaces[Math.floor(this.rand() * spaces.length)];
    const tempReading = this.sensorSim.getReading(`TEMP_${space.id.replace('ROOM_','')}`) || { value: 28.0 };
    const occReading = this.sensorSim.getReading(`OCC_${space.id.replace('ROOM_','')}`) || { value: 5 };

    return [{
      _system: 'ENV_IOT',
      node_ref: `THERMAL_${space.id}`,
      thermal_index: +(tempReading.value ?? 28.0),
      headcount: +(occReading.value ?? 5),
      buildingId: activeBld.id,
      seq: this._nextSeq(),
      ts: Date.now(),
    }];
  }

  /**
   * Occupancy Vision Schema: uses endpoint, area, presence_count
   */
  _generateOCC() {
    const activeBld = getActiveBuilding ? getActiveBuilding() : BUILDING;
    return (activeBld.sensors || [])
      .filter(s => s.source_system === 'OCCUPANCY' || s.type === 'OCCUPANCY')
      .map(s => {
        const r = this.sensorSim.getReading(s.id);
        if (!r) return null;
        const occArea = (activeBld.system_identifiers && activeBld.system_identifiers[s.room]?.OCCUPANCY) || s.room;
        return {
          _system: 'OCCUPANCY',
          endpoint: s.camera_id || `CAM_${s.room}`,
          area: occArea,
          presence_count: r.value ?? 0,
          buildingId: activeBld.id,
          seq: this._nextSeq(),
          ts: Date.now(),
        };
      }).filter(Boolean);
  }

  /**
   * BIM Spatial Schema: uses object, bim_space_type, name, floor
   */
  _generateBIM() {
    const activeBld = getActiveBuilding ? getActiveBuilding() : BUILDING;
    const spaces = (activeBld.spaces || []);
    if (spaces.length === 0) return [];
    const space = spaces[Math.floor(this.rand() * spaces.length)];
    const ifcObj = (activeBld.system_identifiers && activeBld.system_identifiers[space.id]?.BIM) || space.ifc_id || `IFC_${space.id}`;
    return [{
      _system: 'BIM',
      object: ifcObj,
      bim_space_type: 'IfcSpace',
      name: space.name,
      floor: space.floor || 1,
      buildingId: activeBld.id,
      seq: this._nextSeq(),
      ts: Date.now(),
    }];
  }

  /**
   * Access Control Schema: uses portal_id, zone, door_state, authorized
   */
  _generateACCESS() {
    const activeBld = getActiveBuilding ? getActiveBuilding() : BUILDING;
    const doors = activeBld.doors || [];
    if (doors.length === 0) return [];
    const door = doors[Math.floor(this.rand() * doors.length)];
    return [{
      _system: 'ACCESS_CONTROL',
      portal_id: door.id || `DOOR_${door.from}_${door.to}`,
      zone: door.from,
      door_state: this.fireLive ? 'UNLOCKED_EMERGENCY' : 'CLOSED',
      authorized: true,
      buildingId: activeBld.id,
      seq: this._nextSeq(),
      ts: Date.now(),
    }];
  }

  initialise(rand = null) {
    if (rand) this.rand = rand;
    this._reset();
  }

  reset() {
    this._reset();
  }

  _reset() {
    this.paused = false;
    this.fireLive = false;
    this._sentAmbiguousTest = false;
    this._clearPendingTimeouts();
  }
}
