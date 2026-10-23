/**
 * FLOOR PLAN RENDERER
 *
 * High-performance 2D SVG Digital Twin renderer for building floor plans.
 * Displays:
 *   - Architectural spaces, corridors, stairs, lifts, doors, and exits
 *   - Embedded live room telemetry badges (Temperature, Smoke, Occupancy, Status)
 *   - Virtual IoT sensor markers with live readings & status indicators
 *   - Real-time autonomous occupant agents
 *   - Dynamic Dijkstra shortest-path routes with safe/rerouted indicators
 *   - Visual smoke expansion and glowing hazard overlays
 *
 * Generically binds to the active BuildingModel single source of truth.
 */

import { BUILDING, NODE_MAP } from '../data/building.js';

const HAZARD_FILL = {
  NORMAL:   '#1a2e52',   /* clearly distinct from floor #060b18 */
  WARNING:  '#3a2a0d',   /* visible warm amber-dark */
  CRITICAL: '#4a1616',   /* visible red-dark */
  BLOCKED:  '#3d0d0d',   /* deep red, distinct from critical */
};

const HAZARD_STROKE = {
  NORMAL:   '#3d6fab',   /* brighter blue border for normal rooms */
  WARNING:  '#f59e0b',
  CRITICAL: '#ef4444',
  BLOCKED:  '#991b1b',
};

const HAZARD_BADGE_COLOR = {
  NORMAL:   '#22c55e',
  WARNING:  '#f59e0b',
  CRITICAL: '#ef4444',
  BLOCKED:  '#dc2626',
};

const OCC_COLOUR = {
  IDLE:       '#00d4e8',
  EVACUATING: '#f59e0b',
  REDIRECTED: '#f97316',
  EVACUATED:  '#22c55e',
  TRAPPED:    '#ef4444',
  BLOCKED:    '#dc2626',
};

const SENSOR_TYPE_ICON = {
  TEMPERATURE: '🌡️',
  SMOKE:       '💨',
  FIRE_ALARM:  '🚨',
  OCCUPANCY:   '👥',
};

export class FloorPlanRenderer {
  /**
   * @param {Object}      opts
   * @param {SVGElement}  opts.svgEl
   * @param {EventBus}    opts.bus
   * @param {Function}    opts.onRoomClick
   */
  constructor({ svgEl, bus, onRoomClick }) {
    this.svg         = svgEl;
    this.bus         = bus;
    this.onRoomClick = onRoomClick || (() => {});
    this._roomEls    = {};
    this._hazardEls  = {};
    this._badgeEls   = {}; // roomId -> { textEl, bgEl, dotEl }
    this._routeLayer = null;
    this._occLayer   = null;
    this._sensorLayer= null;
    this._hazardLayer= null;
    this._graphLayer = null;
    this._occEls     = {};
    this._sensorEls  = {};
    this._smokeEls   = {};
    this._exitEls    = {};
    this._liftBadges = {};
    this._selectedRoom = null;
    this._tooltip    = document.getElementById('tooltip');
    this._routes     = {};
    this._isSimActive = false;
    this.igniteMode  = false;
    this._flameBadges= {};
    this._latestDTState = {};

    // ── Smooth Occupant Lerp Interpolation State ──
    this._visualPos = {};
    this._occTargets = {};
    this._rafHandle = null;

    // ── Interactive Pan & Zoom Engine State ──
    this._scale = 1.0;
    this._panX = 0;
    this._panY = 0;
    this._isPanning = false;
    this._startPan = { x: 0, y: 0 };
    this._hideTooltipTimer = null;

    this.setBuilding(BUILDING);
    this._initPanZoom();
    this._startRenderLoop();
    this._bindEvents();
  }


  setBuilding(buildingModel) {
    this.BUILDING = buildingModel;
    this.NODE_MAP = {};
    if (this.BUILDING.graph && this.BUILDING.graph.nodes) {
      this.BUILDING.graph.nodes.forEach(n => { this.NODE_MAP[n.id] = n; });
    } else {
      this.NODE_MAP = { ...NODE_MAP };
    }
    // Also index space centroids and exit coordinates so all route waypoints resolve
    (this.BUILDING.spaces || []).forEach(s => {
      if (!this.NODE_MAP[s.id]) {
        this.NODE_MAP[s.id] = { id: s.id, x: s.x + s.width / 2, y: s.y + s.height / 2 };
      }
    });
    (this.BUILDING.exits || []).forEach(e => {
      if (!this.NODE_MAP[e.id]) {
        this.NODE_MAP[e.id] = { id: e.id, x: e.x, y: e.y };
      }
    });

    this._roomEls    = {};
    this._hazardEls  = {};
    this._badgeEls   = {};
    this._occEls     = {};
    this._sensorEls  = {};
    this._smokeEls   = {};
    this._exitEls    = {};
    this._liftBadges = {};
    this._selectedRoom = null;
    this._routes     = {};
    this._activeOccupants = [];

    this._buildSVG();
  }

  // ── Public Update API ──────────────────────────────────

  updateRoomState(entityId, entity) {
    const rect = this._roomEls[entityId];
    if (!rect) return;
    const level = entity.hazard_level || 'NORMAL';
    const predState = entity.predicted_state || 'SAFE';

    rect.setAttribute('fill',   HAZARD_FILL[level]   || HAZARD_FILL.NORMAL);
    rect.setAttribute('stroke', HAZARD_STROKE[level] || HAZARD_STROKE.NORMAL);
    rect.setAttribute('stroke-width', level === 'CRITICAL' || level === 'BLOCKED' ? '2.5' : '1.5');

    // S-Tier: Apply hazard glow & predictive pulse classes
    rect.classList.remove('hazard-warning', 'hazard-critical', 'hazard-blocked', 'hazard-predicted-warning', 'hazard-predicted-critical');
    if (level === 'WARNING')  rect.classList.add('hazard-warning');
    if (level === 'CRITICAL') rect.classList.add('hazard-critical');
    if (level === 'BLOCKED')  rect.classList.add('hazard-blocked');

    // Predictive Hazard Styling (when deterministic state is still NORMAL or WARNING)
    if (level === 'NORMAL' || level === 'WARNING') {
      if (predState === 'PREDICTED_CRITICAL') {
        rect.classList.add('hazard-predicted-critical');
        rect.setAttribute('stroke', '#f97316');
        rect.setAttribute('stroke-dasharray', '5 3');
        rect.setAttribute('stroke-width', '2');
      } else if (predState === 'PREDICTED_WARNING') {
        rect.classList.add('hazard-predicted-warning');
        rect.setAttribute('stroke', '#f59e0b');
        rect.setAttribute('stroke-dasharray', '4 2');
        rect.setAttribute('stroke-width', '1.8');
      } else {
        rect.removeAttribute('stroke-dasharray');
      }
    } else {
      rect.removeAttribute('stroke-dasharray');
    }

    const overlay = this._hazardEls[entityId];
    if (overlay) {
      overlay.style.display = level !== 'NORMAL' ? '' : 'none';
      overlay.setAttribute('class', `hazard-overlay ${level.toLowerCase()}`);
    }

    // Dynamic Smoke & Flame Plume rendering based on live physics
    const smokeVal = typeof entity.smoke === 'number' ? entity.smoke : 0;
    if (level === 'CRITICAL' || level === 'BLOCKED' || smokeVal >= 0.25) {
      if (!this._smokeEls[entityId]) {
        this.addSmokeEffect(entityId);
      }
    } else if (level === 'NORMAL' && smokeVal < 0.10) {
      if (this._smokeEls[entityId]) {
        this.clearSmokeEffects(entityId);
      }
    }

    if (entity.fire_alarm && !this._flameBadges[entityId]) {
      this.addFlameBadge(entityId);
    }

    // Update embedded room telemetry badge (minimalist progressive disclosure)
    const badge = this._badgeEls[entityId];
    if (badge) {
      const tempStr = typeof entity.temperature === 'number' ? `${entity.temperature.toFixed(1)}°C` : '27.4°C';

      if (badge.isCorridor || badge.isStair) {
        badge.statusEl.textContent = `${tempStr} · ${level}`;
        badge.statusEl.setAttribute('fill', HAZARD_BADGE_COLOR[level] || (badge.isStair ? '#60a5fa' : '#94a3b8'));
      } else if (badge.dotEl) {
        if (level === 'NORMAL' && predState === 'PREDICTED_CRITICAL') {
          badge.dotEl.setAttribute('fill', '#f97316');
          badge.statusEl.textContent = `${tempStr} · P-CRIT`;
          badge.statusEl.setAttribute('fill', '#f97316');
        } else if (level === 'NORMAL' && predState === 'PREDICTED_WARNING') {
          badge.dotEl.setAttribute('fill', '#f59e0b');
          badge.statusEl.textContent = `${tempStr} · P-WARN`;
          badge.statusEl.setAttribute('fill', '#f59e0b');
        } else if (level !== 'NORMAL') {
          badge.dotEl.setAttribute('fill', HAZARD_BADGE_COLOR[level] || '#22c55e');
          badge.statusEl.textContent = `${tempStr} · ${level}`;
          badge.statusEl.setAttribute('fill', HAZARD_BADGE_COLOR[level] || '#22c55e');
        } else {
          badge.dotEl.setAttribute('fill', '#30d158');
          badge.statusEl.textContent = `${tempStr} · NORMAL`;
          badge.statusEl.setAttribute('fill', '#94a3b8');
        }
      }
    }

    // Update attached sensors
    const space = this.BUILDING.spaces.find(s => s.id === entityId);
    if (space && space.sensors) {
      space.sensors.forEach(sid => this._updateSensorMarker(sid, level));
    }
  }


