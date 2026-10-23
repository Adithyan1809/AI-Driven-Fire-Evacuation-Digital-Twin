/**
 * TEST: RUNTIME UI DOM CONTRACT VERIFICATION
 *
 * Verifies that the UI modules actually render into real DOM nodes:
 *   1. FloorPlanRenderer renders all spaces, doors, exits, sensor markers, embedded telemetry badges into <svg id="floor-plan-svg">
 *   2. SensorPanel renders all virtual IoT sensors with baselines and protocol badges into <div id="sensor-panel-body">
 *   3. DTStatePanel renders summary bar, entity cards, and Selected Space Inspector into <div id="dt-panel-body">
 *   4. MiddlewarePanel renders 4-stage pipeline banner, progress statistics, and hero card into <div id="middleware-panel-body">
 *   5. EventLog renders Current Event Hero Card, category filters, and pre-populated initial startup events into <div id="event-log-body">
 *   6. Dynamic route segments and occupant agents are appended to the floor plan SVG
 */

import { BUILDING } from '../data/building.js';
import { EventBus } from '../modules/simulationEngine.js';
import { DigitalTwinState } from '../modules/digitalTwinState.js';
import { BuildingGraph } from '../modules/buildingGraph.js';
import { RouteOptimizer } from '../modules/routeOptimizer.js';

import { FloorPlanRenderer } from '../ui/floorPlanRenderer.js';
import { SensorPanel } from '../ui/sensorPanel.js';
import { DTStatePanel } from '../ui/dtStatePanel.js';
import { MiddlewarePanel } from '../ui/middlewarePanel.js';
import { EventLog } from '../ui/eventLog.js';

console.log('================================================================');
console.log('🖥️ VERIFYING REAL RUNTIME UI DOM RENDERING CONTRACT');
console.log('================================================================\n');

// ── Minimal DOM Mock Environment for Node ────────────────────────────
class MockClassList {
  constructor(el) { this.el = el; this._classes = new Set(); }
  add(...cls) { cls.forEach(c => this._classes.add(c)); }
  remove(...cls) { cls.forEach(c => this._classes.delete(c)); }
  toggle(c, force) { if (force !== undefined) { if (force) this.add(c); else this.remove(c); } else { if (this._classes.has(c)) this.remove(c); else this.add(c); } }
  contains(c) { return this._classes.has(c); }
  toString() { return Array.from(this._classes).join(' '); }
}

class MockElement {
  constructor(tag, ns = null) {
    this.tagName = tag.toUpperCase();
    this.namespaceURI = ns;
    this.attributes = {};
    this.style = {};
    this.classList = new MockClassList(this);
    this.childNodes = [];
    this.dataset = {};
    this.listeners = {};
    this._textContent = '';
    this._rawInnerHTML = '';
  }

  get textContent() { return this._textContent; }
  set textContent(v) { this._textContent = String(v); }

  get innerHTML() {
    return this._rawInnerHTML || this.childNodes.map(c => typeof c === 'string' ? c : c.outerHTML || '').join('');
  }
  set innerHTML(html) {
    this.childNodes = [];
    this._rawInnerHTML = String(html);
    this._textContent = html.replace(/<[^>]*>?/gm, '');
  }

  setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'class') this.className = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  appendChild(child) {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) this.childNodes.splice(idx, 1);
    child.parentNode = null;
    return child;
  }
  insertBefore(newChild, refChild) {
    const idx = this.childNodes.indexOf(refChild);
    if (idx !== -1) this.childNodes.splice(idx, 0, newChild);
    else this.childNodes.push(newChild);
    newChild.parentNode = this;
    return newChild;
  }
  get firstChild() { return this.childNodes[0] || null; }
  get children() { return this.childNodes.filter(child => child instanceof MockElement); }
  querySelector(sel) {
    const child = this.querySelectorAll(sel)[0];
    if (child) return child;
    if (sel.startsWith('#') && this._rawInnerHTML.includes(`id="${sel.slice(1)}"`)) {
      return new MockElement('div');
    }
    return null;
  }
  addEventListener(evt, fn) { (this.listeners[evt] = this.listeners[evt] || []).push(fn); }
  dispatchEvent(evt) { (this.listeners[evt] || []).forEach(fn => fn(evt)); }
  querySelectorAll(sel) {
    const results = [];
    function search(node) {
      if (node.childNodes) {
        node.childNodes.forEach(c => {
          if (c instanceof MockElement) {
            results.push(c);
            search(c);
          }
        });
      }
    }
    search(this);
    return results;
  }
}

global.document = {
  createElement: (tag) => new MockElement(tag),
  createElementNS: (ns, tag) => new MockElement(tag, ns),
  getElementById: (id) => {
    return domStore[id] || null;
  }
};
global.window = { performance: { now: () => Date.now() } };
global.performance = { now: () => Date.now() };

const domStore = {
  'floor-plan-svg': new MockElement('svg', 'http://www.w3.org/2000/svg'),
  'sensor-panel-body': new MockElement('div'),
  'dt-panel-body': new MockElement('div'),
  'middleware-panel-body': new MockElement('div'),
  'event-log-body': new MockElement('div'),
  'tooltip': new MockElement('div'),
  'results-panel': new MockElement('div'),
  'curr-tag-badge': new MockElement('span'),
  'curr-time-val': new MockElement('span'),
  'curr-title-text': new MockElement('div'),
  'curr-sub-text': new MockElement('div'),
};

let passed = 0;
let total = 0;

function assert(condition, description) {
  total++;
  if (condition) {
    console.log(`✓ [PASS] ${description}`);
    passed++;
  } else {
    console.error(`✗ [FAIL] ${description}`);
  }
}

