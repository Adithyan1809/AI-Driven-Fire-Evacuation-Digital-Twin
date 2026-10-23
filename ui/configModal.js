/**
 * CONFIGURATION MODAL, DYNAMIC BUILDING MODEL EDITOR & RESEARCH LAB
 *
 * Comprehensive tabbed control center:
 *   1. Simulation (Speed, Presentation Pace, Mode, Auto-Pause)
 *   2. Scenario (Fire Room, Start Time, Severity, Spread)
 *   3. Sensors (Enable/Disable table, Failure Injection: Offline/Frozen/Invalid/Noisy)
 *   4. Building Model Editor & Generalization (Edit rooms, IDs, aliases, switch between 3 buildings)
 *   5. Routing (Dijkstra vs A*, Safest vs Shortest, Hazard Penalty, Lift Interlock)
 *   6. Occupants (Count, Reaction Delay, Speed Multiplier, Speed Variance)
 *   7. AI Semantic Middleware & Research Lab (12 Experiments, Semantic Memory Explorer, Human-in-the-Loop)
 *   8. Heterogeneous Telemetry (BMS, FAS, BIM, OCC toggles, Packet Loss, Delay)
 *   9. Hazard Physics (Temperature & Smoke Warning/Critical Thresholds)
 *   10. Visualization (Layer Toggles, Zoom 50%-200%)
 */

import { BUILDING } from '../data/building.js';
import { PRESETS } from '../modules/configManager.js';
import { canonicalRegistryInstance, CANONICAL_ENTITIES } from '../data/canonicalRegistry.js';

export class ConfigModal {
  /**
   * @param {Object} opts
   * @param {HTMLElement} opts.modalEl
   * @param {ConfigManager} opts.configManager
   * @param {AISemanticService} [opts.aiService]
   * @param {EventBus} opts.bus
   */
  constructor({ modalEl, configManager, aiService = null, bus }) {
    this.modalEl       = modalEl;
    this.configManager = configManager;
    this.aiService     = aiService;
    this.bus           = bus;
    this.activeTab     = 'SEMANTIC';
    this.isOpen        = false;

    this.bus.on('sim:start', () => this._onSimState(true));
    this.bus.on('sim:reset', () => this._onSimState(false));
    this.bus.on('config:changed', () => { if (this.isOpen) this.render(); });
  }

  show() {
    this.isOpen = true;
    this.render();
  }

  hide() {
    this.isOpen = false;
    if (this.modalEl) this.modalEl.innerHTML = '';
  }

  _onSimState(isRunning) {
    if (this.isOpen) this.render();
  }

