/**
 * SCENARIO BUILDER MODAL — Universal Dynamic Emergency Customization Engine
 *
 * Provides comprehensive emergency customization:
 *   1. Multi-Select Fire Origins: Dynamically populated from active BUILDING spaces across architectural wings.
 *   2. Independent Exit Blockers: Dynamically populated from active BUILDING exits.
 *   3. Occupant Fleet Density: Precision slider (5–300 occupants) with dynamic spatial distributions.
 *   4. Fire Physics & ASET Dynamics: Custom ignition delays, thermal ramps, and corridor spread.
 *   5. Quick Presets Ribbon: Dynamically mapped to active building rooms and egress portals.
 *   6. Pre-Flight Egress Feasibility Check & Instant Application with live DT synchronization.
 */

import { BUILDING } from '../data/building.js';

export class ScenarioBuilderModal {
  /**
   * @param {Object} opts
   * @param {HTMLElement} opts.modalEl
   * @param {ConfigManager} opts.configManager
   * @param {EventBus} opts.bus
   */
  constructor({ modalEl, configManager, bus }) {
    this.modalEl       = modalEl;
    this.configManager = configManager;
    this.bus           = bus;
    this.isOpen        = false;

    // Working state during editing
    this._state = {
      fireRooms: ['ROOM_101'],
      blockedExits: {},
      occupantCount: 50,
      distribution: 'ROOM_BASED',
      fireStartSec: 5,
      fireSeverity: 'HIGH',
      fireSpread: true,
      allowLifts: false,
    };

    this._syncFromConfig();
    this._bindDelegatedEvents();

    this.bus.on('modal:open_scenario_builder', () => this.show());
    this.bus.on('config:changed', () => {
      if (!this.isOpen) this._syncFromConfig();
    });

    // Hot-reload when a custom building is loaded
    this.bus.on('building:custom_loaded', ({ building }) => {
      const defaultRoom = building.scenario?.fireRoom || (building.spaces && building.spaces[0]?.id) || 'ROOM_1';
      this._state = {
        fireRooms: [defaultRoom],
        blockedExits: {},
        occupantCount: 50,
        distribution: 'ROOM_BASED',
        fireStartSec: building.scenario?.fireStartSeconds || 5,
        fireSeverity: building.scenario?.fireSeverity || 'HIGH',
        fireSpread: true,
        allowLifts: false,
      };
      if (this.isOpen) this.render();
    });
  }

