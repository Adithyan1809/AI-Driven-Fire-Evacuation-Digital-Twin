/**
 * APP.JS — Master Orchestrator
 *
 * Wires all simulation, AI middleware, graph routing, occupant micro-simulation,
 * ConfigManager, multi-page navigation, and presentation UI modules together via the shared EventBus.
 * Ensures the 2D floor plan, virtual sensors, occupants, and Digital Twin state
 * are completely rendered and interactive from the moment the application loads.
 */

import { BUILDING }                from './data/building.js';
import { EventBus, SimulationEngine, createPRNG } from './modules/simulationEngine.js';
import { ConfigManager }           from './modules/configManager.js';
import { SensorSimulator }         from './modules/sensorSimulator.js';
import { HeterogeneousMessageGenerator } from './modules/heterogeneousMessages.js';
import { DigitalTwinState }        from './modules/digitalTwinState.js';
import { SemanticMiddleware }      from './modules/semanticMiddleware.js';
import { BuildingGraph }           from './modules/buildingGraph.js';
import { RouteOptimizer }          from './modules/routeOptimizer.js';
import { HazardEngine }            from './modules/hazardEngine.js';
import { OccupantSimulator }       from './modules/occupantSimulator.js';
import { MetricsEngine }           from './modules/metricsEngine.js';

import { PageNavigation }          from './ui/pageNavigation.js';
import { FloorPlanRenderer }       from './ui/floorPlanRenderer.js';
import { SensorFleetPage }         from './ui/sensorFleetPage.js';
import { AILabPage }               from './ui/aiLabPage.js';
import { BenchmarkPage }           from './ui/benchmarkPage.js';
import { MiddlewarePanel }         from './ui/middlewarePanel.js';
import { DTStatePanel }            from './ui/dtStatePanel.js';
import { EventLog }                from './ui/eventLog.js';
import { ResultsPanel }            from './ui/resultsPanel.js';
import { Controls }                from './ui/controls.js';
import { ConfigModal }             from './ui/configModal.js';
import { ScenarioBuilderModal }    from './ui/scenarioBuilderModal.js';
import { GuidedTourModal }         from './ui/guidedTourModal.js';
import { CustomBuildingArchitectModal } from './ui/customBuildingArchitectModal.js';

