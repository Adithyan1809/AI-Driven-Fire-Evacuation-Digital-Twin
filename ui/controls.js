/**
 * CONTROLS & 10-SCENE GUIDED PROFESSOR DEMONSTRATION CONTROLLER
 *
 * Comprehensive simulation, presentation & guided demonstration:
 *   1. Playback: START / PAUSE / NEXT EVENT / RESET
 *   2. Presentation Mode: DEMO (Human-paced) vs REAL-TIME (Instant)
 *   3. Presentation Speed: SLOW (Recommended for Professor) / NORMAL / FAST
 *   4. Simulation Speed: 0.5× / 1× / 2× / 5×
 *   5. Configuration Modal Trigger (⚙ CONFIGURATION)
 *   6. 🎓 10-Scene Guided Professor Demo (Part 22)
 */

import { PHASE, PHASE_LABELS } from '../modules/simulationEngine.js';

export class Controls {
  /**
   * @param {Object}           opts
   * @param {SimulationEngine} opts.engine
   * @param {EventBus}         opts.bus
   */
  constructor({ engine, bus, configManager = null }) {
    this.engine = engine;
    this.bus    = bus;
    this.configManager = configManager;

    this.presMode  = 'DEMO';
    this.presSpeed = 'SLOW';
    this.demoSceneIndex = 0;
    this.isDemoActive = false;

    // DOM Elements
    this.btnStart       = document.getElementById('btn-start');
    this.btnPause       = document.getElementById('btn-pause');
    this.btnStepNext    = document.getElementById('btn-step-next');
    this.btnReset       = document.getElementById('btn-reset');
    this.btnCfgOpen     = document.getElementById('btn-cfg-open');
    this.btnArchitectOpen = document.getElementById('btn-architect-open');
    this.btnArchitectToolOpen = document.getElementById('btn-architect-tool-open');
    this.btnSimSpeeds   = document.querySelectorAll('.btn-sim-speed');
    this.btnPresSpeeds  = document.querySelectorAll('.btn-pres-speed');
    this.btnModeDemo    = document.getElementById('btn-mode-demo');
    this.btnModeRealtime= document.getElementById('btn-mode-realtime');
    this.statusBadge    = document.getElementById('status-badge');
    this.statusLabel    = document.getElementById('status-label');
    this.clockEl        = document.getElementById('sim-clock');
    this.scenarioSel    = document.getElementById('scenario-select');

    // Interactive Click-to-Ignite & Spread Physics Controls
    this.btnIgniteTool       = document.getElementById('btn-ignite-tool');
    this.igniteToolLabel     = document.getElementById('ignite-tool-label');
    this.btnSpreadToggle     = document.getElementById('btn-spread-controls-toggle');
    this.spreadToggleArrow   = document.getElementById('spread-toggle-arrow');
    this.spreadPanel         = document.getElementById('spread-controls-panel');
    this.sliderSpreadRate    = document.getElementById('slider-spread-rate');
    this.labelSpreadRate     = document.getElementById('label-spread-rate');
    this.sliderSmokeConvection = document.getElementById('slider-smoke-convection');
    this.labelSmokeConvection  = document.getElementById('label-smoke-convection');
    this.activeFireChips     = document.getElementById('active-fire-chips');
    this.btnIgniteHudClose   = document.getElementById('btn-ignite-hud-close');
    this.igniteActive        = false;

    this._bind();
    this._bindEvents();
    this._setSimSpeed(1);
    this._setPresSpeed('SLOW');
    this._setPresMode('DEMO');
  }