  _bindDelegatedEvents() {
    if (!this.modalEl) return;

    this.modalEl.addEventListener('click', (e) => {
      // 1. Close button or overlay click outside card
      if (e.target.closest('#btn-sb-close') || e.target === this.modalEl || e.target.id === 'sb-overlay') {
        this.hide();
        return;
      }

      // 2. Apply button
      if (e.target.closest('#btn-sb-apply')) {
        this._applyScenario();
        return;
      }

      // 3. Reset to default
      if (e.target.closest('#btn-sb-reset-default')) {
        const spaces = (BUILDING.spaces || []).filter(s => !['CORRIDOR', 'STAIR', 'LIFT'].includes((s.type || '').toUpperCase()));
        const defaultRoom = spaces[0]?.id || (BUILDING.spaces && BUILDING.spaces[0]?.id) || 'ROOM_101';
        this._state = {
          fireRooms: [defaultRoom],
          blockedExits: {},
          occupantCount: 50,
          distribution: 'ROOM_BASED',
          fireStartSec: 5,
          fireSeverity: 'HIGH',
          fireSpread: true,
          allowLifts: false,
        };
        this.render();
        return;
      }

      // 4. Fire room cards / checkboxes
      const fireCard = e.target.closest('.sb-room-card');
      if (fireCard) {
        const roomId = fireCard.dataset.roomId;
        const idx = this._state.fireRooms.indexOf(roomId);
        if (idx >= 0) {
          if (this._state.fireRooms.length > 1) {
            this._state.fireRooms.splice(idx, 1);
          }
        } else {
          this._state.fireRooms.push(roomId);
        }
        this.render();
        return;
      }

      // 5. Exit cards / toggle switch
      const exitCard = e.target.closest('.sb-exit-card');
      if (exitCard) {
        const exitId = exitCard.dataset.exitId;
        this._state.blockedExits[exitId] = !this._state.blockedExits[exitId];
        this.render();
        return;
      }

      // 6. Quick Exit Action Buttons
      if (e.target.closest('#btn-sb-exit-open-all')) {
        this._state.blockedExits = {};
        this.render();
        return;
      }

      const toggleExitBtn = e.target.closest('.btn-toggle-exit');
      if (toggleExitBtn) {
        const exitId = toggleExitBtn.dataset.exitId;
        this._state.blockedExits[exitId] = !this._state.blockedExits[exitId];
        this.render();
        return;
      }

      // 7. Quick presets ribbon
      const presetBtn = e.target.closest('.sb-preset-chip');
      if (presetBtn) {
        const presetKey = presetBtn.dataset.preset;
        this._applyQuickPreset(presetKey);
        this.render();
        return;
      }

      // 8. Occupant count presets
      const occBtn = e.target.closest('.btn-sb-occ-preset');
      if (occBtn) {
        this._state.occupantCount = parseInt(occBtn.dataset.count, 10);
        this.render();
        return;
      }
    });

    this.modalEl.addEventListener('input', (e) => {
      if (e.target.id === 'sb-occ-slider') {
        const val = parseInt(e.target.value, 10);
        this._state.occupantCount = val;
        const valEl = this.modalEl.querySelector('#sb-occ-val');
        if (valEl) valEl.textContent = `${val} Persons`;
        this._updateSummary();
      }
    });

    this.modalEl.addEventListener('change', (e) => {
      if (e.target.id === 'sb-occ-dist') {
        this._state.distribution = e.target.value;
        this._updateSummary();
      }
      if (e.target.id === 'sb-fire-timing') {
        this._state.fireStartSec = parseFloat(e.target.value);
        this._updateSummary();
      }
      if (e.target.id === 'sb-fire-sev') {
        this._state.fireSeverity = e.target.value;
        this._updateSummary();
      }
      if (e.target.id === 'sb-fire-spread') {
        this._state.fireSpread = e.target.checked;
        this._updateSummary();
      }
    });
  }

  _applyQuickPreset(key) {
    const spaces = BUILDING.spaces || [];
    const exits = BUILDING.exits || [];
    const occupiable = spaces.filter(s => !['CORRIDOR', 'STAIR', 'LIFT'].includes((s.type || '').toUpperCase()));
    const nonCorridor = occupiable.length ? occupiable : spaces;

    switch(key) {
      case 'DEFAULT_ORIGIN':
      case 'DEFAULT_101':
        this._state.fireRooms = [nonCorridor[0]?.id || 'ROOM_101'];
        this._state.blockedExits = {};
        break;
      case 'DUAL_ZONE':
      case 'DUAL_STAFF':
        this._state.fireRooms = [nonCorridor[0]?.id || 'ROOM_101', nonCorridor[Math.min(1, nonCorridor.length - 1)]?.id || 'STAFF_ROOM'];
        this._state.blockedExits = {};
        break;
      case 'OPPOSITE_WINGS':
        this._state.fireRooms = [nonCorridor[0]?.id || 'ROOM_101', nonCorridor[Math.min(2, nonCorridor.length - 1)]?.id || 'ROOM_103'];
        this._state.blockedExits = {};
        break;
      case 'ALL_PRIMARY':
      case 'ALL_CLASSROOMS':
        this._state.fireRooms = nonCorridor.slice(0, Math.min(3, nonCorridor.length)).map(s => s.id);
        this._state.blockedExits = {};
        break;
      case 'BLOCK_FIRST_EXIT':
      case 'BLOCK_STAIRCASE':
        this._state.fireRooms = [nonCorridor[0]?.id || 'ROOM_101'];
        if (exits.length > 0) {
          this._state.blockedExits = { [exits[0].id]: true };
        }
        break;
      case 'BLOCK_SECOND_EXIT':
      case 'BLOCK_EAST':
        this._state.fireRooms = [nonCorridor[Math.min(1, nonCorridor.length - 1)]?.id || 'ROOM_102'];
        if (exits.length > 1) {
          this._state.blockedExits = { [exits[1].id]: true };
        } else if (exits.length > 0) {
          this._state.blockedExits = { [exits[0].id]: true };
        }
        break;
      case 'WORST_CASE':
        this._state.fireRooms = nonCorridor.slice(0, Math.min(4, nonCorridor.length)).map(s => s.id);
        if (exits.length > 0) {
          this._state.blockedExits = { [exits[0].id]: true };
        }
        this._state.fireSeverity = 'HIGH';
        this._state.occupantCount = Math.min(200, Math.max(50, this._state.occupantCount * 2));
        break;
      case 'CLEAR_ALL':
        this._state.fireRooms = [nonCorridor[0]?.id || 'ROOM_101'];
        this._state.blockedExits = {};
        break;
    }
  }

