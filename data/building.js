/**
 * BUILDING DATA LOADER
 *
 * Generic building model loader — single source of truth.
 * Swap the active building JSON to use any floor plan.
 *
 * Works in both Node.js (server/scripts) and browser (ES modules via HTTP).
 * JSON is fetched at runtime in browser; required via createRequire in Node.
 *
 * SVG Coordinate System: origin top-left, x→right, y→down
 */

import { BUILDING_A } from './buildings/building_a.js';

// ── Active Building Singleton ─────────────────────────────────────────────────
let _activeBuilding = BUILDING_A;

export const loadBuilding      = (jsonConfig) => jsonConfig;
export const getActiveBuilding = () => _activeBuilding;

export function setActiveBuilding(buildingJson) {
  _activeBuilding = buildingJson;
  _recompute();
}

// ── Exported Maps (mutable, recomputed in-place on building switch) ─────────────
export let BUILDING              = _activeBuilding;
export const SPACE_MAP             = {};
export const SENSOR_MAP            = {};
export const NODE_MAP              = {};
export const EXIT_IDS              = new Set();
export const SPACE_NODE_IDS        = new Set();
export const SPATIAL_GRAPH_MAPPING = {};
export const NODE_TO_SPACE_MAP     = {};

// ── Recompute all derived maps from active building ───────────────────────────
function _recompute() {
  BUILDING = _activeBuilding;

  for (const k in SPACE_MAP) delete SPACE_MAP[k];
  Object.assign(SPACE_MAP, Object.fromEntries((BUILDING.spaces || []).map(s => [s.id, s])));

  for (const k in SENSOR_MAP) delete SENSOR_MAP[k];
  Object.assign(SENSOR_MAP, Object.fromEntries((BUILDING.sensors || []).map(s => [s.id, s])));

  for (const k in NODE_MAP) delete NODE_MAP[k];
  Object.assign(NODE_MAP, Object.fromEntries((BUILDING.graph?.nodes || []).map(n => [n.id, n])));

  EXIT_IDS.clear();
  (BUILDING.exits || []).forEach(e => EXIT_IDS.add(e.id));

  SPACE_NODE_IDS.clear();
  (BUILDING.spaces || []).forEach(s => SPACE_NODE_IDS.add(s.id));

  for (const k in SPATIAL_GRAPH_MAPPING) delete SPATIAL_GRAPH_MAPPING[k];
  for (const k in NODE_TO_SPACE_MAP) delete NODE_TO_SPACE_MAP[k];

  // Use explicit spatial_graph_mapping from JSON if present (preferred, precise)
  if (BUILDING.spatial_graph_mapping) {
    Object.assign(SPATIAL_GRAPH_MAPPING, BUILDING.spatial_graph_mapping);
    Object.assign(NODE_TO_SPACE_MAP, BUILDING.node_to_space_map || _deriveNodeToSpaceMap(BUILDING.spatial_graph_mapping));
  } else {
    // Derive from topology for buildings without explicit mapping
    const derived = _deriveGraphMappings(BUILDING);
    Object.assign(SPATIAL_GRAPH_MAPPING, derived.SPATIAL_GRAPH_MAPPING);
    Object.assign(NODE_TO_SPACE_MAP, derived.NODE_TO_SPACE_MAP);
  }
}

// Immediately compute initial maps
_recompute();

/** Invert SPATIAL_GRAPH_MAPPING → NODE_TO_SPACE_MAP */
function _deriveNodeToSpaceMap(sgm) {
  const n2s = {};
  for (const [spaceId, data] of Object.entries(sgm)) {
    (data.nodes || []).forEach(nid => { n2s[nid] = spaceId; });
  }
  return n2s;
}

/**
 * Derive SPATIAL_GRAPH_MAPPING and NODE_TO_SPACE_MAP from building topology.
 * Used for buildings without an explicit mapping section.
 */