  updateExitState(exitId, accessible) {
    const els = this._exitEls[exitId];
    if (!els) return;
    els.glow.classList.toggle('blocked', !accessible);
    els.marker.classList.toggle('blocked', !accessible);
    els.label.classList.toggle('blocked', !accessible);
    els.label.textContent = accessible ? els.origLabel : '✕ ' + els.origLabel;
  }

  setLiftBlocked(liftId, isBlocked) {
    const badge = this._liftBadges[liftId];
    if (badge) {
      badge.style.display = isBlocked ? '' : 'none';
    }
    const rect = this._roomEls[liftId];
    if (rect) {
      rect.setAttribute('fill', isBlocked ? '#260808' : HAZARD_FILL.NORMAL);
      rect.setAttribute('stroke', isBlocked ? '#ef4444' : '#2d4a7a');
    }
  }

  drawRoutes(routes) {
    this._routes = routes || {};
    this._refreshRouteLayer();
  }

  _refreshRouteLayer() {
    if (!this._routeLayer) return;
    while (this._routeLayer.firstChild) {
      this._routeLayer.removeChild(this._routeLayer.firstChild);
    }

    const drawnKeys = new Set();

    // 1. Draw live dynamic paths from active evacuating occupants
    if (this._activeOccupants && this._activeOccupants.length > 0) {
      this._activeOccupants.forEach(occ => {
        if (occ.status === 'EVACUATED' || occ.status === 'TRAPPED' || occ.status === 'BLOCKED') return;
        const remainingPath = occ.currentPath || occ.path || [];
        if (remainingPath.length < 1) return;

        const pathKey = `${occ.status}-${remainingPath.join('-')}`;
        if (!drawnKeys.has(pathKey)) {
          drawnKeys.add(pathKey);
          this._drawOccupantTrail(occ, remainingPath);
        }
      });
    }

    // 2. Fallback: Draw static baseline routes if no dynamic occupant trails drawn yet
    if (drawnKeys.size === 0 && this._routes) {
      Object.values(this._routes).forEach(route => {
        if (!route || !route.path || route.path.length < 2) return;
        const key = route.path.join('-');
        if (drawnKeys.has(key)) return;
        drawnKeys.add(key);
        this._drawSingleRoute(route);
      });
    }
  }