  _syncFromConfig() {
    const c = this.configManager ? this.configManager.get() : {};
    const sc = c.scenario || {};
    const bldg = c.building || {};
    const occ = c.occupants || {};

    const validSpaceIds = (BUILDING.spaces || []).map(s => s.id);
    const defaultRoom = validSpaceIds[0] || 'ROOM_101';

    let fireRooms = [];
    if (Array.isArray(sc.fireRooms) && sc.fireRooms.length > 0) {
      fireRooms = sc.fireRooms.filter(r => validSpaceIds.includes(r));
    } else if (sc.fireRoom) {
      const candidates = typeof sc.fireRoom === 'string' && sc.fireRoom.includes(',')
        ? sc.fireRoom.split(',')
        : [sc.fireRoom];
      fireRooms = candidates.filter(r => validSpaceIds.includes(r));
    }

    if (!fireRooms.length) {
      fireRooms = [defaultRoom];
    }

    const blockedExits = { ...(bldg.blockedExits || {}) };
    if (bldg.exits) {
      Object.entries(bldg.exits).forEach(([id, ex]) => {
        if (ex.enabled === false) blockedExits[id] = true;
      });
    }

    this._state = {
      fireRooms,
      blockedExits,
      occupantCount: occ.count || 50,
      distribution: occ.distribution || 'ROOM_BASED',
      fireStartSec: sc.fireStartSeconds ?? 5,
      fireSeverity: sc.fireSeverity || 'HIGH',
      fireSpread: sc.fireSpread !== false,
      allowLifts: c.routing?.allowLiftDuringEmergency === true,
    };
  }

  show() {
    this._syncFromConfig();
    this.isOpen = true;
    if (this.modalEl) {
      this.modalEl.style.display = 'flex';
      this.render();
    }
  }

  hide() {
    this.isOpen = false;
    if (this.modalEl) {
      this.modalEl.style.display = 'none';
      this.modalEl.innerHTML = '';
    }
  }

  _getDynamicWings() {
    const spaces = BUILDING.spaces || [];
    const primary = [];
    const secondary = [];
    const circulation = [];

    const nonCorr = spaces.filter(s => !['CORRIDOR', 'STAIR', 'LIFT'].includes((s.type || '').toUpperCase()));
    const avgY = nonCorr.length ? (nonCorr.reduce((acc, s) => acc + (s.y || 0), 0) / nonCorr.length) : 200;

    spaces.forEach(s => {
      const type = (s.type || '').toUpperCase();
      const name = s.name || s.id;
      const sub = s.description || `${s.type} · ${s.ifc_id || 'IFC_SPACE'}`;
      const cap = s.capacity || 0;
      const item = { id: s.id, name, sub, cap, type: s.type, x: s.x, y: s.y };

      if (['CORRIDOR', 'HALLWAY', 'PATHWAY', 'STAIR', 'LIFT'].includes(type)) {
        circulation.push(item);
      } else if (['CLASSROOM', 'LABORATORY', 'SERVER_ROOM', 'AUDITORIUM', 'ICU', 'PATIENT_ROOM', 'THEATER', 'WORKSHOP'].includes(type) || (s.y || 0) < avgY) {
        primary.push(item);
      } else {
        secondary.push(item);
      }
    });

    return { primary, secondary, circulation };
  }

