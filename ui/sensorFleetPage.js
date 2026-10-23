/**
 * SENSOR FLEET PAGE — MISSION CONTROL IOT COMMAND DASHBOARD
 *
 * S-Tier Virtual IoT Telemetry Dashboard for Heterogeneous Multi-Vendor Sensors:
 *   1. Dynamic Real-Time Fleet KPI Aggregates & Health Counters
 *   2. 4 Switchable View Layouts: Grid, Table Matrix, Spatial Room Grouping, Protocol Topology
 *   3. 🗺️ Embedded Spatial Sensor Radar & Mini-Heatmap Overlay
 *   4. ⚡ Live Packet Ingestion Stream & Wire Traffic Ticker
 *   5. 📈 Multi-Sensor Comparative Chart & Spatial Diffusion Analyzer
 *   6. Real-Time SVG Sparklines & Historical Time-Series Tracking
 *   7. Instant Multi-Facet Filtering, Fuzzy Search & Column Sorting
 *   8. Deep-Dive Sensor Hardware & Semantic Resolution Inspector Modal
 *   9. On-the-Fly IoT Fault Injection & Middleware Resilience Testing Lab
 *   10. Telemetry Data Export (CSV / JSON) & Cross-Navigation
 */

import { BUILDING, SENSOR_MAP, SPACE_MAP } from '../data/building.js';

const TYPE_CONFIG = {
  TEMPERATURE: { icon: '🌡️', label: 'Temperature', defaultUnit: '°C', baseVal: 24.5, warnVal: 38.0, critVal: 60.0 },
  SMOKE:       { icon: '💨', label: 'Smoke / AQI',  defaultUnit: 'AQI', baseVal: 0.01, warnVal: 0.15, critVal: 0.50 },
  FIRE_ALARM:  { icon: '🚨', label: 'Fire Alarm',   defaultUnit: '',    baseVal: 'OK', warnVal: 'WARN', critVal: 'ALARM' },
  OCCUPANCY:   { icon: '👥', label: 'Occupancy',    defaultUnit: 'pax', baseVal: 15,   warnVal: 35,   critVal: 50 }
};

const PROTO_SPECS = {
  BMS: {
    name: 'BMS (BACnet/IP)',
    gateway: 'GW-BACNET-01 (192.168.10.12)',
    protocol: 'BACnet/IP Annex J (Port 47808)',
    pollRate: '100 ms',
    bg: 'rgba(59, 130, 246, 0.12)',
    border: '#3b82f6',
    text: '#60a5fa',
    vendor: 'Honeywell Alerton BACnet T-700'
  },
  FAS: {
    name: 'FAS (Fire Safety Loop)',
    gateway: 'FACP-LOOP-04 (RS-485 Modbus)',
    protocol: 'NFPA 72 Addressable SLC Loop',
    pollRate: 'Interrupt / 50 ms',
    bg: 'rgba(239, 68, 68, 0.12)',
    border: '#ef4444',
    text: '#f87171',
    vendor: 'Simplex 4098 Addressable Photoelectric'
  },
  OCCUPANCY: {
    name: 'Smart Vision / PIR',
    gateway: 'EDGE-CV-NODE-02 (10.0.4.88)',
    protocol: 'RTSP / ONVIF Profile S (YOLOv8)',
    pollRate: '200 ms',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: '#10b981',
    text: '#34d399',
    vendor: 'Axis M3057 AI Panoramic Vision Node'
  },
  ENV_IOT: {
    name: 'Environmental IoT Mesh',
    gateway: 'MQTT-BROKER-01 (Port 1883 / TLS)',
    protocol: 'CoAP / MQTT JSON Payload',
    pollRate: '150 ms',
    bg: 'rgba(6, 182, 212, 0.12)',
    border: '#06b6d4',
    text: '#22d3ee',
    vendor: 'Bosch Sensortec BME688 Multiparameter'
  }
};

const COMPARISON_PRESETS = {
  THERMAL: {
    label: '🔥 Thermal Diffusion Spread',
    sensors: ['TEMP_101', 'TEMP_102', 'TEMP_103', 'TEMP_STAFF'],
    type: 'TEMPERATURE'
  },
  SMOKE: {
    label: '💨 Smoke Obscuration Propagation',
    sensors: ['SMOKE_101', 'SMOKE_CORR_E', 'SMOKE_CORR_W', 'SMOKE_103'],
    type: 'SMOKE'
  },
  OCCUPANCY: {
    label: '👥 Dynamic Evacuation Headcount',
    sensors: ['OCC_101', 'OCC_102', 'OCC_103', 'OCC_STAFF'],
    type: 'OCCUPANCY'
  }
};

const COMPARE_COLORS = ['#ef4444', '#f59e0b', '#06b6d4', '#10b981'];

export class SensorFleetPage {
  /**
   * @param {Object}             opts
   * @param {HTMLElement}        opts.container
   * @param {EventBus}           opts.bus
   * @param {ConfigManager}      [opts.configManager]
   * @param {DigitalTwinState}   [opts.dtState]
   * @param {PageNavigation}     [opts.navigation]
   */
  constructor({ container, bus, configManager = null, dtState = null, navigation = null }) {
    this.container     = container;
    this.bus           = bus;
    this.configManager = configManager;
    this.dtState       = dtState;
    this.navigation    = navigation;

    // View & Filter State
    this._viewMode     = 'GRID';     // 'GRID' | 'TABLE' | 'SPATIAL' | 'TOPOLOGY'
    this._filterProto  = 'ALL';
    this._filterType   = 'ALL';
    this._filterStatus = 'ALL';
    this._searchQuery  = '';
    this._sortBy       = 'ID_ASC';

    // Module Toggles
    this._showRadar        = true;
    this._showWireStream   = true;
    this._showCompareChart = true;
    this._showFaultPanel   = false;
    this._wireStreamPaused = false;

    // Compare Module State
    this._activeComparePreset  = 'THERMAL';
    this._selectedCompareSensors = [...COMPARISON_PRESETS.THERMAL.sensors];

    // Wire Packets Ring Buffer
    this._wirePackets  = [];
    this._packetCount  = 0;
    this._lastPktTime  = Date.now();
    this._packetRate   = 0;

    // Telemetry History & Readings
    this._history        = {};
    this._readings       = {};
    this._injectedFaults = {};
    this._inspectorModal = null;
    this._activeInspectorSensor = null;

    this._initHistories();
    this._build();

    // Event Bus Listeners
    this.bus.on('sensors:update',     e => this._onSensorsUpdate(e));
    this.bus.on('hetero:messages',    e => this._onHeteroMessages(e));
    this.bus.on('sim:reset',          () => this._onReset());
    this.bus.on('building:changed',   () => { this._initHistories(); this._build(); });
    this.bus.on('config:changed',     () => this._refreshKPIs());
  }

  // ── Initialization ───────────────────────────────────────────

  _initHistories() {
    const sensors = BUILDING.sensors || [];
    sensors.forEach(s => {
      const cfg = TYPE_CONFIG[s.type] || TYPE_CONFIG.TEMPERATURE;
      let initialVal = typeof cfg.baseVal === 'number' ? cfg.baseVal : 0;
      let unit = cfg.defaultUnit;

      if (s.type === 'OCCUPANCY') {
        const blOcc = BUILDING.sensor_baselines?.occupancy?.[s.room] || BUILDING.baselines?.occupancy?.[s.room];
        initialVal = blOcc?.base !== undefined ? blOcc.base : 0;
        unit = 'persons';
      }

      this._history[s.id] = [initialVal];
      this._readings[s.id] = {
        value: initialVal,
        unit: unit,
        status: 'NORMAL',
        min: initialVal,
        max: initialVal,
        delta: 0,
        lastUpdated: Date.now()
      };
    });
  }

  // ── Master Build ─────────────────────────────────────────────