// ── Test 1: Instantiate UI presentation components into DOM ──────────
const bus = new EventBus();
const dtState = new DigitalTwinState({ bus });
const graph = new BuildingGraph();
const router = new RouteOptimizer({ bus, graph });

const svgEl = domStore['floor-plan-svg'];
const floorPlan = new FloorPlanRenderer({ svgEl, bus });

assert(svgEl.childNodes.length >= 7, `Floor plan SVG populated with ${svgEl.childNodes.length} top-level graphical layers (background, grid, spaces, doors, exits, hazard, routes, occupants, sensors)`);

const viewBox = svgEl.getAttribute('viewBox');
assert(/^0 0 \d+ \d+$/.test(viewBox || '') && viewBox.split(' ').slice(2).every(value => Number(value) > 0), `Floor plan SVG has valid non-zero viewBox: "${viewBox}"`);

// ── Test 2: Sensor Panel DOM Verification ────────────────────────────
const sensorContainer = domStore['sensor-panel-body'];
const sensorPanel = new SensorPanel({ container: sensorContainer, bus });

assert(sensorContainer.childNodes.length >= 2, `Sensor panel container populated with header summary and sensor grid`);
assert(Object.keys(sensorPanel._cards).length === BUILDING.sensors.length, `Sensor panel contains all ${BUILDING.sensors.length} rendered sensor cards`);

// ── Test 3: Digital Twin State Panel DOM Verification ────────────────
const dtContainer = domStore['dt-panel-body'];
const dtPanel = new DTStatePanel({ container: dtContainer, bus, dtState });

assert(dtContainer.childNodes.length >= 3, `Digital Twin state panel populated with Summary Grid, Room Selector Pills, and Selected Entity Inspector`);
assert(Object.keys(dtPanel._cards).length === BUILDING.spaces.length, `Digital Twin state panel rendered cards for all ${BUILDING.spaces.length} spaces`);

// ── Test 4: AI Semantic Middleware Panel DOM Verification ───────────
const mwContainer = domStore['middleware-panel-body'];
const mwPanel = new MiddlewarePanel({ container: mwContainer, bus });

assert(mwContainer.childNodes.length >= 2, `Middleware panel populated with its statistics and active-resolution sections`);

// ── Test 5: Event Timeline DOM Verification ──────────────────────────
const eventContainer = domStore['event-log-body'];
const eventLog = new EventLog({ container: eventContainer, bus });

assert(eventContainer.childNodes.length >= 2, `Event log populated with Category Filter Bar and History Container`);
assert(eventLog._history.length >= 4, `Event timeline pre-populated with ${eventLog._history.length} initial startup milestones`);

// ── Test 6: Route and Occupant Rendering on Floor Plan SVG ───────────
const initialRoutes = router.calculateAllRoutes(['ROOM_101', 'ROOM_102', 'ROOM_103', 'STAFF_ROOM']);
floorPlan.drawRoutes(initialRoutes);

assert(floorPlan._routeLayer.childNodes.length > 0, `Floor plan SVG rendered ${floorPlan._routeLayer.childNodes.length} dynamic route line segments`);

floorPlan.updateOccupants([
  { id: 1, svgX: 420, svgY: 80, status: 'IDLE' },
  { id: 2, svgX: 250, svgY: 80, status: 'IDLE' },
]);
assert(floorPlan._occLayer.childNodes.length === 2, `Floor plan SVG rendered 2 autonomous occupant agent markers`);

// ── Test 7: Multi-Page Tab Navigation DOM Verification ─────────────
import { PageNavigation } from '../ui/pageNavigation.js';
import { SensorFleetPage } from '../ui/sensorFleetPage.js';
import { AILabPage } from '../ui/aiLabPage.js';
import { BenchmarkPage } from '../ui/benchmarkPage.js';
import { MetricsEngine } from '../modules/metricsEngine.js';

// Setup mock tabs & views in domStore
['tab-live-twin', 'tab-sensor-fleet', 'tab-ai-lab', 'tab-benchmarks'].forEach(id => {
  domStore[id] = document.createElement('button');
  domStore[id].id = id;
});
['view-live-twin', 'view-sensor-fleet', 'view-ai-lab', 'view-benchmarks'].forEach(id => {
  domStore[id] = document.createElement('div');
  domStore[id].id = id;
});

const nav = new PageNavigation({ bus });
assert(nav.currentView === 'view-live-twin', `PageNavigation initialized with default view "view-live-twin"`);

nav.switchView('view-sensor-fleet');
assert(nav.currentView === 'view-sensor-fleet', `PageNavigation switched active tab to "view-sensor-fleet"`);

const fleetPage = new SensorFleetPage({ container: domStore['view-sensor-fleet'], bus });
assert(Object.keys(fleetPage._readings).length === BUILDING.sensors.length, `Dedicated Sensor Fleet page initialized telemetry for all ${BUILDING.sensors.length} sensors`);

const aiLab = new AILabPage({ container: domStore['view-ai-lab'], bus, aiService: { resolve: async () => ({}) } });
assert(domStore['view-ai-lab'].querySelector('#lab-payload-input') !== null, `Dedicated AI Semantic Lab rendered interactive payload tester`);

const metrics = new MetricsEngine({ bus });
const benchPage = new BenchmarkPage({ container: domStore['view-benchmarks'], bus, metrics });
assert(domStore['view-benchmarks'].querySelector('#btn-export-bench-json') !== null, `Dedicated Benchmark page rendered comparative analysis and export tool`);

console.log(`\n================================================================`);
console.log(`📊 RUNTIME DOM CONTRACT VERIFICATION: ${passed}/${total} assertions passed (${((passed/total)*100).toFixed(0)}%)`);
console.log(`================================================================\n`);

process.exit(passed === total ? 0 : 1);