  render() {
    const c = this.configManager.get();
    const isLocked = this.configManager.isLocked;
    const activePreset = this.configManager.activePreset;

    this.modalEl.innerHTML = `
      <div class="config-modal-overlay" id="cfg-overlay">
        <div class="config-modal-card">

          <!-- Header -->
          <div class="config-modal-header">
            <div style="display:flex;align-items:center;gap:10px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" style="color:var(--accent-cyan);flex-shrink:0"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              <div>
                <span class="modal-title" style="font-size:13px;font-weight:700;">RESEARCH CONFIGURATION &amp; EXPERIMENT CONTROL</span>
                <div style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono);margin-top:2px;">
                  AI-Driven Digital Twin Framework · Adaptive Semantic Interoperability Middleware
                </div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              ${isLocked ? `<span class="cfg-lock-badge">SIMULATION RUNNING — CONTROLS LOCKED</span>` : ''}
              <button class="btn btn-speed" id="btn-cfg-close" style="font-size:11px;padding:4px 12px;">Close</button>
            </div>
          </div>

          <!-- Presets Bar -->
          <div class="config-presets-bar">
            <span class="preset-label">RESEARCH PRESETS:</span>
            <div class="preset-buttons">
              ${Object.keys(PRESETS).map(key => `
                <button class="btn btn-speed ${activePreset===key?'active':''}" data-preset="${key}" style="font-size:9px;padding:3px 8px;" ${isLocked?'disabled':''}>
                  ${PRESETS[key].name}
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Main Layout: Nav Tabs + Tab Content -->
          <div class="config-main-layout">

            <!-- Left Nav -->
            <div class="config-tab-nav">
              ${[
                { id: 'SEMANTIC',     icon: '🤖', label: '7. AI Semantic & Research Lab' },
                { id: 'BUILDING',     icon: '🏢', label: '4. Building Model & Generalization' },
                { id: 'SIMULATION',   icon: '⏱', label: '1. Simulation' },
                { id: 'SCENARIO',     icon: '🔥', label: '2. Scenario' },
                { id: 'SENSORS',      icon: '📡', label: '3. Sensors & Failures' },
                { id: 'ROUTING',      icon: '🗺️', label: '5. Routing & Dijkstra' },
                { id: 'OCCUPANTS',    icon: '👥', label: '6. 50 Occupants' },
                { id: 'HETEROGENEOUS',icon: '🔗', label: '8. Multi-System Feeds' },
                { id: 'HAZARD',       icon: '⚠️', label: '9. Hazard Physics' },
                { id: 'VISUALIZATION',icon: '👁️', label: '10. Visualization' },
              ].map(tab => `
                <button class="cfg-tab-btn ${this.activeTab===tab.id?'active':''}" data-tab="${tab.id}">
                  <span>${tab.icon}</span> ${tab.label}
                </button>
              `).join('')}
            </div>

            <!-- Right Content Area -->
            <div class="config-tab-content" id="cfg-content">
              ${this._renderActiveTab(c, isLocked)}
            </div>

          </div>

          <!-- Footer: Save / Load / Reset -->
          <div class="config-modal-footer">
            <div style="display:flex;gap:6px;">
              <button class="btn btn-speed" id="btn-cfg-reset" ${isLocked?'disabled':''}>↺ Reset Default</button>
              <button class="btn btn-speed" id="btn-cfg-export">📥 Export JSON</button>
              <button class="btn btn-speed" id="btn-cfg-import-trigger" ${isLocked?'disabled':''}>📂 Import JSON</button>
              <input type="file" id="cfg-import-file" accept=".json" style="display:none;" />
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              <span id="cfg-save-status" style="font-family:var(--font-mono);font-size:10px;color:var(--accent-green)">✓ Config Saved &amp; Persisted</span>
              <button class="btn btn-primary" id="btn-cfg-apply" style="padding:6px 16px;">APPLY &amp; CLOSE</button>
            </div>
          </div>

        </div>
      </div>
    `;

    this._bindEvents(c, isLocked);
  }

  _renderActiveTab(c, isLocked) {
    switch (this.activeTab) {
      case 'SEMANTIC':     return this._renderSemanticTab(c);
      case 'BUILDING':     return this._renderBuildingTab(c);
      case 'SIMULATION':   return this._renderSimulationTab(c);
      case 'SCENARIO':     return this._renderScenarioTab(c);
      case 'SENSORS':      return this._renderSensorsTab(c);
      case 'ROUTING':      return this._renderRoutingTab(c);
      case 'OCCUPANTS':    return this._renderOccupantsTab(c);
      case 'HETEROGENEOUS':return this._renderHeteroTab(c);
      case 'HAZARD':       return this._renderHazardTab(c);
      case 'VISUALIZATION':return this._renderVisualTab(c);
      default:             return '<div>Select a tab</div>';
    }
  }

  _renderSemanticTab(c) {
    const sem = c.semantic || {};
    const threshPct = Math.round((sem.confidenceThreshold || 0.75) * 100);
    const ambMargin = Math.round((sem.ambiguityMargin || 0.05) * 100);
    const mode = sem.mode || 'AI_GEMINI';

    return `
      <div class="cfg-section">
        <div class="cfg-sec-title">GEMINI AI SEMANTIC MIDDLEWARE &amp; SAFETY FIREWALL (GAP C)</div>

        <!-- Mode Selector -->
        <div class="cfg-field-row">
          <div>
            <div class="cfg-label">Inference Engine Mode</div>
            <div class="cfg-desc">Toggle between real Gemini AI LLM semantic inference and deterministic baseline rules.</div>
          </div>
          <select id="cfg-sem-mode" class="cfg-input">
            <option value="AI_GEMINI" ${mode==='AI_GEMINI'?'selected':''}>🤖 Gemini AI (Real LLM Zero-Shot Semantic Inference)</option>
            <option value="DETERMINISTIC_BASELINE" ${mode==='DETERMINISTIC_BASELINE'?'selected':''}>📐 Deterministic Baseline (Rules / Dictionaries)</option>
          </select>
        </div>

        <div class="cfg-field-row">
          <div>
            <div class="cfg-label">Confidence Acceptance Threshold (${threshPct}%)</div>
            <div class="cfg-desc">Mappings below this confidence score are held by the safety firewall.</div>
          </div>
          <input type="range" id="cfg-conf-slider" min="30" max="95" step="1" value="${threshPct}" class="cfg-slider" />
        </div>

        <div class="cfg-field-row">
          <div>
            <div class="cfg-label">Ambiguity Detection Margin (${ambMargin}%)</div>
            <div class="cfg-desc">If the top candidate and second candidate are closer than this margin, the entity is flagged as AMBIGUOUS.</div>
          </div>
          <input type="range" id="cfg-amb-slider" min="1" max="15" step="1" value="${ambMargin}" class="cfg-slider" />
        </div>

        <!-- PART 16: 12-Category Comprehensive Research Lab -->
        <div class="card" style="margin-top:10px;background:#0d1525;border-color:var(--accent-purple);">
          <div class="card-title" style="color:var(--accent-purple)">🔬 Research Lab: 12 Live Semantic Experiments</div>
          <div style="font-size:9.5px;color:var(--text-muted);margin-bottom:8px;">
            Select any research category to demonstrate zero-shot generalization, dynamic schema adaptation, attribute inference, or safety firewall rejection:
          </div>

          <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;margin-bottom:8px;">
            <select id="cfg-demo-experiment-select" class="cfg-input" style="font-size:11px;">
              <option value="TEST_1">1. Unseen Identifier (BMS "NEXUS-AI-01" ➔ ROOM_101)</option>
              <option value="TEST_2">2. Unseen Synonym (BMS "DISTRIB-SYS-LAB" ➔ ROOM_102)</option>
              <option value="TEST_3">3. Abbreviation (FAS "HW-IOT-BAY" ➔ ROOM_103)</option>
              <option value="TEST_4">4. Unseen Schema (Custom JSON with "origin", "node", "thermal_reading")</option>
              <option value="TEST_5">5. Attribute Semantic Translation ("thermal_reading" ➔ temperature)</option>
              <option value="TEST_6">6. Cross-System 4-Feed Unification (BMS, FAS, BIM, OCC ➔ ROOM_101)</option>
              <option value="TEST_7">7. Unknown Entity Rejection (BMS "ZONE_X73" ➔ UNKNOWN / REJECTED)</option>
              <option value="TEST_8">8. Ambiguous Entity Detection (BMS "HOD-CABIN" ➔ AMBIGUOUS / HELD)</option>
              <option value="TEST_9">9. Dynamic Building ID Adaptation (Custom Canonical LAB_X17)</option>
              <option value="TEST_10">10. Dynamic Room Renaming (ROOM_101 ➔ "Robotics & Cybernetics Wing")</option>
              <option value="TEST_11">11. New Room Generalization (Added "BIO_RESEARCH_LAB")</option>
              <option value="TEST_12">12. Removed Room Resilience (Deleted ROOM_103)</option>
            </select>
            <button id="btn-cfg-run-experiment" class="btn btn-primary" style="padding:6px 14px;background:var(--accent-purple);border-color:var(--accent-purple);">
              🚀 RUN EXPERIMENT
            </button>
          </div>

          <div id="cfg-experiment-result-box" style="margin-top:8px;padding:10px;background:rgba(0,0,0,0.5);border-radius:6px;font-family:var(--font-mono);font-size:10px;display:none;"></div>
        </div>

        <!-- PART 5: Human-in-the-loop Review Sandbox -->
        <div class="card" style="margin-top:10px;background:#101728;border-color:var(--accent-cyan);">
          <div class="card-title" style="color:var(--accent-cyan)">🧑‍💻 Human-in-the-Loop Semantic Learning Sandbox</div>
          <div style="font-size:9.5px;color:var(--text-muted);margin-bottom:8px;">
            Test arbitrary foreign feeds. If uncertain or ambiguous, operator can approve or override the mapping, storing a permanent learned memory rule.
          </div>
          <div style="display:grid;grid-template-columns:100px 1fr;gap:6px;margin-bottom:6px;">
            <span class="cfg-label">Source System:</span>
            <select id="cfg-test-sys" class="cfg-input">
              <option value="BMS">BMS (Building Management)</option>
              <option value="FAS">FAS (Fire Alarm System)</option>
              <option value="BIM">BIM (IFC Spatial Model)</option>
              <option value="OCCUPANCY">OCCUPANCY (CCTV Vision)</option>
              <option value="CUSTOM">CUSTOM (Proprietary IoT)</option>
            </select>
          </div>
          <div style="display:grid;grid-template-columns:100px 1fr;gap:6px;margin-bottom:6px;">
            <span class="cfg-label">Identifier:</span>
            <input type="text" id="cfg-test-id" class="cfg-input" value="NEXUS-AI-01" placeholder="e.g. NEXUS-AI-01, CN-NET-LAB, IfcSpace_1003, ZONE_X73" />
          </div>
          <div style="display:grid;grid-template-columns:100px 1fr;gap:6px;margin-bottom:6px;">
            <span class="cfg-label">Description:</span>
            <input type="text" id="cfg-test-desc" class="cfg-input" value="Advanced artificial intelligence and robotics laboratory" placeholder="Optional context description" />
          </div>
          <div style="display:grid;grid-template-columns:100px 1fr;gap:6px;margin-bottom:8px;">
            <span class="cfg-label">Attributes:</span>
            <input type="text" id="cfg-test-attrs" class="cfg-input" value="thermal_reading, people_present" placeholder="Comma-separated attribute names" />
          </div>
          <div style="display:flex;justify-content:flex-end;">
            <button id="btn-cfg-test-resolve" class="btn btn-primary" style="padding:6px 16px;">🚀 RESOLVE VIA GEMINI</button>
          </div>
          <div id="cfg-test-result-box" style="margin-top:8px;padding:10px;background:rgba(0,0,0,0.4);border-radius:6px;font-family:var(--font-mono);font-size:10px;display:none;"></div>
        </div>

        <!-- PART 15: Semantic Memory Explorer -->
        <div class="card" style="margin-top:10px;background:#131d2a;border-color:rgba(34,197,94,0.3);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div class="card-title" style="color:var(--accent-green);margin:0;">🧠 Semantic Memory Explorer</div>
            <button id="btn-cfg-clear-memory" class="btn btn-speed" style="font-size:9px;color:var(--accent-red);border-color:rgba(239,68,68,0.4);">
              🗑 Clear Memory
            </button>
          </div>
          <div style="font-size:9.5px;color:var(--text-muted);margin-bottom:8px;">
            Shows persistent validated and learned semantic memories. Warm queries hit memory in &lt;0.1ms with zero LLM API cost.
          </div>
          <div id="cfg-memory-table-box" style="max-height:180px;overflow-y:auto;">
            <div style="text-align:center;padding:12px;color:var(--text-muted);font-size:10px;">Loading semantic memory records...</div>
          </div>
        </div>

      </div>
    `;
  }

  _renderBuildingTab(c) {
    const spaces = canonicalRegistryInstance.getActiveSpaces();
    const activeBuildingName = canonicalRegistryInstance.getActiveBuildingName();
    const modelVersion = canonicalRegistryInstance.getModelVersion();

    return `
      <div class="cfg-section">
        <div class="cfg-sec-title">DYNAMIC BUILDING MODEL EDITOR &amp; GENERALIZATION (PARTS 2 &amp; 18)</div>

        <!-- Building Generalization Switcher -->
        <div class="card" style="margin-bottom:12px;background:#101728;border-color:var(--accent-cyan);">
          <div class="card-title" style="color:var(--accent-cyan)">🏢 Multi-Building Generalization Suite</div>
          <div style="font-size:9.5px;color:var(--text-muted);margin-bottom:8px;">
            Demonstrate that the same Gemini AI semantic middleware generalizes to completely different building topologies, naming schemes, and geometries without code edits.
          </div>
          <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;">
            <select id="cfg-building-switch-select" class="cfg-input">
              <option value="BUILDING_A" ${canonicalRegistryInstance.activeBuildingKey==='BUILDING_A'?'selected':''}>Building A: College Engineering Block (Floor 1 · 11 Spaces)</option>
              <option value="BUILDING_B" ${canonicalRegistryInstance.activeBuildingKey==='BUILDING_B'?'selected':''}>Building B: Metropolis Commercial Office (Floor 3 · Corporate Suites)</option>
              <option value="BUILDING_C" ${canonicalRegistryInstance.activeBuildingKey==='BUILDING_C'?'selected':''}>Building C: Quantum Research Facility (Floor 2 · Cleanrooms &amp; Cryo)</option>
            </select>
            <button id="btn-cfg-switch-building" class="btn btn-primary" style="padding:6px 14px;">
              🔄 SWITCH BUILDING
            </button>
          </div>
        </div>

        <!-- Active Model Header -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div>
            <strong style="color:#fff;font-size:12px;">Active Model: ${activeBuildingName}</strong>
            <span class="badge badge-purple" style="margin-left:6px;">Model Version ${modelVersion}</span>
          </div>
          <button id="btn-cfg-add-space" class="btn btn-speed" style="color:var(--accent-green);border-color:rgba(34,197,94,0.4);font-size:10px;">
            ➕ ADD NEW ROOM
          </button>
        </div>

        <!-- Spaces Table -->
        <div class="card" style="padding:0;overflow:hidden;margin-bottom:10px;">
          <table class="cfg-table" style="font-size:9.5px;">
            <thead>
              <tr>
                <th>Entity ID</th>
                <th>Room Name</th>
                <th>Type</th>
                <th>Floor</th>
                <th>Known Aliases (Comma-Separated)</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="cfg-spaces-tbody">
              ${spaces.map(s => `
                <tr data-space-id="${s.id}">
                  <td><input type="text" class="cfg-input-mini cfg-space-id" value="${s.id}" style="width:90px;font-family:var(--font-mono);font-weight:700;color:var(--accent-cyan);" /></td>
                  <td><input type="text" class="cfg-input-mini cfg-space-name" value="${s.name}" style="width:180px;" /></td>
                  <td>
                    <select class="cfg-input-mini cfg-space-type">
                      <option value="CLASSROOM" ${s.type==='CLASSROOM'?'selected':''}>CLASSROOM</option>
                      <option value="OFFICE" ${s.type==='OFFICE'?'selected':''}>OFFICE</option>
                      <option value="ADMIN" ${s.type==='ADMIN'?'selected':''}>ADMIN</option>
                      <option value="LABORATORY" ${s.type==='LABORATORY'?'selected':''}>LABORATORY</option>
                      <option value="CORRIDOR" ${s.type==='CORRIDOR'?'selected':''}>CORRIDOR</option>
                      <option value="VERTICAL_TRANSIT" ${s.type==='VERTICAL_TRANSIT'?'selected':''}>LIFT</option>
                      <option value="STAIRCASE" ${s.type==='STAIRCASE'?'selected':''}>STAIRCASE</option>
                    </select>
                  </td>
                  <td><input type="number" class="cfg-input-mini cfg-space-floor" value="${s.floor||1}" style="width:40px;" /></td>
                  <td><input type="text" class="cfg-input-mini cfg-space-aliases" value="${(s.aliases||[]).join(', ')}" style="width:100%;" /></td>
                  <td>
                    <button class="btn-del-space" data-id="${s.id}" style="background:none;border:none;color:var(--accent-red);cursor:pointer;font-size:12px;">🗑</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font-size:9px;color:var(--text-muted);">
            * Saving updates the canonical registry, bumps model version, and purges affected semantic memory.
          </div>
          <button id="btn-cfg-save-building" class="btn btn-primary" style="padding:6px 16px;">
            💾 SAVE MODEL &amp; RE-INDEX
          </button>
        </div>
      </div>
    `;
  }

  _renderSimulationTab(c) {
    const s = c.simulation;
    return `
      <div class="cfg-section">
        <div class="cfg-sec-title">SIMULATION EXECUTION &amp; TIMING</div>

        <div class="cfg-field-row">
          <div>
            <div class="cfg-label">Simulation Clock Speed (${s.simSpeed}×)</div>
            <div class="cfg-desc">Multiplier for physics and occupant movement clock.</div>
          </div>
          <select id="cfg-sim-speed" class="cfg-input">
            ${[0.25, 0.5, 1, 2, 5, 10].map(v => `<option value="${v}" ${s.simSpeed===v?'selected':''}>${v}×</option>`).join('')}
          </select>
        </div>

        <div class="cfg-field-row">
          <div>
            <div class="cfg-label">Presentation Pacing Mode</div>
            <div class="cfg-desc">Slow step-by-step narration speed for lectures and demonstrations.</div>
          </div>
          <select id="cfg-pres-speed" class="cfg-input">
            <option value="SLOW" ${s.presSpeed==='SLOW'?'selected':''}>Slow (~1.4s — Recommended for Professor)</option>
            <option value="NORMAL" ${s.presSpeed==='NORMAL'?'selected':''}>Normal (~0.8s)</option>
            <option value="FAST" ${s.presSpeed==='FAST'?'selected':''}>Fast (~0.4s)</option>
          </select>
        </div>

        <div class="cfg-field-row">
          <div>
            <div class="cfg-label">Presentation Mode</div>
            <div class="cfg-desc">Demo mode steps through AI inference and timeline sequentially.</div>
          </div>
          <select id="cfg-pres-mode" class="cfg-input">
            <option value="DEMO" ${s.presMode==='DEMO'?'selected':''}>🎓 Demo Mode (Human-Paced Narrative)</option>
            <option value="REALTIME" ${s.presMode==='REALTIME'?'selected':''}>⚡ Real-Time (Instant Updates)</option>
          </select>
        </div>

        <div class="cfg-field-row">
          <div>
            <div class="cfg-label">Auto-Pause on Milestones</div>
            <div class="cfg-desc">Automatically pauses simulation when fire is triggered or evacuation begins.</div>
          </div>
          <input type="checkbox" id="cfg-auto-pause" ${s.autoPauseOnMilestones?'checked':''} />
        </div>
      </div>
    `;
  }

  _renderScenarioTab(c) {
    const sc = c.scenario;
    const fireRooms = Array.isArray(sc.fireRooms) ? sc.fireRooms : (sc.fireRoom ? (typeof sc.fireRoom === 'string' && sc.fireRoom.includes(',') ? sc.fireRoom.split(',') : [sc.fireRoom]) : ['ROOM_101']);
    const spaces = BUILDING.spaces.filter(s => ['CLASSROOM', 'OFFICE', 'ADMIN', 'LABORATORY'].includes(s.type));
    return `
      <div class="cfg-section">
        <div class="cfg-sec-title">EMERGENCY SCENARIO DEFINITION &amp; MULTI-ROOM IGNITION</div>

        <div class="cfg-field-row">
          <div>
            <div class="cfg-label">Scenario Type</div>
            <div class="cfg-desc">Type of building emergency event to simulate.</div>
          </div>
          <select id="cfg-scen-type" class="cfg-input">
            <option value="FIRE" ${sc.type==='FIRE'?'selected':''}>Structural Fire &amp; Smoke Propagation</option>
            <option value="SENSOR_FAILURE" ${sc.type==='SENSOR_FAILURE'?'selected':''}>Sensor Malfunction &amp; Missing Telemetry</option>
            <option value="COMM_FAILURE" ${sc.type==='COMM_FAILURE'?'selected':''}>BMS Network Gateway Failure</option>
          </select>
        </div>

        <div class="card" style="margin-top:8px;background:rgba(239,68,68,0.06);border-color:rgba(239,68,68,0.25);">
          <div class="card-title" style="color:var(--accent-red)">🔥 Multi-Room Fire Ignition Selection</div>
          <div style="font-size:9px;color:var(--text-muted);margin-bottom:8px;">
            Select one or multiple rooms to ignite simultaneously or trigger cross-wing emergencies:
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(180px, 1fr));gap:6px;">
            ${spaces.map(s => {
              const isChecked = fireRooms.includes(s.id);
              return `
                <label style="display:flex;align-items:center;gap:6px;font-size:10px;padding:4px 6px;background:rgba(0,0,0,0.3);border-radius:4px;border:1px solid ${isChecked?'var(--accent-red)':'var(--border-primary)'};cursor:pointer;">
                  <input type="checkbox" class="cfg-fire-room-cb" value="${s.id}" ${isChecked?'checked':''} />
                  <span style="font-family:var(--font-mono);font-weight:700;color:${isChecked?'var(--accent-red)':'var(--text-primary)'}">${s.id}</span>
                  <span style="color:var(--text-muted);font-size:8.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.name}</span>
                </label>
              `;
            }).join('')}
          </div>
        </div>

        <div class="cfg-field-row" style="margin-top:10px;">
          <div>
            <div class="cfg-label">Fire Start Time (${sc.fireStartSeconds}s)</div>
            <div class="cfg-desc">Seconds into simulation before thermal ignition is triggered.</div>
          </div>
          <input type="range" id="cfg-fire-time" min="2" max="30" step="1" value="${sc.fireStartSeconds}" class="cfg-slider" />
        </div>

        <div class="cfg-field-row">
          <div>
            <div class="cfg-label">Fire Severity</div>
            <div class="cfg-desc">Ramp rate of temperature and particulate smoke growth.</div>
          </div>
          <select id="cfg-fire-sev" class="cfg-input">
            <option value="LOW" ${sc.fireSeverity==='LOW'?'selected':''}>Low (+0.50°C/tick)</option>
            <option value="MEDIUM" ${sc.fireSeverity==='MEDIUM'?'selected':''}>Medium (+0.75°C/tick)</option>
            <option value="HIGH" ${sc.fireSeverity==='HIGH'?'selected':''}>High (+0.95°C/tick — Standard)</option>
          </select>
        </div>

        <div class="cfg-field-row">
          <div>
            <div class="cfg-label">Spatial Hazard Propagation</div>
            <div class="cfg-desc">Allow heat and smoke to spread to adjacent corridors and connected rooms.</div>
          </div>
          <input type="checkbox" id="cfg-fire-spread" ${sc.fireSpread?'checked':''} />
        </div>
      </div>
    `;
  }

  _renderSensorsTab(c) {
    const sensors = BUILDING.sensors;
    const fail = c.sensors.failureSimulation || {};
    return `
      <div class="cfg-section">
        <div class="cfg-sec-title">VIRTUAL IoT SENSOR MANAGEMENT &amp; FAILURE SIMULATION</div>

        <div class="card" style="background:#1c1328;border-color:rgba(168,85,247,0.3);margin-bottom:12px;">
          <div class="card-title" style="color:var(--accent-purple)">⚠️ Simulate IoT Sensor Failure</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;align-items:center;">
            <div>
              <div class="cfg-label">Inject Failure</div>
              <input type="checkbox" id="cfg-fail-enable" ${fail.enabled?'checked':''} />
            </div>
            <div>
              <div class="cfg-label">Target Sensor</div>
              <select id="cfg-fail-target" class="cfg-input">
                ${sensors.map(s => `<option value="${s.id}" ${fail.targetSensor===s.id?'selected':''}>${s.id} (${s.room})</option>`).join('')}
              </select>
            </div>
            <div>
              <div class="cfg-label">Failure Mode</div>
              <select id="cfg-fail-type" class="cfg-input">
                <option value="OFFLINE" ${fail.failureType==='OFFLINE'?'selected':''}>Offline (Null)</option>
                <option value="FROZEN" ${fail.failureType==='FROZEN'?'selected':''}>Frozen Value (Stuck)</option>
                <option value="INVALID" ${fail.failureType==='INVALID'?'selected':''}>Invalid (-999°C)</option>
                <option value="NOISY" ${fail.failureType==='NOISY'?'selected':''}>Extreme Noise</option>
              </select>
            </div>
          </div>
        </div>

        <div class="cfg-field-row">
          <div>
            <div class="cfg-label">Sensor Telemetry Noise Level (${c.sensors.noiseLevelPct}%)</div>
            <div class="cfg-desc">Standard Gaussian noise variance applied to baseline sensor readings.</div>
          </div>
          <input type="range" id="cfg-noise-slider" min="0" max="20" value="${c.sensors.noiseLevelPct}" class="cfg-slider" />
        </div>

        <div class="card" style="padding:0;overflow:hidden;margin-top:10px;">
          <table class="cfg-table">
            <thead>
              <tr>
                <th>Sensor ID</th>
                <th>Type</th>
                <th>Space</th>
                <th>Source Feed</th>
                <th>Enabled</th>
              </tr>
            </thead>
            <tbody>
              ${sensors.map(s => `
                <tr>
                  <td style="font-family:var(--font-mono);font-weight:700;color:var(--accent-cyan)">${s.id}</td>
                  <td>${s.type}</td>
                  <td>${s.room}</td>
                  <td><span class="badge badge-blue">${s.source_system}</span></td>
                  <td>
                    <input type="checkbox" class="cfg-sensor-toggle" data-sensor="${s.id}" ${c.sensors.enabledMap?.[s.id]!==false?'checked':''} />
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  _renderRoutingTab(c) {
    const r = c.routing;
    const exits = BUILDING.exits || [];
    const blockedExits = c.building?.blockedExits || {};
    return `
      <div class="cfg-section">
        <div class="cfg-sec-title">DYNAMIC ROUTING, DIJKSTRA &amp; EXIT BLOCKING</div>

        <div class="card" style="margin-bottom:12px;background:rgba(239,68,68,0.06);border-color:rgba(239,68,68,0.25);">
          <div class="card-title" style="color:var(--accent-red)">⛔ Emergency Exit Blocking Controls</div>
          <div style="font-size:9px;color:var(--text-muted);margin-bottom:8px;">
            Block specific exits to simulate locked fire doors or debris obstruction. Dijkstra will dynamically reroute occupants to surviving safe exits:
          </div>
          <div style="display:grid;grid-template-columns:1fr;gap:6px;">
            ${exits.map(e => {
              const isBlocked = blockedExits[e.id] === true;
              return `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:rgba(0,0,0,0.3);border-radius:4px;border:1px solid ${isBlocked?'var(--accent-red)':'var(--border-primary)'};">
                  <div>
                    <span style="font-family:var(--font-mono);font-weight:700;color:${isBlocked?'var(--accent-red)':'var(--accent-green)'}">
                      ${isBlocked ? '⛔ BLOCKED' : '✓ OPEN'}
                    </span>
                    <strong style="margin-left:8px;font-size:11px;">${e.name}</strong>
                    <span style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);margin-left:6px;">(${e.id})</span>
                  </div>
                  <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:10px;color:${isBlocked?'var(--accent-red)':'var(--text-secondary)'};font-weight:600;">
                    <input type="checkbox" class="cfg-exit-block-toggle" data-exit="${e.id}" ${isBlocked?'checked':''} />
                    ${isBlocked ? 'Block Exit (Disabled)' : 'Normal Egress'}
                  </label>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="cfg-field-row">
          <div>
            <div class="cfg-label">Pathfinding Algorithm</div>
            <div class="cfg-desc">Graph optimization core.</div>
          </div>
          <select id="cfg-route-algo" class="cfg-input">
            <option value="DIJKSTRA" ${r.algorithm==='DIJKSTRA'?'selected':''}>Dijkstra (Exact Shortest Weighted Path)</option>
            <option value="ASTAR" ${r.algorithm==='ASTAR'?'selected':''}>A* Search (Euclidean Heuristic)</option>
          </select>
        </div>

        <div class="cfg-field-row">
          <div>
            <div class="cfg-label">Egress Strategy</div>
            <div class="cfg-desc">Weighting balance between distance and smoke/thermal safety.</div>
          </div>
          <select id="cfg-route-strat" class="cfg-input">
            <option value="SAFEST" ${r.strategy==='SAFEST'?'selected':''}>Safest Route (Heavy hazard evasion — Standard)</option>
            <option value="BALANCED" ${r.strategy==='BALANCED'?'selected':''}>Balanced (Distance + Safety)</option>
            <option value="SHORTEST" ${r.strategy==='SHORTEST'?'selected':''}>Shortest Distance (Ignore Hazard — Static Baseline)</option>
          </select>
        </div>

        <div class="cfg-field-row">
          <div>
            <div class="cfg-label">Critical Hazard Penalty (${r.hazardPenalty}×)</div>
            <div class="cfg-desc">Graph edge cost multiplier applied to active fire zones.</div>
          </div>
          <input type="range" id="cfg-haz-penalty" min="100" max="5000" step="100" value="${r.hazardPenalty}" class="cfg-slider" />
        </div>

        <div class="cfg-field-row">
          <div>
            <div class="cfg-label">Smoke Diffusion Penalty (${r.smokePenalty}×)</div>
            <div class="cfg-desc">Cost multiplier applied to smoke-filled corridor segments.</div>
          </div>
          <input type="range" id="cfg-smoke-penalty" min="5" max="100" step="5" value="${r.smokePenalty}" class="cfg-slider" />
        </div>

        <div class="cfg-field-row">
          <div>
            <div class="cfg-label">Lift Interlock in Emergency</div>
            <div class="cfg-desc">If disabled, lifts are permanently locked with infinite cost during alarms (NFPA protocol).</div>
          </div>
          <input type="checkbox" id="cfg-lift-allow" ${r.allowLiftDuringEmergency?'checked':''} />
        </div>
      </div>
    `;
  }

  _renderOccupantsTab(c) {
    const occ = c.occupants;
    const count = occ.count || 50;
    return `
      <div class="cfg-section">
        <div class="cfg-sec-title">OCCUPANT MICRO-SIMULATION &amp; POPULATION SCALE</div>

        <div class="card" style="margin-bottom:12px;background:rgba(6,182,212,0.06);border-color:rgba(6,182,212,0.25);">
          <div class="card-title" style="color:var(--accent-cyan)">👥 Building Population Scaling</div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <div style="font-size:12px;font-weight:700;color:var(--accent-cyan);font-family:var(--font-mono);">
              Current: <span id="cfg-occ-count-display">${count}</span> Occupants
            </div>
            <div class="preset-chips" style="display:flex;gap:4px;">
              ${[10, 25, 50, 75, 100, 150, 200, 300].map(n => `
                <button type="button" class="btn btn-speed cfg-occ-chip ${count===n?'active':''}" data-count="${n}" style="font-size:8.5px;padding:2px 6px;">
                  ${n}
                </button>
              `).join('')}
            </div>
          </div>
          <input type="range" id="cfg-occ-slider" min="10" max="300" step="5" value="${count}" class="cfg-slider" style="width:100%;" />
        </div>

        <div class="cfg-field-row">
          <div>
            <div class="cfg-label">Reaction Delay (${occ.reactionDelaySeconds}s)</div>
            <div class="cfg-desc">Pre-movement delay between fire alarm trigger and occupant egress.</div>
          </div>
          <input type="range" id="cfg-react-slider" min="0.1" max="4.0" step="0.1" value="${occ.reactionDelaySeconds}" class="cfg-slider" />
        </div>

        <div class="cfg-field-row">
          <div>
            <div class="cfg-label">Walking Speed Multiplier (${occ.walkingSpeedMultiplier}×)</div>
            <div class="cfg-desc">Base pedestrian velocity along trajectory edges.</div>
          </div>
          <input type="range" id="cfg-speed-slider" min="0.5" max="2.5" step="0.1" value="${occ.walkingSpeedMultiplier}" class="cfg-slider" />
        </div>

        <div class="cfg-field-row">
          <div>
            <div class="cfg-label">Speed Variance (${occ.speedVariationPct}%)</div>
            <div class="cfg-desc">Gaussian variance in individual agent speeds to model realistic crowd dispersion.</div>
          </div>
          <input type="range" id="cfg-var-slider" min="0" max="40" step="5" value="${occ.speedVariationPct}" class="cfg-slider" />
        </div>
      </div>
    `;
  }

  _renderHeteroTab(c) {
    const h = c.heterogeneous;
    const sys = h.activeSystems || {};
    return `
      <div class="cfg-section">
        <div class="cfg-sec-title">HETEROGENEOUS MULTI-SYSTEM TELEMETRY FEEDS</div>

        <div class="card" style="margin-bottom:12px;">
          <div class="card-title">Active Subsystem Ingestion Streams</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" class="cfg-sys-toggle" data-sys="BMS" ${sys.BMS?'checked':''} /> <span class="badge badge-blue">BMS</span> Building Management System</label>
            <label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" class="cfg-sys-toggle" data-sys="FAS" ${sys.FAS?'checked':''} /> <span class="badge badge-red">FAS</span> Fire Alarm System</label>
            <label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" class="cfg-sys-toggle" data-sys="BIM" ${sys.BIM?'checked':''} /> <span class="badge badge-cyan">BIM</span> Spatial Model (IFC)</label>
            <label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" class="cfg-sys-toggle" data-sys="OCCUPANCY" ${sys.OCCUPANCY?'checked':''} /> <span class="badge badge-green">OCC</span> CCTV Occupancy Vision</label>
          </div>
        </div>

        <div class="cfg-field-row">
          <div>
            <div class="cfg-label">Network Packet Loss (${h.packetLossPct}%)</div>
            <div class="cfg-desc">Simulates dropped sensor telemetry frames across building network.</div>
          </div>
          <input type="range" id="cfg-loss-slider" min="0" max="20" value="${h.packetLossPct}" class="cfg-slider" />
        </div>

        <div class="cfg-field-row">
          <div>
            <div class="cfg-label">Communication Lag (${h.messageDelayMs}ms)</div>
            <div class="cfg-desc">Artificial edge gateway transit delay.</div>
          </div>
          <input type="range" id="cfg-delay-slider" min="0" max="500" step="50" value="${h.messageDelayMs}" class="cfg-slider" />
        </div>
      </div>
    `;
  }

  _renderHazardTab(c) {
    const t = c.sensors.customThresholds || { tempWarning: 38, tempCritical: 60, smokeWarning: 0.15, smokeCritical: 0.50 };
    return `
      <div class="cfg-section">
        <div class="cfg-sec-title">HAZARD THRESHOLDS &amp; PROPAGATION PHYSICS</div>

        <div class="cfg-field-row">
          <div>
            <div class="cfg-label">Temperature Warning Threshold (${t.tempWarning}°C)</div>
            <div class="cfg-desc">Triggers WARNING state in space node.</div>
          </div>
          <input type="number" id="cfg-temp-warn" class="cfg-input" value="${t.tempWarning}" min="30" max="60" />
        </div>

        <div class="cfg-field-row">
          <div>
            <div class="cfg-label">Temperature Critical Threshold (${t.tempCritical}°C)</div>
            <div class="cfg-desc">Triggers CRITICAL state and rerouting.</div>
          </div>
          <input type="number" id="cfg-temp-crit" class="cfg-input" value="${t.tempCritical}" min="50" max="90" />
        </div>

        <div class="cfg-field-row">
          <div>
            <div class="cfg-label">Smoke Warning Threshold (${t.smokeWarning} AQI)</div>
            <div class="cfg-desc">Warning state for smoke density.</div>
          </div>
          <input type="number" id="cfg-smoke-warn" class="cfg-input" value="${t.smokeWarning}" step="0.05" min="0.05" max="0.4" />
        </div>

        <div class="cfg-field-row">
          <div>
            <div class="cfg-label">Smoke Critical Threshold (${t.smokeCritical} AQI)</div>
            <div class="cfg-desc">Critical threshold triggering evacuation.</div>
          </div>
          <input type="number" id="cfg-smoke-crit" class="cfg-input" value="${t.smokeCritical}" step="0.05" min="0.3" max="0.9" />
        </div>
      </div>
    `;
  }

  _renderVisualTab(c) {
    const v = c.visualization;
    return `
      <div class="cfg-section">
        <div class="cfg-sec-title">2D FLOOR PLAN VISUALIZATION &amp; LAYERS</div>

        <div class="card">
          <div class="card-title">Active Render Layers</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" class="cfg-vis-toggle" data-layer="showSensors" ${v.showSensors?'checked':''} /> IoT Sensor Markers</label>
            <label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" class="cfg-vis-toggle" data-layer="showOccupants" ${v.showOccupants?'checked':''} /> 50 Occupants</label>
            <label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" class="cfg-vis-toggle" data-layer="showRoutes" ${v.showRoutes?'checked':''} /> Dynamic Egress Routes</label>
            <label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" class="cfg-vis-toggle" data-layer="showHazardHeatmap" ${v.showHazardHeatmap?'checked':''} /> Hazard Glow Overlays</label>
            <label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" class="cfg-vis-toggle" data-layer="showGraph" ${v.showGraph?'checked':''} /> Topological Navigation Graph</label>
          </div>
        </div>

        <div class="cfg-field-row">
          <div>
            <div class="cfg-label">Floor Plan Zoom Level (${v.zoomLevel}%)</div>
            <div class="cfg-desc">SVG canvas scale factor.</div>
          </div>
          <input type="range" id="cfg-zoom-slider" min="50" max="200" step="10" value="${v.zoomLevel}" class="cfg-slider" />
        </div>
      </div>
    `;
  }

  _bindEvents(c, isLocked) {
    const overlay = document.getElementById('cfg-overlay');
    const btnClose = document.getElementById('btn-cfg-close');
    const btnApply = document.getElementById('btn-cfg-apply');
    const btnReset = document.getElementById('btn-cfg-reset');
    const btnExport = document.getElementById('btn-cfg-export');
    const btnImport = document.getElementById('btn-cfg-import-trigger');
    const fileImport = document.getElementById('cfg-import-file');

    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) this.hide();
    });
    btnClose?.addEventListener('click', () => this.hide());
    btnApply?.addEventListener('click', () => {
      this._saveCurrentInputs();
      this.hide();
    });

    // Tab Navigation
    this.modalEl.querySelectorAll('.cfg-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab;
        this.render();
      });
    });

    // Preset Buttons
    this.modalEl.querySelectorAll('.preset-buttons button').forEach(btn => {
      btn.addEventListener('click', () => {
        const presetKey = btn.dataset.preset;
        this.configManager.loadPreset(presetKey);
        this.render();
      });
    });

    // Reset
    btnReset?.addEventListener('click', () => {
      this.configManager.resetToDefault();
      this.render();
    });

    // Dynamic Occupants Slider & Chips
    const occSlider = document.getElementById('cfg-occ-slider');
    const occDisplay = document.getElementById('cfg-occ-count-display');
    occSlider?.addEventListener('input', (e) => {
      if (occDisplay) occDisplay.textContent = e.target.value;
      this.modalEl.querySelectorAll('.cfg-occ-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.count === e.target.value);
      });
    });

    this.modalEl.querySelectorAll('.cfg-occ-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const val = chip.dataset.count;
        if (occSlider) occSlider.value = val;
        if (occDisplay) occDisplay.textContent = val;
        this.modalEl.querySelectorAll('.cfg-occ-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
    });

    // Export
    btnExport?.addEventListener('click', () => {
      const json = this.configManager.exportJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `digital_twin_config_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Import
    btnImport?.addEventListener('click', () => fileImport?.click());
    fileImport?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const res = this.configManager.importJSON(event.target.result);
        if (res.success) {
          alert('Configuration imported successfully!');
          this.render();
        } else {
          alert(`Import failed: ${res.reason}`);
        }
      };
      reader.readAsText(file);
    });

