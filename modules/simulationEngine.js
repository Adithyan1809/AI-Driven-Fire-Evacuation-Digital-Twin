/**
 * SIMULATION ENGINE
 * Master clock, phase sequencer, EventBus, seeded PRNG.
 * Everything deterministic — no Math.random() beyond this module.
 */

import { BUILDING } from '../data/building.js';

// ── Seeded PRNG (mulberry32) ─────────────────────────────
export function createPRNG(seed = 42) {
  let s = seed >>> 0;
  return function rand() {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Normal-distributed noise via Box-Muller (uses our PRNG)
export function normalNoise(rand, mean, std) {
  const u = 1 - rand(); const v = rand();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── EventBus ────────────────────────────────────────────
export class EventBus {
  constructor() { this._h = {}; }

  on(event, fn) {
    (this._h[event] = this._h[event] || []).push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    if (this._h[event]) this._h[event] = this._h[event].filter(h => h !== fn);
  }

  emit(event, data) {
    (this._h[event] || []).slice().forEach(fn => {
      try { fn(data); } catch(e) { console.error(`EventBus[${event}]`, e); }
    });
    if (event !== '*') {
      (this._h['*'] || []).slice().forEach(fn => {
        try { fn(event, data); } catch(e) {}
      });
    }
  }

  once(event, fn) {
    const wrapper = (data) => { this.off(event, wrapper); fn(data); };
    this.on(event, wrapper);
  }
}

// ── Simulation Phases ────────────────────────────────────
export const PHASE = Object.freeze({
  IDLE:          'IDLE',
  INIT:          'INIT',
  NORMAL:        'NORMAL',
  FIRE_TRIGGER:  'FIRE_TRIGGER',
  HAZARD_SPREAD: 'HAZARD_SPREAD',
  REROUTING:     'REROUTING',
  EVACUATION:    'EVACUATION',
  COMPLETE:      'COMPLETE',
});

// Human-readable phase labels
export const PHASE_LABELS = {
  IDLE:          'Ready / Standby',
  INIT:          'System Initializing...',
  NORMAL:        'Normal Operation',
  FIRE_TRIGGER:  '🔥 Emergency Triggered',
  HAZARD_SPREAD: '⚠️ Hazard Propagating',
  REROUTING:     '↺ Recalculating Routes',
  EVACUATION:    '🚨 Evacuation Active',
  COMPLETE:      '✓ Evacuation Complete',
};

// ── SimulationEngine ─────────────────────────────────────
export class SimulationEngine {
  /**
   * @param {Object} opts
   * @param {EventBus} opts.bus
   * @param {Object}   opts.scenario   — BUILDING.scenario
   * @param {Object}   [opts.config]   — ConfigManager instance or config object
   * @param {number}   [opts.seed]     — PRNG seed
   * @param {number}   [opts.tickRate] — ticks per second at 1×
   */
  constructor({ bus, scenario, config = null, seed = 42, tickRate = 10 }) {
    this.bus          = bus;
    this.scenario     = scenario;
    this.config       = config;
    this.rand         = createPRNG(seed);
    this.tickRate     = tickRate;
    this.speedMult    = 1;
    this.tick         = 0;
    this.simTime      = 0;
    this.phase        = PHASE.IDLE;
    this.generationId = 1;
    this.paused       = false;
    this._raf         = null;
    this._lastTs      = null;
    this._accum       = 0;
    this._initSteps   = {};
    this._phaseFlags  = {};
    this._eventId     = 0;

    this.bus.on('config:changed', ({ config }) => {
      if (this.config && typeof this.config.get === 'function') {
        // configManager handles merging internally
      } else {
        this.config = Object.assign({}, this.config, config);
      }
      const fullCfg = this._getConfig();
      if (fullCfg.simulation?.simSpeed) {
        this.setSpeed(fullCfg.simulation.simSpeed);
      }
    });
  }

  // ── Public API ─────────────────────────────────────────

  start() {
    if (this.phase !== PHASE.IDLE) return;
    this._reset();
    this._setPhase(PHASE.INIT);
    this.bus.emit('sim:start', { config: this._getConfig(), generationId: this.generationId, _t: (typeof performance !== 'undefined' ? performance.now() : Date.now()) });
    this._lastTs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (typeof requestAnimationFrame !== 'undefined') {
      this._raf = requestAnimationFrame(ts => this._loop(ts));
    } else {
      const stepMs = Math.max(10, Math.floor(1000 / this.tickRate / (this.speedMult || 1)));
      this._nodeInterval = setInterval(() => {
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        this._loop(now);
      }, stepMs);
    }
  }

  pause() {
    if (this.phase === PHASE.IDLE || this.phase === PHASE.COMPLETE) return;
    this.paused = !this.paused;
    if (!this.paused) {
      this._lastTs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (typeof requestAnimationFrame !== 'undefined') {
        this._raf = requestAnimationFrame(ts => this._loop(ts));
      } else {
        const stepMs = Math.max(10, Math.floor(1000 / this.tickRate / (this.speedMult || 1)));
        this._nodeInterval = setInterval(() => {
          const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
          this._loop(now);
        }, stepMs);
      }
    } else {
      if (this._raf && typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this._raf);
        this._raf = null;
      }
      if (this._nodeInterval) {
        clearInterval(this._nodeInterval);
        this._nodeInterval = null;
      }
    }
    this.bus.emit('sim:pause', { paused: this.paused, _t: (typeof performance !== 'undefined' ? performance.now() : Date.now()) });
  }

  reset() {
    if (this._raf && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
    if (this._nodeInterval) {
      clearInterval(this._nodeInterval);
      this._nodeInterval = null;
    }
    this._reset();
    this.bus.emit('sim:reset', { generationId: this.generationId, _t: (typeof performance !== 'undefined' ? performance.now() : Date.now()) });
  }

  setSpeed(mult) {
    this.speedMult = mult;
    this.bus.emit('sim:speed', {
      speed: mult,
      _t: (typeof performance !== 'undefined' ? performance.now() : Date.now())
    });
  }

  triggerManualFire(rooms) {
    const fireRooms = Array.isArray(rooms) ? rooms : (typeof rooms === 'string' ? rooms.split(',') : [rooms || 'ROOM_101']);
    this._phaseFlags.FIRE_TRIGGER = true;
    if (this.phase === PHASE.IDLE) {
      this.start();
    } else if (this.phase === PHASE.NORMAL || this.phase === PHASE.INIT) {
      this._setPhase(PHASE.FIRE_TRIGGER);
    }
    this.bus.emit('sim:fire_trigger', {
      room: fireRooms[0],
      rooms: fireRooms,
      tick: this.tick,
      time: this.simTime,
      manualTrigger: true,
      _t: (typeof performance !== 'undefined' ? performance.now() : Date.now())
    });
    this.bus.emit('log', {
      tag: 'hazard',
      msg: `🔥 IN-FLIGHT IGNITION: Fire outbreak triggered in ${fireRooms.join(', ')}!`,
      priority: 'high'
    });
  }

  stepNext() {
    if (this.phase === PHASE.IDLE) {
      this.start();
      this.pause();
      return;
    }
    if (this.phase === PHASE.COMPLETE) return;

    const fireStartSec = this._getConfig()?.scenario?.fireStartSeconds ?? 10;
    const fireStartTick = Math.round(fireStartSec * this.tickRate);

    const milestones = [
      10, 20, 30, 40, 50,
      fireStartTick,
      fireStartTick + 15,
      fireStartTick + 20,
      fireStartTick + 35,
      fireStartTick + 50
    ].filter((v, i, a) => a.indexOf(v) === i).sort((a,b) => a-b);

    const nextTarget = milestones.find(m => m > this.tick);

    if (nextTarget !== undefined) {
      while (this.tick < nextTarget && this.phase !== PHASE.COMPLETE) {
        this._tick();
      }
      if (!this.paused) {
        this.pause();
      }
    } else {
      const target = this.tick + 20;
      while (this.tick < target && this.phase !== PHASE.COMPLETE) {
        this._tick();
      }
      if (!this.paused) {
        this.pause();
      }
    }
  }

  signalComplete() {
    if (this.phase === PHASE.COMPLETE) return;
    this._setPhase(PHASE.COMPLETE);
    if (this._raf && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
    if (this._nodeInterval) {
      clearInterval(this._nodeInterval);
      this._nodeInterval = null;
    }
    this.bus.emit('sim:complete', { tick: this.tick, time: this.simTime, _t: (typeof performance !== 'undefined' ? performance.now() : Date.now()) });
  }

  // ── Internal ───────────────────────────────────────────

  _getConfig() {
    if (this.config && typeof this.config.get === 'function') {
      return this.config.get();
    }
    return this.config || {};
  }

  _reset() {
    if (this._nodeInterval) {
      clearInterval(this._nodeInterval);
      this._nodeInterval = null;
    }
    this.generationId = (this.generationId || 0) + 1;
    this.tick = 0;
    this.simTime = 0;
    this._accum = 0;
    this.paused = false;
    this._lastTs = null;
    this.phase = PHASE.IDLE;
    this._initSteps = {};
    this._phaseFlags = {};
  }

  _loop(ts) {
    if (this.paused) return;
    const dt = ts - (this._lastTs || ts);
    this._lastTs = ts;
    this._accum += dt * this.speedMult;
    const tickMs = 1000 / this.tickRate;
    while (this._accum >= tickMs) {
      this._tick();
      this._accum -= tickMs;
      if (this.phase === PHASE.COMPLETE) {
        if (this._nodeInterval) {
          clearInterval(this._nodeInterval);
          this._nodeInterval = null;
        }
        return;
      }
    }
    if (typeof requestAnimationFrame !== 'undefined') {
      this._raf = requestAnimationFrame(t => this._loop(t));
    }
  }

  _tick() {
    this.tick++;
    this.simTime = +(this.tick / this.tickRate).toFixed(2);
    this.bus.emit('sim:tick', {
      tick: this.tick,
      time: this.simTime,
      phase: this.phase,
      generationId: this.generationId,
      rand: this.rand,
      _t: performance.now()
    });
    this._checkPhaseTransitions();
  }

  _checkPhaseTransitions() {
    const t = this.tick;
    const cfg = this._getConfig();
    const validSpaceIds = (BUILDING.spaces || []).map(s => s.id);
    const defaultRoom = validSpaceIds[0] || 'ROOM_101';

    let rawFireRooms = Array.isArray(cfg.scenario?.fireRooms) && cfg.scenario.fireRooms.length > 0
      ? cfg.scenario.fireRooms
      : (cfg.scenario?.fireRoom ? (typeof cfg.scenario.fireRoom === 'string' && cfg.scenario.fireRoom.includes(',') ? cfg.scenario.fireRoom.split(',') : [cfg.scenario.fireRoom]) : [this.scenario?.fire_room || this.scenario?.fireRoom || defaultRoom]);

    let fireRooms = rawFireRooms.filter(r => validSpaceIds.includes(r));
    if (fireRooms.length === 0) fireRooms.push(defaultRoom);
    const fireRoom = fireRooms[0];
    const fireStartSec = cfg.scenario?.fireStartSeconds ?? this.scenario.fire_start_s ?? 5.0;
    const fireStartTick = Math.max(50, Math.round(fireStartSec * this.tickRate));

    // ── Intentional Initialization Sequence (0.0s – 5.0s) ──
    if (this.phase === PHASE.INIT) {
      if (t >= 10 && !this._initSteps[10]) {
        this._initSteps[10] = true;
        this.bus.emit('log', { tag: 'sensor', msg: 'Virtual IoT sensors connected (21 devices active)', priority: 'normal' });
      }
      if (t >= 20 && !this._initSteps[20]) {
        this._initSteps[20] = true;
        this.bus.emit('log', { tag: 'ai', msg: 'BMS, FAS, BIM/IFC, and Occupancy streams connected ✓', priority: 'normal' });
      }
      if (t >= 30 && !this._initSteps[30]) {
        this._initSteps[30] = true;
        this.bus.emit('log', { tag: 'dt', msg: 'Digital Twin synchronized with building spatial model', priority: 'normal' });
      }
      if (t >= 40 && !this._initSteps[40]) {
        this._initSteps[40] = true;
        const occCount = cfg.occupants?.count || 50;
        this.bus.emit('log', { tag: 'evac', msg: `Occupant micro-simulation initialized (${occCount} occupants placed)`, priority: 'normal' });
      }
      if (t >= 50 && !this._phaseFlags.NORMAL) {
        this._phaseFlags.NORMAL = true;
        this._setPhase(PHASE.NORMAL);
        this.bus.emit('log', { tag: 'system', msg: 'SIMULATION ACTIVE — Normal operation baseline established', priority: 'important' });
      }
      return;
    }

    // ── Emergency Scenario Timeline (fireStartTick onwards) ──
    const spreadMult = Math.max(0.2, cfg.scenario?.spreadRateMultiplier ?? 1.0);
    const spreadDelayTicks = Math.max(2, Math.round(5 / spreadMult));   // 0.5s after fire alarm
    const rerouteDelayTicks = Math.max(4, Math.round(10 / spreadMult)); // 1.0s after fire alarm
    const evacDelayTicks = Math.max(6, Math.round(15 / spreadMult));    // 1.5s after fire alarm (evacuation starts promptly)

    // NORMAL → FIRE_TRIGGER
    if (this.phase === PHASE.NORMAL && t >= fireStartTick && !this._phaseFlags.FIRE_TRIGGER) {
      this._phaseFlags.FIRE_TRIGGER = true;
      this._setPhase(PHASE.FIRE_TRIGGER);
      this.bus.emit('sim:fire_trigger', { room: fireRoom, rooms: fireRooms, tick: t, time: this.simTime, _t: performance.now() });
      if (cfg.simulation?.autoPauseOnMilestones) this.pause();
    }

    // FIRE_TRIGGER → HAZARD_SPREAD
    if (this.phase === PHASE.FIRE_TRIGGER && t >= (fireStartTick + spreadDelayTicks) && !this._phaseFlags.HAZARD_SPREAD) {
      this._phaseFlags.HAZARD_SPREAD = true;
      this._setPhase(PHASE.HAZARD_SPREAD);
      this.bus.emit('sim:hazard_spread', { tick: t, time: this.simTime, _t: performance.now() });
    }

    // HAZARD_SPREAD → REROUTING
    if ((this.phase === PHASE.HAZARD_SPREAD || this.phase === PHASE.FIRE_TRIGGER) && t >= (fireStartTick + rerouteDelayTicks) && !this._phaseFlags.REROUTING) {
      this._phaseFlags.REROUTING = true;
      this._setPhase(PHASE.REROUTING);
      this.bus.emit('sim:rerouting', { tick: t, time: this.simTime, _t: performance.now() });
    }

    // REROUTING → EVACUATION
    if ((this.phase === PHASE.REROUTING || this.phase === PHASE.HAZARD_SPREAD || this.phase === PHASE.FIRE_TRIGGER) && t >= (fireStartTick + evacDelayTicks) && !this._phaseFlags.EVACUATION) {
      this._phaseFlags.EVACUATION = true;
      this._setPhase(PHASE.EVACUATION);
      this.bus.emit('sim:evacuation', { tick: t, time: this.simTime, _t: performance.now() });
    }
  }

  _setPhase(phase) {
    const prev = this.phase;
    this.phase = phase;
    this.bus.emit('sim:phase', { phase, prev, tick: this.tick, time: this.simTime, _t: performance.now() });
  }
}