function boot() {
  const bus  = new EventBus();
  const rand = createPRNG(42);

  // ── Multi-Page Navigation ────────────────────────────────
  const navigation = new PageNavigation({ bus });

  // ── Centralized Configuration Engine ─────────────────────
  const configManager = new ConfigManager({ bus });

  // ── Core Domain Modules ──────────────────────────────────
  const engine     = new SimulationEngine({ bus, scenario: BUILDING.scenario, config: configManager, seed: 42 });
  const dtState    = new DigitalTwinState({ bus });
  const graph      = new BuildingGraph();
  const router     = new RouteOptimizer({ bus, graph, config: configManager });
  const sensorSim  = new SensorSimulator({ bus, rand, config: configManager });
  const heteroGen  = new HeterogeneousMessageGenerator({ bus, sensorSim, config: configManager, rand });
  const middleware = new SemanticMiddleware({ bus, dtState, config: configManager });
  const hazard     = new HazardEngine({ bus, dtState, graph, config: configManager });
  const metrics    = new MetricsEngine({ bus });

  let dtPanelRef = null;

  const occupants = new OccupantSimulator({
    bus,
    rand,
    routeOptimizer: router,
    dtState,
    config: configManager,
    signalComplete: () => engine.signalComplete(),
  });

  // ── View 1 (Live Twin) UI Presentation Modules ───────────
  const svgEl = document.getElementById('floor-plan-svg');
  const floorPlan = new FloorPlanRenderer({
    svgEl,
    bus,
    onRoomClick: (roomId) => {
      showRoomDetail(roomId, dtState, bus);
      if (dtPanelRef) dtPanelRef.inspectEntity(roomId);
    },
  });

  const dtPanel = new DTStatePanel({
    container: document.getElementById('dt-panel-body'),
    bus,
    dtState,
  });
  dtPanelRef = dtPanel;

  const middlewarePanel = new MiddlewarePanel({
    container: document.getElementById('middleware-panel-body'),
    bus,
  });

  const eventLog = new EventLog({
    container: document.getElementById('event-log-body'),
    bus,
  });

  const resultsPanel = new ResultsPanel({
    container: document.getElementById('results-panel'),
    bus,
    metrics,
  });

  // ── View 2: Dedicated Sensor Fleet Page ──────────────────
  const sensorFleetPage = new SensorFleetPage({
    container: document.getElementById('view-sensor-fleet'),
    bus,
    configManager,
    dtState,
    navigation,
  });

  // ── View 3: Dedicated AI Semantic Lab Page ───────────────
  const aiLabPage = new AILabPage({
    container: document.getElementById('view-ai-lab'),
    bus,
    aiService: middleware.aiService,
  });

  // ── View 4: Dedicated Benchmark & Evaluation Page ────────
  const benchmarkPage = new BenchmarkPage({
    container: document.getElementById('view-benchmarks'),
    bus,
    metrics,
  });

  const controls = new Controls({ engine, bus, configManager });

  // ── Configuration Modal ──────────────────────────────────
  const configModalEl = document.getElementById('config-modal');
  const configModal   = new ConfigModal({
    modalEl: configModalEl,
    configManager,
    aiService: middleware.aiService,
    bus,
  });

  // ── Custom Scenario Builder Modal ───────────────────────
  const scenarioBuilderModalEl = document.getElementById('scenario-builder-modal');
  const scenarioBuilderModal   = new ScenarioBuilderModal({
    modalEl: scenarioBuilderModalEl,
    configManager,
    bus,
  });

  document.getElementById('btn-open-scenario-builder')?.addEventListener('click', () => {
    scenarioBuilderModal.show();
  });

  // ── 10-Scene Guided Professor Presentation Modal ─────────
  const tourModalEl = document.getElementById('guided-tour-modal');
  const tourModal   = new GuidedTourModal({
    container: tourModalEl,
    bus,
    engine,
    aiService: middleware.aiService,
  });

  document.getElementById('btn-guided-tour-open')?.addEventListener('click', () => {
    tourModal.show(1);
  });

  // ── Universal Custom Building Architect & Studio Modal ────
  const customArchitectModal = new CustomBuildingArchitectModal({ bus });

  // ── Modal Handlers (Event Detail, Tech Stream, Config) ────
  setupModals(bus, configModal);

  // ── Initial State Initialization (Building is ALIVE at startup) ──
  let occupiableSpaces = (BUILDING.spaces || [])
    .filter(s => ['CLASSROOM', 'OFFICE', 'ADMIN', 'LABORATORY', 'CONFERENCE', 'SERVER_ROOM', 'ICU'].includes(s.type))
    .map(s => s.id);

  // Initialize initial occupants and routes so the building is immediately populated
  occupants.initialise(rand);
  const initialRoutes = router.calculateAllRoutes(occupiableSpaces);
  floorPlan.drawRoutes(initialRoutes);
  updateOccupantHeader(occupants);

  // ── Dynamic Custom Building Hot-Reload Listener ───────────
  bus.on('building:custom_loaded', ({ building }) => {
    try {
      // 1. Update active building name in header (both locations)
      const hdrName = document.getElementById('bld-name-header');
      if (hdrName) hdrName.textContent = building.name || 'Custom Facility';
      const fpName = document.getElementById('bld-name-floorplan');
      if (fpName) fpName.textContent = building.name || 'Custom Facility';

      // 2. Clear AI Semantic Service cache & refresh baseline dictionary
      if (middleware && middleware.aiService) {
        middleware.aiService.clearCache();
      }

      // 3. Re-initialize Floor Plan Renderer with new geometry
      floorPlan.setBuilding(building);

      // 4. Re-initialize Digital Twin State with new entities
      if (typeof dtState.init === 'function') dtState.init();
      else if (typeof dtState._initialise === 'function') dtState._initialise();

      // 5. Rebuild Building Graph
      graph.rebuild();

      // 6. Re-initialize Sensor Simulator & Heterogeneous Generator
      if (typeof sensorSim.reset === 'function') sensorSim.reset();
      if (typeof heteroGen.initialise === 'function') heteroGen.initialise(createPRNG(42));

      // 7. Re-calculate Occupiable Spaces (all non-corridor/stair/lift spaces)
      occupiableSpaces = (building.spaces || [])
        .filter(s => !['CORRIDOR', 'STAIR', 'LIFT'].includes(s.type))
        .map(s => s.id);

      // 8. Re-initialize Occupant Simulator with new capacity and weights
      occupants.reset();
      occupants.initialise(createPRNG(42));

      // 9. Recalculate baseline safe routes and update floor plan
      const newRoutes = router.calculateAllRoutes(occupiableSpaces);
      floorPlan.drawRoutes(newRoutes);
      updateOccupantHeader(occupants);

      // 10. Update Scenario Config Fire Room default
      const defaultRoom = building.scenario?.fireRoom || (building.spaces && building.spaces[0]?.id) || 'ROOM_101';
      configManager.update({
        scenario: {
          fireRoom: defaultRoom,
          fireRooms: [defaultRoom],
          fireStartSeconds: building.scenario?.fireStartSeconds || 5,
          fireSeverity: building.scenario?.fireSeverity || 'HIGH',
          spreadRateMultiplier: 1.0,
          fireSpread: true
        },
        building: { blockedExits: {} }
      });

      // 11. Configure Simulation Engine scenario & Auto-Start Live Simulation
      engine.scenario = {
        fire_room: defaultRoom,
        fire_start_s: building.scenario?.fireStartSeconds || 5,
        fireStartSeconds: building.scenario?.fireStartSeconds || 5,
        severity: building.scenario?.fireSeverity || 'HIGH',
        fire_spread: true,
        spread_rate: 1.0,
        temp_growth_rate: 1.2,
        smoke_growth_rate: 0.02
      };

      engine.reset();
      engine.start();

      // 12. Update Controls UI buttons
      const btnStart = document.getElementById('btn-start');
      const btnPause = document.getElementById('btn-pause');
      const btnStepNext = document.getElementById('btn-step-next');
      const btnReset = document.getElementById('btn-reset');
      if (btnStart) btnStart.disabled = true;
      if (btnPause) {
        btnPause.disabled = false;
      }
      if (btnStepNext) btnStepNext.disabled = false;
      if (btnReset) btnReset.disabled = false;
    } catch (err) {
      console.error('[Digital Twin] Error hot-loading custom building:', err);
    }
  });

  // ── Lifecycle Hooks ──────────────────────────────────────
  bus.on('sim:start', () => {
    const activeRoutes = router.calculateAllRoutes(occupiableSpaces);
    floorPlan.drawRoutes(activeRoutes);
    updateOccupantHeader(occupants);
  });

  bus.on('sim:fire_trigger', ({ room }) => {
    document.title = `🔥 FIRE IN ${room} — AI Digital Twin Demo`;
    bus.emit('log', { tag: 'fire', msg: `FIRE ALERT: ${room} — Critical temperature & smoke detected. FAS triggered.` });
  });

  bus.on('routes:graph_changed', () => {
    const newRoutes = router.calculateAllRoutes(occupiableSpaces);
    floorPlan.drawRoutes(newRoutes);
  });

  bus.on('occupants:evacuated', () => {
    updateOccupantHeader(occupants);
  });

  bus.on('occupants:reinitialized', () => {
    const activeRoutes = router.calculateAllRoutes(occupiableSpaces);
    floorPlan.drawRoutes(activeRoutes);
    updateOccupantHeader(occupants);
  });

  bus.on('sim:reset', () => {
    document.title = 'AI-Driven Digital Twin — Emergency Evacuation Demo';
    const cfg = configManager.get();
    const count = cfg.occupants?.count || 50;
    const badge = document.getElementById('occ-badge');
    if (badge) badge.textContent = `${count}`;
    const subBadge = document.getElementById('occ-sub-badge');
    if (subBadge) subBadge.textContent = `0 evac · ${count} rem`;

    // 1. Reset metrics tracking
    metrics.reset();

    // 2. Re-seed and re-initialise occupants
    occupants.reset();
    occupants.initialise(createPRNG(42));

    // 3. Recalculate baseline safe routes
    const resetRoutes = router.calculateAllRoutes(occupiableSpaces);
    floorPlan.drawRoutes(resetRoutes);

    // 4. Purge visual hazard overlays
    floorPlan.clearFlameBadges();
    floorPlan.clearAllSmokeEffects();
    floorPlan.setIgniteMode(false);
    floorPlan.selectRoom(null);
  });

  bus.on('sim:complete', () => {
    document.title = '✅ Evacuation Complete — AI Digital Twin Demo';
    updateOccupantHeader(occupants);
  });

  bus.on('config:changed', ({ config }) => {
    if (config.building?.buildingName) {
      const bldNameEl = document.getElementById('bld-name-header');
      if (bldNameEl) bldNameEl.textContent = config.building.buildingName;
      const bldNameFp = document.getElementById('bld-name-floorplan');
      if (bldNameFp) bldNameFp.textContent = config.building.buildingName;
    }
    if (config.occupants?.count) {
      const badge = document.getElementById('occ-badge');
      if (badge && engine.phase === 'IDLE') badge.textContent = `${config.occupants.count}`;
      const subBadge = document.getElementById('occ-sub-badge');
      if (subBadge && engine.phase === 'IDLE') subBadge.textContent = `0 evac · ${config.occupants.count} rem`;
    }
  });

  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.search.includes('debug'))) {
    window._dt = { bus, engine, configManager, dtState, graph, router, occupants, metrics, sensorSim, floorPlan, dtPanel, middleware, configModal, navigation };
  }

  console.log('[Digital Twin] System initialized with Multi-Page Navigation. Ready.');
}