  render() {
    if (!this.modalEl) return;

    const exits = BUILDING.exits || [];
    const totalExits = exits.length;
    const blockedCount = Object.values(this._state.blockedExits).filter(Boolean).length;
    const openExitsCount = Math.max(0, totalExits - blockedCount);
    const isLocked = this.configManager?.isLocked;

    const { primary, secondary, circulation } = this._getDynamicWings();

    // Dynamic Wing Titles
    const bldgName = BUILDING.name || 'Building';
    const primaryLabel = primary.some(s => ['LABORATORY', 'SERVER_ROOM', 'AUDITORIUM', 'ICU'].includes(s.type))
      ? `🔬 PRIMARY WING (LABS & FACILITIES) — ${primary.length} Spaces`
      : `🏫 NORTH WING (CLASSROOMS & LABS) — ${primary.length} Spaces`;

    const secondaryLabel = secondary.some(s => ['OFFICE', 'ADMIN', 'CAFETERIA', 'STORAGE'].includes(s.type))
      ? `🏢 FACULTY & OPERATIONS WING — ${secondary.length} Spaces`
      : `🏢 SOUTH WING (OPERATIONS & OFFICES) — ${secondary.length} Spaces`;

    const circulationLabel = `🚶 CIRCULATION & EGRESS ARTERIES — ${circulation.length} Corridors/Stairs`;

    // Feasibility status evaluation
    let feasibilityText = `EXCELLENT — ${openExitsCount}/${totalExits} Exits Accessible`;
    let feasibilityColor = '#22c55e';
    if (openExitsCount === 0) {
      feasibilityText = 'CRITICAL — 0 Exits Open (Occupants trapped)';
      feasibilityColor = '#ef4444';
    } else if (openExitsCount === 1) {
      feasibilityText = 'HIGH RISK — Bottleneck to 1 Exit';
      feasibilityColor = '#f59e0b';
    } else if (this._state.fireRooms.length >= 4) {
      feasibilityText = 'SEVERE — Multi-room flashover active';
      feasibilityColor = '#f97316';
    }

    const nonCorr = [...primary, ...secondary];
    const origin1Name = nonCorr[0]?.name || 'Origin 1';
    const origin2Name = nonCorr[1]?.name || 'Origin 2';
    const firstExit = exits[0];
    const secondExit = exits[1];

    this.modalEl.innerHTML = `
      <div class="scenario-builder-card">

          <!-- ═══════ HEADER ═══════ -->
          <div class="scenario-builder-header">
            <div style="display:flex;align-items:center;gap:12px;">
              <div class="sb-header-icon-box">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" style="color:var(--accent-orange)"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
              </div>
              <div>
                <div class="sb-header-title">CUSTOM EMERGENCY SCENARIO BUILDER</div>
                <div class="sb-header-sub">
                  ${bldgName} — Multi-room fire ignitions, blocked egress paths, occupant densities &amp; fire growth physics
                </div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              ${isLocked ? `<span class="badge badge-red" style="font-size:9.5px;padding:3px 8px;">LOCKED DURING SIMULATION</span>` : ''}
              <button class="btn btn-speed sb-close-btn" id="btn-sb-close">Close</button>
            </div>
          </div>

          <!-- ═══════ BODY ═══════ -->
          <div class="scenario-builder-body">

            <!-- ── QUICK PRESET RIBBON ── -->
            <div class="sb-presets-bar">
              <span class="sb-presets-label">QUICK PRESETS:</span>
              <div class="sb-presets-list">
                <button class="sb-preset-chip" data-preset="DEFAULT_ORIGIN">🔥 ${origin1Name} Default</button>
                <button class="sb-preset-chip" data-preset="DUAL_ZONE">🔥 ${origin1Name} + ${origin2Name}</button>
                <button class="sb-preset-chip" data-preset="ALL_PRIMARY">🔥 Multi-Room Drill</button>
                ${firstExit ? `<button class="sb-preset-chip" data-preset="BLOCK_FIRST_EXIT">⛔ Block ${firstExit.name || firstExit.id}</button>` : ''}
                ${secondExit ? `<button class="sb-preset-chip" data-preset="BLOCK_SECOND_EXIT">⛔ Block ${secondExit.name || secondExit.id}</button>` : ''}
                <button class="sb-preset-chip danger" data-preset="WORST_CASE">🚨 Worst-Case Drill</button>
                <button class="sb-preset-chip" data-preset="CLEAR_ALL">↺ Reset</button>
              </div>
            </div>

            <!-- ── SECTION 1: FIRE ORIGIN ROOMS ── -->
            <div class="sb-section-box">
              <div class="sb-section-header">
                <div class="sb-sec-title">
                  <span class="sb-sec-num">1</span>
                  <span>FIRE ORIGIN ROOMS (MULTI-SELECT)</span>
                  <span class="sb-count-badge ${this._state.fireRooms.length > 0 ? 'active' : ''}">
                    🔥 ${this._state.fireRooms.length} Room${this._state.fireRooms.length === 1 ? '' : 's'} Selected
                  </span>
                </div>
                <div class="sb-zone-legend">
                  <span class="legend-chip"><span class="dot north"></span> Primary Wing</span>
                  <span class="legend-chip"><span class="dot south"></span> Secondary Wing</span>
                  <span class="legend-chip"><span class="dot corr"></span> Circulation</span>
                </div>
              </div>

              ${primary.length > 0 ? `
                <!-- Primary Wing -->
                <div class="sb-wing-group">
                  <div class="sb-wing-label">${primaryLabel}</div>
                  <div class="sb-cards-row">
                    ${primary.map(s => this._renderRoomCard(s)).join('')}
                  </div>
                </div>
              ` : ''}

              ${secondary.length > 0 ? `
                <!-- Secondary Wing -->
                <div class="sb-wing-group">
                  <div class="sb-wing-label">${secondaryLabel}</div>
                  <div class="sb-cards-row">
                    ${secondary.map(s => this._renderRoomCard(s)).join('')}
                  </div>
                </div>
              ` : ''}

              ${circulation.length > 0 ? `
                <!-- Circulation -->
                <div class="sb-wing-group">
                  <div class="sb-wing-label">${circulationLabel}</div>
                  <div class="sb-cards-row">
                    ${circulation.map(s => this._renderRoomCard(s)).join('')}
                  </div>
                </div>
              ` : ''}
            </div>

            <!-- ── SECTION 2: BLOCKED EXITS & ESCAPE PATHS ── -->
            <div class="sb-section-box">
              <div class="sb-section-header">
                <div class="sb-sec-title">
                  <span class="sb-sec-num">2</span>
                  <span>INDEPENDENT EXIT BLOCKERS &amp; ESCAPE PATHS</span>
                  <span class="sb-count-badge ${openExitsCount === 0 ? 'danger' : openExitsCount === 1 ? 'warning' : 'success'}">
                    🚪 ${openExitsCount}/${totalExits} Exits Open
                  </span>
                </div>
                <div class="sb-exit-quick-actions">
                  <button class="sb-btn-mini" id="btn-sb-exit-open-all"><span style="color:#22c55e;">●</span> Open All</button>
                  ${exits.map(ex => {
                    const isB = this._state.blockedExits[ex.id] === true;
                    return `
                      <button class="sb-btn-mini btn-toggle-exit" data-exit-id="${ex.id}">
                        <span style="color:${isB ? '#22c55e' : '#ef4444'};">${isB ? '● Open' : '✕ Block'}</span> ${ex.name || ex.id}
                      </button>
                    `;
                  }).join('')}
                </div>
              </div>

              <div class="sb-exits-grid">
                ${exits.map(ex => {
                  const isBlocked = this._state.blockedExits[ex.id] === true;
                  const openSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>';
                  const blockedSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>';
                  return `
                    <div class="sb-exit-card ${isBlocked ? 'blocked' : 'open'}" data-exit-id="${ex.id}">
                      <div class="sb-exit-left">
                        <div class="sb-exit-icon-box ${isBlocked ? 'blocked' : 'open'}">
                          ${isBlocked ? blockedSvg : openSvg}
                        </div>
                        <div>
                          <div class="sb-exit-name">${ex.label || ex.name || ex.id}</div>
                          <div class="sb-exit-location">${ex.connected_node || ex.connects_to ? `Connects to: ${ex.connected_node || ex.connects_to}` : 'Direct Architectural Exit'}</div>
                        </div>
                      </div>
                      <div class="sb-exit-switch ${isBlocked ? 'blocked' : 'open'}">
                        <span class="sb-switch-status">${isBlocked ? 'BLOCKED' : 'OPEN'}</span>
                        <div class="sb-switch-lever"></div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>

              ${openExitsCount === 0 ? `
                <div class="sb-warning-banner">
                  ⚠️ <b>CRITICAL ENTRAPMENT HAZARD:</b> All emergency exits are blocked. Occupants cannot reach safety until at least one exit is opened!
                </div>
              ` : ''}
            </div>

            <!-- ── SECTION 3: OCCUPANT FLEET & DENSITY ── -->
            <div class="sb-section-box">
              <div class="sb-section-header">
                <div class="sb-sec-title">
                  <span class="sb-sec-num">3</span>
                  <span>OCCUPANT FLEET &amp; SPATIAL DENSITY</span>
                  <span class="sb-count-badge cyan">
                    👥 ${this._state.occupantCount} Persons
                  </span>
                </div>
                <div class="sb-occ-presets">
                  <button class="sb-btn-mini btn-sb-occ-preset ${this._state.occupantCount === 15 ? 'active' : ''}" data-count="15">15 Light</button>
                  <button class="sb-btn-mini btn-sb-occ-preset ${this._state.occupantCount === 50 ? 'active' : ''}" data-count="50">50 Standard</button>
                  <button class="sb-btn-mini btn-sb-occ-preset ${this._state.occupantCount === 100 ? 'active' : ''}" data-count="100">100 Dense</button>
                  <button class="sb-btn-mini btn-sb-occ-preset ${this._state.occupantCount === 150 ? 'active' : ''}" data-count="150">150 Peak</button>
                  <button class="sb-btn-mini btn-sb-occ-preset ${this._state.occupantCount === 200 ? 'active' : ''}" data-count="200">200 Severe</button>
                  <button class="sb-btn-mini btn-sb-occ-preset ${this._state.occupantCount === 300 ? 'active' : ''}" data-count="300">300 Max</button>
                </div>
              </div>

              <div class="sb-occ-control-row">
                <div class="sb-slider-col">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <span style="font-size:10px;color:var(--text-secondary);font-family:var(--font-mono);">
                      Density Scale (5 to 300 Occupants):
                    </span>
                    <span id="sb-occ-val" style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--accent-cyan);">
                      ${this._state.occupantCount} Persons
                    </span>
                  </div>
                  <input type="range" id="sb-occ-slider" min="5" max="300" step="5" value="${this._state.occupantCount}" class="sb-custom-slider" />
                  <div class="sb-slider-ticks">
                    <span>5 Min</span>
                    <span>50 Standard</span>
                    <span>100</span>
                    <span>150</span>
                    <span>200</span>
                    <span>300 Max</span>
                  </div>
                </div>

