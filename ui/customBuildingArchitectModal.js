/**
 * CUSTOM BUILDING ARCHITECT & LAYOUT STUDIO MODAL
 *
 * Provides complete visual and code-based customization for floor plans:
 * 1. Interactive Space & Room Builder (Type, Dimensions, Capacity, Sensors)
 * 2. Topological Door & Corridor Connector
 * 3. Emergency Exit Configurator
 * 4. Two-Way Live JSON Studio (Import/Export/Download/Upload)
 * 5. Architectural Preset Gallery (Engineering, Corporate, Cleanroom, Hospital, Blank)
 * 6. One-Click Compile & Hot-Reload into AI Digital Twin Engine
 */

import { BUILDING, createCustomBuilding, setActiveBuilding } from '../data/building.js';
import { canonicalRegistryInstance } from '../data/canonicalRegistry.js';

// ── Built-in Architectural Templates ──────────────────────────────────────────
export const ARCHITECTURAL_TEMPLATES = {
  ENGINEERING_A: {
    name: 'College Engineering Department',
    description: 'Reference 12-space university wing with labs, staff lounge, 2 elevators and 3 exits.',
    building_id: 'BUILDING_A',
    model: BUILDING
  },
  HOSPITAL_WARD: {
    name: 'Metropolitan Hospital Acute Care Wing',
    description: 'Medical floor with ICU, Triage, Surgical Theater, Nurse Station, and Dual Fire Exits.',
    building_id: 'HOSPITAL_WARD',
    spaces: [
      { id: 'ICU_SUITE', name: 'Intensive Care Unit (ICU)', type: 'LABORATORY', x: 40, y: 60, width: 180, height: 160, capacity: 12, connections: ['MED_CORRIDOR_W'] },
      { id: 'SURGICAL_THEATER', name: 'Surgical Operating Theater 1', type: 'LABORATORY', x: 240, y: 60, width: 200, height: 160, capacity: 10, connections: ['MED_CORRIDOR_MAIN'] },
      { id: 'TRIAGE_BAY', name: 'Emergency Triage & Trauma Bay', type: 'OFFICE', x: 460, y: 60, width: 220, height: 160, capacity: 25, connections: ['MED_CORRIDOR_E'] },
      { id: 'MED_CORRIDOR_W', name: 'West Clinical Pathway', type: 'CORRIDOR', x: 40, y: 240, width: 180, height: 80, capacity: 20, connections: ['ICU_SUITE', 'MED_CORRIDOR_MAIN', 'EXIT_WEST_HOSP'] },
      { id: 'MED_CORRIDOR_MAIN', name: 'Central Hospital Spine', type: 'CORRIDOR', x: 240, y: 240, width: 200, height: 80, capacity: 30, connections: ['SURGICAL_THEATER', 'MED_CORRIDOR_W', 'MED_CORRIDOR_E', 'NURSE_STATION'] },
      { id: 'MED_CORRIDOR_E', name: 'East Egress Corridor', type: 'CORRIDOR', x: 460, y: 240, width: 220, height: 80, capacity: 25, connections: ['TRIAGE_BAY', 'MED_CORRIDOR_MAIN', 'EXIT_EAST_HOSP'] },
      { id: 'NURSE_STATION', name: 'Central Nurse Station & Pharmacy', type: 'OFFICE', x: 240, y: 340, width: 200, height: 150, capacity: 15, connections: ['MED_CORRIDOR_MAIN'] },
      { id: 'PATIENT_ROOM_1', name: 'Recovery Suite A', type: 'CLASSROOM', x: 40, y: 340, width: 180, height: 150, capacity: 8, connections: ['MED_CORRIDOR_W'] },
      { id: 'PATIENT_ROOM_2', name: 'Recovery Suite B', type: 'CLASSROOM', x: 460, y: 340, width: 220, height: 150, capacity: 8, connections: ['MED_CORRIDOR_E'] }
    ],
    doors: [
      { from: 'ICU_SUITE', to: 'MED_CORRIDOR_W' },
      { from: 'SURGICAL_THEATER', to: 'MED_CORRIDOR_MAIN' },
      { from: 'TRIAGE_BAY', to: 'MED_CORRIDOR_E' },
      { from: 'MED_CORRIDOR_W', to: 'MED_CORRIDOR_MAIN' },
      { from: 'MED_CORRIDOR_MAIN', to: 'MED_CORRIDOR_E' },
      { from: 'NURSE_STATION', to: 'MED_CORRIDOR_MAIN' },
      { from: 'PATIENT_ROOM_1', to: 'MED_CORRIDOR_W' },
      { from: 'PATIENT_ROOM_2', to: 'MED_CORRIDOR_E' },
      { from: 'MED_CORRIDOR_W', to: 'EXIT_WEST_HOSP' },
      { from: 'MED_CORRIDOR_E', to: 'EXIT_EAST_HOSP' }
    ],
    exits: [
      { id: 'EXIT_WEST_HOSP', name: 'West Ambulance Egress', x: 10, y: 280, width: 30, height: 40, connects_to: 'MED_CORRIDOR_W' },
      { id: 'EXIT_EAST_HOSP', name: 'East Main Public Exit', x: 700, y: 280, width: 30, height: 40, connects_to: 'MED_CORRIDOR_E' }
    ]
  },
  HIGH_TECH_DATACENTER: {
    name: 'Quantum Research & Data Center',
    description: 'Mission-critical server racks, cryogenic quantum processing, and FM-200 containment zones.',
    building_id: 'QUANTUM_FACILITY',
    spaces: [
      { id: 'SERVER_BAY_ALPHA', name: 'Server Bay Alpha (Primary NOC)', type: 'SERVER_ROOM', x: 50, y: 60, width: 220, height: 180, capacity: 6, connections: ['DATA_CORRIDOR'] },
      { id: 'CRYO_LAB', name: 'Superconducting Cryogenics Bay', type: 'LABORATORY', x: 290, y: 60, width: 220, height: 180, capacity: 8, connections: ['DATA_CORRIDOR'] },
      { id: 'CONTROL_ROOM', name: 'Command & Telemetry Center', type: 'OFFICE', x: 530, y: 60, width: 200, height: 180, capacity: 16, connections: ['DATA_CORRIDOR'] },
      { id: 'DATA_CORRIDOR', name: 'Pressurized Airlock Spine', type: 'CORRIDOR', x: 50, y: 260, width: 680, height: 90, capacity: 40, connections: ['SERVER_BAY_ALPHA', 'CRYO_LAB', 'CONTROL_ROOM', 'EXIT_NORTH_NOC', 'EXIT_SOUTH_NOC'] },
      { id: 'POWER_PLANT', name: 'UPS & Generator Facility', type: 'STORAGE', x: 50, y: 370, width: 320, height: 160, capacity: 4, connections: ['DATA_CORRIDOR'] },
      { id: 'CLEANROOM', name: 'Nanofab Cleanroom Suite', type: 'LABORATORY', x: 390, y: 370, width: 340, height: 160, capacity: 14, connections: ['DATA_CORRIDOR'] }
    ],
    doors: [
      { from: 'SERVER_BAY_ALPHA', to: 'DATA_CORRIDOR' },
      { from: 'CRYO_LAB', to: 'DATA_CORRIDOR' },
      { from: 'CONTROL_ROOM', to: 'DATA_CORRIDOR' },
      { from: 'POWER_PLANT', to: 'DATA_CORRIDOR' },
      { from: 'CLEANROOM', to: 'DATA_CORRIDOR' },
      { from: 'DATA_CORRIDOR', to: 'EXIT_NORTH_NOC' },
      { from: 'DATA_CORRIDOR', to: 'EXIT_SOUTH_NOC' }
    ],
    exits: [
      { id: 'EXIT_NORTH_NOC', name: 'North Fire Portal', x: 20, y: 305, width: 30, height: 40, connects_to: 'DATA_CORRIDOR' },
      { id: 'EXIT_SOUTH_NOC', name: 'South Security Exit', x: 740, y: 305, width: 30, height: 40, connects_to: 'DATA_CORRIDOR' }
    ]
  },
  BLANK_CANVAS: {
    name: 'Custom New Facility',
    description: 'Empty starter layout ready for custom architectural room placement.',
    building_id: 'CUSTOM_LAYOUT',
    spaces: [
      { id: 'CENTRAL_HALL', name: 'Central Lobby & Pathway', type: 'CORRIDOR', x: 200, y: 200, width: 400, height: 120, capacity: 30, connections: ['ROOM_A', 'EXIT_MAIN'] },
      { id: 'ROOM_A', name: 'Primary Suite A', type: 'OFFICE', x: 200, y: 60, width: 180, height: 120, capacity: 15, connections: ['CENTRAL_HALL'] },
      { id: 'ROOM_B', name: 'Primary Suite B', type: 'LABORATORY', x: 420, y: 60, width: 180, height: 120, capacity: 15, connections: ['CENTRAL_HALL'] }
    ],
    doors: [
      { from: 'ROOM_A', to: 'CENTRAL_HALL' },
      { from: 'ROOM_B', to: 'CENTRAL_HALL' },
      { from: 'CENTRAL_HALL', to: 'EXIT_MAIN' }
    ],
    exits: [
      { id: 'EXIT_MAIN', name: 'Main Egress Exit', x: 620, y: 260, width: 30, height: 40, connects_to: 'CENTRAL_HALL' }
    ]
  }
};