function updateOccupantHeader(occupants) {
  const { total, evacuated, trapped, remaining } = occupants.getCount();
  const badge = document.getElementById('occ-badge');
  if (badge) badge.textContent = remaining > 0 ? `${remaining}` : '0';
  const subBadge = document.getElementById('occ-sub-badge');
  if (subBadge) {
    subBadge.textContent = trapped > 0
      ? `${evacuated} evac · ${trapped} trapped · ${remaining} rem`
      : `${evacuated} evac · ${remaining} rem`;
  }
  // New fp-header-center structure: update individual stat values
  const summary = document.getElementById('center-evac-summary');
  if (summary) {
    const stats = summary.querySelectorAll('.fp-evac-stat strong');
    if (stats[0]) stats[0].textContent = evacuated;
    if (stats[1]) stats[1].textContent = remaining;
    if (stats[2]) {
      stats[2].textContent = trapped;
      stats[2].style.color = trapped > 0 ? 'var(--accent-red)' : '';
    }
  }
}

function showRoomDetail(roomId, dtState, bus) {
  const entity = dtState.getEntity(roomId);
  if (!entity) return;
  bus.emit('log', {
    tag: 'dt',
    msg: `Inspected node [${roomId}]: Temp=${entity.temperature?.toFixed(1)}°C, Smoke=${entity.smoke?.toFixed(3)}, Hazard=${entity.hazard_level}`
  });
}