    // Load Semantic Memory Table
    if (this.activeTab === 'SEMANTIC' && this.aiService) {
      this.aiService.getSemanticMemory().then(res => {
        const box = document.getElementById('cfg-memory-table-box');
        if (!box) return;
        const items = res.items || [];
        if (!items.length) {
          box.innerHTML = `<div style="text-align:center;padding:12px;color:var(--text-muted);font-size:10px;">Semantic Memory is currently empty. Run experiments or telemetry to populate.</div>`;
          return;
        }
        box.innerHTML = `
          <table class="cfg-table" style="font-size:8.5px;">
            <thead>
              <tr>
                <th>Source Feed</th>
                <th>Canonical Target</th>
                <th>Confidence</th>
                <th>Status</th>
                <th>Provenance</th>
                <th>Hits</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(m => `
                <tr>
                  <td><strong>${m.source_system}</strong> "${m.source_entity}"</td>
                  <td style="color:var(--accent-green);font-weight:700;">${m.target_entity}</td>
                  <td>${(m.confidence*100).toFixed(0)}%</td>
                  <td><span class="badge ${m.status==='learned'?'badge-purple':'badge-blue'}">${m.status==='learned'?'✓ Learned':'Validated'}</span></td>
                  <td style="color:var(--text-muted);">${m.provenance}</td>
                  <td style="color:var(--accent-cyan);font-weight:700;">${m.hits || 1}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      });
    }

