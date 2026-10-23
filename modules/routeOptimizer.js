/**
 * ROUTE OPTIMIZER
 *
 * Dijkstra's algorithm on the building graph.
 * Re-runs whenever graph costs change (hazard events).
 * Classifies routes as SAFE / UNSAFE / BLOCKED for visualisation.
 *
 * AI SAFETY: Pure deterministic algorithm. Zero AI involvement.
 *            The AI system only produces semantic mappings.
 *            Evacuation decisions are made here, not by the AI.
 */

import { BUILDING } from '../data/building.js';

export class RouteOptimizer {
  /**
   * @param {Object}        opts
   * @param {EventBus}      opts.bus
   * @param {BuildingGraph} opts.graph
   * @param {Object}        [opts.config]
   */
  constructor({ bus, graph, config = null }) {
    this.bus       = bus;
    this.graph     = graph;
    this.config    = config;
    this._recalcCount = 0;

    this.bus.on('hazard:graph_updated', () => this._onGraphUpdated());
    this.bus.on('hazard:lift_blocked',  () => this._onGraphUpdated());
    this.bus.on('config:changed',       ({ config }) => {
      if (!(this.config && typeof this.config.get === 'function')) {
        this.config = config;
      }
      this._onGraphUpdated();
    });
    this.bus.on('sim:reset',            () => { this._recalcCount = 0; });
  }

  _getConfig() {
    if (this.config && typeof this.config.get === 'function') {
      return this.config.get();
    }
    return this.config || {};
  }

  // ── Public API ─────────────────────────────────────────

  /**
   * Find the shortest (safest) path from startNodeId to any reachable exit.
   * @param {string}   startNodeId
   * @param {string[]} [preferredExits]  — optional priority exit list
   * @returns {{ path: string[], cost: number, exit: string, status: string } | null}
   */
  findPath(startNodeId, preferredExits = null) {
    const cfg = this._getConfig();
    const availableExits = this.graph.getExitIds ? this.graph.getExitIds(cfg) : (BUILDING.exits || []).map(e => e.id);
    const targets = preferredExits || availableExits;
    if (!targets.length) return null;

    const dist  = {};
    const prev  = {};
    const visited = new Set();
    const queue = new MinHeap();

    // Initialise
    for (const id of this.graph.getNodeIds()) dist[id] = Infinity;
    dist[startNodeId] = 0;
    queue.push({ node: startNodeId, cost: 0 });

    while (!queue.isEmpty()) {
      const { node: u, cost: cu } = queue.pop();
      if (visited.has(u)) continue;
      visited.add(u);

      // Found an exit
      if (targets.includes(u)) {
        const path   = this._reconstructPath(prev, startNodeId, u);
        const status = this._classifyPath(path);
        const evaluation = this.evaluateRoute(path);
        return { path, cost: cu, exit: u, status, evaluation };
      }

      for (const { node: v, cost: edgeCost } of this.graph.getNeighbours(u)) {
        if (visited.has(v)) continue;
        const newCost = cu + edgeCost;
        if (newCost < dist[v]) {
          dist[v] = newCost;
          prev[v] = u;
          queue.push({ node: v, cost: newCost });
        }
      }
    }

    return null;   // no reachable exit
  }

  /**
   * Evaluates safety score and exposure risk metrics for a path.
   * @param {string[]} path
   * @returns {Object} Route safety evaluation metrics
   */
  evaluateRoute(path) {
    if (!path || !path.length) return null;
    let baseDistance = 0;
    let totalCost = 0;
    let maxCost = 1.0;
    let hasWarning = false;
    let hasCritical = false;

    for (let i = 0; i < path.length - 1; i++) {
      const u = path[i];
      const v = path[i + 1];
      const edge = this.graph.getEdge ? this.graph.getEdge(u, v) : null;
      const baseCost = edge ? (edge.base_cost || edge.cost || 1.0) : 1.0;
      const actualCost = this.graph.getEdgeCost(u, v);

      baseDistance += baseCost;
      totalCost += actualCost;
      maxCost = Math.max(maxCost, isFinite(actualCost) ? actualCost / baseCost : 999);

      if (!isFinite(actualCost) || actualCost >= 1000) hasCritical = true;
      else if (actualCost >= 15) hasWarning = true;
    }

    const currentExposure = hasCritical ? 'CRITICAL' : hasWarning ? 'WARNING' : 'LOW';
    const predictedExposure = maxCost >= 5.0 ? 'HIGH' : maxCost >= 2.0 ? 'MEDIUM' : 'LOW';
    const safetyScore = hasCritical ? 0 : Math.max(10, Math.round(100 * Math.max(0, 1.0 - (totalCost - baseDistance) / (baseDistance * 10 + 1))));

    return {
      path,
      baseDistance: +baseDistance.toFixed(1),
      totalCost: isFinite(totalCost) ? +totalCost.toFixed(1) : Infinity,
      maxMultiplier: +maxCost.toFixed(2),
      currentExposure,
      predictedExposure,
      routeSafetyScore: safetyScore,
      targetExit: path[path.length - 1],
    };
  }