function setupModals(bus, configModal) {
  // ── Utility Menu (···) Toggle ────────────────────────────
  const btnUtility = document.getElementById('btn-utility-menu');
  const utilityDropdown = document.getElementById('utility-dropdown');
  btnUtility?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = utilityDropdown.classList.contains('hidden');
    utilityDropdown.classList.toggle('hidden', !isHidden);
    btnUtility.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
  });
  document.addEventListener('click', () => {
    utilityDropdown?.classList.add('hidden');
    btnUtility?.setAttribute('aria-expanded', 'false');
  });

  // ── Panel Toggle Logic ───────────────────────────────────
  const panelLeft    = document.getElementById('panel-left');
  const panelRight   = document.getElementById('panel-right');
  const backdrop     = document.getElementById('panel-backdrop');
  const btnToggleL   = document.getElementById('btn-panel-left-toggle');
  const btnToggleR   = document.getElementById('btn-panel-right-toggle');

  function updateBackdrop() {
    const anyOpen = panelLeft?.classList.contains('panel-open') || panelRight?.classList.contains('panel-open');
    backdrop?.classList.toggle('visible', !!anyOpen);
  }

  btnToggleL?.addEventListener('click', () => {
    panelLeft?.classList.toggle('panel-open');
    updateBackdrop();
  });

  btnToggleR?.addEventListener('click', () => {
    panelRight?.classList.toggle('panel-open');
    updateBackdrop();
  });

  backdrop?.addEventListener('click', () => {
    panelLeft?.classList.remove('panel-open');
    panelRight?.classList.remove('panel-open');
    updateBackdrop();
  });

  // Auto-open left panel when a room is selected on floor plan
  bus.on('room:selected', () => {
    panelLeft?.classList.add('panel-open');
    updateBackdrop();
  });

  // Auto-open right panel on AI events briefly
  bus.on('middleware:processed', () => {
    if (!panelRight?.classList.contains('panel-open')) {
      panelRight?.classList.add('panel-open');
      updateBackdrop();
    }
  });

  // ── Setup Sheet Toggle ───────────────────────────────────
  const setupSheet = document.getElementById('sim-setup-sheet');
  const btnSetup   = document.getElementById('btn-sim-setup');
  const btnCloseSetup = document.getElementById('btn-close-setup-sheet');

  btnSetup?.addEventListener('click', () => {
    const isOpen = setupSheet?.classList.contains('sheet-open');
    setupSheet?.classList.toggle('sheet-open', !isOpen);
    setupSheet?.setAttribute('aria-hidden', isOpen ? 'true' : 'false');
  });

  btnCloseSetup?.addEventListener('click', () => {
    setupSheet?.classList.remove('sheet-open');
    setupSheet?.setAttribute('aria-hidden', 'true');
  });

  // Mode toggle buttons in setup sheet mirror controls.js mode buttons
  const btnModeSheetDemo = document.getElementById('btn-mode-demo-sheet');
  const btnModeSheetRT   = document.getElementById('btn-mode-realtime-sheet');
  const btnModeDemoMain  = document.getElementById('btn-mode-demo');
  const btnModeRTMain    = document.getElementById('btn-mode-realtime');
  btnModeSheetDemo?.addEventListener('click', () => {
    btnModeDemoMain?.click();
    btnModeSheetDemo.classList.add('active');
    btnModeSheetRT?.classList.remove('active');
  });
  btnModeSheetRT?.addEventListener('click', () => {
    btnModeRTMain?.click();
    btnModeSheetRT.classList.add('active');
    btnModeSheetDemo?.classList.remove('active');
  });

  // ── Configuration Modal ──────────────────────────────────
  bus.on('modal:open_config', () => {
    configModal.show();
  });

  document.getElementById('btn-cfg-open')?.addEventListener('click', () => {
    configModal.show();
    utilityDropdown?.classList.add('hidden');
  });

  // ── Presentation Mode (Toggle / P shortcut) ──────────────
  function togglePresentationMode(force) {
    const isPres = typeof force === 'boolean' ? force : !document.body.classList.contains('presentation-mode');
    document.body.classList.toggle('presentation-mode', isPres);
    const btnTool = document.getElementById('btn-presentation-mode-toggle');
    const btnMenu = document.getElementById('btn-pres-mode-menu');
    btnTool?.classList.toggle('active', isPres);
    if (btnMenu) {
      btnMenu.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
        ${isPres ? 'Exit Presentation (P)' : 'Presentation Mode (P)'}
      `;
    }
    if (isPres) {
      panelLeft?.classList.remove('panel-open');
      panelRight?.classList.remove('panel-open');
      updateBackdrop();
    }
    bus.emit('presentation:toggled', { active: isPres });
  }

  document.getElementById('btn-presentation-mode-toggle')?.addEventListener('click', () => togglePresentationMode());
  document.getElementById('btn-pres-mode-menu')?.addEventListener('click', () => {
    togglePresentationMode();
    utilityDropdown?.classList.add('hidden');
  });

  document.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      togglePresentationMode();
    }
  });

  document.getElementById('btn-architect-tool-open')?.addEventListener('click', () => {
    bus.emit('modal:open_custom_architect', {});
  });

  function escapeHtml(str) {
    if (typeof str !== 'string') return String(str ?? '');
    return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);
  }

  // Technical Drawer Modal
  const drawerModal = document.getElementById('tech-drawer-modal');
  const drawerContent = document.getElementById('tech-drawer-content');
  const btnCloseDrawer = document.getElementById('btn-close-tech-drawer');

  bus.on('modal:open_technical_drawer', ({ records = [] }) => {
    if (!drawerModal || !drawerContent) return;
    drawerContent.innerHTML = records.map((r, i) => {
      const source = escapeHtml(r.source || (r.cacheHit ? 'SEMANTIC_MEMORY' : 'GEMINI_AI'));
      const lat = Number(r.latency || 0).toFixed(1);
      const msgStr = escapeHtml(JSON.stringify(r.msg));

      const uniqueMap = new Map();
      (r.mappings || []).forEach(m => {
        const key = `${m.source_entity || m.from}➔${m.canonical_entity || m.to}`;
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, {
            from: m.source_entity || m.from || 'SENSOR',
            to: m.canonical_entity || m.to || 'UNKNOWN',
            conf: +(m.confidence || 0.95).toFixed(2),
            field: m.field || m.source_attribute || 'telemetry'
          });
        }
      });
      const distinctMaps = Array.from(uniqueMap.values());
      const mapStr = distinctMaps.map(m =>
        `<span style="background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.3);border-radius:3px;padding:1px 5px;margin-right:4px;font-size:10px;"><strong>${escapeHtml(m.from)}</strong> → <span style="color:#22c55e;font-weight:700;">${escapeHtml(m.to)}</span> (${(m.conf*100).toFixed(0)}%)</span>`
      ).join(' ');

      const explStr = escapeHtml(r.mappings?.[0]?.explanation || r.mappings?.[0]?.reasoning || 'Zero-shot resolution.');
      return `
        <div style="background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:10px 12px;margin-bottom:8px;font-family:var(--font-mono);font-size:11px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:4px;">
            <span style="color:var(--accent-cyan);font-weight:700;">RECORD #${i + 1} — ${source}</span>
            <span class="badge badge-cyan" style="font-size:9px;">${lat}ms</span>
          </div>
          <div style="color:var(--text-muted);margin-bottom:4px;word-break:break-all;"><strong style="color:var(--text-secondary);">RAW:</strong> ${msgStr}</div>
          <div style="margin-bottom:4px;"><strong style="color:var(--text-secondary);">RESOLVED:</strong> ${mapStr}</div>
          <div style="color:var(--text-secondary);font-size:10px;line-height:1.4;"><strong style="color:var(--accent-amber);">REASON:</strong> ${explStr}</div>
        </div>
      `;
    }).join('') || '<div style="color:var(--text-muted);padding:16px;text-align:center;">No telemetry records captured yet. Start simulation to capture records.</div>';
    drawerModal.style.display = 'flex';
  });

  btnCloseDrawer?.addEventListener('click', () => {
    if (drawerModal) drawerModal.style.display = 'none';
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}