                <div class="sb-dist-col">
                  <div style="font-size:9.5px;color:var(--text-muted);font-family:var(--font-mono);margin-bottom:4px;">
                    DISTRIBUTION MODE:
                  </div>
                  <select id="sb-occ-dist" class="scenario-dropdown" style="width:100%;padding:6px 8px;font-size:10px;">
                    <option value="ROOM_BASED" ${this._state.distribution==='ROOM_BASED'?'selected':''}>Capacity-Weighted (Realistic)</option>
                    <option value="UNIFORM" ${this._state.distribution==='UNIFORM'?'selected':''}>Uniform Equal Spread</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- ── SECTION 4: FIRE PHYSICS & ASET TIMELINE ── -->
            <div class="sb-section-box">
              <div class="sb-section-header">
                <div class="sb-sec-title">
                  <span class="sb-sec-num">4</span>
                  <span>FIRE TIMELINE &amp; PROPAGATION DYNAMICS</span>
                </div>
              </div>

              <div class="sb-physics-grid">
                <div class="sb-phys-card">
                  <div class="sb-phys-label">⏱️ FIRE IGNITION TIMING:</div>
                  <select id="sb-fire-timing" class="scenario-dropdown sb-phys-select">
                    <option value="0" ${this._state.fireStartSec===0?'selected':''}>0.0s (Immediate Alarm)</option>
                    <option value="2" ${this._state.fireStartSec===2?'selected':''}>2.0s (Rapid Ignition)</option>
                    <option value="5" ${this._state.fireStartSec===5?'selected':''}>5.0s (Standard Baseline)</option>
                    <option value="10" ${this._state.fireStartSec===10?'selected':''}>10.0s (Delayed Alarm)</option>
                  </select>
                </div>