  _build() {
    this.container.innerHTML = '';
    const sensors = BUILDING.sensors || [];
    const root = document.createElement('div');
    root.className = 'fleet-page-container';

    // 1. Header & Controls Card
    const headerCard = document.createElement('div');
    headerCard.className = 'fleet-page-header';
    headerCard.innerHTML = `
      <div class="fleet-header-top">
        <div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:18px;">📡</span>
            <h2 style="font-size:16px;font-weight:700;color:var(--text-primary);letter-spacing:0.3px;margin:0;">
              Virtual IoT Sensor Fleet Dashboard
            </h2>
            <span class="badge badge-cyan" style="font-size:8.5px;padding:2px 7px;">${sensors.length} NODES ONLINE</span>
          </div>
          <div style="font-size:10.5px;color:var(--text-muted);font-family:var(--font-mono);margin-top:3px;">
            Heterogeneous multi-vendor telemetry stream monitoring · Sub-millisecond AI Middleware Ingestion
          </div>
        </div>

        <div class="fleet-header-actions">
          <!-- Search Box -->
          <div class="fleet-search-box">
            <span class="fleet-search-icon">🔍</span>
            <input type="text" id="fleet-search-input" class="fleet-search-input" placeholder="Search sensor, room, IFC..." value="${this._searchQuery}">
            ${this._searchQuery ? `<button id="btn-fleet-search-clear" class="fleet-search-clear">✕</button>` : ''}
          </div>

          <!-- Feature Toggles -->
          <div style="display:flex;gap:4px;">
            <button id="btn-toggle-radar" class="btn btn-speed ${this._showRadar ? 'active' : ''}" style="font-size:9px;padding:4px 8px;" title="Toggle 2D Spatial Sensor Radar">
              RADAR
            </button>
            <button id="btn-toggle-wire" class="btn btn-speed ${this._showWireStream ? 'active' : ''}" style="font-size:9px;padding:4px 8px;" title="Toggle Live Wire Ingestion Stream">
              WIRE STREAM
            </button>
            <button id="btn-toggle-compare" class="btn btn-speed ${this._showCompareChart ? 'active' : ''}" style="font-size:9px;padding:4px 8px;" title="Toggle Multi-Sensor Comparative Analyzer">
              COMPARE
            </button>
            <button id="btn-toggle-fault-lab" class="btn btn-speed ${this._showFaultPanel ? 'active' : ''}" style="color:var(--accent-purple);border-color:rgba(168,85,247,0.4);font-size:9px;padding:4px 8px;" title="Open IoT Malfunction & Stress-Testing Lab">
              FAULT LAB
            </button>
          </div>

          <!-- View Mode Toggle -->
          <div class="fleet-view-toggle-group" id="fleet-view-toggles">
            <button class="fleet-view-btn ${this._viewMode === 'GRID' ? 'active' : ''}" data-view="GRID" title="Card Grid View">
              GRID
            </button>
            <button class="fleet-view-btn ${this._viewMode === 'TABLE' ? 'active' : ''}" data-view="TABLE" title="Matrix Table View">
              TABLE
            </button>
            <button class="fleet-view-btn ${this._viewMode === 'SPATIAL' ? 'active' : ''}" data-view="SPATIAL" title="Spatial Room Groups">
              ROOMS
            </button>
            <button class="fleet-view-btn ${this._viewMode === 'TOPOLOGY' ? 'active' : ''}" data-view="TOPOLOGY" title="Gateway Protocol Topology">
              TOPOLOGY
            </button>
          </div>

          <!-- Export Telemetry Dropdown -->
          <div style="display:flex;gap:4px;">
            <button id="btn-export-csv" class="btn btn-speed" style="font-size:9px;padding:4px 8px;" title="Export Telemetry to CSV">
              CSV
            </button>
            <button id="btn-export-json" class="btn btn-speed" style="font-size:9px;padding:4px 8px;" title="Export Telemetry to JSON">
              JSON
            </button>
          </div>
        </div>
      </div>

      <!-- Real-Time KPI Ribbon -->
      <div class="fleet-kpi-grid" id="fleet-kpi-grid">
        ${this._renderKPIRibbonHTML()}
      </div>
    `;
    root.appendChild(headerCard);

    // 2. FEATURE 1: Spatial Sensor Radar & Mini-Heatmap Overlay
    const radarSection = document.createElement('div');
    radarSection.id = 'fleet-radar-section';
    radarSection.className = 'fleet-radar-section';
    radarSection.style.display = this._showRadar ? 'flex' : 'none';
    radarSection.innerHTML = this._renderRadarSectionHTML();
    root.appendChild(radarSection);

    // 3. FEATURE 2: Live Wire Packet Ingestion Stream Ticker
    const wireSection = document.createElement('div');
    wireSection.id = 'fleet-wire-stream-section';
    wireSection.className = 'fleet-wire-stream-section';
    wireSection.style.display = this._showWireStream ? 'flex' : 'none';
    wireSection.innerHTML = this._renderWireStreamSectionHTML();
    root.appendChild(wireSection);

    // 4. FEATURE 3: Multi-Sensor Comparative Diffusion Chart
    const compareSection = document.createElement('div');
    compareSection.id = 'fleet-compare-section';
    compareSection.className = 'fleet-compare-section';
    compareSection.style.display = this._showCompareChart ? 'flex' : 'none';
    compareSection.innerHTML = this._renderCompareSectionHTML();
    root.appendChild(compareSection);

    // 5. Interactive Fault Injection Panel
    const faultPanel = document.createElement('div');
    faultPanel.id = 'fleet-fault-panel';
    faultPanel.className = 'fleet-fault-panel';
    faultPanel.style.display = this._showFaultPanel ? 'flex' : 'none';
    faultPanel.innerHTML = this._renderFaultPanelHTML();
    root.appendChild(faultPanel);

    // 6. Multi-Facet Filter Toolbar
    const filterToolbar = document.createElement('div');
    filterToolbar.className = 'fleet-filter-toolbar';
    filterToolbar.innerHTML = `
      <div class="fleet-filter-chips-group">
        <span style="font-family:var(--font-mono);font-size:8.5px;font-weight:700;color:var(--text-muted);margin-right:2px;">PROTOCOL:</span>
        <button class="fleet-filter-chip ${this._filterProto === 'ALL' ? 'active' : ''}" data-filter-proto="ALL">ALL (${sensors.length})</button>
        <button class="fleet-filter-chip bms ${this._filterProto === 'BMS' ? 'active' : ''}" data-filter-proto="BMS">BMS BACnet (${sensors.filter(s=>s.source_system==='BMS').length})</button>
        <button class="fleet-filter-chip fas ${this._filterProto === 'FAS' ? 'active' : ''}" data-filter-proto="FAS">FAS Loop (${sensors.filter(s=>s.source_system==='FAS').length})</button>
        <button class="fleet-filter-chip occ ${this._filterProto === 'OCCUPANCY' ? 'active' : ''}" data-filter-proto="OCCUPANCY">AI Vision / PIR (${sensors.filter(s=>s.source_system==='OCCUPANCY').length})</button>
        <button class="fleet-filter-chip env ${this._filterProto === 'ENV_IOT' ? 'active' : ''}" data-filter-proto="ENV_IOT">ENV-IoT (${sensors.filter(s=>s.source_system==='ENV_IOT').length})</button>
      </div>

      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <!-- Sensor Type Filter -->
        <div style="display:flex;align-items:center;gap:4px;">
          <span style="font-family:var(--font-mono);font-size:8.5px;color:var(--text-muted);">TYPE:</span>
          <select id="fleet-type-select" class="fleet-sort-select">
            <option value="ALL" ${this._filterType==='ALL'?'selected':''}>All Types</option>
            <option value="TEMPERATURE" ${this._filterType==='TEMPERATURE'?'selected':''}>Temperature</option>
            <option value="SMOKE" ${this._filterType==='SMOKE'?'selected':''}>Smoke / AQI</option>
            <option value="FIRE_ALARM" ${this._filterType==='FIRE_ALARM'?'selected':''}>Fire Alarm</option>
            <option value="OCCUPANCY" ${this._filterType==='OCCUPANCY'?'selected':''}>Occupancy</option>
          </select>
        </div>

        <!-- Health Status Filter -->
        <div style="display:flex;align-items:center;gap:4px;">
          <span style="font-family:var(--font-mono);font-size:8.5px;color:var(--text-muted);">STATUS:</span>
          <select id="fleet-status-select" class="fleet-sort-select">
            <option value="ALL" ${this._filterStatus==='ALL'?'selected':''}>All Health</option>
            <option value="NORMAL" ${this._filterStatus==='NORMAL'?'selected':''}>Normal</option>
            <option value="WARNING" ${this._filterStatus==='WARNING'?'selected':''}>Warning</option>
            <option value="CRITICAL" ${this._filterStatus==='CRITICAL'?'selected':''}>Critical</option>
            <option value="FAULT" ${this._filterStatus==='FAULT'?'selected':''}>Injected Fault</option>
          </select>
        </div>

        <!-- Sort By -->
        <div style="display:flex;align-items:center;gap:4px;">
          <span style="font-family:var(--font-mono);font-size:8.5px;color:var(--text-muted);">SORT:</span>
          <select id="fleet-sort-select" class="fleet-sort-select">
            <option value="ID_ASC" ${this._sortBy==='ID_ASC'?'selected':''}>Sensor ID (A-Z)</option>
            <option value="ROOM_ASC" ${this._sortBy==='ROOM_ASC'?'selected':''}>Room Name</option>
            <option value="SEV_DESC" ${this._sortBy==='SEV_DESC'?'selected':''}>Highest Hazard First</option>
            <option value="VAL_DESC" ${this._sortBy==='VAL_DESC'?'selected':''}>Highest Value First</option>
            <option value="SYS_ASC" ${this._sortBy==='SYS_ASC'?'selected':''}>Protocol System</option>
          </select>
        </div>
      </div>
    `;
    root.appendChild(filterToolbar);

    // 7. Main Telemetry Content Area
    const contentContainer = document.createElement('div');
    contentContainer.id = 'fleet-view-content';
    contentContainer.className = 'fleet-view-content';
    root.appendChild(contentContainer);

    this.container.appendChild(root);

    // 8. Attach Listeners & Render Views
    this._attachHeaderListeners(headerCard, filterToolbar, faultPanel, radarSection, wireSection, compareSection);
    this._attachRadarListeners(radarSection);
    this._attachWireStreamListeners(wireSection);
    this._attachCompareListeners(compareSection);
    this._renderViewContent();
  }

  // ── FEATURE 1: Spatial Radar HTML Generator ──────────────────

  _renderRadarSectionHTML() {
    const vp = BUILDING.viewport || { width: 880, height: 490 };
    const spaces = BUILDING.spaces || [];
    const sensors = BUILDING.sensors || [];

    return `
      <div class="fleet-radar-header">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:14px;">🗺️</span>
          <strong style="font-size:11px;color:var(--accent-cyan);font-family:var(--font-mono);">
            2D Spatial Sensor Topology Radar &amp; Thermal Dispersion Map
          </strong>
          <span class="badge badge-cyan" style="font-size:8px;">${sensors.length} PINS MAPPED</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;font-family:var(--font-mono);font-size:8.5px;color:var(--text-muted);">
          <span><span style="color:#10b981;">●</span> Nominal</span>
          <span><span style="color:#f59e0b;">●</span> Warning (&ge;38°C)</span>
          <span><span style="color:#ef4444;">●</span> Fire Origin (&ge;60°C)</span>
          <span><span style="color:#a855f7;">●</span> Fault Injected</span>
        </div>
      </div>

      <div class="fleet-radar-svg-wrap">
        <svg class="fleet-radar-svg" viewBox="0 0 ${vp.width} ${vp.height}" id="fleet-radar-svg" xmlns="http://www.w3.org/2000/svg">
          <!-- Room Boundaries -->
          <g id="radar-rooms">
            ${spaces.map(s => `
              <rect x="${s.x}" y="${s.y}" width="${s.width || 100}" height="${s.height || 80}"
                fill="rgba(15, 28, 50, 0.55)" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1.2" rx="4" id="radar-room-${s.id}"/>
              <text x="${s.x + 8}" y="${s.y + 14}" fill="rgba(255, 255, 255, 0.4)" font-size="8.5" font-family="var(--font-mono)">${s.name || s.id}</text>
            `).join('')}
          </g>

          <!-- Thermal Plume Diffusion Overlays -->
          <g id="radar-thermal-halos"></g>

          <!-- Interactive Sensor Pins -->
          <g id="radar-sensor-pins">
            ${sensors.map(s => {
              const reading = this._readings[s.id] || { status: 'NORMAL' };
              const color = this._getNodeColor(reading.status, this._injectedFaults[s.id]);
              return `
                <g class="radar-node-pin" data-sensor-id="${s.id}" transform="translate(${s.x}, ${s.y})">
                  <circle r="7" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="1.5" id="radar-pin-glow-${s.id}"/>
                  <circle r="3.5" fill="${color}" id="radar-pin-dot-${s.id}"/>
                  <title>${s.id} (${s.room}): ${this._formatVal(reading.value, s.type)} ${reading.unit}</title>
                </g>
              `;
            }).join('')}
          </g>
        </svg>
      </div>
    `;
  }

  _attachRadarListeners(radarSection) {
    radarSection.querySelectorAll('.radar-node-pin').forEach(pin => {
      pin.addEventListener('click', () => {
        const sensorId = pin.dataset.sensorId;
        this._openSensorInspector(sensorId);
      });
    });
  }

  // ── FEATURE 2: Live Wire Stream HTML & Event Ingestion ───────

  _renderWireStreamSectionHTML() {
    return `
      <div class="wire-terminal-header">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:14px;">⚡</span>
          <strong style="font-size:11px;color:var(--accent-cyan);font-family:var(--font-mono);">
            Live Wire Ingestion Packet Stream (Multi-Protocol Demux)
          </strong>
          <span class="badge badge-purple" id="wire-packet-rate-badge" style="font-size:8px;">0 pkts/s · 0.8ms</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <button id="btn-toggle-wire-pause" class="btn btn-speed" style="font-size:8.5px;padding:2px 7px;">
            ${this._wireStreamPaused ? '▶ RESUME' : '⏸ PAUSE'}
          </button>
          <button id="btn-clear-wire-stream" class="btn btn-speed" style="font-size:8.5px;padding:2px 7px;">
            ↺ CLEAR LOG
          </button>
        </div>
      </div>

      <div class="wire-terminal-box" id="fleet-wire-terminal">
        <div style="color:var(--text-muted);font-style:italic;">Listening to heterogeneous fieldbus telemetry frames [BMS/BACnet, FAS/NFPA72, RTSP/YOLO, MQTT/CoAP]...</div>
      </div>
    `;
  }

  _attachWireStreamListeners(wireSection) {
    wireSection.querySelector('#btn-toggle-wire-pause')?.addEventListener('click', () => {
      this._wireStreamPaused = !this._wireStreamPaused;
      const btn = wireSection.querySelector('#btn-toggle-wire-pause');
      if (btn) btn.textContent = this._wireStreamPaused ? '▶ RESUME' : '⏸ PAUSE';
    });

    wireSection.querySelector('#btn-clear-wire-stream')?.addEventListener('click', () => {
      this._wirePackets = [];
      const term = wireSection.querySelector('#fleet-wire-terminal');
      if (term) term.innerHTML = '<div style="color:var(--text-muted);font-style:italic;">Packet buffer cleared. Awaiting live telemetry frames...</div>';
    });
  }

  _onHeteroMessages({ messages = [] }) {
    if (this._wireStreamPaused) return;
    messages.forEach(msg => {
      this._addWirePacket(msg._system || 'WIRELESS_IOT', msg.node_ref || msg.device_id || msg.asset || 'NODE', msg);
    });
  }