  _drawOccupantTrail(occ, pathNodes) {
    if (!this._routeLayer || !pathNodes || pathNodes.length === 0) return;
    const status = occ.status === 'REDIRECTED' ? 'REDIRECTED' : (occ.routeStatus || 'SAFE');

    const points = [];
    if (occ.svgX !== undefined && occ.svgY !== undefined) {
      points.push({ x: occ.svgX, y: occ.svgY });
    }

    pathNodes.forEach(nid => {
      const node = this.NODE_MAP[nid];
      if (node) {
        if (points.length === 0 || Math.hypot(points[points.length - 1].x - node.x, points[points.length - 1].y - node.y) > 2) {
          points.push({ x: node.x, y: node.y });
        }
      }
    });

    if (points.length < 2) return;

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', p1.x);
      line.setAttribute('y1', p1.y);
      line.setAttribute('x2', p2.x);
      line.setAttribute('y2', p2.y);
      line.setAttribute('class', `route-segment ${status.toLowerCase()}${status === 'REDIRECTED' ? ' route-segment-animated' : ''}`);
      if (i === points.length - 2) {
        line.setAttribute('marker-end', status === 'SAFE' ? 'url(#route-arrow)' : 'url(#route-arrow-orange)');
      }
      this._routeLayer.appendChild(line);
    }
  }

  _startRenderLoop() {
    const LERP_FACTOR = 0.25;
    const loop = () => {
      for (const [id, item] of Object.entries(this._occEls)) {
        if (!item || !item.circle) continue;
        const target = this._occTargets[id];
        if (!target) continue;

        if (!this._visualPos[id]) {
          this._visualPos[id] = { x: target.x, y: target.y };
        }
        const vp = this._visualPos[id];
        const dx = target.x - vp.x;
        const dy = target.y - vp.y;
        if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
          vp.x += dx * LERP_FACTOR;
          vp.y += dy * LERP_FACTOR;
        } else {
          vp.x = target.x;
          vp.y = target.y;
        }
        item.circle.setAttribute('cx', vp.x.toFixed(1));
        item.circle.setAttribute('cy', vp.y.toFixed(1));
      }
      if (typeof requestAnimationFrame !== 'undefined') {
        this._rafHandle = requestAnimationFrame(loop);
      }
    };
    if (typeof requestAnimationFrame !== 'undefined') {
      this._rafHandle = requestAnimationFrame(loop);
    }
  }

  updateOccupants(occupants) {
    if (!this._occLayer) return;

    this._activeOccupants = occupants || [];

    // Prune stale occupant elements
    const activeIds = new Set((occupants || []).map(o => o.id));
    for (const [id, item] of Object.entries(this._occEls)) {
      if (!activeIds.has(id)) {
        if (item.g && item.g.parentNode) item.g.parentNode.removeChild(item.g);
        delete this._occEls[id];
        delete this._occTargets[id];
        delete this._visualPos[id];
      }
    }

    // S-Tier: Radius and visual weight by status
    const OCC_RADIUS = {
      IDLE:       4,
      EVACUATING: 6,
      REDIRECTED: 7,
      TRAPPED:    8,
      EVACUATED:  3,
      BLOCKED:    8,
    };

    occupants.forEach(occ => {
      let item = this._occEls[occ.id];
      if (!item) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'occupant');
        g.setAttribute('id', `occ-el-${occ.id}`);

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('r', OCC_RADIUS[occ.status] || 4);
        circle.setAttribute('fill', OCC_COLOUR[occ.status] || OCC_COLOUR.IDLE);
        circle.setAttribute('stroke', 'rgba(0,0,0,0.55)');
        circle.setAttribute('stroke-width', '1.5');
        circle.setAttribute('cx', occ.svgX);
        circle.setAttribute('cy', occ.svgY);

        g.appendChild(circle);
        this._occLayer.appendChild(g);
        item = { g, circle };
        this._occEls[occ.id] = item;
        this._visualPos[occ.id] = { x: occ.svgX, y: occ.svgY };

        // Tactical Agent micro-HUD on hover
        g.style.cursor = 'pointer';
        g.addEventListener('mouseenter', e => this._showOccupantTooltip(e, occ));
        g.addEventListener('mouseleave', () => this._scheduleHideTooltip());
      }

      this._occTargets[occ.id] = { x: occ.svgX, y: occ.svgY };

      // Fallback for headless environments (tests) where RAF isn't ticking
      if (typeof requestAnimationFrame === 'undefined') {
        item.circle.setAttribute('cx', occ.svgX);
        item.circle.setAttribute('cy', occ.svgY);
      }

      item.circle.setAttribute('fill', OCC_COLOUR[occ.status] || OCC_COLOUR.IDLE);
      item.circle.setAttribute('r', OCC_RADIUS[occ.status] || 4);
      item.g.style.display = occ.status === 'EVACUATED' ? 'none' : '';

      // Keep occ reference fresh
      item.occ = occ;

      // S-Tier: Animate TRAPPED and REDIRECTED with a filter class
      if (occ.status === 'TRAPPED' || occ.status === 'BLOCKED') {
        item.g.style.filter = 'drop-shadow(0 0 5px rgba(239,68,68,0.9))';
      } else if (occ.status === 'REDIRECTED') {
        item.g.style.filter = 'drop-shadow(0 0 4px rgba(249,115,22,0.7))';
      } else if (occ.status === 'EVACUATING') {
        item.g.style.filter = 'drop-shadow(0 0 3px rgba(245,158,11,0.6))';
      } else {
        item.g.style.filter = '';
      }
    });

    // Continuously refresh active route flow paths
    this._refreshRouteLayer();
  }


  selectRoom(roomId) {
    if (this._selectedRoom && this._roomEls[this._selectedRoom]) {
      this._roomEls[this._selectedRoom].classList.remove('selected');
    }
    this._selectedRoom = roomId;

    const allSpaces = Object.values(this._roomEls);
    if (roomId && this._roomEls[roomId]) {
      this._roomEls[roomId].classList.add('selected');
      allSpaces.forEach(el => {
        if (el !== this._roomEls[roomId]) {
          el.classList.add('dimmed');
        } else {
          el.classList.remove('dimmed');
        }
      });
    } else {
      allSpaces.forEach(el => el.classList.remove('dimmed'));
    }
  }

  setIgniteMode(enabled) {
    this.igniteMode = !!enabled;
    if (this.svg) {
      this.svg.classList.toggle('ignite-active-cursor', this.igniteMode);
    }
    const hud = document.getElementById('ignite-hud-banner');
    if (hud) {
      hud.style.display = this.igniteMode ? 'flex' : 'none';
    }
  }

  igniteRoom(roomId) {
    const space = this.BUILDING.spaces.find(s => s.id === roomId);
    if (!space) return;

    this.addFlameBadge(roomId);
    this.addSmokeEffect(roomId);

    this.bus.emit('sim:fire_trigger', {
      room: roomId,
      rooms: [roomId],
      manualTrigger: true,
      _t: (typeof performance !== 'undefined' ? performance.now() : Date.now())
    });

    this.bus.emit('log', {
      tag: 'hazard',
      msg: `Ignition: Fire detected in ${space.id} (${space.name})`,
      priority: 'high'
    });
  }

  addFlameBadge(roomId) {
    const space = this.BUILDING.spaces.find(s => s.id === roomId);
    if (!space || this._flameBadges[roomId]) return;

    const badgeG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    badgeG.setAttribute('class', 'flame-origin-badge');
    badgeG.setAttribute('id', `flame-badge-${roomId}`);

    const cx = space.x + space.width - 38;
    const cy = space.y + 13;

    const bg = this._appendRect(badgeG, {
      x: cx - 34, y: cy - 8, w: 68, h: 16,
      cls: 'flame-badge-bg'
    });
    bg.setAttribute('rx', '4');
    bg.setAttribute('fill', 'rgba(255, 69, 58, 0.92)');
    bg.setAttribute('stroke', 'rgba(255, 69, 58, 0.6)');
    bg.setAttribute('stroke-width', '0.75');

    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', cx - 24);
    dot.setAttribute('cy', cy);
    dot.setAttribute('r', '2.5');
    dot.setAttribute('fill', '#ffffff');
    badgeG.appendChild(dot);

    const text = this._text(cx + 4, cy + 0.5, 'FIRE ORIGIN', 'flame-badge-text');
    text.setAttribute('fill', '#ffffff');
    text.setAttribute('font-weight', '700');
    text.setAttribute('font-size', '8px');
    text.setAttribute('letter-spacing', '0.4px');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-family', 'var(--font-mono)');
    badgeG.appendChild(text);

    this.svg.appendChild(badgeG);
    this._flameBadges[roomId] = badgeG;
  }

  clearFlameBadges() {
    Object.keys(this._flameBadges).forEach(id => {
      const el = this._flameBadges[id];
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    this._flameBadges = {};
  }

  addSmokeEffect(roomId) {
    const space = this.BUILDING.spaces.find(s => s.id === roomId);
    if (!space) return;
    if (this._smokeEls[roomId]) return;

    const smokeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    smokeGroup.setAttribute('class', 'smoke-group');
    smokeGroup.setAttribute('id', `smoke-group-${roomId}`);

    for (let i = 0; i < 5; i++) {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', space.x + space.width / 2 + (Math.random() - 0.5) * space.width * 0.4);
      circle.setAttribute('cy', space.y + space.height / 2 + (Math.random() - 0.5) * space.height * 0.4);
      circle.setAttribute('r', `${10 + Math.random() * 12}`);
      circle.setAttribute('class', 'smoke-particle');
      circle.style.animationDelay = `${i * 0.4}s`;
      smokeGroup.appendChild(circle);
    }
    this.svg.appendChild(smokeGroup);
    this._smokeEls[roomId] = smokeGroup;
  }

  clearSmokeEffects(roomId) {
    const el = this._smokeEls[roomId];
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
      delete this._smokeEls[roomId];
    }
  }

  clearAllSmokeEffects() {
    Object.keys(this._smokeEls).forEach(r => this.clearSmokeEffects(r));
    this._smokeEls = {};
  }

  applyVisualizationConfig(v = {}) {
    if (this._sensorLayer) this._sensorLayer.style.display = v.showSensors !== false ? '' : 'none';
    if (this._occLayer)    this._occLayer.style.display = v.showOccupants !== false ? '' : 'none';
    if (this._routeLayer)  this._routeLayer.style.display = v.showRoutes !== false ? '' : 'none';
    if (this._hazardLayer) this._hazardLayer.style.display = v.showHazardHeatmap !== false ? '' : 'none';
    if (this._graphLayer)  this._graphLayer.style.display = v.showGraph === true ? '' : 'none';

    if (v.zoomLevel) {
      const scale = v.zoomLevel / 100;
      this.svg.style.transform = scale !== 1 ? `scale(${scale})` : '';
      this.svg.style.transformOrigin = 'center center';
    }
  }

  // ── SVG Builder ────────────────────────────────────────

  _getViewport() {
    let maxX = this.BUILDING.viewport?.width || this.BUILDING.dimensions?.width || 880;
    let maxY = this.BUILDING.viewport?.height || this.BUILDING.dimensions?.height || 500;
    (this.BUILDING.spaces || []).forEach(s => {
      maxX = Math.max(maxX, (s.x || 0) + (s.width || 0) + 40);
      maxY = Math.max(maxY, (s.y || 0) + (s.height || 0) + 40);
    });
    (this.BUILDING.exits || []).forEach(e => {
      maxX = Math.max(maxX, (e.x || 0) + (e.width || 40) + 40);
      maxY = Math.max(maxY, (e.y || 0) + (e.height || 40) + 40);
    });
    return { width: Math.ceil(maxX), height: Math.ceil(maxY) };
  }

  _buildSVG() {
    this.svg.innerHTML = '';
    const vp = this._getViewport();
    this.svg.setAttribute('viewBox', `0 0 ${vp.width} ${vp.height}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    this._defs();
    this._drawBackground();
    this._drawGrid();
    this._drawSpaces();
    this._drawDoors();
    this._drawExits();

    this._hazardLayer = this._group('hazard-layer');
    this._buildHazardOverlays();

    this._graphLayer  = this._group('graph-layer');
    this._graphLayer.style.display = 'none';
    this._drawTopologicalGraph();

    this._routeLayer  = this._group('route-layer');
    this._occLayer    = this._group('occupant-layer');
    this._sensorLayer = this._group('sensor-layer');
    this._drawSensors();
  }

  _defs() {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    
    // Green arrow marker for safe routes
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'route-arrow');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '6');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '5');
    marker.setAttribute('markerHeight', '5');
    marker.setAttribute('orient', 'auto-start-reverse');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M 0 1 L 10 5 L 0 9 z');
    path.setAttribute('fill', '#22c55e');
    marker.appendChild(path);
    defs.appendChild(marker);

    // Orange arrow marker for reroutes
    const markerOrange = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    markerOrange.setAttribute('id', 'route-arrow-orange');
    markerOrange.setAttribute('viewBox', '0 0 10 10');
    markerOrange.setAttribute('refX', '6');
    markerOrange.setAttribute('refY', '5');
    markerOrange.setAttribute('markerWidth', '5');
    markerOrange.setAttribute('markerHeight', '5');
    markerOrange.setAttribute('orient', 'auto-start-reverse');
    const pathOrange = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathOrange.setAttribute('d', 'M 0 1 L 10 5 L 0 9 z');
    pathOrange.setAttribute('fill', '#f97316');
    markerOrange.appendChild(pathOrange);
    defs.appendChild(markerOrange);

    // Red arrow marker for blocked/critical routes
    const markerRed = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    markerRed.setAttribute('id', 'route-arrow-red');
    markerRed.setAttribute('viewBox', '0 0 10 10');
    markerRed.setAttribute('refX', '6');
    markerRed.setAttribute('refY', '5');
    markerRed.setAttribute('markerWidth', '5');
    markerRed.setAttribute('markerHeight', '5');
    markerRed.setAttribute('orient', 'auto-start-reverse');
    const pathRed = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathRed.setAttribute('d', 'M 0 1 L 10 5 L 0 9 z');
    pathRed.setAttribute('fill', '#ef4444');
    markerRed.appendChild(pathRed);
    defs.appendChild(markerRed);

    this.svg.appendChild(defs);
  }

  _drawBackground() {
    const vp = this._getViewport();
    const bg = this._appendRect(this.svg, {
      x: 0, y: 0,
      w: vp.width, h: vp.height,
      cls: 'floor-bg'
    });
    bg.setAttribute('fill', '#080d1a');
  }

  _drawGrid() {
    const g = this._group('grid-lines');
    const vp = this._getViewport();
    for (let x = 0; x <= vp.width; x += 40) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x); line.setAttribute('y1', 0);
      line.setAttribute('x2', x); line.setAttribute('y2', vp.height);
      line.setAttribute('class', 'floor-grid');
      g.appendChild(line);
    }
    for (let y = 0; y <= vp.height; y += 40) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', 0); line.setAttribute('y1', y);
      line.setAttribute('x2', vp.width); line.setAttribute('y2', y);
      line.setAttribute('class', 'floor-grid');
      g.appendChild(line);
    }
  }

  _drawSpaces() {
    const g = this._group('spaces-layer');
    const baselines = this.BUILDING.sensor_baselines || {};

    this.BUILDING.spaces.forEach(space => {
      const spaceG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      spaceG.setAttribute('id', `space-g-${space.id}`);

      const rect = this._appendRect(spaceG, {
        x: space.x, y: space.y, w: space.width, h: space.height,
        cls: `room ${space.type.toLowerCase()}`
      });
      rect.setAttribute('id', `room-rect-${space.id}`);
      rect.setAttribute('fill', HAZARD_FILL.NORMAL);
      rect.setAttribute('stroke', HAZARD_STROKE.NORMAL);
      rect.setAttribute('stroke-width', '1.5');
      rect.setAttribute('rx', '4');

      rect.addEventListener('click', (e) => {
        if (this.igniteMode || e.shiftKey || e.altKey) {
          this.igniteRoom(space.id);
        } else {
          this.selectRoom(space.id);
          this.onRoomClick(space.id);
        }
      });
      rect.addEventListener('mouseenter', e => this._showSpaceTooltip(e, space));
      rect.addEventListener('mouseleave', () => this._scheduleHideTooltip(250));

      this._roomEls[space.id] = rect;

      // Labels & Live Telemetry Badges
      if (space.type !== 'CORRIDOR' && space.type !== 'STAIR' && space.type !== 'LIFT') {
        const cx = space.x + space.width / 2;
        const topY = space.y + 18;

        const lbl = this._text(cx, topY, space.id, 'room-label');
        const name = this._text(cx, topY + 12, space.name, 'room-name');
        spaceG.appendChild(lbl);
        spaceG.appendChild(name);

        // Embedded Room Telemetry Badge (minimalist, quiet, single-line)
        const badgeG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        badgeG.setAttribute('class', 'room-telemetry-badge');

        const badgeW = Math.min(space.width - 24, 114);
        const badgeH = 18;
        const badgeX = cx - badgeW / 2;
        const badgeY = space.y + space.height - badgeH - 6;

        const bgEl = this._appendRect(badgeG, {
          x: badgeX, y: badgeY, w: badgeW, h: badgeH,
          cls: 'room-telemetry-bg'
        });
        bgEl.setAttribute('rx', '4');

        const dotEl = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dotEl.setAttribute('cx', badgeX + 8);
        dotEl.setAttribute('cy', badgeY + badgeH / 2);
        dotEl.setAttribute('r', '2');
        dotEl.setAttribute('fill', '#30d158');
        dotEl.setAttribute('class', 'room-status-dot');
        badgeG.appendChild(dotEl);

        const statusEl = this._text(badgeX + 15, badgeY + badgeH / 2 + 0.5, '27.4°C · NORMAL', 'room-telemetry-text');
        statusEl.setAttribute('text-anchor', 'start');
        statusEl.setAttribute('dominant-baseline', 'central');
        statusEl.setAttribute('font-weight', '500');
        statusEl.setAttribute('font-size', '8.5px');
        statusEl.setAttribute('font-family', 'var(--font-mono)');
        statusEl.setAttribute('fill', '#94a3b8');
        badgeG.appendChild(statusEl);

        spaceG.appendChild(badgeG);
        this._badgeEls[space.id] = { bgEl, dotEl, statusEl };
      } else if (space.type === 'CORRIDOR') {
        const cx = space.x + space.width / 2;
        const isVertical = (space.height || 100) > (space.width || 100) * 1.5;
        const cy = space.y + space.height / 2;
        const topY = isVertical ? space.y + 30 : cy - 5;

        const lbl = this._text(cx, topY, space.name.toUpperCase(), 'corridor-label');
        spaceG.appendChild(lbl);

        const statusEl = this._text(cx, topY + 12, '27.4°C · NORMAL', 'corridor-status-sub');
        statusEl.setAttribute('dominant-baseline', 'central');
        statusEl.setAttribute('text-anchor', 'middle');
        statusEl.setAttribute('font-size', '8px');
        statusEl.setAttribute('font-family', 'var(--font-mono)');
        statusEl.setAttribute('fill', '#64748b');
        spaceG.appendChild(statusEl);

        this._badgeEls[space.id] = { statusEl, isCorridor: true };
      } else if (space.type === 'STAIR') {
        const cx = space.x + space.width / 2;
        const cy = space.y + space.height / 2;
        const lbl = this._text(cx, cy - 6, 'STAIRS', 'stair-label');
        spaceG.appendChild(lbl);

        const statusEl = this._text(cx, cy + 8, '27.4°C · NORMAL', 'stair-status-sub');
        statusEl.setAttribute('dominant-baseline', 'central');
        statusEl.setAttribute('text-anchor', 'middle');
        statusEl.setAttribute('font-size', '8px');
        statusEl.setAttribute('font-family', 'var(--font-mono)');
        statusEl.setAttribute('fill', '#60a5fa');
        spaceG.appendChild(statusEl);

        this._badgeEls[space.id] = { statusEl, isStair: true };
      } else if (space.type === 'LIFT') {
        const cx = space.x + space.width / 2;
        const cy = space.y + space.height / 2;
        const lbl = this._text(cx, cy - 4, space.name, 'room-label');
        spaceG.appendChild(lbl);

        const badge = this._text(cx, cy + 12, '🚫 DISABLED', 'lift-disabled-label');
        badge.style.display = 'none';
        spaceG.appendChild(badge);
        this._liftBadges[space.id] = badge;
      }

      g.appendChild(spaceG);
    });
  }

  _drawDoors() {
    const g = this._group('doors-layer');
    const doors = this.BUILDING.doors || [];

    doors.forEach(door => {
      // 1. Explicit rectangle doorway (e.g. BUILDING_A legacy)
      if (door.x !== undefined && door.w !== undefined) {
        const rect = this._appendRect(g, {
          x: door.x, y: door.y, w: door.w, h: door.h,
          cls: 'door-rect'
        });
        rect.setAttribute('fill', 'rgba(56, 189, 248, 0.55)');
        rect.setAttribute('stroke', '#38bdf8');
        rect.setAttribute('stroke-width', '1.5');
        rect.setAttribute('rx', '2');
        return;
      }

      // 2. Explicit line doorway
      if (door.x1 !== undefined && door.x2 !== undefined) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', door.x1); line.setAttribute('y1', door.y1);
        line.setAttribute('x2', door.x2); line.setAttribute('y2', door.y2);
        line.setAttribute('class', 'door');
        line.setAttribute('stroke', '#38bdf8');
        line.setAttribute('stroke-width', '2.5');
        line.setAttribute('stroke-linecap', 'round');
        g.appendChild(line);
        return;
      }

      // 3. Topological doorway ({ from, to }) in Custom Architect buildings
      if (door.from && door.to) {
        const s1 = (this.BUILDING.spaces || []).find(s => s.id === door.from) ||
                   (this.BUILDING.exits || []).find(e => e.id === door.from);
        const s2 = (this.BUILDING.spaces || []).find(s => s.id === door.to) ||
                   (this.BUILDING.exits || []).find(e => e.id === door.to);

        if (!s1 || !s2) return;

        // Space A bounding box
        const s1w = s1.width || 40;
        const s1h = s1.height || 40;
        const s2w = s2.width || 40;
        const s2h = s2.height || 40;

        // Check vertical adjacency (s1 above s2 or s2 above s1)
        const overlapLeft = Math.max(s1.x, s2.x);
        const overlapRight = Math.min(s1.x + s1w, s2.x + s2w);
        const horizontalOverlap = overlapRight - overlapLeft;

        // Check horizontal adjacency (s1 left of s2 or s2 left of s1)
        const overlapTop = Math.max(s1.y, s2.y);
        const overlapBottom = Math.min(s1.y + s1h, s2.y + s2h);
        const verticalOverlap = overlapBottom - overlapTop;

        const doorGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        doorGroup.setAttribute('class', 'doorway-portal-g');
        doorGroup.setAttribute('id', `door-${door.from}-${door.to}`);

        if (horizontalOverlap > 8) {
          // Horizontal boundary door
          const midX = (overlapLeft + overlapRight) / 2;
          const doorW = Math.min(48, Math.max(30, horizontalOverlap * 0.45));
          const doorH = 8;
          let doorY;
          if (s1.y + s1h <= s2.y + 15) {
            doorY = (s1.y + s1h + s2.y) / 2 - doorH / 2;
          } else {
            doorY = (s2.y + s2h + s1.y) / 2 - doorH / 2;
          }

          const dRect = this._appendRect(doorGroup, {
            x: midX - doorW / 2, y: doorY, w: doorW, h: doorH,
            cls: 'door-portal'
          });
          dRect.setAttribute('rx', '3');
          g.appendChild(doorGroup);
        } else if (verticalOverlap > 8) {
          // Vertical boundary door
          const midY = (overlapTop + overlapBottom) / 2;
          const doorW = 8;
          const doorH = Math.min(48, Math.max(30, verticalOverlap * 0.45));
          let doorX;
          if (s1.x + s1w <= s2.x + 15) {
            doorX = (s1.x + s1w + s2.x) / 2 - doorW / 2;
          } else {
            doorX = (s2.x + s2w + s1.x) / 2 - doorW / 2;
          }

          const dRect = this._appendRect(doorGroup, {
            x: doorX, y: midY - doorH / 2, w: doorW, h: doorH,
            cls: 'door-portal'
          });
          dRect.setAttribute('rx', '3');
          g.appendChild(doorGroup);
        } else {
          // Separated rooms / corridor connectors — draw dashed link with central portal badge
          const c1x = s1.x + s1w / 2;
          const c1y = s1.y + s1h / 2;
          const c2x = s2.x + s2w / 2;
          const c2y = s2.y + s2h / 2;

          const connLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          connLine.setAttribute('x1', c1x); connLine.setAttribute('y1', c1y);
          connLine.setAttribute('x2', c2x); connLine.setAttribute('y2', c2y);
          connLine.setAttribute('class', 'door-connector-line');
          doorGroup.appendChild(connLine);

          const midX = (c1x + c2x) / 2;
          const midY = (c1y + c2y) / 2;
          const pBadge = this._appendRect(doorGroup, {
            x: midX - 8, y: midY - 8, w: 16, h: 16,
            cls: 'door-portal'
          });
          pBadge.setAttribute('rx', '4');

          g.appendChild(doorGroup);
        }
      }
    });
  }

  _drawExits() {
    const g = this._group('exits-layer');
    (this.BUILDING.exits || []).forEach(exit => {
      const exitG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      exitG.setAttribute('id', `exit-g-${exit.id}`);

      const labelText = exit.label || exit.name || exit.id || 'EXIT';
      // Dynamically calculate box width based on text length to guarantee text never overflows borders
      const charWidth = 6.2;
      const padding = 16;
      const boxW = Math.max(54, Math.ceil(labelText.length * charWidth + padding));
      const boxH = 22;
      const boxX = exit.x - boxW / 2;
      const boxY = exit.y - boxH / 2;

      const glow = this._appendRect(exitG, {
        x: boxX - 3, y: boxY - 3, w: boxW + 6, h: boxH + 6,
        cls: 'exit-glow'
      });
      glow.setAttribute('rx', '6');

      const marker = this._appendRect(exitG, {
        x: boxX, y: boxY, w: boxW, h: boxH,
        cls: 'exit-marker'
      });
      marker.setAttribute('rx', '4');

      const label = this._text(exit.x, exit.y + 0.5, labelText, 'exit-label');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'central');

      exitG.appendChild(glow);
      exitG.appendChild(marker);
      exitG.appendChild(label);
      g.appendChild(exitG);

      this._exitEls[exit.id] = { glow, marker, label, origLabel: labelText };
    });
  }

  _buildHazardOverlays() {
    this.BUILDING.spaces.forEach(space => {
      const overlay = this._appendRect(this._hazardLayer, {
        x: space.x, y: space.y, w: space.width, h: space.height,
        cls: 'hazard-overlay'
      });
      overlay.setAttribute('rx', '4');
      overlay.style.display = 'none';
      this._hazardEls[space.id] = overlay;
    });
  }

  _drawTopologicalGraph() {
    const nodes = this.BUILDING.graph?.nodes || [];
    const edges = this.BUILDING.graph?.edges || [];

    edges.forEach(e => {
      const n1 = this.NODE_MAP[e.from], n2 = this.NODE_MAP[e.to];
      if (!n1 || !n2) return;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', n1.x); line.setAttribute('y1', n1.y);
      line.setAttribute('x2', n2.x); line.setAttribute('y2', n2.y);
      line.setAttribute('stroke', 'rgba(168, 85, 247, 0.4)');
      line.setAttribute('stroke-width', '1');
      line.setAttribute('stroke-dasharray', '2 2');
      this._graphLayer.appendChild(line);
    });

    nodes.forEach(n => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', n.x);
      circle.setAttribute('cy', n.y);
      circle.setAttribute('r', '3');
      circle.setAttribute('fill', 'rgba(168, 85, 247, 0.8)');
      this._graphLayer.appendChild(circle);
    });
  }

  _drawSensors() {
    (this.BUILDING.sensors || []).forEach(sensor => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'sensor-marker normal');
      g.setAttribute('id', `sensor-marker-${sensor.id}`);

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', sensor.x);
      circle.setAttribute('cy', sensor.y);
      circle.setAttribute('r', '2.5');
      circle.setAttribute('class', 'sensor-base');

      const callout = this._text(sensor.x, sensor.y + 10, `${sensor.id}`, 'sensor-callout');

      g.appendChild(circle);
      g.appendChild(callout);

      g.addEventListener('mouseenter', e => this._showSensorTooltip(e, sensor));
      g.addEventListener('mouseleave', () => this._scheduleHideTooltip(200));

      this._sensorLayer.appendChild(g);
      this._sensorEls[sensor.id] = { g, circle, callout };
    });
  }

  _drawSingleRoute(route) {
    const { path, status } = route;
    if (path.length < 2) return;

    for (let i = 0; i < path.length - 1; i++) {
      const n1 = this.NODE_MAP[path[i]];
      const n2 = this.NODE_MAP[path[i + 1]];
      if (!n1 || !n2) continue;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', n1.x); line.setAttribute('y1', n1.y);
      line.setAttribute('x2', n2.x); line.setAttribute('y2', n2.y);
      line.setAttribute('class', `route-segment ${status.toLowerCase()}`);
      if (i === path.length - 2) {
        line.setAttribute('marker-end', status === 'SAFE' ? 'url(#route-arrow)' : 'url(#route-arrow-orange)');
      }
      this._routeLayer.appendChild(line);
    }
  }

  _updateSensorMarker(sensorId, level) {
    const item = this._sensorEls[sensorId];
    if (!item) return;
    item.g.setAttribute('class', `sensor-marker ${level.toLowerCase()}`);
  }

  // ── Interactive Pan & Zoom Engine ─────────────────────

  _initPanZoom() {
    const container = document.getElementById('floor-plan-container');
    if (!container) return;

    // Create floating glass HUD controls if not already present
    if (!document.getElementById('floor-hud-controls')) {
      const hud = document.createElement('div');
      hud.className = 'floor-hud-controls';
      hud.id = 'floor-hud-controls';
      hud.innerHTML = `
        <button class="hud-zoom-btn" id="btn-zoom-in" title="Zoom In (+)">➕</button>
        <span class="hud-zoom-level" id="hud-zoom-level" title="Click to Reset Zoom">100%</span>
        <button class="hud-zoom-btn" id="btn-zoom-out" title="Zoom Out (−)">➖</button>
        <button class="hud-zoom-btn" id="btn-zoom-reset" title="Reset Pan & Zoom (⟲)">⟲</button>
        <button class="hud-zoom-btn" id="btn-zoom-focus" title="Focus Active Incident Zone (🎯)">🎯</button>
        <div class="hud-divider"></div>
        <button class="hud-zoom-btn hud-ignite-btn" id="btn-hud-ignite" title="Toggle Click-to-Ignite Mode (🔥)">🔥</button>
      `;
      container.appendChild(hud);

      // Bind HUD Buttons
      document.getElementById('btn-zoom-in')?.addEventListener('click', (e) => { e.stopPropagation(); this.zoomIn(); });
      document.getElementById('btn-zoom-out')?.addEventListener('click', (e) => { e.stopPropagation(); this.zoomOut(); });
      document.getElementById('btn-zoom-reset')?.addEventListener('click', (e) => { e.stopPropagation(); this.resetView(); });
      document.getElementById('hud-zoom-level')?.addEventListener('click', (e) => { e.stopPropagation(); this.resetView(); });
      document.getElementById('btn-zoom-focus')?.addEventListener('click', (e) => { e.stopPropagation(); this.focusActiveIncident(); });
      document.getElementById('btn-hud-ignite')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setIgniteMode(!this.igniteMode);
        document.getElementById('btn-hud-ignite')?.classList.toggle('active', this.igniteMode);
      });
    }

    // Mouse Wheel Zoom
    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      this.setZoom(this._scale * zoomFactor, e.clientX, e.clientY);
    }, { passive: false });

    // Mouse Drag Panning
    container.addEventListener('mousedown', (e) => {
      // Ignore clicks on buttons or HUD
      if (e.target.closest('.floor-hud-controls') || e.target.closest('.tactical-room-hud') || e.target.closest('#tooltip')) return;
      if (e.target.closest('.room') && this.igniteMode) return;

      this._isPanning = true;
      this._startPan = { x: e.clientX - this._panX, y: e.clientY - this._panY };
      this.svg.classList.add('panning');
    });

    window.addEventListener('mousemove', (e) => {
      if (!this._isPanning) return;
      this._panX = e.clientX - this._startPan.x;
      this._panY = e.clientY - this._startPan.y;
      this._updateTransform();
    });

    window.addEventListener('mouseup', () => {
      if (this._isPanning) {
        this._isPanning = false;
        this.svg.classList.remove('panning');
      }
    });

    // Double click to zoom into point
    container.addEventListener('dblclick', (e) => {
      if (e.target.closest('.floor-hud-controls') || e.target.closest('#tooltip')) return;
      this.setZoom(this._scale > 1.4 ? 1.0 : this._scale * 1.5, e.clientX, e.clientY);
    });

    // Tooltip keep-alive listeners
    if (this._tooltip) {
      this._tooltip.addEventListener('mouseenter', () => {
        if (this._hideTooltipTimer) clearTimeout(this._hideTooltipTimer);
      });
      this._tooltip.addEventListener('mouseleave', () => {
        this._scheduleHideTooltip(120);
      });
    }
  }

  setZoom(newScale, clientX = null, clientY = null) {
    const clamped = Math.max(0.6, Math.min(3.2, newScale));
    this._scale = +clamped.toFixed(2);

    const levelEl = document.getElementById('hud-zoom-level');
    if (levelEl) levelEl.textContent = `${Math.round(this._scale * 100)}%`;

    this._updateTransform();
  }

  zoomIn() {
    this.setZoom(this._scale * 1.25);
  }

  zoomOut() {
    this.setZoom(this._scale * 0.8);
  }

  resetView() {
    this._scale = 1.0;
    this._panX = 0;
    this._panY = 0;
    const levelEl = document.getElementById('hud-zoom-level');
    if (levelEl) levelEl.textContent = '100%';
    this._updateTransform();
  }

  focusActiveIncident() {
    const flameIds = Object.keys(this._flameBadges);
    if (flameIds.length > 0) {
      const space = this.BUILDING.spaces.find(s => s.id === flameIds[0]);
      if (space) {
        this._scale = 1.6;
        const cx = space.x + space.width / 2;
        const cy = space.y + space.height / 2;
        const vp = this.BUILDING.viewport || { width: 880, height: 490 };
        this._panX = (vp.width / 2 - cx) * 1.2;
        this._panY = (vp.height / 2 - cy) * 1.2;
        const levelEl = document.getElementById('hud-zoom-level');
        if (levelEl) levelEl.textContent = `${Math.round(this._scale * 100)}%`;
        this._updateTransform();
        return;
      }
    }
    this.resetView();
  }

  _updateTransform() {
    this.svg.style.transform = `translate(${this._panX}px, ${this._panY}px) scale(${this._scale})`;
    this.svg.style.transformOrigin = 'center center';
  }

  // ── Tactical Tooltips & HUD ────────────────────────────

  _showSpaceTooltip(event, space) {
    if (this._hideTooltipTimer) clearTimeout(this._hideTooltipTimer);
    if (!this._tooltip) return;

    const st = this._latestDTState[space.id] || {};
    const level = st.hazard_level || 'NORMAL';
    const predState = st.predicted_state || 'SAFE';
    const predRisk = st.predicted_risk || 0;
    const tempStr = typeof st.temperature === 'number' ? `${st.temperature.toFixed(1)}°C` : '27.4°C';
    const smokeStr = typeof st.smoke === 'number' ? `${st.smoke.toFixed(2)} AQI` : '0.01 AQI';
    const occVal = typeof st.occupancy === 'number' ? st.occupancy : Math.round(space.capacity * 0.35);

    const levelColor = level === 'CRITICAL' ? '#ef4444' : level === 'WARNING' ? '#f59e0b' : level === 'BLOCKED' ? '#dc2626' : '#22c55e';
    const predColor = predState === 'PREDICTED_CRITICAL' ? '#ef4444' : predState === 'PREDICTED_WARNING' ? '#f59e0b' : '#38bdf8';

    this._tooltip.className = 'tactical-room-hud';
    this._tooltip.style.pointerEvents = 'auto';
    this._tooltip.innerHTML = `
      <div class="tactical-hud-header">
        <div>
          <div class="tactical-hud-title">${space.id} · ${space.name}</div>
          <div class="tactical-hud-sub">${space.type} · Max Capacity: ${space.capacity} pax</div>
        </div>
        <div style="display:flex;gap:4px;">
          <span class="badge" style="background:${levelColor}22;color:${levelColor};border:1px solid ${levelColor}66;font-size:7.5px;">
            ${level}
          </span>
          ${predState !== 'SAFE' ? `
            <span class="badge" style="background:${predColor}22;color:${predColor};border:1px solid ${predColor}66;font-size:7.5px;">
              🔮 ${predState.replace('_', ' ')} (${Math.round(predRisk * 100)}%)
            </span>
          ` : ''}
        </div>
      </div>

      <div class="tactical-metrics-row">
        <div class="tactical-metric-item">
          <span style="color:#f87171;">🌡️</span>
          <span style="color:#f1f5f9;">${tempStr}</span>
        </div>
        <div class="tactical-metric-item">
          <span style="color:#fb923c;">💨</span>
          <span style="color:#f1f5f9;">${smokeStr}</span>
        </div>
        <div class="tactical-metric-item">
          <span style="color:#38bdf8;">👥</span>
          <span style="color:#f1f5f9;">${occVal} / ${space.capacity} pax</span>
        </div>
        <div class="tactical-metric-item">
          <span style="color:#a855f7;">GUID:</span>
          <span style="color:#94a3b8;font-size:7.5px;">${space.ifc_id || 'IFC_SPACE'}</span>
        </div>
      </div>

      <div class="tactical-actions-row">
        <button class="hud-action-btn fire" id="tactical-btn-ignite" title="Ignite fire in this space">
          🔥 Ignite
        </button>
        <button class="hud-action-btn" id="tactical-btn-smoke" title="Add smoke cloud">
          💨 Smoke
        </button>
        <button class="hud-action-btn" id="tactical-btn-inspect" title="Inspect full telemetry in left panel">
          🔍 Inspect
        </button>
      </div>
    `;

    // Wire Tactical Action Buttons
    setTimeout(() => {
      document.getElementById('tactical-btn-ignite')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.igniteRoom(space.id);
        this._hideTooltip();
      });
      document.getElementById('tactical-btn-smoke')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.addSmokeEffect(space.id);
        this._hideTooltip();
      });
      document.getElementById('tactical-btn-inspect')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectRoom(space.id);
        this.onRoomClick(space.id);
        this._hideTooltip();
      });
    }, 10);

    this._positionTooltip(event);
    this._tooltip.style.display = 'flex';
  }

  _showOccupantTooltip(event, occ) {
    if (this._hideTooltipTimer) clearTimeout(this._hideTooltipTimer);
    if (!this._tooltip) return;

    const statusColor = OCC_COLOUR[occ.status] || '#00d4e8';
    const isProactive = !!occ.proactiveReroute;

    this._tooltip.className = 'tactical-room-hud';
    this._tooltip.style.pointerEvents = 'none';
    this._tooltip.innerHTML = `
      <div class="agent-micro-tooltip">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:3px;margin-bottom:3px;">
          <span style="font-weight:800;color:var(--accent-cyan);">👤 AGENT #${occ.id}</span>
          <span class="badge" style="background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor}66;font-size:7px;">
            ${occ.status}
          </span>
        </div>
        <div style="font-size:8px;color:#cbd5e1;">Target Exit: <strong style="color:#34d399;">${occ.targetExit || 'Reachable Exit'}</strong></div>
        <div style="font-size:8px;color:var(--text-muted);">Routing: <span style="color:#38bdf8;">Dijkstra Dynamic (Active)</span></div>
        ${isProactive ? `
          <div style="margin-top:4px;padding-top:4px;border-top:1px dashed rgba(249,115,22,0.4);font-size:7.5px;">
            <div style="color:#f97316;font-weight:700;">⚡ PROACTIVE REROUTE:</div>
            <div style="color:#cbd5e1;">Avoided: <span style="color:#f87171;">${occ.proactiveReroute.avoidedSpace}</span> (${Math.round(occ.proactiveReroute.predictedRisk * 100)}% risk)</div>
            <div style="color:#94a3b8;">${occ.proactiveReroute.reason}</div>
          </div>
        ` : ''}
      </div>
    `;
    this._positionTooltip(event);
    this._tooltip.style.display = 'flex';
  }

  _showSensorTooltip(event, sensor) {
    if (this._hideTooltipTimer) clearTimeout(this._hideTooltipTimer);
    if (!this._tooltip) return;

    this._tooltip.className = 'tactical-room-hud';
    this._tooltip.style.pointerEvents = 'none';
    this._tooltip.innerHTML = `
      <div class="agent-micro-tooltip">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:3px;margin-bottom:3px;">
          <span style="font-weight:800;color:#38bdf8;">📡 ${sensor.id}</span>
          <span class="badge badge-cyan" style="font-size:7px;">${sensor.type}</span>
        </div>
        <div style="font-size:8px;color:#cbd5e1;">Assigned Space: <strong style="color:var(--accent-cyan);">${sensor.room}</strong></div>
        <div style="font-size:8px;color:var(--text-muted);">Ingress Protocol: <span style="color:#f59e0b;">${sensor.source_system}</span></div>
      </div>
    `;
    this._positionTooltip(event);
    this._tooltip.style.display = 'flex';
  }

  _positionTooltip(event) {
    const tt = this._tooltip;
    if (!tt) return;
    const container = document.getElementById('floor-plan-container');
    const containerRect = container ? container.getBoundingClientRect() : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };

    let left = event.clientX + 14;
    let top = event.clientY - 10;

    // Avoid overflow
    if (left + 230 > containerRect.right) left = event.clientX - 240;
    if (top + 160 > containerRect.bottom) top = containerRect.bottom - 170;

    tt.style.left = `${Math.max(10, left)}px`;
    tt.style.top  = `${Math.max(10, top)}px`;
  }

  _scheduleHideTooltip(delay = 200) {
    if (this._hideTooltipTimer) clearTimeout(this._hideTooltipTimer);
    this._hideTooltipTimer = setTimeout(() => {
      this._hideTooltip();
    }, delay);
  }

  _hideTooltip() {
    if (this._tooltip) {
      this._tooltip.style.display = 'none';
    }
  }

  _bindEvents() {
    this.bus.on('dt:state_change', ({ entityId, entity }) => {
      this._latestDTState[entityId] = { ...(this._latestDTState[entityId] || {}), ...entity };
      this.updateRoomState(entityId, entity);
    });


    this.bus.on('dt:initialised', () => {
      this.BUILDING.spaces.forEach(space => {
        this.updateRoomState(space.id, { hazard_level: 'NORMAL', fire_alarm: false });
      });
      ['LIFT_1', 'LIFT_2'].forEach(id => this.setLiftBlocked(id, false));
    });

    this.bus.on('hazard:exit_status', ({ exitId, accessible }) => {
      this.updateExitState(exitId, accessible);
    });

    this.bus.on('hazard:lift_blocked', ({ liftId }) => {
      this.setLiftBlocked(liftId, true);
    });

    this.bus.on('routes:calculated', ({ routes }) => {
      this.drawRoutes(routes);
    });

    this.bus.on('occupants:positions', ({ occupants }) => {
      this.updateOccupants(occupants);
    });

    this.bus.on('occupants:initialised', ({ occupants }) => {
      this.updateOccupants(occupants);
    });

    this.bus.on('sim:fire_trigger', ({ room, rooms }) => {
      const targets = (Array.isArray(rooms) && rooms.length > 0) ? rooms : (room ? [room] : ['ROOM_101']);
      targets.forEach(r => {
        this.addFlameBadge(r);
        setTimeout(() => this.addSmokeEffect(r), 400);
      });
    });

    this.bus.on('config:changed', ({ config }) => {
      if (config.visualization) {
        this.applyVisualizationConfig(config.visualization);
      }
      if (config.building?.blockedExits) {
        (this.BUILDING.exits || []).forEach(e => {
          const isBlocked = config.building.blockedExits[e.id] === true;
          this.updateExitState(e.id, !isBlocked);
        });
      }
    });

    this.bus.on('scenario:custom_applied', ({ blockedExits }) => {
      (this.BUILDING.exits || []).forEach(e => {
        const isBlocked = blockedExits && blockedExits[e.id] === true;
        this.updateExitState(e.id, !isBlocked);
      });
    });

    this.bus.on('hazard:exit_status', ({ exitId, accessible }) => {
      this.updateExitState(exitId, accessible);
    });

    this.bus.on('renderer:set_ignite_mode', ({ enabled }) => {
      this.setIgniteMode(enabled);
    });

    this.bus.on('route:proactive_reroute', (info) => {
      this._showProactiveRerouteToast(info);
    });

    this.bus.on('sim:reset', () => {
      this._visualPos = {};
      this._occTargets = {};
      this.clearFlameBadges();
      this.clearAllSmokeEffects();
      this.setIgniteMode(false);
      this.BUILDING.spaces.forEach(s => this.updateRoomState(s.id, { hazard_level:'NORMAL', fire_alarm:false }));
      ['LIFT_1', 'LIFT_2'].forEach(id => this.setLiftBlocked(id, false));
      this.selectRoom(null);
      const toastContainer = document.getElementById('proactive-toast-container');
      if (toastContainer) toastContainer.innerHTML = '';
    });
  }

  _showProactiveRerouteToast(info = {}) {
    let container = document.getElementById('proactive-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'proactive-toast-container';
      container.className = 'proactive-reroute-toast-container';
      const fpWrap = document.getElementById('panel-centre') || document.body;
      fpWrap.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'proactive-reroute-toast';
    const riskPct = Math.round((info.predictedRisk || 0.82) * 100);
    const horizon = info.horizon || 15;

    toast.innerHTML = `
      <div class="proactive-toast-hdr">
        <span style="font-family:var(--font-mono);font-size:9.5px;font-weight:700;color:var(--accent-purple);letter-spacing:0.4px;">PROACTIVE REROUTE</span>
        <span style="font-family:var(--font-mono);font-size:9px;color:var(--accent-amber);font-weight:600;">~${horizon}s lead time</span>
      </div>
      <div class="proactive-toast-body" style="font-size:11px;color:var(--text-secondary);margin:3px 0;">
        <div>Agent <strong>#${info.occupantId ?? '1'}</strong> bypassing <span style="color:var(--accent-red);font-weight:600;">${info.spaceId || 'Predicted Hazard'}</span> (${riskPct}% risk)</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">Re-routed to <span style="color:var(--accent-green);font-weight:600;">${info.newExit || 'Safe Exit'}</span></div>
      </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-6px)';
      toast.style.transition = 'all 250ms cubic-bezier(0.16, 1, 0.3, 1)';
      setTimeout(() => toast.remove(), 260);
    }, 3800);
  }

  _group(cls) {
    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    g.setAttribute('class', cls);
    this.svg.appendChild(g);
    return g;
  }

  _appendRect(parent, { x,y,w,h,cls }) {
    const r = document.createElementNS('http://www.w3.org/2000/svg','rect');
    r.setAttribute('x',x); r.setAttribute('y',y);
    r.setAttribute('width',w); r.setAttribute('height',h);
    if (cls) r.setAttribute('class',cls);
    parent.appendChild(r);
    return r;
  }

  _text(x, y, text, cls) {
    const t = document.createElementNS('http://www.w3.org/2000/svg','text');
    t.setAttribute('x', x); t.setAttribute('y', y);
    if (cls) t.setAttribute('class', cls);
    t.textContent = text;
    return t;
  }
}