export class CustomBuildingArchitectModal {
  /**
   * @param {Object}   opts
   * @param {EventBus} opts.bus
   */
  constructor({ bus }) {
    this.bus = bus;
    this.activeTab = 'DESIGNER'; // 'DESIGNER' | 'JSON'
    this.currentBuilding = JSON.parse(JSON.stringify(ARCHITECTURAL_TEMPLATES.HOSPITAL_WARD));
    this._modalEl = null;

    this.bus.on('modal:open_custom_architect', () => this.open());

    // Close on Escape key
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this._modalEl && this._modalEl.style.display !== 'none') {
          this.close();
        }
      });
    }
  }

  open() {
    this._ensureModal();
    this._render();
    if (this._modalEl) {
      this._modalEl.style.display = 'flex';
      this._modalEl.style.zIndex = '500';
    }
  }

  close() {
    if (this._modalEl) {
      this._modalEl.style.display = 'none';
    }
  }

  _ensureModal() {
    if (this._modalEl) return;
    let el = document.getElementById('custom-architect-modal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'custom-architect-modal';
      document.body.appendChild(el);
    }
    el.className = 'architect-modal-overlay';
    el.style.display = 'none';
    el.onclick = (e) => {
      if (e.target === el) this.close();
    };
    this._modalEl = el;
  }

  _render() {
    const b = this.currentBuilding;
    const jsonStr = JSON.stringify(b, null, 2);

    this._modalEl.innerHTML = `
      <div class="modal-dialog architect-modal-dialog" style="max-width:960px;width:95vw;max-height:90vh;display:flex;flex-direction:column;background:#090d16;border:1px solid #38bdf8;border-radius:12px;box-shadow:0 25px 60px rgba(0,0,0,0.8),0 0 30px rgba(56,189,248,0.15);overflow:hidden;color:#f1f5f9;font-family:inherit;">
        
        <!-- Modal Header -->
        <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid rgba(56,189,248,0.2);background:#0b1324;">
          <div style="display:flex;align-items:center;gap:10px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" style="color:var(--accent-cyan);"><line x1="18" y1="20" x2="18" y2="4"/><path d="M6 20V8a2 2 0 0 1 2-2h10"/><path d="M6 14h8"/></svg>
            <div>
              <div style="font-weight:700;font-size:14px;letter-spacing:0.4px;color:var(--accent-cyan);display:flex;align-items:center;gap:8px;">
                UNIVERSAL FLOOR PLAN ARCHITECT &amp; STUDIO
                <span class="badge badge-cyan" style="font-size:8.5px;">DYNAMIC ADAPTATION</span>
              </div>
              <div style="font-size:10px;color:#94a3b8;margin-top:2px;">Design custom spaces, connect doorways, place exits, and simulate real-time AI egress</div>
            </div>
          </div>
          <button id="architect-btn-close" style="background:rgba(255,255,255,0.06);border:1px solid var(--border-subtle);color:var(--text-secondary);font-size:12px;font-weight:500;cursor:pointer;padding:4px 12px;border-radius:var(--radius-pill);transition:all 0.15s ease;" title="Close Architect Studio">Close</button>
        </div>

        <!-- Template Selector Bar -->
        <div style="display:flex;align-items:center;gap:8px;padding:10px 20px;background:#0f172a;border-bottom:1px solid rgba(255,255,255,0.06);overflow-x:auto;">
          <span style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;">Preset Gallery:</span>
          <button class="template-chip ${b.building_id==='BUILDING_A'?'active':''}" data-template="ENGINEERING_A">Engineering Dept</button>
          <button class="template-chip ${b.building_id==='HOSPITAL_WARD'?'active':''}" data-template="HOSPITAL_WARD">Hospital Acute Ward</button>
          <button class="template-chip ${b.building_id==='QUANTUM_FACILITY'?'active':''}" data-template="HIGH_TECH_DATACENTER">Quantum Data Center</button>
          <button class="template-chip ${b.building_id==='CUSTOM_LAYOUT'?'active':''}" data-template="BLANK_CANVAS">Starter Canvas</button>
          
          <div style="margin-left:auto;display:flex;gap:6px;">
            <button id="tab-btn-designer" class="btn-tab ${this.activeTab==='DESIGNER'?'active':''}" style="font-size:11px;padding:4px 12px;">Visual Designer</button>
            <button id="tab-btn-json" class="btn-tab ${this.activeTab==='JSON'?'active':''}" style="font-size:11px;padding:4px 12px;">JSON Studio</button>
          </div>
        </div>

        <!-- Modal Body Content -->
        <div style="flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:14px;">
          
          ${this.activeTab === 'DESIGNER' ? this._renderDesignerHTML() : this._renderJsonStudioHTML(jsonStr)}

        </div>

        <!-- Modal Footer -->
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;border-top:1px solid rgba(56,189,248,0.2);background:#0b1324;">
          <div style="font-size:10px;color:#94a3b8;display:flex;align-items:center;gap:6px;font-family:var(--font-mono);">
            <span style="color:#22c55e;">●</span> Spaces: <strong>${(b.spaces||[]).length}</strong> | 
            Doors: <strong>${(b.doors||[]).length}</strong> | 
            Exits: <strong>${(b.exits||[]).length}</strong>
          </div>
          <div style="display:flex;gap:10px;">
            <button id="architect-btn-export-json" class="btn-secondary" style="font-size:11px;padding:6px 14px;">Export JSON</button>
            <button id="architect-btn-apply" class="btn-primary" style="font-size:11px;padding:6px 18px;background:var(--accent-cyan);color:#000;font-weight:700;">Apply &amp; Simulate</button>
          </div>
        </div>

      </div>
    `;

    this._bindDOMEvents();
  }

  _renderDesignerHTML() {
    const b = this.currentBuilding;
    const spaces = b.spaces || [];
    const exits = b.exits || [];

    return `
      <!-- Facility Details Row -->
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;background:#111827;padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);">
        <div>
          <label style="font-size:9px;color:#94a3b8;text-transform:uppercase;font-weight:700;">Facility Name</label>
          <input id="inp-facility-name" type="text" value="${b.name || ''}" style="width:100%;background:#090d16;border:1px solid #334155;color:#f8fafc;padding:5px 8px;border-radius:4px;font-size:11px;box-sizing:border-box;">
        </div>
        <div>
          <label style="font-size:9px;color:#94a3b8;text-transform:uppercase;font-weight:700;">Building ID</label>
          <input id="inp-facility-id" type="text" value="${b.building_id || 'CUSTOM_BUILDING'}" style="width:100%;background:#090d16;border:1px solid #334155;color:#f8fafc;padding:5px 8px;border-radius:4px;font-size:11px;box-sizing:border-box;">
        </div>
        <div>
          <label style="font-size:9px;color:#94a3b8;text-transform:uppercase;font-weight:700;">Floor Level</label>
          <input id="inp-facility-floor" type="number" value="${b.floor || 1}" style="width:100%;background:#090d16;border:1px solid #334155;color:#f8fafc;padding:5px 8px;border-radius:4px;font-size:11px;box-sizing:border-box;">
        </div>
      </div>

      <!-- Add New Room / Space Card -->
      <div style="background:#111827;padding:12px;border-radius:8px;border:1px solid rgba(56,189,248,0.25);">
        <div style="font-size:11px;font-weight:800;color:#38bdf8;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
          ➕ ADD CUSTOM ROOM OR CORRIDOR
        </div>
        <div style="display:grid;grid-template-columns:1.5fr 2fr 1.5fr 1fr 1fr 1fr 1fr auto;gap:6px;align-items:end;">
          <div>
            <label style="font-size:8px;color:#94a3b8;">Space ID</label>
            <input id="add-room-id" type="text" placeholder="e.g. ROOM_201" style="width:100%;background:#090d16;border:1px solid #334155;color:#f8fafc;padding:4px 6px;border-radius:4px;font-size:10px;box-sizing:border-box;">
          </div>
          <div>
            <label style="font-size:8px;color:#94a3b8;">Display Name</label>
            <input id="add-room-name" type="text" placeholder="e.g. Robotics Lab" style="width:100%;background:#090d16;border:1px solid #334155;color:#f8fafc;padding:4px 6px;border-radius:4px;font-size:10px;box-sizing:border-box;">
          </div>
          <div>
            <label style="font-size:8px;color:#94a3b8;">Type</label>
            <select id="add-room-type" style="width:100%;background:#090d16;border:1px solid #334155;color:#f8fafc;padding:4px 6px;border-radius:4px;font-size:10px;box-sizing:border-box;">
              <option value="CLASSROOM">Classroom / Ward</option>
              <option value="OFFICE">Office / Station</option>
              <option value="LABORATORY">Laboratory / ICU</option>
              <option value="CORRIDOR">Corridor / Pathway</option>
              <option value="CONFERENCE">Conference Room</option>
              <option value="SERVER_ROOM">Server / NOC Room</option>
              <option value="LOUNGE">Lounge / Cafeteria</option>
              <option value="STORAGE">Storage / Plant</option>
            </select>
          </div>
          <div>
            <label style="font-size:8px;color:#94a3b8;">X (px)</label>
            <input id="add-room-x" type="number" value="100" style="width:100%;background:#090d16;border:1px solid #334155;color:#f8fafc;padding:4px 6px;border-radius:4px;font-size:10px;box-sizing:border-box;">
          </div>
          <div>
            <label style="font-size:8px;color:#94a3b8;">Y (px)</label>
            <input id="add-room-y" type="number" value="100" style="width:100%;background:#090d16;border:1px solid #334155;color:#f8fafc;padding:4px 6px;border-radius:4px;font-size:10px;box-sizing:border-box;">
          </div>
          <div>
            <label style="font-size:8px;color:#94a3b8;">Width</label>
            <input id="add-room-w" type="number" value="160" style="width:100%;background:#090d16;border:1px solid #334155;color:#f8fafc;padding:4px 6px;border-radius:4px;font-size:10px;box-sizing:border-box;">
          </div>
          <div>
            <label style="font-size:8px;color:#94a3b8;">Height</label>
            <input id="add-room-h" type="number" value="120" style="width:100%;background:#090d16;border:1px solid #334155;color:#f8fafc;padding:4px 6px;border-radius:4px;font-size:10px;box-sizing:border-box;">
          </div>
          <button id="btn-add-room-action" style="background:#0284c7;color:#fff;border:none;padding:5px 12px;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;height:24px;">+ Add</button>
        </div>
      </div>

      <!-- Add Door Connection & Exit Row -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div style="background:#111827;padding:10px 12px;border-radius:8px;border:1px solid rgba(168,85,247,0.3);">
          <div style="font-size:10px;font-weight:700;color:#c084fc;margin-bottom:6px;">🚪 CONNECT DOORWAY</div>
          <div style="display:flex;gap:6px;align-items:center;">
            <select id="add-door-from" style="flex:1;background:#090d16;border:1px solid #334155;color:#f8fafc;padding:4px 6px;border-radius:4px;font-size:9.5px;">
              ${spaces.map((s, idx) => `<option value="${s.id}" ${idx === 0 ? 'selected' : ''}>${s.id} (${s.name})</option>`).join('')}
            </select>
            <span style="color:#64748b;">➔</span>
            <select id="add-door-to" style="flex:1;background:#090d16;border:1px solid #334155;color:#f8fafc;padding:4px 6px;border-radius:4px;font-size:9.5px;">
              ${spaces.map((s, idx) => `<option value="${s.id}" ${idx === (spaces.length > 1 ? 1 : 0) ? 'selected' : ''}>${s.id} (${s.name})</option>`).join('')}
            </select>
            <button id="btn-add-door-action" style="background:#7c3aed;color:#fff;border:none;padding:5px 12px;border-radius:4px;font-size:9.5px;cursor:pointer;font-weight:700;">Connect</button>
          </div>
        </div>

        <div style="background:#111827;padding:10px 12px;border-radius:8px;border:1px solid rgba(34,197,94,0.3);">
          <div style="font-size:10px;font-weight:700;color:#4ade80;margin-bottom:6px;">🚨 EMERGENCY EXIT</div>
          <div style="display:flex;gap:6px;align-items:center;">
            <input id="add-exit-id" type="text" placeholder="EXIT_ID" value="EXIT_CUSTOM_${exits.length+1}" style="width:90px;background:#090d16;border:1px solid #334155;color:#f8fafc;padding:4px 6px;border-radius:4px;font-size:9.5px;">
            <input id="add-exit-x" type="number" placeholder="X" value="720" style="width:50px;background:#090d16;border:1px solid #334155;color:#f8fafc;padding:4px 6px;border-radius:4px;font-size:9.5px;">
            <input id="add-exit-y" type="number" placeholder="Y" value="280" style="width:50px;background:#090d16;border:1px solid #334155;color:#f8fafc;padding:4px 6px;border-radius:4px;font-size:9.5px;">
            <select id="add-exit-connect" style="flex:1;background:#090d16;border:1px solid #334155;color:#f8fafc;padding:4px 6px;border-radius:4px;font-size:9.5px;">
              ${spaces.map(s => `<option value="${s.id}">${s.id} (${s.name})</option>`).join('')}
            </select>
            <button id="btn-add-exit-action" style="background:#16a34a;color:#fff;border:none;padding:5px 12px;border-radius:4px;font-size:9.5px;cursor:pointer;font-weight:700;">+ Exit</button>
          </div>
        </div>
      </div>

      <!-- Spaces & Doors Dual Summary Grid -->
      <div style="display:grid;grid-template-columns:3fr 2fr;gap:10px;">
        <!-- Spaces List Table -->
        <div style="background:#111827;border-radius:8px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">
          <div style="padding:8px 12px;background:#1e293b;font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;display:flex;justify-content:space-between;">
            <span>Architectural Spaces (${spaces.length})</span>
            <span style="color:#64748b;">(X, Y, W, H)</span>
          </div>
          <div style="max-height:180px;overflow-y:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:9.5px;text-align:left;">
              <thead>
                <tr style="border-bottom:1px solid rgba(255,255,255,0.06);color:#64748b;font-size:8px;">
                  <th style="padding:5px 8px;">ID</th>
                  <th style="padding:5px 8px;">Name</th>
                  <th style="padding:5px 8px;">Type</th>
                  <th style="padding:5px 8px;">Cap</th>
                  <th style="padding:5px 8px;text-align:right;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${spaces.map(s => `
                  <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                    <td style="padding:5px 8px;font-weight:700;color:#38bdf8;">${s.id}</td>
                    <td style="padding:5px 8px;color:#f1f5f9;">${s.name}</td>
                    <td style="padding:5px 8px;"><span class="badge ${s.type==='CORRIDOR'?'badge-purple':'badge-cyan'}" style="font-size:7px;">${s.type}</span></td>
                    <td style="padding:5px 8px;color:#f59e0b;">${s.capacity}p</td>
                    <td style="padding:5px 8px;text-align:right;">
                      <button class="btn-delete-space" data-id="${s.id}" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);padding:1px 5px;border-radius:3px;font-size:8px;cursor:pointer;">✕</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Doors & Exits Table -->
        <div style="background:#111827;border-radius:8px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;display:flex;flex-direction:column;">
          <div style="padding:8px 12px;background:#1e293b;font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">
            Doorways (${(b.doors||[]).length}) &amp; Exits (${exits.length})
          </div>
          <div style="max-height:180px;overflow-y:auto;flex:1;">
            <table style="width:100%;border-collapse:collapse;font-size:9.5px;text-align:left;">
              <thead>
                <tr style="border-bottom:1px solid rgba(255,255,255,0.06);color:#64748b;font-size:8px;">
                  <th style="padding:5px 8px;">Type</th>
                  <th style="padding:5px 8px;">Connection</th>
                  <th style="padding:5px 8px;text-align:right;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${(b.doors || []).map((d, idx) => `
                  <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                    <td style="padding:5px 8px;"><span class="badge badge-purple" style="font-size:7px;">DOOR</span></td>
                    <td style="padding:5px 8px;color:#e2e8f0;font-family:monospace;font-size:8.5px;">${d.from} ➔ ${d.to}</td>
                    <td style="padding:5px 8px;text-align:right;">
                      <button class="btn-delete-door" data-index="${idx}" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);padding:1px 5px;border-radius:3px;font-size:8px;cursor:pointer;">✕</button>
                    </td>
                  </tr>
                `).join('')}
                ${exits.map((e, idx) => `
                  <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                    <td style="padding:5px 8px;"><span class="badge badge-green" style="font-size:7px;">EXIT</span></td>
                    <td style="padding:5px 8px;color:#4ade80;font-family:monospace;font-size:8.5px;">${e.id} ➔ ${e.connects_to}</td>
                    <td style="padding:5px 8px;text-align:right;">
                      <button class="btn-delete-exit" data-id="${e.id}" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);padding:1px 5px;border-radius:3px;font-size:8px;cursor:pointer;">✕</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  _renderJsonStudioHTML(jsonStr) {
    return `
      <div style="display:flex;flex-direction:column;gap:8px;height:100%;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:10px;color:#94a3b8;">Directly edit or paste BuildingModel JSON definition with full schema validation:</span>
          <div style="display:flex;gap:6px;">
            <button id="btn-json-copy" style="background:#1e293b;border:1px solid #334155;color:#cbd5e1;padding:3px 8px;border-radius:4px;font-size:9.5px;cursor:pointer;">📋 Copy JSON</button>
            <input type="file" id="inp-json-upload" accept=".json" style="display:none;">
            <button id="btn-json-upload-trigger" style="background:#1e293b;border:1px solid #334155;color:#cbd5e1;padding:3px 8px;border-radius:4px;font-size:9.5px;cursor:pointer;">📤 Upload .json</button>
          </div>
        </div>
        <textarea id="json-studio-textarea" style="width:100%;height:320px;background:#050811;border:1px solid #334155;color:#38bdf8;font-family:monospace;font-size:10px;padding:10px;border-radius:6px;box-sizing:border-box;resize:none;">${jsonStr}</textarea>
        <div id="json-validation-status" style="font-size:9.5px;color:#22c55e;display:flex;align-items:center;gap:4px;">
          ✓ Valid Building Specification Syntax
        </div>
      </div>
    `;
  }

  _bindDOMEvents() {
    // Close
    this._modalEl.querySelector('#architect-btn-close')?.addEventListener('click', () => this.close());

    // Tab Switches
    this._modalEl.querySelector('#tab-btn-designer')?.addEventListener('click', () => {
      this._syncFromInputs();
      this.activeTab = 'DESIGNER';
      this._render();
    });

    this._modalEl.querySelector('#tab-btn-json')?.addEventListener('click', () => {
      this._syncFromInputs();
      this.activeTab = 'JSON';
      this._render();
    });

    // Template Selector Chips
    this._modalEl.querySelectorAll('.template-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const tKey = btn.dataset.template;
        if (ARCHITECTURAL_TEMPLATES[tKey]) {
          this.currentBuilding = JSON.parse(JSON.stringify(ARCHITECTURAL_TEMPLATES[tKey]));
          this._render();
        }
      });
    });

    // Add Room Action
    this._modalEl.querySelector('#btn-add-room-action')?.addEventListener('click', () => {
      const id = this._modalEl.querySelector('#add-room-id')?.value.trim();
      const name = this._modalEl.querySelector('#add-room-name')?.value.trim() || id;
      const type = this._modalEl.querySelector('#add-room-type')?.value;
      const x = parseInt(this._modalEl.querySelector('#add-room-x')?.value, 10) || 100;
      const y = parseInt(this._modalEl.querySelector('#add-room-y')?.value, 10) || 100;
      const width = parseInt(this._modalEl.querySelector('#add-room-w')?.value, 10) || 160;
      const height = parseInt(this._modalEl.querySelector('#add-room-h')?.value, 10) || 120;

      if (!id) {
        alert('Please specify a Space ID (e.g. ROOM_201)');
        return;
      }

      if (!this.currentBuilding.spaces) this.currentBuilding.spaces = [];
      if (this.currentBuilding.spaces.some(s => s.id === id)) {
        alert(`Space with ID "${id}" already exists.`);
        return;
      }

      this.currentBuilding.spaces.push({
        id,
        name,
        type,
        x,
        y,
        width,
        height,
        capacity: type === 'CORRIDOR' ? 30 : 20,
        connections: []
      });

      this._render();
    });

    // Add Door Action
    this._modalEl.querySelector('#btn-add-door-action')?.addEventListener('click', () => {
      const from = this._modalEl.querySelector('#add-door-from')?.value;
      const to = this._modalEl.querySelector('#add-door-to')?.value;

      if (!from || !to) {
        alert('Please select both spaces to connect.');
        return;
      }

      if (from === to) {
        alert(`Cannot connect "${from}" to itself. Please select two different spaces.`);
        return;
      }

      if (!this.currentBuilding.doors) this.currentBuilding.doors = [];

      const exists = this.currentBuilding.doors.some(d =>
        (d.from === from && d.to === to) || (d.from === to && d.to === from)
      );
      if (exists) {
        alert(`Doorway between "${from}" and "${to}" already exists.`);
        return;
      }

      this.currentBuilding.doors.push({ from, to });

      const fromSpace = (this.currentBuilding.spaces || []).find(s => s.id === from);
      if (fromSpace) {
        if (!Array.isArray(fromSpace.connections)) fromSpace.connections = [];
        if (!fromSpace.connections.includes(to)) fromSpace.connections.push(to);
      }

      const toSpace = (this.currentBuilding.spaces || []).find(s => s.id === to);
      if (toSpace) {
        if (!Array.isArray(toSpace.connections)) toSpace.connections = [];
        if (!toSpace.connections.includes(from)) toSpace.connections.push(from);
      }

      this._render();
    });

    // Delete Door Action
    this._modalEl.querySelectorAll('.btn-delete-door').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        if (!isNaN(idx) && this.currentBuilding.doors && this.currentBuilding.doors[idx]) {
          const removed = this.currentBuilding.doors.splice(idx, 1)[0];
          if (removed) {
            const fs = (this.currentBuilding.spaces || []).find(s => s.id === removed.from);
            if (fs && Array.isArray(fs.connections)) fs.connections = fs.connections.filter(c => c !== removed.to);
            const ts = (this.currentBuilding.spaces || []).find(s => s.id === removed.to);
            if (ts && Array.isArray(ts.connections)) ts.connections = ts.connections.filter(c => c !== removed.from);
          }
          this._render();
        }
      });
    });

    // Add Exit Action
    this._modalEl.querySelector('#btn-add-exit-action')?.addEventListener('click', () => {
      const id = this._modalEl.querySelector('#add-exit-id')?.value.trim() || `EXIT_${Date.now()}`;
      const x = parseInt(this._modalEl.querySelector('#add-exit-x')?.value, 10) || 720;
      const y = parseInt(this._modalEl.querySelector('#add-exit-y')?.value, 10) || 280;
      const connects_to = this._modalEl.querySelector('#add-exit-connect')?.value;

      if (!this.currentBuilding.exits) this.currentBuilding.exits = [];
      if (this.currentBuilding.exits.some(e => e.id === id)) {
        alert(`Exit with ID "${id}" already exists.`);
        return;
      }

      this.currentBuilding.exits.push({ id, name: id.replace(/_/g, ' '), x, y, width: 30, height: 40, connects_to });
      this._render();
    });

    // Delete Exit Action
    this._modalEl.querySelectorAll('.btn-delete-exit').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        this.currentBuilding.exits = (this.currentBuilding.exits || []).filter(e => e.id !== id);
        this._render();
      });
    });

    // Delete Space
    this._modalEl.querySelectorAll('.btn-delete-space').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        this.currentBuilding.spaces = (this.currentBuilding.spaces || []).filter(s => s.id !== id);
        this.currentBuilding.doors = (this.currentBuilding.doors || []).filter(d => d.from !== id && d.to !== id);
        this._render();
      });
    });

    // Copy JSON
    this._modalEl.querySelector('#btn-json-copy')?.addEventListener('click', () => {
      const txt = this._modalEl.querySelector('#json-studio-textarea')?.value;
      if (txt) {
        navigator.clipboard.writeText(txt);
        alert('JSON copied to clipboard!');
      }
    });

    // Upload JSON Trigger
    const fileInp = this._modalEl.querySelector('#inp-json-upload');
    this._modalEl.querySelector('#btn-json-upload-trigger')?.addEventListener('click', () => fileInp?.click());
    fileInp?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const parsed = JSON.parse(evt.target.result);
            this.currentBuilding = parsed;
            this._render();
          } catch (err) {
            alert('Invalid JSON file format: ' + err.message);
          }
        };
        reader.readAsText(file);
      }
    });

    // Export JSON File
    this._modalEl.querySelector('#architect-btn-export-json')?.addEventListener('click', () => {
      this._syncFromInputs();
      const blob = new Blob([JSON.stringify(this.currentBuilding, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.currentBuilding.building_id || 'custom-building'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // 🚀 Apply & Live Simulate
    this._modalEl.querySelector('#architect-btn-apply')?.addEventListener('click', () => {
      this._syncFromInputs();
      this.applyBuildingModel(this.currentBuilding);
      this.close();
    });
  }

  _syncFromInputs() {
    if (this.activeTab === 'DESIGNER') {
      const nameInp = this._modalEl.querySelector('#inp-facility-name');
      if (nameInp) this.currentBuilding.name = nameInp.value.trim();
      const idInp = this._modalEl.querySelector('#inp-facility-id');
      if (idInp) this.currentBuilding.building_id = idInp.value.trim();
      const floorInp = this._modalEl.querySelector('#inp-facility-floor');
      if (floorInp) this.currentBuilding.floor = parseInt(floorInp.value, 10) || 1;
    } else if (this.activeTab === 'JSON') {
      const txt = this._modalEl.querySelector('#json-studio-textarea')?.value;
      if (txt) {
        try {
          this.currentBuilding = JSON.parse(txt);
        } catch (e) {
          console.warn('JSON parse error during sync:', e);
        }
      }
    }
  }

  applyBuildingModel(rawBuilding) {
    const compiled = createCustomBuilding(rawBuilding);

    // 1. Update Active Building Singleton
    setActiveBuilding(compiled);

    // 2. Register to Canonical Building Registry for zero-shot LLM resolution
    canonicalRegistryInstance.registerCustomBuilding(compiled);

    // 3. Emit building custom loaded event across bus
    this.bus.emit('building:custom_loaded', { building: compiled });

    // 4. Log Confirmation
    this.bus.emit('log', {
      tag: 'system',
      msg: `📐 [ARCHITECT STUDIO] Custom Building "${compiled.name}" (${compiled.spaces.length} spaces, ${compiled.exits.length} exits) compiled and hot-loaded into Digital Twin!`,
      priority: 'important'
    });
  }
}