    // Clear Semantic Memory
    const btnClearMem = document.getElementById('btn-cfg-clear-memory');
    btnClearMem?.addEventListener('click', async () => {
      if (this.aiService) {
        await this.aiService.clearSemanticMemory();
        this.render();
      }
    });

    // Switch Building Handler
    const btnSwitchBld = document.getElementById('btn-cfg-switch-building');
    btnSwitchBld?.addEventListener('click', async () => {
      const bKey = document.getElementById('cfg-building-switch-select')?.value || 'BUILDING_A';
      if (this.aiService) {
        const res = await this.aiService.switchBuilding(bKey);
        alert(`Switched active building to: ${res.activeBuilding} (${res.version}). ${res.invalidatedMemoryItems || 0} stale memory items cleared.`);
        this.render();
      }
    });

    // Add Space Button
    const btnAddSpace = document.getElementById('btn-cfg-add-space');
    btnAddSpace?.addEventListener('click', () => {
      const tbody = document.getElementById('cfg-spaces-tbody');
      if (!tbody) return;
      const newId = `ROOM_${Date.now().toString().slice(-3)}`;
      const tr = document.createElement('tr');
      tr.dataset.spaceId = newId;
      tr.innerHTML = `
        <td><input type="text" class="cfg-input-mini cfg-space-id" value="${newId}" style="width:90px;font-family:var(--font-mono);font-weight:700;color:var(--accent-cyan);" /></td>
        <td><input type="text" class="cfg-input-mini cfg-space-name" value="New Academic Laboratory" style="width:180px;" /></td>
        <td>
          <select class="cfg-input-mini cfg-space-type">
            <option value="LABORATORY" selected>LABORATORY</option>
            <option value="CLASSROOM">CLASSROOM</option>
            <option value="OFFICE">OFFICE</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </td>
        <td><input type="number" class="cfg-input-mini cfg-space-floor" value="1" style="width:40px;" /></td>
        <td><input type="text" class="cfg-input-mini cfg-space-aliases" value="New Lab, Research Room" style="width:100%;" /></td>
        <td>
          <button class="btn-del-space" data-id="${newId}" style="background:none;border:none;color:var(--accent-red);cursor:pointer;font-size:12px;">🗑</button>
        </td>
      `;
      tbody.appendChild(tr);
      tr.querySelector('.btn-del-space')?.addEventListener('click', () => tr.remove());
    });

