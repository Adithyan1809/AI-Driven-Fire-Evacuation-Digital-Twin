/**
 * BUILDING GRAPH
 *
 * Weighted undirected graph representing navigable building topology.
 * Nodes: rooms, corridor junctions, stairs, exits.
 * Edges: doors, corridor segments (bidirectional, dynamic cost).
 *
 * The cost of each edge is dynamically updated by the HazardEngine
 * based on the current Digital Twin state.
 */

import { BUILDING } from '../data/building.js';

export class BuildingGraph {
  constructor() {
    // adjacency list: node_id → [{to, edge_id, cost}]
    this._adj    = {};
    // edge definitions: edge_id → {from, to, base_cost, current_cost}
    this._edges  = {};
    // node cost multipliers: node_id → multiplier (applied to all in-edges)
    this._nodeMult = {};
    this._build();
  }

  // ── Public API ─────────────────────────────────────────

  /** Get all neighbours of a node with their current edge costs */
  getNeighbours(nodeId) {
    return (this._adj[nodeId] || []).map(entry => ({
      node:    entry.to,
      edgeId:  entry.edge_id,
      cost:    this._effectiveCost(entry),
    }));
  }

  /** Get all node IDs */
  getNodeIds() { return Object.keys(this._adj); }

  /** Get all exit IDs (filtering out disabled or blocked exits) */
  getExitIds(config = null) {
    const cfg = config || {};
    const exitsConfig = cfg.building?.exits;
    const blockedExits = cfg.building?.blockedExits || {};
    return (BUILDING.exits || [])
      .filter(e => {
        if (blockedExits[e.id]) return false;
        if (exitsConfig && exitsConfig[e.id] && exitsConfig[e.id].enabled === false) return false;
        const mult = this.getNodeCost(e.id);
        if (!isFinite(mult) || mult >= 10000) return false;
        if (e.connected_node) {
          const connMult = this.getNodeCost(e.connected_node);
          if (!isFinite(connMult) || connMult >= 10000) return false;
        }
        return true;
      })
      .map(e => e.id);
  }

  /** Check if a node is an active exit (cost = 0 to "leave" from it) */
  isExit(nodeId, config = null) {
    return this.getExitIds(config).includes(nodeId);
  }

  /**
   * Apply a cost multiplier to all edges that touch a node.
   * Used by HazardEngine to mark a space as dangerous.
   * @param {string} nodeId
   * @param {number} multiplier  — 1 = normal, 1000 = dangerous, Infinity = blocked
   */
  setNodeCostMultiplier(nodeId, multiplier) {
    this._nodeMult[nodeId] = multiplier;
  }

  /** Reset all dynamic costs to baseline */
  resetCosts() { this._nodeMult = {}; }

  /** Get the effective traversal cost through a node (for Dijkstra heuristic) */
  getNodeCost(nodeId) {
    return this._nodeMult[nodeId] ?? 1;
  }

  /** Get edge cost between two adjacent nodes */
  getEdgeCost(fromId, toId) {
    const entry = (this._adj[fromId] || []).find(e => e.to === toId);
    return entry ? this._effectiveCost(entry) : Infinity;
  }

  /** Get a snapshot of all edges with their current costs (for visualisation) */
  getEdgeSnapshot() {
    return Object.values(this._edges).map(e => ({
      ...e,
      current_cost: this._effectiveCostById(e.id),
      status: this._classifyEdgeCost(this._effectiveCostById(e.id)),
    }));
  }

  /** Rebuild graph from active BUILDING model */
  rebuild() {
    this._adj = {};
    this._edges = {};
    this._nodeMult = {};
    this._build();
  }

  // ── Internal ───────────────────────────────────────────

  _build() {
    this._adj = {};
    this._edges = {};
    this._nodeMult = {};

    const nodes = BUILDING.graph?.nodes || [];
    const edges = BUILDING.graph?.edges || [];

    // Initialise adjacency lists for all nodes
    nodes.forEach(n => {
      this._adj[n.id] = [];
      this._nodeMult[n.id] = 1;
    });

    // Add edges (bidirectional)
    edges.forEach(edge => {
      this._edges[edge.id] = { ...edge, current_cost: edge.base_cost || 1 };
      if (this._adj[edge.from]) this._adj[edge.from].push({ to: edge.to,   edge_id: edge.id });
      if (this._adj[edge.to])   this._adj[edge.to  ].push({ to: edge.from, edge_id: edge.id });
    });
  }

  _effectiveCost(adjEntry) {
    return this._effectiveCostById(adjEntry.edge_id, adjEntry.to);
  }

  _effectiveCostById(edgeId, toNodeId) {
    const edge    = this._edges[edgeId];
    if (!edge) return Infinity;
    const base    = edge.base_cost;
    // Destination node cost multiplier dominates (you must pass through it)
    const destMult = toNodeId ? (this._nodeMult[toNodeId] ?? 1) : 1;
    if (!isFinite(destMult)) return Infinity;
    return base * destMult;
  }

  _classifyEdgeCost(cost) {
    if (!isFinite(cost) || cost >= 1000) return 'BLOCKED';
    if (cost >= 20)                      return 'UNSAFE';
    if (cost >= 3)                       return 'CROWDED';
    return 'SAFE';
  }
}
