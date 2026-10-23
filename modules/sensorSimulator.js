/**
 * SENSOR SIMULATOR
 *
 * Generates realistic time-series sensor data.
 * Normal state: Gaussian noise around baseline.
 * Fire state: deterministic ramp with realistic physics.
 * Failure state: injected sensor malfunctions (offline, frozen, invalid, noisy).
 */

import { BUILDING, SENSOR_MAP } from '../data/building.js';
import { normalNoise } from './simulationEngine.js';

export function computeTopologicalDistances(building, fireRooms) {
  const adj = {};
  if (building?.spaces) {
    building.spaces.forEach(s => {
      let conns = Array.isArray(s.connections) ? [...s.connections] : [];
      if (conns.length === 0 && building.doors) {
        building.doors.forEach(d => {
          if (d.from === s.id) conns.push(d.to);
          if (d.to === s.id) conns.push(d.from);
        });
      }
      adj[s.id] = [...new Set(conns.filter(c => building.spaces.some(sp => sp.id === c)))];
    });
  }

  const distMap = {};
  if (building?.spaces) {
    building.spaces.forEach(s => { distMap[s.id] = Infinity; });
  }

  const activeRooms = (Array.isArray(fireRooms) ? fireRooms : [fireRooms]).filter(Boolean);
  if (activeRooms.length === 0) return distMap;

  const queue = [];
  activeRooms.forEach(r => {
    distMap[r] = 0;
    queue.push({ id: r, d: 0 });
  });

  while (queue.length > 0) {
    const { id, d } = queue.shift();
    const neighbors = adj[id] || [];
    for (const n of neighbors) {
      if (distMap[n] === undefined || distMap[n] > d + 1) {
        distMap[n] = d + 1;
        queue.push({ id: n, d: d + 1 });
      }
    }
  }

  return distMap;
}

export class SensorSimulator {
  /**
   * @param {Object}   opts
   * @param {EventBus} opts.bus
   * @param {Function} [opts.rand]   — Seeded PRNG function () => number
   * @param {Object}   [opts.config] — ConfigManager instance or plain config object
   */
  constructor({ bus, rand = null, config = null }) {
    this.bus      = bus;
    this.rand     = rand || Math.random;
    this.config   = config;
    this.readings = {};
    this.fireTick = null;
    this.fireRooms= null;
    this.fireRoom = null;
    this.bl       = BUILDING.sensor_baselines || BUILDING.baselines || { temperature: { min: 28, max: 32 }, smoke: { min: 0, max: 0.04 }, occupancy: {} };
    this.sc       = BUILDING.scenario || {};
    this._distMap = {};
    this._occupantsList = null;
    this._occupantCounts = {};

    this._initReadings();
    this.bus.on('sim:tick', e => this._onTick(e));
    this.bus.on('sim:fire_trigger', e => this._onFireTrigger(e));
    this.bus.on('occupants:initialised', ({ occupants }) => {
      this._updateOccupancyFromSnapshot(occupants);
    });
    this.bus.on('occupants:positions', ({ occupants }) => {
      this._updateOccupancyFromSnapshot(occupants);
    });
    this.bus.on('occupants:evacuated', () => {
      if (this._occupantsList) {
        this._updateOccupancyFromSnapshot(this._occupantsList);
      }
    });
    this.bus.on('occupants:all_evacuated', () => {
      this._occupantsList = [];
      this._occupantCounts = {};
      BUILDING.sensors.filter(s => s.type === 'OCCUPANCY').forEach(s => {
        this.readings[s.id] = { value: 0, unit: 'persons', status: 'NORMAL' };
      });
    });
    this.bus.on('sim:reset', () => this._reset());
  }

  // ── Public API ─────────────────────────────────────────

  getReading(sensorId) {
    return this.readings[sensorId] || null;
  }

  getAllReadings() {
    return Object.assign({}, this.readings);
  }

  // ── Internal ───────────────────────────────────────────