                <div class="sb-phys-card">
                  <div class="sb-phys-label">🌡️ THERMAL GROWTH RATE:</div>
                  <select id="sb-fire-sev" class="scenario-dropdown sb-phys-select">
                    <option value="LOW" ${this._state.fireSeverity==='LOW'?'selected':''}>Slow Growth (0.8°C/s)</option>
                    <option value="MEDIUM" ${this._state.fireSeverity==='MEDIUM'?'selected':''}>Medium Growth (1.2°C/s)</option>
                    <option value="HIGH" ${this._state.fireSeverity==='HIGH'?'selected':''}>Violent Flashover (1.8°C/s)</option>
                  </select>
                </div>

                <div class="sb-phys-card">
                  <div class="sb-phys-label">💨 CORRIDOR SPREAD:</div>
                  <label class="sb-checkbox-label">
                    <input type="checkbox" id="sb-fire-spread" ${this._state.fireSpread?'checked':''} />
                    <span>Dynamic Corridor Hazard Spread</span>
                  </label>
                </div>
              </div>
            </div>

          </div>

          <!-- ═══════ FOOTER ═══════ -->
          <div class="scenario-builder-footer">
            <div class="sb-live-summary">
              <div style="display:flex;align-items:center;gap:8px;">
                <span class="sb-summary-label">PRE-FLIGHT FORECAST:</span>
                <span style="font-size:10px;font-family:var(--font-mono);font-weight:700;color:${feasibilityColor};">
                  ${feasibilityText}
                </span>
              </div>
              <div class="sb-summary-text" id="sb-summary-text">
                Fire: ${this._state.fireRooms.join(', ')} · ${blockedCount === 0 ? `All ${totalExits} Exits Open` : `${blockedCount} Exit(s) Blocked`} · ${this._state.occupantCount} Occupants · T+${this._state.fireStartSec}s
              </div>
            </div>