  /**
   * Find candidate routes to all reachable exits for comparative analysis.
   * @param {string} startNodeId
   * @returns {Array<Object>} List of evaluated candidate paths
   */
  findAllCandidateRoutes(startNodeId) {
    const cfg = this._getConfig();
    const availableExits = this.graph.getExitIds ? this.graph.getExitIds(cfg) : (BUILDING.exits || []).map(e => e.id);
    const candidates = [];

    availableExits.forEach(exitId => {
      const res = this.findPath(startNodeId, [exitId]);
      if (res && res.path && res.path.length) {
        candidates.push(res);
      }
    });

    candidates.sort((a, b) => (b.evaluation?.routeSafetyScore || 0) - (a.evaluation?.routeSafetyScore || 0) || a.cost - b.cost);
    return candidates;
  }

  /**
   * Calculate routes for all starting positions.
   * @param {string[]} startNodes — list of node IDs
   * @returns {Object}  nodeId → route result
   */
  calculateAllRoutes(startNodes = null) {
    const routes = {};
    const nodes = startNodes || (BUILDING.spaces || []).map(s => s.id);
    const t0 = performance.now();
    nodes.forEach(id => { routes[id] = this.findPath(id); });
    const elapsed = performance.now() - t0;
    this.bus.emit('routes:calculated', { routes, elapsed_ms: elapsed, recalc_count: this._recalcCount });
    return routes;
  }

  /** Classify a single edge between two nodes */
  classifyEdge(fromId, toId) {
    const cost = this.graph.getEdgeCost(fromId, toId);
    if (!isFinite(cost) || cost >= 1000) return 'BLOCKED';
    if (cost >= 20)  return 'UNSAFE';
    if (cost >= 3)   return 'CROWDED';
    return 'SAFE';
  }

  getRecalcCount() { return this._recalcCount; }

  // ── Internal ───────────────────────────────────────────

  _onGraphUpdated() {
    this._recalcCount++;
    this.bus.emit('routes:recalculating', { count: this._recalcCount });
    this.bus.emit('routes:graph_changed', { count: this._recalcCount });
  }

  _reconstructPath(prev, start, end) {
    const path = [end];
    let cur = end;
    while (cur !== start) {
      if (!prev[cur]) break;
      cur = prev[cur];
      path.unshift(cur);
    }
    return path;
  }

  _classifyPath(path) {
    let maxCost = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const c = this.graph.getEdgeCost(path[i], path[i+1]);
      if (!isFinite(c)) return 'BLOCKED';
      maxCost = Math.max(maxCost, c);
    }
    if (maxCost >= 20)  return 'UNSAFE';
    if (maxCost >= 3)   return 'CROWDED';
    return 'SAFE';
  }
}

// ── Minimal Binary Min-Heap for Dijkstra ────────────────
class MinHeap {
  constructor() { this._data = []; }
  push(item)  { this._data.push(item); this._bubbleUp(this._data.length - 1); }
  pop()       { const top = this._data[0]; const last = this._data.pop(); if (this._data.length) { this._data[0] = last; this._siftDown(0); } return top; }
  isEmpty()   { return this._data.length === 0; }
  _bubbleUp(i) { while (i > 0) { const p = (i-1)>>1; if (this._data[p].cost <= this._data[i].cost) break; [this._data[p],this._data[i]] = [this._data[i],this._data[p]]; i=p; } }
  _siftDown(i) { const n = this._data.length; while (true) { let m=i; const l=2*i+1,r=2*i+2; if(l<n&&this._data[l].cost<this._data[m].cost)m=l; if(r<n&&this._data[r].cost<this._data[m].cost)m=r; if(m===i)break; [this._data[m],this._data[i]]=[this._data[i],this._data[m]]; i=m; } }
}
