/**
 * GRAPH INSPECTION SCRIPT (Part 5)
 *
 * Displays full topology, spatial entity bindings, coordinates,
 * adjacent nodes, hazard states, and cost multipliers.
 */

import { BUILDING, NODE_TO_SPACE_MAP, SPATIAL_GRAPH_MAPPING } from '../data/building.js';
import { BuildingGraph } from '../modules/buildingGraph.js';

function inspectGraph() {
  console.log('========================================================================================');
  console.log('  🔍 PART 5: NAVIGATION GRAPH & SPATIAL ENTITY BINDING INSPECTION');
  console.log('========================================================================================\n');

  const graph = new BuildingGraph();

  // Test with a simulated fire in Room 101 and Corridor
  graph.setNodeCostMultiplier('ROOM_101', 2500);
  graph.setNodeCostMultiplier('JUNC_101', 2500);
  graph.setNodeCostMultiplier('JUNC_102', 20);

  const tableData = BUILDING.graph.nodes.map(n => {
    const spaceId = NODE_TO_SPACE_MAP[n.id] || n.id;
    const isExit = BUILDING.exits.some(e => e.id === n.id);
    const nodeType = isExit ? 'EXIT' : (n.id.startsWith('JUNC') ? 'WAYPOINT' : 'SPACE_CENTROID');
    const neighbours = graph.getNeighbours(n.id).map(nb => `${nb.node} (cost: ${nb.cost})`).join(', ');
    const multiplier = graph.getNodeCost(n.id);

    return {
      NodeID: n.id,
      Type: nodeType,
      SpatialEntity: spaceId,
      Coordinates: `(${n.x}, ${n.y})`,
      CostMultiplier: multiplier,
      AdjacentEdges: neighbours
    };
  });

  console.table(tableData);
}

inspectGraph();