  _updateOccupancyFromSnapshot(occupants) {
    if (!Array.isArray(occupants)) return;
    this._occupantsList = occupants;
    const counts = {};
    if (BUILDING.spaces) {
      BUILDING.spaces.forEach(sp => { counts[sp.id] = 0; });
    }

    occupants.forEach(o => {
      if (o.status === 'EVACUATED') return;

      let matchedRoom = null;
      if (typeof o.svgX === 'number' && typeof o.svgY === 'number' && BUILDING.spaces) {
        const match = BUILDING.spaces.find(s =>
          o.svgX >= s.x && o.svgX <= (s.x + (s.width || 100)) &&
          o.svgY >= s.y && o.svgY <= (s.y + (s.height || 80))
        );
        if (match) matchedRoom = match.id;
      }

      if (!matchedRoom && (o.status === 'IDLE' || !o.status)) {
        matchedRoom = o.homeRoom;
      }

      if (matchedRoom) {
        counts[matchedRoom] = (counts[matchedRoom] || 0) + 1;
      }
    });

    this._occupantCounts = counts;
  }

  _getConfig() {
    if (this.config && typeof this.config.get === 'function') {
      return this.config.get();
    }
    return this.config || {};
  }

  _initReadings() {
    BUILDING.sensors.forEach(sensor => {
      this.readings[sensor.id] = this._baselineReading(sensor);
    });
  }

  _baselineReading(sensor) {
    const cfg = this._getConfig();
    const noisePct = (cfg.sensors?.noiseLevelPct ?? 2) / 100;
    switch (sensor.type) {
      case 'TEMPERATURE': {
        const base = (this.bl.temperature.min + this.bl.temperature.max) / 2;
        const val = +(base + normalNoise(this.rand, 0, 0.3 * (1 + noisePct * 5))).toFixed(1);
        return { value: val, unit: '°C', status: 'NORMAL' };
      }
      case 'SMOKE': {
        const val = +(Math.abs(normalNoise(this.rand, 0.01, 0.003))).toFixed(4);
        return { value: val, unit: 'AQI', status: 'NORMAL' };
      }
      case 'FIRE_ALARM': {
        return { value: false, unit: 'bool', status: 'OK' };
      }
      case 'OCCUPANCY': {
        if (this._occupantCounts && this._occupantCounts[sensor.room] !== undefined) {
          return { value: this._occupantCounts[sensor.room], unit: 'persons', status: 'NORMAL' };
        }
        const roomConfig = this.bl.occupancy ? this.bl.occupancy[sensor.room] : null;
        const base = roomConfig ? roomConfig.base : 0;
        return { value: base, unit: 'persons', status: 'NORMAL' };
      }
      default:
        return { value: 0, unit: '', status: 'NORMAL' };
    }
  }

  _onFireTrigger({ room, rooms, tick, manualTrigger }) {
    const newRooms = rooms || (Array.isArray(room) ? room : (typeof room === 'string' && room.includes(',') ? room.split(',') : [room || 'ROOM_101']));
    if (manualTrigger && this.fireRooms && this.fireRooms.length > 0) {
      this.fireRooms = [...new Set([...this.fireRooms, ...newRooms])];
    } else {
      this.fireRooms = newRooms;
    }
    this.fireRoom = this.fireRooms[0];
    this._distMap = computeTopologicalDistances(BUILDING, this.fireRooms);

    if (tick !== undefined && tick !== null) {
      if (this.fireTick === null || manualTrigger) {
        this.fireTick = tick;
      }
    }
  }

  _onTick({ tick, rand }) {
    this.rand = rand || this.rand;
    const cfg = this._getConfig();
    const fireStartSec = cfg.scenario?.fireStartSeconds ?? 10;
    const fireStartTick = Math.max(50, Math.round(fireStartSec * 10));

    if (this.fireRooms && this.fireRooms.length > 0 && this.fireTick === null && tick >= fireStartTick) {
      this.fireTick = tick;
      this._distMap = computeTopologicalDistances(BUILDING, this.fireRooms);
    }

    BUILDING.sensors.forEach(sensor => {
      if (cfg.sensors?.enabledMap && cfg.sensors.enabledMap[sensor.id] === false) {
        delete this.readings[sensor.id];
        return;
      }

      const fail = cfg.sensors?.failureSimulation;
      if (fail?.enabled && fail.targetSensor === sensor.id) {
        this.readings[sensor.id] = this._simulateFailure(sensor, fail.failureType);
        return;
      }

      this.readings[sensor.id] = this._computeReading(sensor, tick);
    });

    this.bus.emit('sensors:update', { readings: this.getAllReadings(), tick });
  }