    // Delete Space Row
    this.modalEl.querySelectorAll('.btn-del-space').forEach(btn => {
      btn.addEventListener('click', (e) => {
        btn.closest('tr')?.remove();
      });
    });

    // Save Building Model
    const btnSaveBld = document.getElementById('btn-cfg-save-building');
    btnSaveBld?.addEventListener('click', async () => {
      const rows = this.modalEl.querySelectorAll('#cfg-spaces-tbody tr');
      const newSpaces = [];
      rows.forEach(tr => {
        const id = tr.querySelector('.cfg-space-id')?.value.trim();
        const name = tr.querySelector('.cfg-space-name')?.value.trim();
        const type = tr.querySelector('.cfg-space-type')?.value;
        const floor = parseInt(tr.querySelector('.cfg-space-floor')?.value || '1', 10);
        const aliasesRaw = tr.querySelector('.cfg-space-aliases')?.value || '';
        const aliases = aliasesRaw.split(',').map(a => a.trim()).filter(Boolean);

        if (id && name) {
          newSpaces.push({
            id,
            name,
            type: type || 'CLASSROOM',
            floor: isNaN(floor) ? 1 : floor,
            aliases,
            description: `${name} located on Floor ${floor}`,
            attributes: { temperature: { type: 'number' }, smoke: { type: 'number' }, occupancy: { type: 'number' } },
            connections: ['CORRIDOR_MAIN'],
          });
        }
      });

      if (this.aiService) {
        const res = await this.aiService.updateBuildingModel(newSpaces);
        alert(`Building model updated successfully to ${res.version}! ${res.invalidatedMemoryItems || 0} stale cache entries invalidated.`);
        this.render();
      }
    });