function _deriveGraphMappings(building) {
  const sgm     = {};
  const n2s     = {};
  const spaces  = building.spaces  || [];
  const nodes   = (building.graph?.nodes || []);
  const edges   = (building.graph?.edges || []);

  spaces.forEach(s => {
    sgm[s.id] = { nodes: [], edges: [], primaryJunction: null, description: s.name };
  });

  nodes.forEach(n => {
    // Direct ID match
    if (sgm[n.id]) {
      sgm[n.id].nodes.push(n.id);
      sgm[n.id].primaryJunction = n.id;
      n2s[n.id] = n.id;
      return;
    }
    // Bounding box containment
    const container = spaces.find(s =>
      n.x >= s.x && n.x <= s.x + (s.width  || 0) &&
      n.y >= s.y && n.y <= s.y + (s.height || 0)
    );
    if (container) {
      sgm[container.id].nodes.push(n.id);
      if (!sgm[container.id].primaryJunction) {
        sgm[container.id].primaryJunction = n.id;
      }
      n2s[n.id] = container.id;
    }
    // Exit nodes map to themselves
    if (new Set((building.exits || []).map(e => e.id)).has(n.id)) {
      n2s[n.id] = n.id;
    }
  });

  edges.forEach(e => {
    const fromSpace = n2s[e.from];
    if (fromSpace && sgm[fromSpace]) sgm[fromSpace].edges.push(e.id);
    const toSpace = n2s[e.to];
    if (toSpace && toSpace !== fromSpace && sgm[toSpace]) {
      sgm[toSpace].edges.push(e.id);
    }
  });

  return { SPATIAL_GRAPH_MAPPING: sgm, NODE_TO_SPACE_MAP: n2s };
}

/**
 * Generic graph generator for custom buildings and layouts.
 * Synthesizes multi-segment corridor junctions, exit nodes, and Euclidean-weighted bidirectional edges.
 *
 * @param {Array} spaces - Building spaces array
 * @param {Array} [doors=[]] - Door definitions [{ from, to, width, x, y }]
 * @param {Array} [exits=[]] - Exit definitions [{ id, name, x, y, connects_to }]
 * @returns {{ nodes: Array, edges: Array, spatialGraphMapping: Object, nodeToSpaceMap: Object }}
 */