  _addWirePacket(system, deviceId, payload) {
    if (this._wireStreamPaused) return;
    const now = Date.now();
    this._packetCount++;
    if (now - this._lastPktTime >= 1000) {
      this._packetRate = this._packetCount;
      this._packetCount = 0;
      this._lastPktTime = now;
      const rateBadge = this.container.querySelector('#wire-packet-rate-badge');
      if (rateBadge) rateBadge.textContent = `${this._packetRate} pkts/s · 0.8ms`;
    }

    const term = this.container.querySelector('#fleet-wire-terminal');
    if (!term) return;

    const timeStr = new Date().toLocaleTimeString().split(' ')[0] + '.' + String(now % 1000).padStart(3, '0');
    const tagClass = system.includes('BMS') ? 'bms' : system.includes('FAS') ? 'fas' : system.includes('OCC') ? 'occ' : 'env';

    const row = document.createElement('div');
    row.className = 'wire-pkt-row';
    row.innerHTML = `
      <span style="color:var(--text-muted);">${timeStr}</span>
      <span class="wire-pkt-tag ${tagClass}">[${system}]</span>
      <strong style="color:var(--text-primary);">${deviceId}</strong>
      <span style="color:var(--text-secondary);">&rarr;</span>
      <span style="color:#00d4e8;word-break:break-all;">${JSON.stringify(payload)}</span>
    `;

    term.appendChild(row);
    if (term.children.length > 50) term.removeChild(term.children[0]);
    term.scrollTop = term.scrollHeight;
  }

  // ── FEATURE 3: Multi-Sensor Comparative Chart ────────────────

  _renderCompareSectionHTML() {
    const preset = COMPARISON_PRESETS[this._activeComparePreset] || COMPARISON_PRESETS.THERMAL;

    return `
      <div class="compare-header-row">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:14px;">📈</span>
          <strong style="font-size:11px;color:var(--accent-cyan);font-family:var(--font-mono);">
            Multi-Sensor Synchronized Diffusion &amp; Dispersion Analyzer
          </strong>
        </div>

        <div class="compare-presets-group">
          <span style="font-family:var(--font-mono);font-size:8.5px;color:var(--text-muted);">PRESETS:</span>
          ${Object.entries(COMPARISON_PRESETS).map(([k, v]) => `
            <button class="btn btn-speed btn-compare-preset ${this._activeComparePreset === k ? 'active' : ''}" data-preset="${k}" style="font-size:9px;padding:3px 8px;">
              ${v.label}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Comparative Chart -->
      <div class="compare-chart-wrap" id="compare-chart-wrap">
        ${this._generateMultiLineSVG()}
      </div>

      <!-- Real-Time Physics & Rate of Change Metrics -->
      <div class="compare-metrics-grid" id="compare-metrics-grid">
        ${this._renderCompareMetricsHTML()}
      </div>
    `;
  }

  _attachCompareListeners(compareSection) {
    compareSection.querySelectorAll('.btn-compare-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.preset;
        this._activeComparePreset = k;
        this._selectedCompareSensors = [...(COMPARISON_PRESETS[k]?.sensors || [])];
        compareSection.querySelectorAll('.btn-compare-preset').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._refreshCompareChart();
      });
    });
  }

  _generateMultiLineSVG() {
    const width = 860;
    const height = 180;
    const pad = { top: 20, right: 30, bottom: 25, left: 45 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const sensorIds = this._selectedCompareSensors;
    let allVals = [];
    sensorIds.forEach(id => {
      const h = this._history[id] || [0];
      allVals.push(...h);
    });

    const maxVal = Math.max(60, ...allVals);
    const minVal = 0;
    const range = (maxVal - minVal) === 0 ? 1 : (maxVal - minVal);

    return `
      <svg viewBox="0 0 ${width} ${height}" style="width:100%;height:100%;display:block;" xmlns="http://www.w3.org/2000/svg">
        <!-- Grid lines -->
        <g stroke="rgba(255,255,255,0.06)" stroke-width="1">
          <line x1="${pad.left}" y1="${pad.top}" x2="${width - pad.right}" y2="${pad.top}" stroke-dasharray="3,3"/>
          <line x1="${pad.left}" y1="${pad.top + plotH / 2}" x2="${width - pad.right}" y2="${pad.top + plotH / 2}" stroke-dasharray="3,3"/>
          <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}"/>
        </g>

        <!-- Y Axis Labels -->
        <text x="${pad.left - 6}" y="${pad.top + 4}" fill="var(--text-muted)" font-size="8.5" font-family="var(--font-mono)" text-anchor="end">${maxVal.toFixed(0)}</text>
        <text x="${pad.left - 6}" y="${pad.top + plotH / 2 + 3}" fill="var(--text-muted)" font-size="8.5" font-family="var(--font-mono)" text-anchor="end">${(maxVal / 2).toFixed(0)}</text>
        <text x="${pad.left - 6}" y="${height - pad.bottom + 3}" fill="var(--text-muted)" font-size="8.5" font-family="var(--font-mono)" text-anchor="end">0</text>

        <!-- Multi-Sensor Paths -->
        ${sensorIds.map((id, idx) => {
          const vals = this._history[id] || [0];
          const color = COMPARE_COLORS[idx % COMPARE_COLORS.length];
          const len = vals.length;
          const points = vals.map((v, i) => {
            const x = len > 1 ? pad.left + (i / (len - 1)) * plotW : pad.left + plotW / 2;
            const y = height - pad.bottom - ((v - minVal) / range) * plotH;
            return [x.toFixed(1), y.toFixed(1)];
          });
          const pathD = 'M ' + points.map(p => p.join(',')).join(' L ');
          const lastPt = points[points.length - 1] || [pad.left, height - pad.bottom];

          return `
            <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="${lastPt[0]}" cy="${lastPt[1]}" r="3.5" fill="${color}"/>
          `;
        }).join('')}

        <!-- Interactive Legend on Chart -->
        <g transform="translate(${pad.left + 10}, ${pad.top - 6})">
          ${sensorIds.map((id, idx) => {
            const color = COMPARE_COLORS[idx % COMPARE_COLORS.length];
            const r = this._readings[id] || { value: 0 };
            const offset = idx * 170;
            return `
              <g transform="translate(${offset}, 0)">
                <circle cx="4" cy="4" r="4" fill="${color}"/>
                <text x="12" y="7" fill="var(--text-primary)" font-size="9" font-family="var(--font-mono)" font-weight="700">${id} (${this._getRoomName(SENSOR_MAP[id]?.room || id)}): ${typeof r.value === 'number' ? r.value.toFixed(1) : r.value}</text>
              </g>
            `;
          }).join('')}
        </g>
      </svg>
    `;
  }

  _renderCompareMetricsHTML() {
    const sensorIds = this._selectedCompareSensors;
    return sensorIds.map((id, idx) => {
      const color = COMPARE_COLORS[idx % COMPARE_COLORS.length];
      const r = this._readings[id] || { value: 0, min: 0, max: 0, delta: 0, unit: '' };
      const s = SENSOR_MAP[id] || {};
      const hist = this._history[id] || [0];
      const rateOfRise = hist.length > 5 ? ((hist[hist.length - 1] - hist[hist.length - 5]) / 5).toFixed(2) : '0.00';

      return `
        <div class="compare-metric-card" style="border-left:3px solid ${color};">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <strong style="color:${color};font-size:10px;">${id}</strong>
            <span style="color:var(--text-muted);font-size:8px;">${s.source_system || 'IoT'}</span>
          </div>
          <div style="font-size:8.5px;color:var(--text-secondary);margin-top:1px;">Space: <strong>${this._getRoomName(s.room)}</strong></div>
          <div style="display:flex;justify-content:space-between;margin-top:4px;">
            <span>Current: <strong style="color:var(--text-primary);">${this._formatVal(r.value, s.type)} ${r.unit}</strong></span>
            <span>Max: <strong style="color:var(--text-primary);">${this._formatVal(r.max, s.type)}</strong></span>
          </div>
          <div style="display:flex;justify-content:space-between;color:var(--text-muted);margin-top:2px;">
            <span>Rate of Change: <strong style="color:${parseFloat(rateOfRise) > 0.5 ? '#ef4444' : 'var(--accent-cyan)'};">${rateOfRise > 0 ? '+' : ''}${rateOfRise}/s</strong></span>
            <span>Status: <strong style="color:${r.status === 'CRITICAL' ? '#ef4444' : '#10b981'};">${r.status}</strong></span>
          </div>
        </div>
      `;
    }).join('');
  }

  _refreshCompareChart() {
    const wrap = this.container.querySelector('#compare-chart-wrap');
    if (wrap) wrap.innerHTML = this._generateMultiLineSVG();
    const metricsGrid = this.container.querySelector('#compare-metrics-grid');
    if (metricsGrid) metricsGrid.innerHTML = this._renderCompareMetricsHTML();
  }

  // ── Layout Views (Grid, Table, Spatial, Topology) ────────────

  _renderViewContent() {
    const container = this.container.querySelector('#fleet-view-content');
    if (!container) return;
    container.innerHTML = '';

    const sensors = this._getFilteredSensors();

    if (sensors.length === 0) {
      container.innerHTML = `
        <div style="background:var(--bg-card);border:1px solid var(--border-primary);border-radius:var(--radius-md);padding:32px;text-align:center;color:var(--text-muted);font-family:var(--font-mono);">
          <div style="font-size:24px;margin-bottom:8px;">🔍</div>
          <div style="font-size:12px;font-weight:700;color:var(--text-secondary);">No Sensors Match Selected Filters</div>
          <div style="font-size:10px;margin-top:4px;">Try clearing the search query or resetting the protocol and type filters.</div>
          <button id="btn-reset-filters" class="btn btn-speed" style="margin-top:12px;font-size:9.5px;">↺ Reset All Filters</button>
        </div>
      `;
      container.querySelector('#btn-reset-filters')?.addEventListener('click', () => {
        this._searchQuery = '';
        this._filterProto = 'ALL';
        this._filterType = 'ALL';
        this._filterStatus = 'ALL';
        this._build();
      });
      return;
    }

    switch (this._viewMode) {
      case 'GRID':     this._renderGridView(container, sensors); break;
      case 'TABLE':    this._renderTableView(container, sensors); break;
      case 'SPATIAL':  this._renderSpatialView(container, sensors); break;
      case 'TOPOLOGY': this._renderTopologyView(container, sensors); break;
      default:         this._renderGridView(container, sensors);
    }
  }

  _renderGridView(container, sensors) {
    const grid = document.createElement('div');
    grid.className = 'fleet-cards-grid';

    sensors.forEach(s => {
      const reading = this._readings[s.id] || { value: 0, unit: '', status: 'NORMAL', min: 0, max: 0, delta: 0 };
      const proto = PROTO_SPECS[s.source_system] || PROTO_SPECS.ENV_IOT;
      const typeInfo = TYPE_CONFIG[s.type] || TYPE_CONFIG.TEMPERATURE;
      const hist = this._history[s.id] || [0];
      const hasFault = !!this._injectedFaults[s.id];

      const card = document.createElement('div');
      card.className = `fleet-sensor-card status-${hasFault ? 'fault' : reading.status.toLowerCase()}`;
      card.dataset.sensorId = s.id;

      const formattedVal = this._formatVal(reading.value, s.type);
      const statusPill = this._getStatusBadge(reading.status, hasFault ? this._injectedFaults[s.id] : null);
      const sparklineSvg = this._generateSparklineSVG(hist, reading.status);

      card.innerHTML = `
        <div class="card-top-row">
          <div class="card-sensor-info">
            <span class="card-sensor-icon">${typeInfo.icon}</span>
            <div>
              <div class="card-sensor-id">
                ${s.id}
                ${hasFault ? `<span style="font-size:8px;background:rgba(168,85,247,0.2);color:#c084fc;border:1px solid rgba(168,85,247,0.4);border-radius:3px;padding:0 3px;">FAULT</span>` : ''}
              </div>
              <div class="card-sensor-room" data-room-id="${s.room}" title="Click to view space on Live Floor Plan">
                📍 ${this._getRoomName(s.room)}
              </div>
            </div>
          </div>
          <span class="card-proto-badge" style="background:${proto.bg};border:1px solid ${proto.border};color:${proto.text};">
            ${s.source_system}
          </span>
        </div>