    // PART 16: 12 Research Experiments Handler
    const btnExp = document.getElementById('btn-cfg-run-experiment');
    btnExp?.addEventListener('click', async () => {
      const expType = document.getElementById('cfg-demo-experiment-select')?.value || 'TEST_1';
      const expBox = document.getElementById('cfg-experiment-result-box');
      if (!expBox) return;
      expBox.style.display = 'block';
      expBox.innerHTML = `<span style="color:var(--accent-purple)">⚡ Executing Live Experiment against Gemini AI API...</span>`;

      let reqPayload = {};
      let expTitle = '';

      switch (expType) {
        case 'TEST_1':
          expTitle = '1. Unseen Identifier Resolution';
          reqPayload = { source_system: 'BMS', source_entity: 'NEXUS-AI-01', description: 'advanced artificial intelligence and machine learning research laboratory', attributes: ['temperature'], force_refresh: true };
          break;
        case 'TEST_2':
          expTitle = '2. Unseen Synonym Disambiguation';
          reqPayload = { source_system: 'BMS', source_entity: 'DISTRIB-SYS-LAB', description: 'distributed systems and computer networking research facility', attributes: ['temperature'], force_refresh: true };
          break;
        case 'TEST_3':
          expTitle = '3. Hardware Lab Abbreviation';
          reqPayload = { source_system: 'FAS', source_entity: 'HW-IOT-BAY', description: 'embedded microcontrollers and IoT prototyping workshop', attributes: ['smoke_density'], force_refresh: true };
          break;
        case 'TEST_4':
          expTitle = '4. Unseen Schema Interpretation (Custom JSON Structure)';
          reqPayload = { origin: 'BMS', node: 'NEXUS-AI-01', thermal_reading: 61.4, people_present: 23, description: 'Advanced AI Lab', force_refresh: true };
          break;
        case 'TEST_5':
          expTitle = '5. Attribute Semantic Translation';
          reqPayload = { source_system: 'BMS', source_entity: 'ROOM_101', description: 'Room 101 AI lab', attributes: ['thermal_reading', 'smoke_density', 'people_present'], force_refresh: true };
          break;
        case 'TEST_6':
          expTitle = '6. Cross-System 4-Feed Multi-Source Unification';
          reqPayload = { source_system: 'BIM', source_entity: 'IfcSpace_0037', description: 'IfcSpace architectural room object for AI research classroom', attributes: ['bim_space_type'], force_refresh: true };
          break;
        case 'TEST_7':
          expTitle = '7. Unknown Entity Rejection by Safety Firewall';
          reqPayload = { source_system: 'BMS', source_entity: 'ZONE_X73', description: 'unmapped external parking annex sensor', attributes: ['temperature'], force_refresh: true };
          break;
        case 'TEST_8':
          expTitle = '8. Ambiguous Entity Detection & Margin Flagging';
          reqPayload = { source_system: 'BMS', source_entity: 'HOD-CABIN', description: 'HOD office cabin room on floor 1', attributes: ['temperature'], force_refresh: true };
          break;
        case 'TEST_9':
          expTitle = '9. Dynamic Building ID Adaptation (Custom Canonical LAB_X17)';
          reqPayload = {
            source_system: 'BMS',
            source_entity: 'NEXUS-AI-01',
            description: 'advanced artificial intelligence research laboratory',
            canonical_entities: [
              { id: 'LAB_X17', name: 'Artificial Intelligence Laboratory', type: 'laboratory', description: 'AI & Robotics research room', floor: 1, aliases: [] }
            ],
            force_refresh: true
          };
          break;
        case 'TEST_10':
          expTitle = '10. Dynamic Room Renaming (ROOM_101 ➔ "Robotics & Cybernetics Wing")';
          reqPayload = {
            source_system: 'BMS',
            source_entity: 'CYBER-ROBOTICS-LAB',
            description: 'cybernetics research center',
            canonical_entities: [
              { id: 'ROOM_101', name: 'Robotics & Cybernetics Wing', type: 'laboratory', description: 'Advanced robotics and cybernetics center', floor: 1, aliases: [] }
            ],
            force_refresh: true
          };
          break;
        case 'TEST_11':
          expTitle = '11. New Room Generalization (Added "BIO_RESEARCH_LAB")';
          reqPayload = {
            source_system: 'BMS',
            source_entity: 'GENE-EDIT-LAB',
            description: 'Biotechnology and genomic research laboratory',
            canonical_entities: [
              ...CANONICAL_ENTITIES,
              { id: 'BIO_RESEARCH_LAB', name: 'Biotechnology & Genomics Research Lab', type: 'LABORATORY', description: 'Genomics and bioengineering lab', floor: 1, aliases: ['Bio Lab'] }
            ],
            force_refresh: true
          };
          break;
        case 'TEST_12':
          expTitle = '12. Removed Room Resilience (Deleted ROOM_103)';
          reqPayload = {
            source_system: 'BMS',
            source_entity: 'IOT-SENSOR-HUB',
            description: 'Hardware lab sensor hub',
            canonical_entities: CANONICAL_ENTITIES.filter(s => s.id !== 'ROOM_103'),
            force_refresh: true
          };
          break;
      }

      try {
        const res = await fetch('/api/semantic/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqPayload)
        });
        const data = await res.json();
        const m = data.mapping || {};
        const v = data.validation || {};
        const isPassed = v.valid;

        expBox.innerHTML = `
          <div style="border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:4px;margin-bottom:6px;display:flex;justify-content:space-between;">
            <span style="color:var(--accent-purple);font-weight:700;">${expTitle}</span>
            <span class="badge badge-purple">${m.model || data.source} (${m.latency_ms || 0}ms)</span>
          </div>

          <div style="margin-bottom:4px;">
            <span style="color:var(--text-muted)">Input:</span>
            <strong>${reqPayload.source_system || reqPayload.origin || 'BMS'} "${reqPayload.source_entity || reqPayload.node || 'TELEMETRY'}"</strong>
            <span style="color:var(--text-secondary);font-size:9px;">("${reqPayload.description || ''}")</span>
          </div>

          <div style="margin-bottom:4px;">
            <span style="color:var(--text-muted)">Target Resolved:</span>
            <span style="color:${isPassed?'var(--accent-green)':'var(--accent-red)'};font-weight:700;font-size:12px;">
              ${m.target_entity || 'UNKNOWN'}
            </span>
            <span style="color:var(--accent-cyan);margin-left:6px;">(${(m.entity_confidence*100).toFixed(1)}% Confidence)</span>
          </div>

          ${Array.isArray(m.attribute_mappings) && m.attribute_mappings.length > 0 ? `
            <div style="margin-bottom:4px;">
              <span style="color:var(--text-muted)">Attributes Mapped: </span>
              ${m.attribute_mappings.map(a => `<span style="color:var(--accent-yellow);background:rgba(255,255,255,0.05);padding:1px 4px;border-radius:2px;margin-right:4px;">${a.source} ➔ <strong>${a.target}</strong></span>`).join('')}
            </div>
          ` : ''}

          <div style="margin-bottom:6px;color:#cbd5e1;">
            <span style="color:var(--accent-yellow)">💡 AI Reasoning Trace: </span>${m.reason || 'Semantic match'}
          </div>

          <div style="padding:4px 8px;border-radius:4px;background:${isPassed?'rgba(34,197,94,0.15)':'rgba(239,68,68,0.15)'};border:1px solid ${isPassed?'var(--accent-green)':'var(--accent-red)'};">
            <span style="color:${isPassed?'var(--accent-green)':'var(--accent-red)'};font-weight:700;">
              ${isPassed ? '✓ 9-POINT SAFETY FIREWALL: PASSED' : '🚫 9-POINT SAFETY FIREWALL: HELD / REJECTED'}
            </span>
            <div style="color:var(--text-secondary);font-size:9px;margin-top:2px;">
              ${v.reason || 'Safety verification executed against canonical schema.'}
            </div>
          </div>
        `;
      } catch (err) {
        expBox.innerHTML = `<span style="color:var(--accent-red)">Experiment failed: ${err.message}</span>`;
      }
    });

    // Custom Interactive Sandbox & Human Learning Test Button
    const btnTest = document.getElementById('btn-cfg-test-resolve');
    btnTest?.addEventListener('click', async () => {
      const sys = document.getElementById('cfg-test-sys')?.value || 'BMS';
      const id = document.getElementById('cfg-test-id')?.value || 'NEXUS-AI-01';
      const desc = document.getElementById('cfg-test-desc')?.value || '';
      const rawAttrs = document.getElementById('cfg-test-attrs')?.value || '';
      const attrs = rawAttrs.split(',').map(s => s.trim()).filter(Boolean);
      const resultBox = document.getElementById('cfg-test-result-box');

      if (!resultBox) return;
      resultBox.style.display = 'block';
      resultBox.innerHTML = `<span style="color:var(--accent-cyan)">🤖 Querying Gemini AI Semantic Service...</span>`;

      try {
        const res = await fetch('/api/semantic/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_system: sys,
            source_entity: id,
            description: desc,
            attributes: attrs,
            canonical_entities: canonicalRegistryInstance.getActiveSpaces(),
            force_refresh: true,
          })
        });

        const data = await res.json();
        const m = data.mapping || {};
        const v = data.validation || {};
        const isValid = v.valid;
        const isAmbiguous = v.status === 'AMBIGUOUS' || (m.alternatives && m.alternatives.length > 0);

        resultBox.innerHTML = `
          <div style="display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:4px;margin-bottom:6px;">
            <span style="color:var(--accent-cyan);font-weight:700;">GEMINI AI RESOLUTION RESULT</span>
            <span class="badge ${data.source==='GEMINI_AI'?'badge-purple':'badge-blue'}">${m.model || data.source} (${m.latency_ms || 0}ms)</span>
          </div>

          <div style="margin-bottom:4px;">
            <span style="color:var(--text-muted)">Source: </span>
            <strong>${sys} "${id}"</strong> ➔
            <span style="color:${isValid?'var(--accent-green)':'var(--accent-red)'};font-weight:700;font-size:12px;">
              ${m.target_entity || 'UNKNOWN'}
            </span>
            <span style="color:var(--accent-cyan);margin-left:6px;">(${(m.entity_confidence*100).toFixed(1)}% Confidence)</span>
          </div>

          ${Array.isArray(m.attribute_mappings) && m.attribute_mappings.length > 0 ? `
            <div style="margin-bottom:4px;">
              <span style="color:var(--text-muted)">Attributes: </span>
              ${m.attribute_mappings.map(a => `<span style="color:var(--accent-yellow);background:rgba(255,255,255,0.05);padding:1px 4px;border-radius:2px;margin-right:4px;">${a.source} ➔ <strong>${a.target}</strong></span>`).join('')}
            </div>
          ` : ''}

          ${Array.isArray(m.alternatives) && m.alternatives.length > 0 ? `
            <div style="margin-bottom:4px;color:var(--text-muted);">
              <span>Alternative Candidates: </span>
              ${m.alternatives.map(a => `<span style="color:#fff;background:rgba(255,255,255,0.05);padding:1px 4px;border-radius:2px;margin-right:4px;">${a.entity} (${(a.confidence*100).toFixed(0)}%)</span>`).join('')}
            </div>
          ` : ''}

          <div style="margin-bottom:6px;color:#cbd5e1;">
            <span style="color:var(--accent-yellow)">💡 Reasoning Trace: </span>${m.reason || 'Semantic match'}
          </div>

          <div style="padding:4px 8px;border-radius:4px;background:${isValid?'rgba(34,197,94,0.15)':'rgba(239,68,68,0.15)'};border:1px solid ${isValid?'var(--accent-green)':'var(--accent-red)'};">
            <span style="color:${isValid?'var(--accent-green)':'var(--accent-red)'};font-weight:700;">
              ${isValid ? '✓ SAFETY FIREWALL PASSED' : '🚫 SAFETY FIREWALL HELD / REJECTED'}
            </span>
            <div style="color:var(--text-secondary);font-size:9px;margin-top:2px;">
              ${v.reason || 'Verified against canonical Digital Twin schema.'}
            </div>
          </div>

          <!-- Human in the loop action controls -->
          <div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.08);display:flex;gap:6px;justify-content:flex-end;">
            <button class="btn btn-speed" id="btn-learn-accept-top" style="color:var(--accent-green);font-size:9px;">
              ✓ Learn "${m.target_entity || 'Target'}" Decision
            </button>
            ${Array.isArray(m.alternatives) && m.alternatives.length > 0 ? `
              <button class="btn btn-speed" id="btn-learn-accept-alt" style="color:var(--accent-yellow);font-size:9px;">
                ✓ Override to "${m.alternatives[0].entity}"
              </button>
            ` : ''}
          </div>
        `;

        document.getElementById('btn-learn-accept-top')?.addEventListener('click', async () => {
          if (this.aiService) {
            await this.aiService.learnHumanDecision({
              source_system: sys,
              source_entity: id,
              target_entity: m.target_entity,
              confidence: 0.99,
              human_decision: 'HUMAN_CONFIRMED',
            });
            alert(`Stored learned mapping in Semantic Memory: ${sys} "${id}" ➔ ${m.target_entity}`);
          }
        });

        document.getElementById('btn-learn-accept-alt')?.addEventListener('click', async () => {
          if (this.aiService && m.alternatives?.[0]) {
            await this.aiService.learnHumanDecision({
              source_system: sys,
              source_entity: id,
              target_entity: m.alternatives[0].entity,
              confidence: 0.99,
              human_decision: 'HUMAN_OVERRIDE',
            });
            alert(`Stored human override in Semantic Memory: ${sys} "${id}" ➔ ${m.alternatives[0].entity}`);
          }
        });
      } catch (err) {
        resultBox.innerHTML = `<span style="color:var(--accent-red)">Error: ${err.message}</span>`;
      }
    });
  }

  _saveCurrentInputs() {
    const patch = {};

    // Simulation
    const simSpeed = parseFloat(document.getElementById('cfg-sim-speed')?.value);
    const presSpeed = document.getElementById('cfg-pres-speed')?.value;
    const presMode = document.getElementById('cfg-pres-mode')?.value;
    const autoPause = document.getElementById('cfg-auto-pause')?.checked;
    if (!isNaN(simSpeed)) {
      patch.simulation = {
        simSpeed,
        presSpeed: presSpeed || 'SLOW',
        presMode: presMode || 'DEMO',
        autoPauseOnMilestones: !!autoPause,
      };
    }

    // Scenario
    const scenType = document.getElementById('cfg-scen-type')?.value;
    const fireTime = parseFloat(document.getElementById('cfg-fire-time')?.value);
    const fireSev  = document.getElementById('cfg-fire-sev')?.value;
    const fireSpread = document.getElementById('cfg-fire-spread')?.checked;
    const checkedFireRooms = Array.from(this.modalEl.querySelectorAll('.cfg-fire-room-cb:checked')).map(cb => cb.value);
    const fireRoom = checkedFireRooms[0] || document.getElementById('cfg-fire-room')?.value || 'ROOM_101';
    const fireRooms = checkedFireRooms.length > 0 ? checkedFireRooms : [fireRoom];

    patch.scenario = {
      type: scenType || 'FIRE',
      fireRoom,
      fireRooms,
      fireStartSeconds: isNaN(fireTime) ? 10 : fireTime,
      fireSeverity: fireSev || 'HIGH',
      fireSpread: !!fireSpread,
    };

    // Occupants
    const occCount = parseInt(document.getElementById('cfg-occ-slider')?.value || document.getElementById('cfg-occ-count')?.value, 10);
    const reactDelay = parseFloat(document.getElementById('cfg-react-slider')?.value);
    const speedMult = parseFloat(document.getElementById('cfg-speed-slider')?.value);
    const speedVar = parseFloat(document.getElementById('cfg-var-slider')?.value);
    if (!isNaN(occCount)) {
      patch.occupants = {
        count: occCount,
        reactionDelaySeconds: isNaN(reactDelay) ? 1.0 : reactDelay,
        walkingSpeedMultiplier: isNaN(speedMult) ? 1.0 : speedMult,
        speedVariationPct: isNaN(speedVar) ? 15 : speedVar,
      };
    }

    // Routing & Blocked Exits
    const algo = document.getElementById('cfg-route-algo')?.value;
    const strat = document.getElementById('cfg-route-strat')?.value;
    const hazPen = parseFloat(document.getElementById('cfg-haz-penalty')?.value);
    const smokePen = parseFloat(document.getElementById('cfg-smoke-penalty')?.value);
    const liftAllow = document.getElementById('cfg-lift-allow')?.checked;
    if (algo || strat) {
      patch.routing = {
        algorithm: algo || 'DIJKSTRA',
        strategy: strat || 'SAFEST',
        hazardPenalty: isNaN(hazPen) ? 1000 : hazPen,
        smokePenalty: isNaN(smokePen) ? 20 : smokePen,
        allowLiftDuringEmergency: !!liftAllow,
      };
    }

    const exitToggles = this.modalEl.querySelectorAll('.cfg-exit-block-toggle');
    if (exitToggles.length > 0) {
      const blockedExits = {};
      exitToggles.forEach(t => {
        blockedExits[t.dataset.exit] = t.checked;
      });
      patch.building = { ...(patch.building || {}), blockedExits };
    }

    // Semantic
    const confVal = parseFloat(document.getElementById('cfg-conf-slider')?.value);
    const ambVal  = parseFloat(document.getElementById('cfg-amb-slider')?.value);
    const semMode = document.getElementById('cfg-sem-mode')?.value;
    if (!isNaN(confVal)) {
      patch.semantic = {
        confidenceThreshold: +(confVal / 100).toFixed(2),
        ambiguityMargin: isNaN(ambVal) ? 0.05 : +(ambVal / 100).toFixed(2),
        validationEnabled: true,
        mode: semMode || 'AI_GEMINI',
      };
    }

    this.configManager.set(patch);
  }
}