  _simulateFailure(sensor, failureType) {
    switch (failureType) {
      case 'OFFLINE':
        return { value: null, unit: '', status: 'OFFLINE' };
      case 'FROZEN':
        return { value: sensor.type === 'TEMPERATURE' ? 29.5 : 0.01, unit: sensor.type==='TEMPERATURE'?'°C':'AQI', status: 'FROZEN' };
      case 'INVALID':
        return { value: -999.0, unit: 'ERR', status: 'INVALID' };
      case 'NOISY':
        return { value: +(normalNoise(this.rand, 50, 25).toFixed(1)), unit: '°C', status: 'NOISY' };
      default:
        return { value: null, unit: '', status: 'OFFLINE' };
    }
  }

  _computeReading(sensor, tick) {
    const fireRooms  = this.fireRooms || (this.fireRoom ? [this.fireRoom] : []);
    if (!this._distMap || Object.keys(this._distMap).length === 0) {
      this._distMap = computeTopologicalDistances(BUILDING, fireRooms);
    }
    const dist = (this._distMap && this._distMap[sensor.room] !== undefined) ? this._distMap[sensor.room] : Infinity;
    const fireDelta = (this.fireTick !== null) ? Math.max(0, tick - this.fireTick) : 0;
    const cfg        = this._getConfig();
    const spreadMult = cfg.scenario?.spreadRateMultiplier ?? 1.0;
    const noisePct   = (cfg.sensors?.noiseLevelPct ?? 2) / 100;
    const baseRampRate = (cfg.scenario?.fireSeverity === 'LOW') ? 0.8 : (cfg.scenario?.fireSeverity === 'MEDIUM') ? 1.2 : 1.8;

    switch (sensor.type) {
      case 'TEMPERATURE': {
        const base = (this.bl.temperature.min + this.bl.temperature.max) / 2;
        let val;

        if (this.fireTick !== null && dist === 0) {
          // Fire Origin: Standard NFPA 72 t^2 fire growth curve
          const tSec = fireDelta / 10;
          const alpha = (cfg.scenario?.fireSeverity === 'LOW') ? 0.0035 : (cfg.scenario?.fireSeverity === 'MEDIUM') ? 0.0125 : 0.042;
          const qHeat = alpha * Math.pow(tSec * spreadMult, 2);
          const flashoverThresholdSec = 16.0 / spreadMult;
          let tempRise;
          if (tSec < flashoverThresholdSec) {
            // Pre-flashover growth phase (t^2 buoyant plume heating)
            tempRise = 16 + (32 * Math.pow(tSec * spreadMult / 10, 1.4)) + (qHeat * 30);
          } else {
            // Post-flashover fully developed phase (radiant ceiling layer feedback)
            const postFlash = tSec - flashoverThresholdSec;
            tempRise = 110 + (postFlash * 16 * spreadMult);
          }
          const raw = base + tempRise;
          val = Math.min(350, raw + normalNoise(this.rand, 0, 0.35 * (1 + noisePct * 5)));
        } else if (this.fireTick !== null && dist < Infinity) {
          // Adjacent & Multi-hop Spaces: Thermodynamic doorway plume spill & ceiling jet convection
          const tSec = fireDelta / 10;
          const onsetDelaySec = (2.0 * dist) / spreadMult;
          if (tSec > onsetDelaySec) {
            const activeSec = tSec - onsetDelaySec;
            const spatialAttenuation = Math.pow(0.55, dist);
            // Check if multiple fire origins contribute additive thermal flux
            const multiOriginBonus = (fireRooms.length > 1 && dist <= 1) ? 1.25 : 1.0;
            const maxEquilibriumTemp = Math.max(36, base + (190 * spatialAttenuation * multiOriginBonus));
            const tempRise = (maxEquilibriumTemp - base) * (1 - Math.exp(-activeSec * 0.16 * spreadMult));
            const raw = base + tempRise;
            val = Math.min(maxEquilibriumTemp, raw + normalNoise(this.rand, 0, 0.3 * (1 + noisePct * 5)));
          } else {
            val = base + normalNoise(this.rand, 0, 0.3 * (1 + noisePct * 5));
          }
        } else {
          val = base + normalNoise(this.rand, 0, 0.3 * (1 + noisePct * 5));
        }

        val = +val.toFixed(1);
        const status = val >= 60 ? 'CRITICAL' : val >= 38 ? 'WARNING' : 'NORMAL';
        return { value: val, unit: '°C', status };
      }

      case 'SMOKE': {
        let val;
        if (this.fireTick !== null && dist === 0) {
          // Fire Origin: Optical smoke obscuration & soot generation curve
          const tSec = fireDelta / 10;
          const raw = 0.10 + 0.90 * (1 - Math.exp(-tSec * 0.18 * spreadMult));
          val = Math.min(1.0, raw + Math.abs(normalNoise(this.rand, 0, 0.003)));
        } else if (this.fireTick !== null && dist < Infinity) {
          // Multi-hop Corridor & Adjacent Space Smoke Dispersion
          const tSec = fireDelta / 10;
          const onsetDelaySec = (1.6 * dist) / spreadMult;
          if (tSec > onsetDelaySec) {
            const activeSec = tSec - onsetDelaySec;
            const smokeAttenuation = Math.pow(0.62, dist);
            const multiOriginBonus = (fireRooms.length > 1 && dist <= 1) ? 1.20 : 1.0;
            const maxSmoke = Math.min(0.95, Math.max(0.04, 0.85 * smokeAttenuation * multiOriginBonus));
            const raw = 0.02 + (maxSmoke - 0.02) * (1 - Math.exp(-activeSec * 0.18 * spreadMult));
            val = Math.min(maxSmoke, raw + Math.abs(normalNoise(this.rand, 0, 0.002)));
          } else {
            val = Math.abs(normalNoise(this.rand, 0.01, 0.003));
          }
        } else {
          val = Math.abs(normalNoise(this.rand, 0.01, 0.003));
        }

        val = +val.toFixed(4);
        const status = val >= 0.50 ? 'CRITICAL' : val >= 0.15 ? 'WARNING' : 'NORMAL';
        return { value: val, unit: 'AQI', status };
      }

      case 'FIRE_ALARM': {
        if (this.fireTick !== null && dist === 0) {
          return { value: true, unit: 'bool', status: 'ALARM' };
        }
        if (this.fireTick !== null && dist === 1) {
          const onsetDelay = Math.max(2, Math.round(12 / spreadMult));
          if (fireDelta > onsetDelay + 6) return { value: true, unit: 'bool', status: 'ALARM' };
        }
        return { value: false, unit: 'bool', status: 'OK' };
      }

      case 'OCCUPANCY': {
        let count = 0;
        if (this._occupantCounts && this._occupantCounts[sensor.room] !== undefined) {
          count = this._occupantCounts[sensor.room];
        } else {
          const roomConfig = this.bl.occupancy ? this.bl.occupancy[sensor.room] : null;
          count = roomConfig ? roomConfig.base : 0;
        }
        return { value: count, unit: 'persons', status: 'NORMAL' };
      }

      default:
        return { value: 0, unit: '', status: 'NORMAL' };
    }
  }

  reset() {
    this._reset();
  }

  init() {
    this._reset();
  }

  _reset() {
    this.fireTick = null;
    this.fireRooms= null;
    this.fireRoom = null;
    this._distMap = {};
    this._occupantsList = null;
    this._occupantCounts = {};
    this._initReadings();
  }
}