export function buildGraphFromSpaces(spaces = [], doors = [], exits = []) {
  const nodes = [];
  const nodeSet = new Set();
  const nodeCoords = {};
  const corridorJunctions = {};
  const spatialGraphMapping = {};
  const nodeToSpaceMap = {};

  // 1. Synthesize Nodes
  (spaces || []).forEach(s => {
    const isCorridor = ['CORRIDOR', 'HALLWAY', 'PATHWAY'].includes((s.type || '').toUpperCase());
    const w = s.width || 120;
    const h = s.height || 80;
    const cx = Math.round((s.x || 0) + w / 2);
    const cy = Math.round((s.y || 0) + h / 2);

    spatialGraphMapping[s.id] = { nodes: [], edges: [], primaryJunction: null, description: s.name || s.id };

    if (isCorridor && (w >= 180 || h >= 180)) {
      // Multi-segment corridor junctions
      const juncs = [];
      if (w >= h) {
        // Horizontal corridor — create West, Mid(s), East junctions along centerline
        const segments = Math.max(2, Math.min(5, Math.round(w / 140)));
        for (let i = 0; i <= segments; i++) {
          const jx = Math.round((s.x || 0) + 20 + (i * (w - 40) / segments));
          const jid = i === 0 ? `JUNC_${s.id}_W` : i === segments ? `JUNC_${s.id}_E` : `JUNC_${s.id}_M${i}`;
          const nObj = { id: jid, x: jx, y: cy };
          nodes.push(nObj);
          nodeSet.add(jid);
          nodeCoords[jid] = { x: jx, y: cy };
          juncs.push(nObj);
          spatialGraphMapping[s.id].nodes.push(jid);
          nodeToSpaceMap[jid] = s.id;
        }
      } else {
        // Vertical corridor — create North, Mid(s), South junctions
        const segments = Math.max(2, Math.min(5, Math.round(h / 140)));
        for (let i = 0; i <= segments; i++) {
          const jy = Math.round((s.y || 0) + 20 + (i * (h - 40) / segments));
          const jid = i === 0 ? `JUNC_${s.id}_N` : i === segments ? `JUNC_${s.id}_S` : `JUNC_${s.id}_M${i}`;
          const nObj = { id: jid, x: cx, y: jy };
          nodes.push(nObj);
          nodeSet.add(jid);
          nodeCoords[jid] = { x: cx, y: jy };
          juncs.push(nObj);
          spatialGraphMapping[s.id].nodes.push(jid);
          nodeToSpaceMap[jid] = s.id;
        }
      }

      // Also add primary centroid node alias
      if (!nodeSet.has(s.id)) {
        nodes.push({ id: s.id, x: cx, y: cy });
        nodeSet.add(s.id);
        nodeCoords[s.id] = { x: cx, y: cy };
        spatialGraphMapping[s.id].nodes.push(s.id);
        nodeToSpaceMap[s.id] = s.id;
      }

      corridorJunctions[s.id] = juncs;
      spatialGraphMapping[s.id].primaryJunction = juncs[Math.floor(juncs.length / 2)].id;
    } else {
      // Standard room / space centroid node
      if (!nodeSet.has(s.id)) {
        nodes.push({ id: s.id, x: cx, y: cy });
        nodeSet.add(s.id);
        nodeCoords[s.id] = { x: cx, y: cy };
        spatialGraphMapping[s.id].nodes.push(s.id);
        nodeToSpaceMap[s.id] = s.id;
        spatialGraphMapping[s.id].primaryJunction = s.id;
      }
    }
  });

  // 2. Nodes for Exits
  (exits || []).forEach(e => {
    if (!nodeSet.has(e.id)) {
      const ex = e.x !== undefined ? e.x : 50;
      const ey = e.y !== undefined ? e.y : 50;
      nodes.push({ id: e.id, x: ex, y: ey });
      nodeSet.add(e.id);
      nodeCoords[e.id] = { x: ex, y: ey };
    }
  });

  const edges = [];
  const edgeSet = new Set();

  const addEdge = (from, to) => {
    if (!from || !to || from === to) return;
    const key1 = `${from}__${to}`;
    const key2 = `${to}__${from}`;
    if (!edgeSet.has(key1) && !edgeSet.has(key2)) {
      const p1 = nodeCoords[from] || { x: 0, y: 0 };
      const p2 = nodeCoords[to]   || { x: 0, y: 0 };
      const cost = Math.max(1, Math.round(Math.hypot(p1.x - p2.x, p1.y - p2.y)));
      edges.push({ id: `E_${from}_${to}`, from, to, base_cost: cost });
      edgeSet.add(key1);
    }
  };

  // 3. Connect consecutive corridor junction segments & space centroid alias
  Object.entries(corridorJunctions).forEach(([spaceId, juncs]) => {
    for (let i = 0; i < juncs.length - 1; i++) {
      addEdge(juncs[i].id, juncs[i + 1].id);
    }
    if (nodeSet.has(spaceId) && juncs.length > 0) {
      addEdge(spaceId, juncs[Math.floor(juncs.length / 2)].id);
    }
  });

  // Helper to find closest node in a target space to coordinate (x, y)
  const getClosestNodeInSpace = (spaceId, targetX, targetY) => {
    if (corridorJunctions[spaceId] && corridorJunctions[spaceId].length) {
      let best = corridorJunctions[spaceId][0];
      let minD = Infinity;
      corridorJunctions[spaceId].forEach(n => {
        const d = (n.x - targetX) ** 2 + (n.y - targetY) ** 2;
        if (d < minD) { minD = d; best = n; }
      });
      return best.id;
    }
    return spaceId;
  };

  // 4. Connect Doors
  (doors || []).forEach(d => {
    const sFrom = (spaces || []).find(s => s.id === d.from);
    const sTo   = (spaces || []).find(s => s.id === d.to);

    const doorX = d.x !== undefined ? d.x : (sFrom && sTo ? Math.round((((sFrom.x || 0) + (sFrom.width || 0) / 2) + ((sTo.x || 0) + (sTo.width || 0) / 2)) / 2) : 100);
    const doorY = d.y !== undefined ? d.y : (sFrom && sTo ? Math.round((((sFrom.y || 0) + (sFrom.height || 0) / 2) + ((sTo.y || 0) + (sTo.height || 0) / 2)) / 2) : 100);

    const nodeFrom = getClosestNodeInSpace(d.from, doorX, doorY);
    const nodeTo   = getClosestNodeInSpace(d.to, doorX, doorY);
    addEdge(nodeFrom, nodeTo);
  });

  // 5. Connect Connections on spaces
  (spaces || []).forEach(s => {
    const cx = (s.x || 0) + (s.width || 0) / 2;
    const cy = (s.y || 0) + (s.height || 0) / 2;
    (s.connections || []).forEach(connId => {
      const node1 = getClosestNodeInSpace(s.id, cx, cy);
      const node2 = getClosestNodeInSpace(connId, cx, cy);
      addEdge(node1, node2);
    });
  });

  // 6. Connect Exits directly to the nearest corridor junction / room node
  (exits || []).forEach(e => {
    const ex = e.x !== undefined ? e.x : 50;
    const ey = e.y !== undefined ? e.y : 50;

    let targetNode = null;
    if (e.connects_to && nodeSet.has(e.connects_to)) {
      targetNode = getClosestNodeInSpace(e.connects_to, ex, ey);
    } else if (e.connected_node && nodeSet.has(e.connected_node)) {
      targetNode = getClosestNodeInSpace(e.connected_node, ex, ey);
    } else {
      let minD = Infinity;
      nodes.forEach(n => {
        if (n.id !== e.id && !exits.some(exObj => exObj.id === n.id)) {
          const d = (n.x - ex) ** 2 + (n.y - ey) ** 2;
          if (d < minD) { minD = d; targetNode = n.id; }
        }
      });
    }

    if (targetNode) {
      addEdge(targetNode, e.id);
    }
  });

  return { nodes, edges, spatialGraphMapping, nodeToSpaceMap };
}