  _bind() {
    this.btnStart?.addEventListener('click', () => {
      if (this.engine.phase === PHASE.IDLE) {
        this.engine.start();
        this.btnStart.disabled   = true;
        this.btnPause.disabled   = false;
        this.btnStepNext.disabled= false;
        this.btnReset.disabled   = false;
      }
    });

    this.btnPause?.addEventListener('click', () => {
      this.engine.pause();
      const paused = this.engine.paused;
      this.btnPause.textContent = paused ? 'Resume' : 'Pause';
    });

    this.btnStepNext?.addEventListener('click', () => {
      this.engine.stepNext();
      this.btnReset.disabled = false;
      this.btnPause.textContent = 'Resume';
      if (this.engine.phase !== PHASE.IDLE) {
        this.btnStart.disabled = true;
        this.btnPause.disabled = false;
      }
    });

    this.btnReset?.addEventListener('click', () => {
      // 1. Reset Simulation Engine
      this.engine.reset();

      // 2. Clear Demo States
      this.isDemoActive = false;
      this.demoSceneIndex = 0;

      // 3. Reset Button Controls
      this.btnStart.disabled   = false;
      this.btnPause.disabled   = true;
      this.btnStepNext.disabled= false;
      this.btnReset.disabled   = true;
      this.btnPause.textContent = 'Pause';

      // 4. Reset Clock and Banners
      if (this.clockEl) this.clockEl.textContent = '00.0s';
      const fireBanner = document.getElementById('fire-alert-banner');
      if (fireBanner) { fireBanner.classList.remove('visible'); fireBanner.textContent = ''; }

      // 5. Close Open Modals / Overlays
      const resultsPanel = document.getElementById('results-panel');
      if (resultsPanel) resultsPanel.style.display = 'none';
      const techDrawer = document.getElementById('tech-drawer-modal');
      if (techDrawer) techDrawer.style.display = 'none';
      const configModal = document.getElementById('config-modal');
      if (configModal) configModal.style.display = 'none';
      const tourModal = document.getElementById('guided-tour-modal');
      if (tourModal) tourModal.style.display = 'none';
      const architectModal = document.getElementById('custom-architect-modal');
      if (architectModal) architectModal.style.display = 'none';

      // 6. Reset Ignite Mode & Spread Controls
      this.setIgniteMode(false);
      if (this.spreadPanel) this.spreadPanel.style.display = 'none';
      if (this.btnSpreadToggle) this.btnSpreadToggle.classList.remove('active');
      if (this.spreadToggleArrow) this.spreadToggleArrow.textContent = '▾';

      // 7. Reset Fire Chips to Default Scenario Room
      const cfg = this.configManager ? this.configManager.get() : {};
      const rooms = cfg.scenario?.fireRooms || [cfg.scenario?.fireRoom || 'ROOM_101'];
      this._renderFireChips(rooms);

      // 8. Log Hard Reset Confirmation
      this.bus.emit('log', {
        tag: 'system',
        msg: '🔄 [HARD RESET] Full simulation environment, occupant positions, and Digital Twin telemetry restored to clean baseline.',
        priority: 'important'
      });
    });

    this.btnCfgOpen?.addEventListener('click', () => {
      this.bus.emit('modal:open_config', {});
    });

    this.btnArchitectOpen?.addEventListener('click', () => {
      this.bus.emit('modal:open_custom_architect', {});
    });

    this.btnArchitectToolOpen?.addEventListener('click', () => {
      this.bus.emit('modal:open_custom_architect', {});
    });

    // Simulation Speed toggles
    this.btnSimSpeeds.forEach(btn => {
      btn.addEventListener('click', () => {
        const mult = parseFloat(btn.dataset.speed);
        this._setSimSpeed(mult);
      });
    });

    // Presentation Speed toggles
    this.btnPresSpeeds.forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = btn.dataset.speed;
        this._setPresSpeed(speed);
      });
    });

    // Presentation Mode toggles
    this.btnModeDemo?.addEventListener('click', () => this._setPresMode('DEMO'));
    this.btnModeRealtime?.addEventListener('click', () => this._setPresMode('REALTIME'));

    this.scenarioSel?.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val.startsWith('MULTI:')) {
        const rooms = val.replace('MULTI:', '').split(',');
        const partial = {
          scenario: { fireRoom: rooms[0], fireRooms: rooms },
          building: { blockedExits: {} }
        };
        if (this.configManager) this.configManager.update(partial);
        else this.bus.emit('config:changed', { config: partial, preset: 'CUSTOM' });
        this.bus.emit('log', { tag: 'system', msg: `Multi-room fire scenario configured: ${rooms.join(', ')}` });
      } else if (val.startsWith('BLOCK_EXIT:')) {
        const parts = val.replace('BLOCK_EXIT:', '').split(':');
        const blockedList = parts[0].split(',');
        const fireRoom = parts[1] || 'ROOM_101';
        const blockedExits = {};
        blockedList.forEach(id => { blockedExits[id] = true; });
        const partial = {
          scenario: { fireRoom, fireRooms: [fireRoom] },
          building: { blockedExits }
        };
        if (this.configManager) this.configManager.update(partial);
        else this.bus.emit('config:changed', { config: partial, preset: 'CUSTOM' });
        this.bus.emit('log', { tag: 'system', msg: `Exit Blocked Scenario: [${blockedList.join(', ')}] blocked with fire in ${fireRoom}` });
      } else {
        const partial = {
          scenario: { fireRoom: val, fireRooms: [val] },
          building: { blockedExits: {} }
        };
        if (this.configManager) this.configManager.update(partial);
        else this.bus.emit('config:changed', { config: partial, preset: 'CUSTOM' });
        this.bus.emit('log', { tag: 'system', msg: `Emergency scenario updated: Fire in ${val}` });
      }
    });

    const occCountSel = document.getElementById('occupant-count-select');
    occCountSel?.addEventListener('change', (e) => {
      const count = parseInt(e.target.value, 10);
      const partial = { occupants: { count } };
      if (this.configManager) this.configManager.update(partial);
      else this.bus.emit('config:changed', { config: partial, preset: 'CUSTOM' });
      this.bus.emit('log', { tag: 'system', msg: `Occupant count configured to ${count} occupants` });
    });

    // ── Click-to-Ignite Tool Button ──
    this.btnIgniteTool?.addEventListener('click', () => this.toggleIgniteMode());
    this.btnIgniteHudClose?.addEventListener('click', () => this.setIgniteMode(false));

    // ── Spread Controls Toolbar Toggle ──
    this.btnSpreadToggle?.addEventListener('click', () => this.toggleSpreadPanel());

    // ── Spread Speed Presets ──
    document.querySelectorAll('.btn-spread-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const mult = parseFloat(btn.dataset.mult);
        this.setSpreadRate(mult);
      });
    });

    // ── Spread Speed Slider ──
    this.sliderSpreadRate?.addEventListener('input', (e) => {
      const mult = parseFloat(e.target.value);
      this.setSpreadRate(mult);
    });

    // ── Smoke Convection Penetration Slider ──
    this.sliderSmokeConvection?.addEventListener('input', (e) => {
      const factor = parseFloat(e.target.value);
      this.setSmokeConvection(factor);
    });

    document.addEventListener('keydown', e => {
      if (e.code === 'Space' && !e.target.matches('input, textarea')) {
        e.preventDefault();
        // trigger pause button click
        document.getElementById('btn-pause')?.click();
      }
      if (e.code === 'ArrowRight' && !e.target.matches('input, textarea')) {
        e.preventDefault();
        document.getElementById('btn-step-next')?.click();
      }
    });
  }

  _bindEvents() {
    this.bus.on('sim:tick', ({ time }) => {
      if (this.clockEl) {
        const s = Math.floor(time);
        const dec = Math.floor((time - s) * 10);
        this.clockEl.textContent = `${String(s).padStart(2,'0')}.${dec}s`;
      }
    });

    this.bus.on('building:custom_loaded', ({ building }) => {
      this.updateScenarioDropdown(building);
      const rooms = building.scenario?.fireRooms || [building.scenario?.fireRoom || (building.spaces && building.spaces[0]?.id) || 'ROOM_101'];
      this._renderFireChips(rooms);
    });

    this.bus.on('sim:phase', ({ phase }) => this._updateStatus(phase));
    this.bus.on('sim:reset', () => {
      this._updateStatus(PHASE.IDLE);
      this.setIgniteMode(false);
      const cfg = this.configManager ? this.configManager.get() : {};
      const rooms = cfg.scenario?.fireRooms || [cfg.scenario?.fireRoom || 'ROOM_101'];
      this._renderFireChips(rooms);
    });
    this.bus.on('sim:complete', () => {
      this.btnStart.disabled = true;
      this.btnPause.disabled = true;
      this.btnStepNext.disabled = true;
    });

    this.bus.on('sim:fire_trigger', ({ room, rooms }) => {
      const fireBanner = document.getElementById('fire-alert-banner');
      const list = (Array.isArray(rooms) && rooms.length > 0) ? rooms : (room ? [room] : ['ROOM_101']);
      if (fireBanner) {
        fireBanner.textContent = `FIRE DETECTED — ${list.join(', ')} · CRITICAL EMERGENCY ACTIVE`;
        fireBanner.classList.add('visible');
      }
      this._renderFireChips(list);
    });

    this.bus.on('config:changed', ({ config }) => {
      if (config.scenario?.fireRoom && this.scenarioSel) {
        if (Array.isArray(config.scenario.fireRooms) && config.scenario.fireRooms.length > 1) {
          const matchVal = `MULTI:${config.scenario.fireRooms.join(',')}`;
          const opt = Array.from(this.scenarioSel.options).find(o => o.value === matchVal);
          if (opt) this.scenarioSel.value = matchVal;
        } else {
          this.scenarioSel.value = config.scenario.fireRoom;
        }
      }
      if (config.scenario?.fireRooms || config.scenario?.fireRoom) {
        const rooms = config.scenario.fireRooms || [config.scenario.fireRoom];
        this._renderFireChips(rooms);
      }
      if (config.scenario?.spreadRateMultiplier !== undefined) {
        const mult = config.scenario.spreadRateMultiplier;
        if (this.sliderSpreadRate) this.sliderSpreadRate.value = mult;
        if (this.labelSpreadRate) this.labelSpreadRate.textContent = `${mult.toFixed(1)}×`;
        document.querySelectorAll('.btn-spread-preset').forEach(btn => {
          btn.classList.toggle('active', parseFloat(btn.dataset.mult) === mult);
        });
      }
      if (config.scenario?.adjacentSmokeFactor !== undefined) {
        const f = config.scenario.adjacentSmokeFactor;
        if (this.sliderSmokeConvection) this.sliderSmokeConvection.value = f;
        if (this.labelSmokeConvection) this.labelSmokeConvection.textContent = `${Math.round(f * 100)}%`;
      }
      const occCountSel = document.getElementById('occupant-count-select');
      if (occCountSel && config.occupants?.count) {
        occCountSel.value = `${config.occupants.count}`;
      }
      if (config.simulation?.presMode) {
        this._setPresMode(config.simulation.presMode);
      }
      if (config.simulation?.presSpeed) {
        this._setPresSpeed(config.simulation.presSpeed);
      }
      if (config.simulation?.simSpeed) {
        this._setSimSpeed(config.simulation.simSpeed);
      }
    });
  }

  toggleIgniteMode() {
    this.setIgniteMode(!this.igniteActive);
  }

  setIgniteMode(enabled) {
    this.igniteActive = !!enabled;
    if (this.btnIgniteTool) {
      this.btnIgniteTool.classList.toggle('active', this.igniteActive);
    }
    if (this.igniteToolLabel) {
      this.igniteToolLabel.textContent = this.igniteActive ? 'Ignite: ON' : 'Click-to-Ignite';
    }
    this.bus.emit('renderer:set_ignite_mode', { enabled: this.igniteActive });
  }

  toggleSpreadPanel() {
    if (!this.spreadPanel) return;
    const isVisible = this.spreadPanel.style.display !== 'none';
    this.spreadPanel.style.display = isVisible ? 'none' : 'flex';
    if (this.btnSpreadToggle) {
      this.btnSpreadToggle.classList.toggle('active', !isVisible);
    }
    if (this.spreadToggleArrow) {
      this.spreadToggleArrow.textContent = isVisible ? '▾' : '▴';
    }
  }

  setSpreadRate(multiplier) {
    const mult = Math.max(0.2, Math.min(5.0, Number(multiplier) || 1.0));
    if (this.sliderSpreadRate) this.sliderSpreadRate.value = mult;
    if (this.labelSpreadRate) this.labelSpreadRate.textContent = `${mult.toFixed(1)}×`;
    document.querySelectorAll('.btn-spread-preset').forEach(btn => {
      btn.classList.toggle('active', Math.abs(parseFloat(btn.dataset.mult) - mult) < 0.05);
    });

    if (this.configManager) {
      this.configManager.setFireSpreadRate(mult);
    } else {
      this.bus.emit('config:changed', { config: { scenario: { spreadRateMultiplier: mult } }, preset: 'CUSTOM' });
    }
    this.bus.emit('log', { tag: 'system', msg: `⚡ Fire spread rate adjusted to ${mult.toFixed(1)}× velocity` });
  }

  setSmokeConvection(factor) {
    const f = Math.max(0.1, Math.min(0.9, Number(factor) || 0.4));
    if (this.sliderSmokeConvection) this.sliderSmokeConvection.value = f;
    if (this.labelSmokeConvection) this.labelSmokeConvection.textContent = `${Math.round(f * 100)}%`;

    if (this.configManager) {
      this.configManager.setSmokeConvectionFactor(f);
    } else {
      this.bus.emit('config:changed', { config: { scenario: { adjacentSmokeFactor: f } }, preset: 'CUSTOM' });
    }
    this.bus.emit('log', { tag: 'system', msg: `💨 Smoke convection penetration adjusted to ${Math.round(f * 100)}%` });
  }

  _renderFireChips(rooms = []) {
    if (!this.activeFireChips) return;
    const list = Array.isArray(rooms) ? rooms : [rooms];
    this.activeFireChips.innerHTML = list.map(r => `
      <span class="fire-chip active" title="Active fire outbreak in ${r}">
        🔥 ${r}
      </span>
    `).join('') || '<span style="color:var(--text-muted);font-size:9px;">None</span>';
  }

  _setSimSpeed(mult) {
    this.engine.setSpeed(mult);
    this.btnSimSpeeds.forEach(btn => {
      const active = parseFloat(btn.dataset.speed) === mult;
      btn.classList.toggle('active', active);
    });
    this.bus.emit('sim:speed_changed', { mult });
  }

  _setPresSpeed(speed) {
    this.presSpeed = speed;
    this.btnPresSpeeds.forEach(btn => {
      const active = btn.dataset.speed === speed;
      btn.classList.toggle('active', active);
    });
    this.bus.emit('presentation:speed', { speed });
  }

  _setPresMode(mode) {
    this.presMode = mode;
    this.btnModeDemo?.classList.toggle('active', mode === 'DEMO');
    this.btnModeRealtime?.classList.toggle('active', mode === 'REALTIME');
    document.body.classList.toggle('demo-mode-active', mode === 'DEMO');
    this.bus.emit('presentation:mode', { mode });
  }

  _updateStatus(phase) {
    const badge = this.statusBadge;
    if (!badge) return;

    const dataStatus = {
      IDLE:          'idle',
      INIT:          'running',
      NORMAL:        'running',
      FIRE_TRIGGER:  'fire',
      HAZARD_SPREAD: 'fire',
      REROUTING:     'evacuating',
      EVACUATION:    'evacuating',
      COMPLETE:      'complete',
    }[phase] || 'idle';

    badge.dataset.status = dataStatus;
    if (this.statusLabel) this.statusLabel.textContent = PHASE_LABELS[phase] || phase;
  }

  updateScenarioDropdown(building) {
    if (!this.scenarioSel || !building) return;
    const spaces = (building.spaces || []).filter(s => !['CORRIDOR', 'STAIR', 'LIFT'].includes(s.type));
    const exits = building.exits || [];

    let html = `
      <optgroup label="Single Room Fires">
        ${spaces.map(s => `<option value="${s.id}">${s.name || s.id} (${s.type})</option>`).join('')}
      </optgroup>
    `;

    if (spaces.length >= 2) {
      html += `
        <optgroup label="Multi-Room Fires">
          <option value="MULTI:${spaces[0].id},${spaces[1].id}">🔥 Dual: ${spaces[0].name} + ${spaces[1].name}</option>
          ${spaces.length >= 3 ? `<option value="MULTI:${spaces[0].id},${spaces[1].id},${spaces[2].id}">🔥🔥 Severe: ${spaces[0].name} + ${spaces[1].name} + ${spaces[2].name}</option>` : ''}
        </optgroup>
      `;
    }

    if (exits.length > 0 && spaces.length > 0) {
      html += `
        <optgroup label="Blocked Exit Scenarios">
          ${exits.map(e => `<option value="BLOCK_EXIT:${e.id}:${spaces[0].id}">⛔ ${e.name} Blocked + Fire in ${spaces[0].name}</option>`).join('')}
        </optgroup>
      `;
    }

    this.scenarioSel.innerHTML = html;
  }
}