        <div class="card-telemetry-box">
          <div>
            <div style="font-size:7.5px;font-family:var(--font-mono);color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px;">Live Reading</div>
            <div class="card-telemetry-val" id="val-${s.id}">
              ${formattedVal} <span class="card-telemetry-unit">${reading.unit}</span>
            </div>
          </div>
          <div id="badge-${s.id}">
            ${statusPill}
          </div>
        </div>

        <div class="card-sparkline-container" id="spark-${s.id}" title="Real-time time-series telemetry curve">
          ${sparklineSvg}
        </div>

        <div class="card-stats-row" id="stats-${s.id}">
          <span>MIN: <strong style="color:var(--text-primary);">${this._formatVal(reading.min, s.type)}</strong></span>
          <span>MAX: <strong style="color:var(--text-primary);">${this._formatVal(reading.max, s.type)}</strong></span>
          <span>Δ: <strong style="color:var(--text-primary);">${typeof reading.delta === 'number' ? (reading.delta >= 0 ? '+' : '') + reading.delta.toFixed(1) : '0.0'}</strong></span>
        </div>

        <div class="card-actions-row">
          <button class="card-action-btn btn-inspect-sensor" data-sensor-id="${s.id}" title="Deep-dive sensor specifications & resolution trace">
            🔍 Inspect
          </button>
          <button class="card-action-btn btn-quick-fault" data-sensor-id="${s.id}" title="Inject fault on this node">
            ⚡ ${hasFault ? 'Fix Fault' : 'Fault'}
          </button>
          <button class="card-action-btn btn-view-room" data-room-id="${s.room}" title="Highlight space on Floor Plan">
            📍 Space
          </button>
        </div>
      `;

      grid.appendChild(card);
    });

    container.appendChild(grid);
    this._attachCardActions(container);
  }

  _renderTableView(container, sensors) {
    const wrap = document.createElement('div');
    wrap.className = 'fleet-table-wrap';

    const table = document.createElement('table');
    table.className = 'fleet-matrix-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th class="sortable" data-sort="ID_ASC">SENSOR ID</th>
          <th>TYPE</th>
          <th class="sortable" data-sort="ROOM_ASC">SPACE / ROOM</th>
          <th class="sortable" data-sort="SYS_ASC">INGEST PROTOCOL</th>
          <th class="sortable" data-sort="VAL_DESC">LIVE VALUE</th>
          <th class="sortable" data-sort="SEV_DESC">HEALTH STATUS</th>
          <th>MIN / MAX RANGE</th>
          <th style="width:130px;">TREND SPARKLINE</th>
          <th style="text-align:right;">ACTIONS</th>
        </tr>
      </thead>
      <tbody>
        ${sensors.map(s => {
          const reading = this._readings[s.id] || { value: 0, unit: '', status: 'NORMAL', min: 0, max: 0, delta: 0 };
          const proto = PROTO_SPECS[s.source_system] || PROTO_SPECS.ENV_IOT;
          const typeInfo = TYPE_CONFIG[s.type] || TYPE_CONFIG.TEMPERATURE;
          const hist = this._history[s.id] || [0];
          const hasFault = !!this._injectedFaults[s.id];
          const formattedVal = this._formatVal(reading.value, s.type);
          const statusPill = this._getStatusBadge(reading.status, hasFault ? this._injectedFaults[s.id] : null);
          const sparklineSvg = this._generateSparklineSVG(hist, reading.status, 130, 24);

          return `
            <tr class="${reading.status === 'CRITICAL' ? 'row-critical' : reading.status === 'WARNING' ? 'row-warning' : ''}" data-sensor-id="${s.id}">
              <td style="font-family:var(--font-mono);font-weight:700;color:var(--text-primary);">
                ${typeInfo.icon} ${s.id}
                ${hasFault ? `<span style="font-size:7.5px;background:rgba(168,85,247,0.2);color:#c084fc;padding:1px 3px;border-radius:2px;margin-left:3px;">FAULT</span>` : ''}
              </td>
              <td style="font-family:var(--font-mono);color:var(--text-secondary);font-size:9.5px;">${typeInfo.label}</td>
              <td><span class="card-sensor-room" data-room-id="${s.room}">📍 ${this._getRoomName(s.room)}</span></td>
              <td>
                <span style="font-family:var(--font-mono);font-size:8.5px;font-weight:700;padding:2px 6px;border-radius:3px;background:${proto.bg};border:1px solid ${proto.border};color:${proto.text};">
                  ${s.source_system}
                </span>
              </td>
              <td style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--text-primary);" id="tbl-val-${s.id}">
                ${formattedVal} <span style="font-size:9px;color:var(--text-muted);font-weight:400;">${reading.unit}</span>
              </td>
              <td id="tbl-st-${s.id}">${statusPill}</td>
              <td style="font-family:var(--font-mono);font-size:9px;color:var(--text-secondary);" id="tbl-range-${s.id}">
                ${this._formatVal(reading.min, s.type)} &rarr; ${this._formatVal(reading.max, s.type)}
              </td>
              <td>
                <div style="height:24px;background:rgba(0,0,0,0.2);border-radius:3px;overflow:hidden;" id="tbl-spark-${s.id}">
                  ${sparklineSvg}
                </div>
              </td>
              <td style="text-align:right;">
                <div style="display:inline-flex;gap:4px;">
                  <button class="btn btn-speed btn-inspect-sensor" data-sensor-id="${s.id}" style="font-size:8.5px;padding:2px 6px;">🔍</button>
                  <button class="btn btn-speed btn-quick-fault" data-sensor-id="${s.id}" style="font-size:8.5px;padding:2px 6px;">⚡</button>
                  <button class="btn btn-speed btn-view-room" data-room-id="${s.room}" style="font-size:8.5px;padding:2px 6px;">📍</button>
                </div>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
    `;

    wrap.appendChild(table);
    container.appendChild(wrap);
    this._attachCardActions(container);

    wrap.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        this._sortBy = th.dataset.sort;
        const sortSelect = this.container.querySelector('#fleet-sort-select');
        if (sortSelect) sortSelect.value = this._sortBy;
        this._renderViewContent();
      });
    });
  }

  _renderSpatialView(container, sensors) {
    const grid = document.createElement('div');
    grid.className = 'fleet-spatial-grid';

    const roomsMap = {};
    (BUILDING.spaces || []).forEach(sp => {
      roomsMap[sp.id] = { space: sp, sensors: [] };
    });

    sensors.forEach(s => {
      if (!roomsMap[s.room]) {
        roomsMap[s.room] = { space: { id: s.room, name: s.room, type: 'SPACE', ifc_id: 'IFC_GENERIC' }, sensors: [] };
      }
      roomsMap[s.room].sensors.push(s);
    });

    Object.values(roomsMap).forEach(({ space, sensors: roomSensors }) => {
      if (roomSensors.length === 0) return;

      let roomHazard = 'SAFE';
      let highestTemp = 0;
      let highestSmoke = 0;
      let occupantCount = 0;

      roomSensors.forEach(s => {
        const r = this._readings[s.id];
        if (!r) return;
        if (s.type === 'TEMPERATURE' && typeof r.value === 'number' && r.value > highestTemp) highestTemp = r.value;
        if (s.type === 'SMOKE' && typeof r.value === 'number' && r.value > highestSmoke) highestSmoke = r.value;
        if (s.type === 'OCCUPANCY' && typeof r.value === 'number') occupantCount = r.value;
        if (r.status === 'CRITICAL') roomHazard = 'CRITICAL';
        else if (r.status === 'WARNING' && roomHazard !== 'CRITICAL') roomHazard = 'WARNING';
      });

      const hazardBadge = roomHazard === 'CRITICAL'
        ? `<span class="badge badge-red" style="animation:pulse-ring 1.8s infinite;">🔥 CRITICAL HAZARD</span>`
        : roomHazard === 'WARNING'
        ? `<span class="badge badge-yellow">⚠️ ELEVATED RISK</span>`
        : `<span class="badge badge-green">✅ NORMAL ZONE</span>`;

      const card = document.createElement('div');
      card.className = `fleet-room-group-card ${roomHazard === 'CRITICAL' ? 'status-critical' : ''}`;

      card.innerHTML = `
        <div class="room-group-header">
          <div>
            <div style="display:flex;align-items:center;gap:6px;">
              <h3 style="font-size:13px;font-weight:700;color:var(--text-primary);margin:0;">${space.name || space.id}</h3>
              <span style="font-family:var(--font-mono);font-size:8px;color:var(--text-muted);background:rgba(255,255,255,0.05);padding:1px 4px;border-radius:3px;">
                ${space.ifc_id || space.id}
              </span>
            </div>
            <div style="font-size:9px;color:var(--text-secondary);margin-top:2px;">
              Type: <strong>${space.type || 'SPACE'}</strong> · Capacity: <strong>${space.capacity || 40} pax</strong> · Active Occupants: <strong style="color:var(--accent-green);">${occupantCount}</strong>
            </div>
          </div>
          <div>${hazardBadge}</div>
        </div>

        <div class="room-group-sensors-list">
          ${roomSensors.map(s => {
            const reading = this._readings[s.id] || { value: 0, unit: '', status: 'NORMAL' };
            const proto = PROTO_SPECS[s.source_system] || PROTO_SPECS.ENV_IOT;
            const typeInfo = TYPE_CONFIG[s.type] || TYPE_CONFIG.TEMPERATURE;
            const formattedVal = this._formatVal(reading.value, s.type);

            return `
              <div class="room-sensor-mini-row" data-sensor-id="${s.id}">
                <div style="display:flex;align-items:center;gap:6px;">
                  <span>${typeInfo.icon}</span>
                  <strong style="color:var(--text-primary);">${s.id}</strong>
                  <span style="font-size:7.5px;padding:1px 4px;border-radius:2px;background:${proto.bg};color:${proto.text};border:1px solid ${proto.border};">${s.source_system}</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-weight:700;color:var(--text-primary);font-size:11px;">
                    ${formattedVal} <span style="font-size:8px;color:var(--text-muted);font-weight:400;">${reading.unit}</span>
                  </span>
                  <button class="btn btn-speed btn-inspect-sensor" data-sensor-id="${s.id}" style="font-size:8px;padding:1px 5px;" title="Inspect Sensor">🔍</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(255,255,255,0.05);padding-top:8px;margin-top:auto;">
          <span style="font-family:var(--font-mono);font-size:8.5px;color:var(--text-muted);">
            Peak Temp: <strong style="color:${highestTemp >= 60 ? '#ef4444' : highestTemp >= 38 ? '#f59e0b' : 'var(--text-primary)'}">${highestTemp > 0 ? highestTemp.toFixed(1) + '°C' : 'Normal'}</strong>
          </span>
          <button class="btn btn-speed btn-view-room" data-room-id="${space.id}" style="font-size:8.5px;padding:2px 7px;">
            📍 Focus on Floor Plan
          </button>
        </div>
      `;

      grid.appendChild(card);
    });

    container.appendChild(grid);
    this._attachCardActions(container);
  }

  _renderTopologyView(container, sensors) {
    const grid = document.createElement('div');
    grid.className = 'fleet-topology-grid';

    const gateways = ['BMS', 'FAS', 'OCCUPANCY', 'ENV_IOT'];

    gateways.forEach(protoKey => {
      const proto = PROTO_SPECS[protoKey];
      const protoSensors = sensors.filter(s => s.source_system === protoKey);
      const criticalCount = protoSensors.filter(s => this._readings[s.id]?.status === 'CRITICAL').length;
      const warningCount = protoSensors.filter(s => this._readings[s.id]?.status === 'WARNING').length;

      const card = document.createElement('div');
      card.className = 'fleet-gateway-card';

      card.innerHTML = `
        <div class="gateway-header">
          <div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${proto.border};"></span>
              <h3 style="font-size:13px;font-weight:700;color:var(--text-primary);margin:0;">${proto.name}</h3>
            </div>
            <div style="font-family:var(--font-mono);font-size:8.5px;color:var(--text-muted);margin-top:2px;">
              ${proto.gateway}
            </div>
          </div>
          <span style="font-family:var(--font-mono);font-size:8px;font-weight:700;padding:2px 6px;border-radius:3px;background:rgba(34,197,94,0.12);color:#34d399;border:1px solid rgba(34,197,94,0.3);">
            ● ACTIVE STREAM
          </span>
        </div>

        <div class="gateway-stat-pills">
          <div class="gateway-stat-pill">
            <div style="color:var(--text-muted);font-size:7.5px;">PROTOCOL STANDARD</div>
            <div style="color:var(--text-primary);font-weight:700;margin-top:2px;font-size:9px;">${proto.protocol}</div>
          </div>
          <div class="gateway-stat-pill">
            <div style="color:var(--text-muted);font-size:7.5px;">POLL INTERVAL / LATENCY</div>
            <div style="color:var(--accent-cyan);font-weight:700;margin-top:2px;font-size:9px;">${proto.pollRate} &middot; &lt;1.2ms</div>
          </div>
          <div class="gateway-stat-pill">
            <div style="color:var(--text-muted);font-size:7.5px;">SUBSCRIBED NODES</div>
            <div style="color:var(--text-primary);font-weight:700;margin-top:2px;font-size:11px;">${protoSensors.length} Nodes</div>
          </div>
          <div class="gateway-stat-pill">
            <div style="color:var(--text-muted);font-size:7.5px;">HEALTH DISPATCH</div>
            <div style="margin-top:2px;font-weight:700;font-size:9px;">
              ${criticalCount > 0 ? `<span style="color:#ef4444;">${criticalCount} ALARMS</span>` : warningCount > 0 ? `<span style="color:#f59e0b;">${warningCount} WARNS</span>` : `<span style="color:#10b981;">ALL HEALTHY</span>`}
            </div>
          </div>
        </div>

        <div style="margin-top:4px;">
          <div style="font-family:var(--font-mono);font-size:8px;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Connected Telemetry Feeds:</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;max-height:160px;overflow-y:auto;background:rgba(0,0,0,0.25);padding:6px;border-radius:4px;">
            ${protoSensors.map(s => {
              const r = this._readings[s.id];
              const isCrit = r?.status === 'CRITICAL';
              const isWarn = r?.status === 'WARNING';
              const color = isCrit ? '#ef4444' : isWarn ? '#f59e0b' : '#34d399';

              return `
                <button class="btn-inspect-sensor" data-sensor-id="${s.id}" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:3px;padding:2px 6px;font-family:var(--font-mono);font-size:8.5px;color:var(--text-primary);cursor:pointer;display:inline-flex;align-items:center;gap:3px;">
                  <span style="color:${color};font-size:8px;">●</span>
                  <span>${s.id}</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>
      `;

      grid.appendChild(card);
    });

    container.appendChild(grid);
    this._attachCardActions(container);
  }

  // ── Telemetry Update Engine ──────────────────────────────────

  _onSensorsUpdate({ readings, tick }) {
    if (!readings) return;

    for (const [id, data] of Object.entries(readings)) {
      let rawVal = data.value;
      let status = data.status || 'NORMAL';
      let unit = data.unit || '';

      if (this._injectedFaults[id]) {
        const fault = this._injectedFaults[id];
        if (fault === 'OFFLINE') { rawVal = null; status = 'OFFLINE'; unit = ''; }
        else if (fault === 'FROZEN') { rawVal = 29.5; status = 'FROZEN'; }
        else if (fault === 'INVALID') { rawVal = -999.0; status = 'INVALID'; unit = 'ERR'; }
        else if (fault === 'NOISY') { rawVal = +(Math.random() * 80).toFixed(1); status = 'NOISY'; }
        else if (fault === 'HEAT_SPIKE') { rawVal = 98.6; status = 'CRITICAL'; }
      }

      const numVal = typeof rawVal === 'number' ? rawVal : (rawVal === true ? 100 : 0);
      if (!this._history[id]) this._history[id] = [];
      this._history[id].push(numVal);
      if (this._history[id].length > 30) this._history[id].shift();

      const prev = this._readings[id] || { min: numVal, max: numVal, delta: 0 };
      const min = Math.min(prev.min !== undefined ? prev.min : numVal, numVal);
      const max = Math.max(prev.max !== undefined ? prev.max : numVal, numVal);
      const delta = typeof rawVal === 'number' && typeof prev.value === 'number' ? (rawVal - prev.value) : 0;

      this._readings[id] = { value: rawVal, unit, status, min, max, delta, lastUpdated: Date.now() };

      // Ingest live wire packet frame
      const sensor = SENSOR_MAP[id];
      if (sensor && Math.random() < 0.35) {
        this._addWirePacket(sensor.source_system, id, { value: rawVal, unit, status, zone: sensor.room });
      }

      // Fast in-place DOM updates for Grid View
      const valEl = this.container.querySelector(`#val-${id}`);
      if (valEl) valEl.innerHTML = `${this._formatVal(rawVal, this._getSensorType(id))} <span class="card-telemetry-unit">${unit}</span>`;
      const badgeEl = this.container.querySelector(`#badge-${id}`);
      if (badgeEl) badgeEl.innerHTML = this._getStatusBadge(status, this._injectedFaults[id]);
      const sparkEl = this.container.querySelector(`#spark-${id}`);
      if (sparkEl) sparkEl.innerHTML = this._generateSparklineSVG(this._history[id], status);
      const statsEl = this.container.querySelector(`#stats-${id}`);
      if (statsEl) {
        const sType = this._getSensorType(id);
        statsEl.innerHTML = `
          <span>MIN: <strong style="color:var(--text-primary);">${this._formatVal(min, sType)}</strong></span>
          <span>MAX: <strong style="color:var(--text-primary);">${this._formatVal(max, sType)}</strong></span>
          <span>Δ: <strong style="color:var(--text-primary);">${typeof delta === 'number' ? (delta >= 0 ? '+' : '') + (sType === 'OCCUPANCY' ? Math.round(delta) : delta.toFixed(1)) : '0'}</strong></span>
        `;
      }

      // Fast in-place DOM updates for Table View
      const tblVal = this.container.querySelector(`#tbl-val-${id}`);
      if (tblVal) tblVal.innerHTML = `${this._formatVal(rawVal, this._getSensorType(id))} <span style="font-size:9px;color:var(--text-muted);font-weight:400;">${unit}</span>`;
      const tblSt = this.container.querySelector(`#tbl-st-${id}`);
      if (tblSt) tblSt.innerHTML = this._getStatusBadge(status, this._injectedFaults[id]);
      const tblSpark = this.container.querySelector(`#tbl-spark-${id}`);
      if (tblSpark) tblSpark.innerHTML = this._generateSparklineSVG(this._history[id], status, 130, 24);
      const tblRange = this.container.querySelector(`#tbl-range-${id}`);
      if (tblRange) {
        const sType = this._getSensorType(id);
        tblRange.innerHTML = `${this._formatVal(min, sType)} &rarr; ${this._formatVal(max, sType)}`;
      }

      // Fast in-place Radar node update
      const pinDot = this.container.querySelector(`#radar-pin-dot-${id}`);
      const pinGlow = this.container.querySelector(`#radar-pin-glow-${id}`);
      if (pinDot && pinGlow) {
        const nodeColor = this._getNodeColor(status, this._injectedFaults[id]);
        pinDot.setAttribute('fill', nodeColor);
        pinGlow.setAttribute('fill', nodeColor);
        pinGlow.setAttribute('stroke', nodeColor);
        if (status === 'CRITICAL') pinGlow.setAttribute('r', '11');
        else if (status === 'WARNING') pinGlow.setAttribute('r', '9');
        else pinGlow.setAttribute('r', '7');
      }

      const cardEl = this.container.querySelector(`.fleet-sensor-card[data-sensor-id="${id}"]`);
      if (cardEl) cardEl.className = `fleet-sensor-card status-${this._injectedFaults[id] ? 'fault' : status.toLowerCase()}`;
    }

    this._refreshKPIs();
    this._refreshCompareChart();

    if (this._activeInspectorSensor && this._inspectorModal) {
      this._updateInspectorModalData(this._activeInspectorSensor);
    }
  }

  // ── KPI Ribbon Calculator ────────────────────────────────────

  _renderKPIRibbonHTML() {
    const sensors = BUILDING.sensors || [];
    let healthyCount = 0;
    let warningCount = 0;
    let criticalCount = 0;
    let faultCount = Object.keys(this._injectedFaults).length;
    let tempSum = 0;
    let tempCount = 0;
    let peakTemp = 0;
    let peakTempRoom = '—';
    let peakSmoke = 0;
    let totalOcc = 0;

    sensors.forEach(s => {
      const r = this._readings[s.id];
      if (!r) return;
      if (r.status === 'CRITICAL' || r.value === true) criticalCount++;
      else if (r.status === 'WARNING') warningCount++;
      else healthyCount++;

      if (s.type === 'TEMPERATURE' && typeof r.value === 'number') {
        tempSum += r.value;
        tempCount++;
        if (r.value > peakTemp) {
          peakTemp = r.value;
          peakTempRoom = this._getRoomName(s.room);
        }
      }
      if (s.type === 'SMOKE' && typeof r.value === 'number' && r.value > peakSmoke) {
        peakSmoke = r.value;
      }
      if (s.type === 'OCCUPANCY' && typeof r.value === 'number') {
        totalOcc += r.value;
      }
    });

    const avgTemp = tempCount > 0 ? (tempSum / tempCount).toFixed(1) : '24.5';

    return `
      <div class="fleet-kpi-card">
        <span class="lbl">TOTAL FLEET NODES</span>
        <div class="val" style="color:var(--accent-cyan);">
          <span>${sensors.length}</span>
          <span style="font-size:10px;color:var(--text-muted);font-weight:400;">/ ${sensors.length} ACTIVE</span>
        </div>
        <div class="sub">Heterogeneous Multi-Vendor</div>
      </div>

      <div class="fleet-kpi-card">
        <span class="lbl">HEALTHY NODES</span>
        <div class="val" style="color:var(--accent-green);">
          <span class="kpi-pulse-dot" style="background:#10b981;"></span>
          <span id="kpi-healthy-count">${healthyCount}</span>
        </div>
        <div class="sub">Normal Operating Envelope</div>
      </div>

      <div class="fleet-kpi-card">
        <span class="lbl">WARNING / ELEVATED</span>
        <div class="val" style="color:var(--accent-yellow);">
          <span class="kpi-pulse-dot" style="background:#f59e0b;"></span>
          <span id="kpi-warn-count">${warningCount}</span>
        </div>
        <div class="sub">Exceeds Normal Baseline</div>
      </div>

      <div class="fleet-kpi-card" style="${criticalCount > 0 ? 'border-color:rgba(239,68,68,0.6);box-shadow:0 0 12px rgba(239,68,68,0.25);' : ''}">
        <span class="lbl">CRITICAL / ALARM</span>
        <div class="val" style="color:var(--accent-red);">
          <span class="kpi-pulse-dot" style="background:#ef4444;${criticalCount>0?'animation:pulse-ring 0.8s infinite;':''}"></span>
          <span id="kpi-crit-count">${criticalCount}</span>
        </div>
        <div class="sub">${criticalCount > 0 ? '🔥 ACTIVE HAZARD TRIGGERED' : 'Zero Active Alarms'}</div>
      </div>

      <div class="fleet-kpi-card">
        <span class="lbl">AVG FLEET TEMP</span>
        <div class="val" style="color:var(--text-primary);" id="kpi-avg-temp">
          ${avgTemp} <span style="font-size:10px;color:var(--text-muted);font-weight:400;">°C</span>
        </div>
        <div class="sub">Peak: <strong id="kpi-peak-temp" style="color:${peakTemp>=60?'#ef4444':peakTemp>=38?'#f59e0b':'var(--text-primary)'}">${peakTemp>0?peakTemp.toFixed(1)+'°C ('+peakTempRoom+')':'Normal'}</strong></div>
      </div>

      <div class="fleet-kpi-card">
        <span class="lbl">PEAK SMOKE / OCCUPANCY</span>
        <div class="val" style="color:var(--text-primary);" id="kpi-peak-smoke">
          ${peakSmoke.toFixed(3)} <span style="font-size:10px;color:var(--text-muted);font-weight:400;">AQI</span>
        </div>
        <div class="sub">Total Detected Occupants: <strong id="kpi-total-occ" style="color:var(--accent-green);">${totalOcc} pax</strong></div>
      </div>

      <div class="fleet-kpi-card">
        <span class="lbl">INJECTED FAULTS</span>
        <div class="val" style="color:var(--accent-purple);" id="kpi-faults">
          ${faultCount} <span style="font-size:10px;color:var(--text-muted);font-weight:400;">NODES</span>
        </div>
        <div class="sub">${faultCount > 0 ? 'Middleware Stress Testing' : 'Resilience Test Standby'}</div>
      </div>
    `;
  }

  _refreshKPIs() {
    const ribbon = this.container.querySelector('#fleet-kpi-grid');
    if (ribbon) ribbon.innerHTML = this._renderKPIRibbonHTML();
  }

  // ── Sparkline SVG Generator ──────────────────────────────────

  _generateSparklineSVG(values, status = 'NORMAL', width = 240, height = 34) {
    if (!values || values.length === 0) values = [0];
    const len = values.length;
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = (maxVal - minVal) === 0 ? 1 : (maxVal - minVal);

    const padTop = 3;
    const padBottom = 3;
    const plotH = height - padTop - padBottom;

    const points = values.map((v, i) => {
      const x = len > 1 ? (i / (len - 1)) * width : width / 2;
      const normY = range > 0 ? (v - minVal) / range : (v > 0 ? 0.5 : 0);
      const y = height - padBottom - (normY * plotH);
      return [x.toFixed(1), y.toFixed(1)];
    });

    const pathD = 'M ' + points.map(p => p.join(',')).join(' L ');
    const areaD = `${pathD} L ${width},${height} L 0,${height} Z`;

    let strokeColor = '#06b6d4';
    let gradTop = 'rgba(6, 182, 212, 0.35)';
    if (status === 'CRITICAL') { strokeColor = '#ef4444'; gradTop = 'rgba(239, 68, 68, 0.4)'; }
    else if (status === 'WARNING') { strokeColor = '#f59e0b'; gradTop = 'rgba(245, 158, 11, 0.4)'; }
    else if (status === 'OFFLINE' || status === 'INVALID') { strokeColor = '#a855f7'; gradTop = 'rgba(168, 85, 247, 0.3)'; }

    const lastPt = points[points.length - 1] || [0, height / 2];

    return `
      <svg class="fleet-sparkline-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-${status}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${gradTop}" />
            <stop offset="100%" stop-color="rgba(0,0,0,0)" />
          </linearGradient>
        </defs>
        <path d="${areaD}" fill="url(#grad-${status})" />
        <path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="${lastPt[0]}" cy="${lastPt[1]}" r="2.8" fill="${strokeColor}" />
      </svg>
    `;
  }

  // ── Sensor Inspector Modal ───────────────────────────────────

  _openSensorInspector(sensorId) {
    const sensor = SENSOR_MAP[sensorId] || (BUILDING.sensors || []).find(s => s.id === sensorId);
    if (!sensor) return;

    this._activeInspectorSensor = sensorId;

    const modal = document.createElement('div');
    modal.className = 'fleet-modal-overlay';
    this._inspectorModal = modal;

    const proto = PROTO_SPECS[sensor.source_system] || PROTO_SPECS.ENV_IOT;
    const typeInfo = TYPE_CONFIG[sensor.type] || TYPE_CONFIG.TEMPERATURE;
    const reading = this._readings[sensorId] || { value: 0, unit: '', status: 'NORMAL', min: 0, max: 0, delta: 0 };
    const room = SPACE_MAP[sensor.room] || { name: sensor.room, ifc_id: 'IFC_GENERIC' };

    modal.innerHTML = `
      <div class="fleet-inspector-dialog">
        <div class="fleet-inspector-header">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:22px;">${typeInfo.icon}</span>
            <div>
              <div style="display:flex;align-items:center;gap:6px;">
                <h2 style="font-size:15px;font-weight:700;color:var(--text-primary);margin:0;">${sensor.id} — Hardware &amp; Telemetry Inspector</h2>
                <span style="font-family:var(--font-mono);font-size:8.5px;padding:2px 6px;border-radius:3px;background:${proto.bg};border:1px solid ${proto.border};color:${proto.text};">
                  ${sensor.source_system}
                </span>
              </div>
              <div style="font-size:10px;color:var(--text-secondary);margin-top:2px;">
                Deployed in <strong>${room.name || sensor.room}</strong> (${room.ifc_id || 'IFC_SPACE'}) · Physical Coords: (${sensor.x || 0}, ${sensor.y || 0})
              </div>
            </div>
          </div>
          <button id="btn-close-inspector" class="btn btn-speed" style="font-size:11px;padding:4px 8px;">✕ CLOSE</button>
        </div>

        <div class="fleet-inspector-tabs" id="inspector-tabs">
          <button class="fleet-tab-btn active" data-tab="telemetry">Real-Time Telemetry</button>
          <button class="fleet-tab-btn" data-tab="hardware">Hardware &amp; Protocols</button>
          <button class="fleet-tab-btn" data-tab="raw-payload">Ingested Payload</button>
          <button class="fleet-tab-btn" data-tab="ai-trace">Semantic Resolution</button>
        </div>

        <div class="fleet-inspector-body" id="inspector-body">
          ${this._renderInspectorTabContent('telemetry', sensor, reading, proto, typeInfo, room)}
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelectorAll('.fleet-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.fleet-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        const body = modal.querySelector('#inspector-body');
        if (body) {
          body.innerHTML = this._renderInspectorTabContent(tab, sensor, this._readings[sensorId], proto, typeInfo, room);
          this._attachInspectorBodyListeners(modal, sensorId);
        }
      });
    });

    modal.querySelector('#btn-close-inspector')?.addEventListener('click', () => this._closeSensorInspector());
    modal.addEventListener('click', e => { if (e.target === modal) this._closeSensorInspector(); });
    this._attachInspectorBodyListeners(modal, sensorId);
  }

  _closeSensorInspector() {
    if (this._inspectorModal) {
      this._inspectorModal.remove();
      this._inspectorModal = null;
      this._activeInspectorSensor = null;
    }
  }

  _renderInspectorTabContent(tab, sensor, reading, proto, typeInfo, room) {
    const hist = this._history[sensor.id] || [0];
    const formattedVal = this._formatVal(reading.value, sensor.type);

    switch (tab) {
      case 'telemetry':
        return `
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
            <div class="fleet-kpi-card">
              <span class="lbl">CURRENT VALUE</span>
              <div class="val" style="color:var(--text-primary);">${formattedVal} <span style="font-size:10px;color:var(--text-muted);">${reading.unit}</span></div>
              <div class="sub">${this._getStatusBadge(reading.status, this._injectedFaults[sensor.id])}</div>
            </div>
            <div class="fleet-kpi-card">
              <span class="lbl">BASELINE VALUE</span>
              <div class="val" style="color:var(--text-secondary);">${this._formatVal(typeInfo.baseVal, sensor.type)} <span style="font-size:10px;color:var(--text-muted);">${reading.unit}</span></div>
              <div class="sub">Nominal Room Average</div>
            </div>
            <div class="fleet-kpi-card">
              <span class="lbl">PEAK / RECORDED MAX</span>
              <div class="val" style="color:var(--accent-orange);">${this._formatVal(reading.max, sensor.type)} <span style="font-size:10px;color:var(--text-muted);">${reading.unit}</span></div>
              <div class="sub">Minimum: ${this._formatVal(reading.min, sensor.type)} ${reading.unit}</div>
            </div>
            <div class="fleet-kpi-card">
              <span class="lbl">SAFETY THRESHOLDS</span>
              <div class="val" style="color:var(--accent-yellow);font-size:14px;">Warn &ge; ${typeInfo.warnVal} · Crit &ge; ${typeInfo.critVal}</div>
              <div class="sub">7-Point Firewall Rule #2</div>
            </div>
          </div>

          <div style="background:rgba(0,0,0,0.35);border:1px solid var(--border-primary);border-radius:var(--radius-md);padding:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-family:var(--font-mono);font-size:10.5px;font-weight:700;color:var(--accent-cyan);">
                📈 HIGH-RESOLUTION TIME-SERIES TRAJECTORY (${hist.length} Samples Captured)
              </span>
              <div style="display:flex;gap:12px;font-family:var(--font-mono);font-size:8.5px;">
                <span style="color:var(--accent-cyan);">● Live Value</span>
                <span style="color:#f59e0b;">- - Warning (${typeInfo.warnVal})</span>
                <span style="color:#ef4444;">- - Critical (${typeInfo.critVal})</span>
              </div>
            </div>
            <div style="height:140px;background:rgba(0,0,0,0.25);border-radius:6px;overflow:hidden;position:relative;">
              ${this._generateExpandedChartSVG(hist, typeInfo, reading.status)}
            </div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg-card);border:1px solid var(--border-primary);border-radius:var(--radius-sm);padding:10px 14px;">
            <div style="font-size:10px;color:var(--text-secondary);">Simulate sensor anomaly or calibrate node sensitivity for this spatial feed.</div>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-speed btn-trigger-spike" data-sensor-id="${sensor.id}" style="color:var(--accent-orange);border-color:rgba(249,115,22,0.4);font-size:9.5px;">
                🔥 Trigger Heat Spike
              </button>
              <button class="btn btn-speed btn-toggle-fault-single" data-sensor-id="${sensor.id}" style="color:var(--accent-purple);border-color:rgba(168,85,247,0.4);font-size:9.5px;">
                ⚡ Inject Dropout
              </button>
            </div>
          </div>
        `;

      case 'hardware':
        return `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div style="background:rgba(0,0,0,0.3);border:1px solid var(--border-primary);border-radius:var(--radius-md);padding:14px;">
              <div style="font-family:var(--font-mono);font-size:10.5px;font-weight:700;color:var(--accent-cyan);margin-bottom:10px;">DEVICE SPECIFICATIONS &amp; FIRMWARE</div>
              <table style="width:100%;font-size:10px;border-collapse:collapse;">
                <tr style="border-bottom:1px solid rgba(255,255,255,0.04);"><td style="color:var(--text-muted);padding:5px 0;">Manufacturer Model:</td><td style="color:var(--text-primary);font-weight:600;">${proto.vendor}</td></tr>
                <tr style="border-bottom:1px solid rgba(255,255,255,0.04);"><td style="color:var(--text-muted);padding:5px 0;">Device UUID:</td><td style="color:var(--accent-cyan);font-family:var(--font-mono);">${sensor.id}</td></tr>
                <tr style="border-bottom:1px solid rgba(255,255,255,0.04);"><td style="color:var(--text-muted);padding:5px 0;">Physical Type:</td><td style="color:var(--text-primary);font-weight:600;">${typeInfo.label} (${sensor.type})</td></tr>
                <tr style="border-bottom:1px solid rgba(255,255,255,0.04);"><td style="color:var(--text-muted);padding:5px 0;">Firmware Build:</td><td style="font-family:var(--font-mono);color:var(--text-secondary);">v4.8.2-rtos-sec</td></tr>
                <tr><td style="color:var(--text-muted);padding:5px 0;">Resolution:</td><td style="font-family:var(--font-mono);color:var(--text-primary);">0.01 ${reading.unit} &middot; 16-bit ADC</td></tr>
              </table>
            </div>

            <div style="background:rgba(0,0,0,0.3);border:1px solid var(--border-primary);border-radius:var(--radius-md);padding:14px;">
              <div style="font-family:var(--font-mono);font-size:10.5px;font-weight:700;color:var(--accent-cyan);margin-bottom:10px;">NETWORK &amp; SPATIAL TOPOLOGY</div>
              <table style="width:100%;font-size:10px;border-collapse:collapse;">
                <tr style="border-bottom:1px solid rgba(255,255,255,0.04);"><td style="color:var(--text-muted);padding:5px 0;">Gateway:</td><td style="color:var(--text-primary);font-weight:600;">${proto.gateway}</td></tr>
                <tr style="border-bottom:1px solid rgba(255,255,255,0.04);"><td style="color:var(--text-muted);padding:5px 0;">Protocol:</td><td style="font-family:var(--font-mono);color:var(--text-primary);">${proto.protocol}</td></tr>
                <tr style="border-bottom:1px solid rgba(255,255,255,0.04);"><td style="color:var(--text-muted);padding:5px 0;">Sampling Rate:</td><td style="font-family:var(--font-mono);color:var(--accent-green);">${proto.pollRate}</td></tr>
                <tr style="border-bottom:1px solid rgba(255,255,255,0.04);"><td style="color:var(--text-muted);padding:5px 0;">IFC Space GUID:</td><td style="font-family:var(--font-mono);color:#38bdf8;">${room.ifc_id || sensor.room}</td></tr>
                <tr><td style="color:var(--text-muted);padding:5px 0;">Location:</td><td style="font-family:var(--font-mono);color:var(--text-primary);">X: ${sensor.x}px, Y: ${sensor.y}px</td></tr>
              </table>
            </div>
          </div>
        `;

      case 'raw-payload':
        const samplePayload = this._generateSamplePayload(sensor, reading);
        return `
          <div style="background:rgba(0,0,0,0.35);border:1px solid var(--border-primary);border-radius:var(--radius-md);padding:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-family:var(--font-mono);font-size:10.5px;font-weight:700;color:var(--accent-cyan);">📡 RAW HETEROGENEOUS INGESTION PAYLOAD</span>
              <span class="badge badge-cyan" style="font-size:8px;">LIVE WIRE BUFFER</span>
            </div>
            <pre style="background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:12px;color:#22d3ee;font-family:var(--font-mono);font-size:10.5px;overflow-x:auto;">${JSON.stringify(samplePayload, null, 2)}</pre>
          </div>
        `;

      case 'ai-trace':
        return `
          <div style="background:rgba(0,0,0,0.35);border:1px solid var(--border-primary);border-radius:var(--radius-md);padding:14px;">
            <div style="font-family:var(--font-mono);font-size:10.5px;font-weight:700;color:var(--accent-purple);margin-bottom:6px;">🧠 ZERO-SHOT SEMANTIC RESOLUTION PIPELINE</div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;text-align:center;font-family:var(--font-mono);font-size:9px;">
              <div style="background:rgba(0,0,0,0.4);padding:8px;border-radius:4px;"><span style="color:var(--text-muted);font-size:7.5px;">1. INGEST</span><div style="color:#fff;font-weight:700;">${sensor.source_system}</div></div>
              <div style="background:rgba(168,85,247,0.1);padding:8px;border-radius:4px;"><span style="color:var(--accent-purple);font-size:7.5px;">2. GEMINI AI</span><div style="color:#c084fc;font-weight:700;">Matched (0.98)</div></div>
              <div style="background:rgba(16,185,129,0.1);padding:8px;border-radius:4px;"><span style="color:var(--accent-green);font-size:7.5px;">3. FIREWALL</span><div style="color:#34d399;font-weight:700;">PASS (Safe)</div></div>
              <div style="background:rgba(6,182,212,0.1);padding:8px;border-radius:4px;"><span style="color:var(--accent-cyan);font-size:7.5px;">4. DT STATE</span><div style="color:#22d3ee;font-weight:700;">${sensor.room}</div></div>
            </div>
          </div>
        `;

      default: return '';
    }
  }

  _generateExpandedChartSVG(values, typeInfo, status) {
    const width = 740;
    const height = 140;
    if (!values || values.length === 0) values = [0];
    const len = values.length;
    const maxBound = Math.max(typeInfo.critVal * 1.2, Math.max(...values, 50));
    const minBound = 0;
    const range = maxBound - minBound;

    const warnY = height - ((typeInfo.warnVal - minBound) / range) * height;
    const critY = height - ((typeInfo.critVal - minBound) / range) * height;

    const points = values.map((v, i) => {
      const x = len > 1 ? (i / (len - 1)) * width : width / 2;
      const y = height - ((v - minBound) / range) * height;
      return [x.toFixed(1), y.toFixed(1)];
    });

    const pathD = 'M ' + points.map(p => p.join(',')).join(' L ');
    const areaD = `${pathD} L ${width},${height} L 0,${height} Z`;

    return `
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="width:100%;height:100%;display:block;">
        <line x1="0" y1="${warnY}" x2="${width}" y2="${warnY}" stroke="#f59e0b" stroke-width="1" stroke-dasharray="4,4" opacity="0.6"/>
        <line x1="0" y1="${critY}" x2="${width}" y2="${critY}" stroke="#ef4444" stroke-width="1" stroke-dasharray="4,4" opacity="0.6"/>
        <defs>
          <linearGradient id="exp-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="rgba(6, 182, 212, 0.4)" />
            <stop offset="100%" stop-color="rgba(6, 182, 212, 0.0)" />
          </linearGradient>
        </defs>
        <path d="${areaD}" fill="url(#exp-grad)" />
        <path d="${pathD}" fill="none" stroke="#00d4e8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        ${points.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="#00d4e8" />`).join('')}
      </svg>
    `;
  }

  _generateSamplePayload(sensor, reading) {
    const ts = Date.now();
    switch (sensor.source_system) {
      case 'BMS':
        return { _system: 'BMS_BACNET_IP', device_id: sensor.id, bms_zone: sensor.bms_zone || 'Z101', temp_celsius: typeof reading.value === 'number' ? reading.value : 24.5, timestamp: ts };
      case 'FAS':
        return { _system: 'FAS_FIRE_LOOP', asset: sensor.id, fas_device: sensor.fas_device || 'FA_D_101', air_obscuration: typeof reading.value === 'number' ? reading.value : 0.01, alert_status: reading.status === 'CRITICAL' ? 'ALARM' : 'NORMAL', timestamp: ts };
      case 'OCCUPANCY':
        return { _system: 'SMART_VISION_YOLO', camera_id: sensor.camera_id || 'CAM_101', target_space: sensor.room, presence_count: typeof reading.value === 'number' ? reading.value : 14, timestamp: ts };
      default:
        return { _system: 'ENV_IOT_WIRELESS', node_ref: sensor.id, thermal_index: typeof reading.value === 'number' ? reading.value : 25.0, timestamp: ts };
    }
  }

  _updateInspectorModalData(sensorId) {
    const modal = this._inspectorModal;
    if (!modal) return;
    const sensor = SENSOR_MAP[sensorId] || (BUILDING.sensors || []).find(s => s.id === sensorId);
    if (!sensor) return;
    const proto = PROTO_SPECS[sensor.source_system] || PROTO_SPECS.ENV_IOT;
    const typeInfo = TYPE_CONFIG[sensor.type] || TYPE_CONFIG.TEMPERATURE;
    const reading = this._readings[sensorId];
    const room = SPACE_MAP[sensor.room] || { name: sensor.room, ifc_id: 'IFC_GENERIC' };

    const activeTab = modal.querySelector('.fleet-tab-btn.active')?.dataset.tab || 'telemetry';
    const body = modal.querySelector('#inspector-body');
    if (body && activeTab === 'telemetry') {
      body.innerHTML = this._renderInspectorTabContent('telemetry', sensor, reading, proto, typeInfo, room);
      this._attachInspectorBodyListeners(modal, sensorId);
    }
  }

  _attachInspectorBodyListeners(modal, sensorId) {
    modal.querySelector('.btn-trigger-spike')?.addEventListener('click', () => {
      this._injectedFaults[sensorId] = 'HEAT_SPIKE';
      this.bus.emit('log', { tag: 'ai', msg: `⚡ Injected sudden HEAT SPIKE anomaly on sensor ${sensorId}` });
      this._refreshKPIs();
    });

    modal.querySelector('.btn-toggle-fault-single')?.addEventListener('click', () => {
      if (this._injectedFaults[sensorId]) delete this._injectedFaults[sensorId];
      else this._injectedFaults[sensorId] = 'OFFLINE';
      this.bus.emit('log', { tag: 'ai', msg: `⚡ Toggled FAULT status on sensor ${sensorId}` });
      this._refreshKPIs();
      this._renderViewContent();
    });
  }

  // ── Fault Injection Panel ────────────────────────────────────

  _renderFaultPanelHTML() {
    const sensors = BUILDING.sensors || [];
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:14px;">⚡</span>
          <strong style="font-size:11px;color:var(--accent-purple);font-family:var(--font-mono);">
            IoT Sensor Malfunction &amp; Middleware Resilience Testing Lab
          </strong>
        </div>
        <button id="btn-close-fault-panel" class="btn btn-speed" style="font-size:9px;padding:2px 6px;">✕ CLOSE</button>
      </div>

      <div style="font-size:9.5px;color:var(--text-secondary);">
        Directly test edge fault-tolerance and the 7-Point AI Safety Firewall by injecting hardware dropouts, frozen readings, high Gaussian noise, or corrupt out-of-bounds values.
      </div>

      <div class="fault-controls-bar">
        <label style="font-family:var(--font-mono);font-size:8.5px;color:var(--text-muted);">TARGET SENSOR:</label>
        <select id="fault-target-sensor" class="fault-select">
          <option value="ALL">ALL FLEET SENSORS</option>
          ${sensors.map(s => `<option value="${s.id}">${s.id} (${s.room} · ${s.type})</option>`).join('')}
        </select>

        <label style="font-family:var(--font-mono);font-size:8.5px;color:var(--text-muted);">FAULT PATTERN:</label>
        <select id="fault-type-select" class="fault-select">
          <option value="OFFLINE">Complete Node Dropout (Offline / Packet Loss)</option>
          <option value="FROZEN">Frozen Value (Stuck Telemetry)</option>
          <option value="NOISY">Gaussian Noise Drift (&plusmn;35°C Variance)</option>
          <option value="INVALID">Corrupt Value Rejection (-999.0°C)</option>
          <option value="HEAT_SPIKE">Thermal Flare (+60°C Spike)</option>
        </select>

        <button id="btn-apply-fault" class="btn btn-speed" style="color:var(--accent-purple);border-color:rgba(168,85,247,0.5);font-weight:700;font-size:9.5px;padding:4px 10px;">
          INJECT FAULT
        </button>
        <button id="btn-clear-all-faults" class="btn btn-reset" style="font-size:9.5px;padding:4px 10px;">
          CLEAR ALL FAULTS
        </button>
      </div>

      <div id="fault-feedback-box" style="display:none;background:rgba(0,0,0,0.3);border:1px solid rgba(168,85,247,0.3);border-radius:4px;padding:6px 10px;font-family:var(--font-mono);font-size:9px;color:#c084fc;"></div>
    `;
  }

  // ── Action Handlers ──────────────────────────────────────────

  _attachHeaderListeners(headerCard, filterToolbar, faultPanel, radarSection, wireSection, compareSection) {
    const searchInput = headerCard.querySelector('#fleet-search-input');
    searchInput?.addEventListener('input', e => {
      this._searchQuery = e.target.value.trim().toLowerCase();
      this._renderViewContent();
    });

    headerCard.querySelector('#btn-fleet-search-clear')?.addEventListener('click', () => {
      this._searchQuery = '';
      if (searchInput) searchInput.value = '';
      this._build();
    });

    // Module Toggles
    headerCard.querySelector('#btn-toggle-radar')?.addEventListener('click', () => {
      this._showRadar = !this._showRadar;
      if (radarSection) radarSection.style.display = this._showRadar ? 'flex' : 'none';
      headerCard.querySelector('#btn-toggle-radar')?.classList.toggle('active', this._showRadar);
    });

    headerCard.querySelector('#btn-toggle-wire')?.addEventListener('click', () => {
      this._showWireStream = !this._showWireStream;
      if (wireSection) wireSection.style.display = this._showWireStream ? 'flex' : 'none';
      headerCard.querySelector('#btn-toggle-wire')?.classList.toggle('active', this._showWireStream);
    });

    headerCard.querySelector('#btn-toggle-compare')?.addEventListener('click', () => {
      this._showCompareChart = !this._showCompareChart;
      if (compareSection) compareSection.style.display = this._showCompareChart ? 'flex' : 'none';
      headerCard.querySelector('#btn-toggle-compare')?.classList.toggle('active', this._showCompareChart);
    });

    headerCard.querySelector('#btn-toggle-fault-lab')?.addEventListener('click', () => {
      this._showFaultPanel = !this._showFaultPanel;
      if (faultPanel) faultPanel.style.display = this._showFaultPanel ? 'flex' : 'none';
      headerCard.querySelector('#btn-toggle-fault-lab')?.classList.toggle('active', this._showFaultPanel);
    });

    faultPanel.querySelector('#btn-close-fault-panel')?.addEventListener('click', () => {
      this._showFaultPanel = false;
      if (faultPanel) faultPanel.style.display = 'none';
      headerCard.querySelector('#btn-toggle-fault-lab')?.classList.remove('active');
    });

    // View Mode Toggles
    headerCard.querySelectorAll('.fleet-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        headerCard.querySelectorAll('.fleet-view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._viewMode = btn.dataset.view;
        this._renderViewContent();
      });
    });

    // Fault Actions
    faultPanel.querySelector('#btn-apply-fault')?.addEventListener('click', () => {
      const target = faultPanel.querySelector('#fault-target-sensor')?.value;
      const type = faultPanel.querySelector('#fault-type-select')?.value;
      const fbBox = faultPanel.querySelector('#fault-feedback-box');

      if (target === 'ALL') {
        (BUILDING.sensors || []).forEach(s => { this._injectedFaults[s.id] = type; });
        this.bus.emit('log', { tag: 'ai', msg: `⚡ Injected bulk fault pattern [${type}] across all fleet sensors.` });
      } else {
        this._injectedFaults[target] = type;
        this.bus.emit('log', { tag: 'ai', msg: `⚡ Injected fault [${type}] on node ${target}.` });
      }

      if (fbBox) {
        fbBox.style.display = 'block';
        fbBox.innerHTML = `✓ Successfully applied fault [${type}] to ${target}. The AI Safety Firewall is actively monitoring for out-of-bounds rejection.`;
      }

      this._refreshKPIs();
      this._renderViewContent();
    });

    faultPanel.querySelector('#btn-clear-all-faults')?.addEventListener('click', () => {
      this._injectedFaults = {};
      const fbBox = faultPanel.querySelector('#fault-feedback-box');
      if (fbBox) {
        fbBox.style.display = 'block';
        fbBox.innerHTML = `✓ Restored all fleet sensors to normal healthy telemetry operation.`;
      }
      this.bus.emit('log', { tag: 'ai', msg: `↺ Cleared all simulated sensor faults. Restored normal operations.` });
      this._refreshKPIs();
      this._renderViewContent();
    });

    // Export CSV & JSON
    headerCard.querySelector('#btn-export-csv')?.addEventListener('click', () => this._exportCSV());
    headerCard.querySelector('#btn-export-json')?.addEventListener('click', () => this._exportJSON());

    // Protocol Chips
    filterToolbar.querySelectorAll('.fleet-filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        filterToolbar.querySelectorAll('.fleet-filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this._filterProto = chip.dataset.filterProto;
        this._renderViewContent();
      });
    });

    filterToolbar.querySelector('#fleet-type-select')?.addEventListener('change', e => {
      this._filterType = e.target.value;
      this._renderViewContent();
    });

    filterToolbar.querySelector('#fleet-status-select')?.addEventListener('change', e => {
      this._filterStatus = e.target.value;
      this._renderViewContent();
    });

    filterToolbar.querySelector('#fleet-sort-select')?.addEventListener('change', e => {
      this._sortBy = e.target.value;
      this._renderViewContent();
    });
  }

  _attachCardActions(container) {
    container.querySelectorAll('.btn-inspect-sensor').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this._openSensorInspector(btn.dataset.sensorId);
      });
    });

    container.querySelectorAll('.btn-quick-fault').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.dataset.sensorId;
        if (this._injectedFaults[id]) delete this._injectedFaults[id];
        else this._injectedFaults[id] = 'OFFLINE';
        this._refreshKPIs();
        this._renderViewContent();
      });
    });

    container.querySelectorAll('.btn-view-room, .card-sensor-room').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        this._navigateToRoom(el.dataset.roomId);
      });
    });
  }

  _navigateToRoom(roomId) {
    if (this.navigation) this.navigation.switchView('view-live-twin');
    else document.getElementById('tab-live-twin')?.click();

    if (this.dtState && roomId) {
      this.bus.emit('dt:inspect_entity', { entityId: roomId });
      this.bus.emit('log', { tag: 'dt', msg: `Navigated from Sensor Fleet to inspect space: ${roomId}` });
    }
  }

  // ── Filters & Helpers ────────────────────────────────────────

  _getFilteredSensors() {
    let sensors = [...(BUILDING.sensors || [])];

    if (this._filterProto !== 'ALL') {
      sensors = sensors.filter(s => s.source_system === this._filterProto);
    }
    if (this._filterType !== 'ALL') {
      sensors = sensors.filter(s => s.type === this._filterType);
    }
    if (this._filterStatus !== 'ALL') {
      sensors = sensors.filter(s => {
        const r = this._readings[s.id];
        if (this._filterStatus === 'FAULT') return !!this._injectedFaults[s.id];
        return r && r.status === this._filterStatus;
      });
    }

    if (this._searchQuery) {
      const q = this._searchQuery;
      sensors = sensors.filter(s => {
        const roomObj = SPACE_MAP[s.room];
        const roomName = (roomObj?.name || s.room).toLowerCase();
        return s.id.toLowerCase().includes(q) ||
               s.room.toLowerCase().includes(q) ||
               roomName.includes(q) ||
               (s.source_system || '').toLowerCase().includes(q) ||
               (s.type || '').toLowerCase().includes(q);
      });
    }

    sensors.sort((a, b) => {
      const rA = this._readings[a.id] || { value: 0 };
      const rB = this._readings[b.id] || { value: 0 };
      switch (this._sortBy) {
        case 'ID_ASC':   return a.id.localeCompare(b.id);
        case 'ROOM_ASC': return (this._getRoomName(a.room)).localeCompare(this._getRoomName(b.room));
        case 'VAL_DESC': {
          const vA = typeof rA.value === 'number' ? rA.value : (rA.value ? 100 : 0);
          const vB = typeof rB.value === 'number' ? rB.value : (rB.value ? 100 : 0);
          return vB - vA;
        }
        case 'SEV_DESC': {
          const sev = st => st === 'CRITICAL' ? 3 : st === 'WARNING' ? 2 : 1;
          return sev(rB.status) - sev(rA.status);
        }
        case 'SYS_ASC':  return (a.source_system || '').localeCompare(b.source_system || '');
        default:         return 0;
      }
    });

    return sensors;
  }

  _getNodeColor(status, faultType) {
    if (faultType) return '#a855f7';
    if (status === 'CRITICAL') return '#ef4444';
    if (status === 'WARNING') return '#f59e0b';
    return '#10b981';
  }

  _formatVal(val, type) {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'boolean') return val ? 'ALM' : 'OK';
    if (typeof val === 'number') {
      if (type === 'OCCUPANCY') return String(Math.round(val));
      if (type === 'SMOKE' || (val < 1 && val > 0)) return val.toFixed(3);
      return val.toFixed(1);
    }
    return String(val);
  }

  _getStatusBadge(status, faultType = null) {
    if (faultType) {
      return `<span class="card-status-pill" style="background:rgba(168,85,247,0.18);border:1px solid rgba(168,85,247,0.4);color:#c084fc;"><span style="color:#c084fc;font-size:9px;">⚡</span> ${faultType}</span>`;
    }
    if (status === 'CRITICAL') {
      return `<span class="card-status-pill" style="background:rgba(239,68,68,0.18);border:1px solid rgba(239,68,68,0.4);color:#f87171;"><span style="color:#ef4444;font-size:9px;animation:pulse-ring 1.2s infinite;">●</span> CRITICAL</span>`;
    }
    if (status === 'WARNING') {
      return `<span class="card-status-pill" style="background:rgba(245,158,11,0.18);border:1px solid rgba(245,158,11,0.4);color:#fbbf24;"><span style="color:#f59e0b;font-size:9px;">●</span> WARN</span>`;
    }
    return `<span class="card-status-pill" style="background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);color:#34d399;"><span style="color:#10b981;font-size:9px;">●</span> ACTIVE</span>`;
  }

  _getRoomName(roomId) {
    const sp = SPACE_MAP[roomId];
    return sp?.name || roomId;
  }

  _getSensorType(sensorId) {
    const s = SENSOR_MAP[sensorId] || (BUILDING.sensors || []).find(item => item.id === sensorId);
    return s?.type || 'TEMPERATURE';
  }

  _exportCSV() {
    const sensors = BUILDING.sensors || [];
    const headers = ['Sensor_ID', 'Type', 'Room_ID', 'Room_Name', 'Source_System', 'Live_Value', 'Unit', 'Status', 'Min_Value', 'Max_Value', 'Delta', 'Timestamp'];
    const rows = sensors.map(s => {
      const r = this._readings[s.id] || {};
      const room = SPACE_MAP[s.room] || {};
      return [s.id, s.type, s.room, `"${room.name || s.room}"`, s.source_system, r.value ?? '', r.unit ?? '', r.status ?? 'NORMAL', r.min ?? '', r.max ?? '', r.delta ?? '', new Date().toISOString()].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `virtual_sensor_fleet_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    this.bus.emit('log', { tag: 'dt', msg: '📥 Exported Virtual IoT Sensor Fleet telemetry snapshot to CSV.' });
  }

  _exportJSON() {
    const sensors = BUILDING.sensors || [];
    const data = {
      exportTimestamp: new Date().toISOString(),
      building: BUILDING.name,
      totalSensors: sensors.length,
      sensors: sensors.map(s => ({
        id: s.id,
        type: s.type,
        room: s.room,
        roomName: this._getRoomName(s.room),
        source_system: s.source_system,
        telemetry: this._readings[s.id] || {},
        history: this._history[s.id] || []
      }))
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2));
    const link = document.createElement('a');
    link.setAttribute('href', dataStr);
    link.setAttribute('download', `virtual_sensor_fleet_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    this.bus.emit('log', { tag: 'dt', msg: '📥 Exported Virtual IoT Sensor Fleet telemetry dataset to JSON.' });
  }

  _onReset() {
    this._injectedFaults = {};
    this._initHistories();
    this._build();
  }
}