/**
 * Factory to construct a complete, validated custom BuildingModel specification.
 * Automatically synthesizes graph, spatial mappings, and baseline sensors.
 */
export function createCustomBuilding({
  building_id = 'CUSTOM_BUILDING',
  name = 'Custom Architectural Facility',
  description = 'User-designed architectural floor plan with dynamic AI adaptation.',
  version = 'v1.0',
  floor = 1,
  dimensions = { width: 800, height: 600, viewBox: '0 0 800 600' },
  spaces = [],
  doors = [],
  exits = [],
  sensors = [],
  walls = [],
  baselines = null,
  scenario = null,
} = {}) {
  // Ensure default exit if none specified
  const finalExits = exits.length > 0 ? exits : [
    { id: 'EXIT_MAIN', name: 'Main Emergency Exit', x: 740, y: 300, width: 30, height: 40, connects_to: spaces[0]?.id || 'CORRIDOR' }
  ];

  // Synthesize spatial graph with multi-junction corridor support and Euclidean weights
  const { nodes, edges, spatialGraphMapping, nodeToSpaceMap } = buildGraphFromSpaces(spaces, doors, finalExits);
  const graph = { nodes, edges };

  // Auto-generate IFC GUIDs and aliases
  const systemIdentifiers = {};
  const enrichedSpaces = spaces.map((s, idx) => {
    const ifcId = s.ifc_id || `IFC_${1000 + idx}`;
    systemIdentifiers[s.id] = {
      BMS: `Z_${s.id}`,
      FAS: `R_${s.id}`,
      BIM: ifcId,
      OCCUPANCY: `ROOM-${s.id}`
    };
    return {
      id: s.id,
      name: s.name || s.id,
      type: s.type || 'ROOM',
      floor: s.floor || floor,
      capacity: s.capacity || 20,
      x: s.x || 100,
      y: s.y || 100,
      width: s.width || 120,
      height: s.height || 100,
      ifc_id: ifcId,
      doors: s.doors || [],
      sensors: s.sensors || [],
      connections: s.connections || []
    };
  });

  // Auto-generate sensors if not provided
  let enrichedSensors = [...sensors];
  if (enrichedSensors.length === 0) {
    enrichedSpaces.forEach(s => {
      enrichedSensors.push(
        { id: `TEMP_${s.id}`, type: 'TEMPERATURE', room: s.id, x: s.x + 20, y: s.y + 20, source_system: 'BMS', bms_zone: `Z_${s.id}` },
        { id: `SMOKE_${s.id}`, type: 'SMOKE', room: s.id, x: s.x + 40, y: s.y + 20, source_system: 'BMS', bms_zone: `Z_${s.id}` },
        { id: `OCC_${s.id}`, type: 'OCCUPANCY', room: s.id, x: s.x + 60, y: s.y + 20, source_system: 'OCCUPANCY', camera_id: `CAM_${s.id}` }
      );
    });
  }

  // Auto-generate occupancy baseline
  const occBaselines = {};
  enrichedSpaces.forEach(s => {
    occBaselines[s.id] = { base: Math.round((s.capacity || 20) * 0.4), noise: 1 };
  });

  const sensorBaselines = baselines || {
    temperature: { min: 28, max: 32 },
    smoke: { min: 0, max: 0.04 },
    occupancy: occBaselines
  };

  const defaultScenario = scenario || {
    fireStartSeconds: 10,
    fireRoom: enrichedSpaces[0]?.id || 'ROOM_1',
    fireRooms: [enrichedSpaces[0]?.id || 'ROOM_1'],
    fireSeverity: 'HIGH',
    spreadRateMultiplier: 1.0,
    fireSpread: true,
    propagation_ticks: 20
  };

  const spaceMaxX = enrichedSpaces.length ? Math.max(...enrichedSpaces.map(s => (s.x || 0) + (s.width || 0) + 40)) : 880;
  const exitMaxX  = finalExits.length ? Math.max(...finalExits.map(e => (e.x || 0) + (e.width || 40) + 40)) : 880;
  const spaceMaxY = enrichedSpaces.length ? Math.max(...enrichedSpaces.map(s => (s.y || 0) + (s.height || 0) + 40)) : 500;
  const exitMaxY  = finalExits.length ? Math.max(...finalExits.map(e => (e.y || 0) + (e.height || 40) + 40)) : 500;

  const autoWidth = Math.max(880, spaceMaxX, exitMaxX);
  const autoHeight = Math.max(500, spaceMaxY, exitMaxY);

  const finalViewport = { width: autoWidth, height: autoHeight };
  const finalDimensions = { width: autoWidth, height: autoHeight, viewBox: `0 0 ${autoWidth} ${autoHeight}` };

  const buildingModel = {
    building_id,
    name,
    description,
    version,
    floor,
    dimensions: finalDimensions,
    viewport: finalViewport,
    spaces: enrichedSpaces,
    doors,
    exits: finalExits,
    sensors: enrichedSensors,
    walls,
    graph,
    system_identifiers: systemIdentifiers,
    sensor_baselines: sensorBaselines,
    baselines: sensorBaselines,
    scenario: defaultScenario
  };

  return buildingModel;
}

// ── Initialize ────────────────────────────────────────────────────────────────
_recompute();