            <div style="display:flex;align-items:center;gap:10px;">
              <button class="btn btn-speed" id="btn-sb-reset-default" style="padding:7px 14px;font-size:10.5px;">
                RESTORE DEFAULTS
              </button>
              <button class="btn btn-start sb-apply-btn" id="btn-sb-apply" ${isLocked ? 'disabled' : ''}>
                APPLY SCENARIO
              </button>
            </div>
          </div>

        </div>
    `;
  }

  _renderRoomCard(s) {
    const isFire = this._state.fireRooms.includes(s.id);
    const fireSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="#ffffff" stroke="#ffffff" stroke-width="1.5"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 17c1.38 0 2.5-1.12 2.5-2.5 0-.61-.22-1.17-.58-1.61L12 11.5l-.92 1.39c-.36.44-.58 1-.58 1.61z"/><path d="M12 2c-.5 2-2 4-3.5 6A7.5 7.5 0 1 0 19 14.5c0-4-3.5-7.5-7-12.5z"/></svg>';
    const checkSvg = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    return `
      <div class="sb-room-card ${isFire ? 'fire-active' : ''}" data-room-id="${s.id}">
        <div class="sb-room-top">
          <div class="sb-check-indicator ${isFire ? 'active' : ''}">
            ${isFire ? fireSvg : checkSvg}
          </div>
          <div class="sb-room-name-box">
            <div class="sb-room-title">${s.name}</div>
            <div class="sb-room-meta">${s.id} · ${s.sub}</div>
          </div>
        </div>
        <div class="sb-room-bottom">
          <span class="sb-room-status-badge ${isFire ? 'fire' : 'safe'}">
            ${isFire ? 'IGNITION' : 'NORMAL'}
          </span>
          ${s.cap > 0 ? `<span class="sb-room-cap">${s.cap} Cap</span>` : ''}
        </div>
      </div>
    `;
  }

  _updateSummary() {
    const exits = BUILDING.exits || [];
    const totalExits = exits.length;
    const blockedCount = Object.values(this._state.blockedExits).filter(Boolean).length;
    const sumEl = this.modalEl ? this.modalEl.querySelector('#sb-summary-text') : null;
    if (sumEl) {
      sumEl.innerHTML = `
        Fire: ${this._state.fireRooms.join(', ')} · ${blockedCount === 0 ? `All ${totalExits} Exits Open` : `${blockedCount} Exit(s) Blocked`} · ${this._state.occupantCount} Occupants · T+${this._state.fireStartSec}s
      `;
    }
  }

  _applyScenario() {
    try {
      const occSlider = this.modalEl.querySelector('#sb-occ-slider');
      if (occSlider) this._state.occupantCount = parseInt(occSlider.value, 10) || this._state.occupantCount;

      const occDist = this.modalEl.querySelector('#sb-occ-dist');
      if (occDist) this._state.distribution = occDist.value || this._state.distribution;

      const fireTiming = this.modalEl.querySelector('#sb-fire-timing');
      if (fireTiming) this._state.fireStartSec = parseFloat(fireTiming.value) || this._state.fireStartSec;

      const fireSev = this.modalEl.querySelector('#sb-fire-sev');
      if (fireSev) this._state.fireSeverity = fireSev.value || this._state.fireSeverity;

      const fireSpread = this.modalEl.querySelector('#sb-fire-spread');
      if (fireSpread) this._state.fireSpread = fireSpread.checked;

      const blockedExitsMap = {};
      const exitsConfig = {};
      (BUILDING.exits || []).forEach(ex => {
        const isBlocked = this._state.blockedExits[ex.id] === true;
        blockedExitsMap[ex.id] = isBlocked;
        exitsConfig[ex.id] = { name: ex.name, enabled: !isBlocked };
      });

      const validSpaces = (BUILDING.spaces || []).map(s => s.id);
      let selectedFireRooms = this._state.fireRooms.filter(r => validSpaces.includes(r));
      if (!selectedFireRooms.length && validSpaces.length) {
        selectedFireRooms = [validSpaces[0]];
      }
      this._state.fireRooms = selectedFireRooms;
      const fireRoomPrimary = selectedFireRooms[0] || 'ROOM_101';

      const partialConfig = {
        scenario: {
          type: 'FIRE',
          fireRoom: fireRoomPrimary,
          fireRooms: [...selectedFireRooms],
          fireStartSeconds: this._state.fireStartSec,
          fireSeverity: this._state.fireSeverity,
          fireSpread: this._state.fireSpread,
        },
        building: {
          blockedExits: blockedExitsMap,
          exits: exitsConfig,
        },
        occupants: {
          count: this._state.occupantCount,
          distribution: this._state.distribution,
        }
      };

      if (this.configManager) {
        if (typeof this.configManager.update === 'function') {
          this.configManager.update(partialConfig);
        } else if (typeof this.configManager.set === 'function') {
          this.configManager.set(partialConfig);
        }
      }

      this.bus.emit('config:changed', { config: this.configManager ? this.configManager.get() : partialConfig, preset: 'CUSTOM' });

      // Synchronize Exit status across the Digital Twin and Floor Plan
      (BUILDING.exits || []).forEach(ex => {
        const isBlocked = blockedExitsMap[ex.id] === true;
        this.bus.emit('hazard:exit_status', { exitId: ex.id, accessible: !isBlocked, hazardLevel: isBlocked ? 'BLOCKED' : 'NORMAL' });
      });

      // Synchronize fire trigger event across the Digital Twin and Floor Plan
      this.bus.emit('sim:fire_trigger', {
        rooms: selectedFireRooms,
        room: fireRoomPrimary,
        manualTrigger: true
      });

      const blockedNames = Object.keys(this._state.blockedExits).filter(k => this._state.blockedExits[k]);
      const blockedDesc = blockedNames.length > 0 ? ` [Blocked: ${blockedNames.join(', ')}]` : '';
      const msg = `Custom scenario active: Fire in [${selectedFireRooms.join(', ')}]${blockedDesc} with ${this._state.occupantCount} occupants.`;

      this.bus.emit('log', { tag: 'system', msg, priority: 'important' });
      this.bus.emit('scenario:custom_applied', { ...this._state });
    } catch(err) {
      console.error('[ScenarioBuilderModal] Apply error:', err);
    } finally {
      this.hide();
    }
  }
}
