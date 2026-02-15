/**
 * Cluster-based graph layout: groups connected nodes together
 * and arranges disconnected clusters in a grid.
 */

interface LayoutNode {
  id: string;
  position?: { x: number; y: number };
}

interface LayoutEdge {
  sourceNodeId: string;
  targetNodeId: string;
}

export interface ClusterInfo {
  nodeIds: string[];
  bounds: { x: number; y: number; width: number; height: number };
}

export interface ClusteredLayoutResult {
  positions: Map<string, { x: number; y: number }>;
  clusters: ClusterInfo[];
}

const NODE_WIDTH = 220;
const NODE_HEIGHT = 80;
const NODE_GAP_X = 60;
const NODE_GAP_Y = 40;
const CLUSTER_GAP = 100;
const CLUSTER_PADDING = 30;
const CLUSTER_LABEL_HEIGHT = 32;
const SINGLETON_GAP = 15;

/**
 * Find connected components using BFS.
 */
function findClusters(nodes: LayoutNode[], edges: LayoutEdge[]): string[][] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const adj = new Map<string, Set<string>>();

  for (const id of nodeIds) {
    adj.set(id, new Set());
  }

  for (const edge of edges) {
    if (nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId)) {
      adj.get(edge.sourceNodeId)!.add(edge.targetNodeId);
      adj.get(edge.targetNodeId)!.add(edge.sourceNodeId);
    }
  }

  const visited = new Set<string>();
  const clusters: string[][] = [];

  for (const id of nodeIds) {
    if (visited.has(id)) continue;

    const cluster: string[] = [];
    const queue = [id];
    visited.add(id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      cluster.push(current);

      for (const neighbor of adj.get(current) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    clusters.push(cluster);
  }

  // Sort: largest clusters first, singletons last
  clusters.sort((a, b) => b.length - a.length);

  return clusters;
}

/**
 * Layout nodes within a single cluster in a compact grid.
 * Accounts for label area and padding around the cluster.
 * Returns the bounding box dimensions (inner content area).
 */
function layoutCluster(
  nodeIds: string[],
  startX: number,
  startY: number,
): { positions: Map<string, { x: number; y: number }>; width: number; height: number } {
  const positions = new Map<string, { x: number; y: number }>();

  // Offset nodes to account for cluster padding and label
  const innerX = startX + CLUSTER_PADDING;
  const innerY = startY + CLUSTER_PADDING + CLUSTER_LABEL_HEIGHT;

  if (nodeIds.length === 1) {
    positions.set(nodeIds[0], { x: innerX, y: innerY });
    return { positions, width: NODE_WIDTH, height: NODE_HEIGHT };
  }

  const cols = Math.ceil(Math.sqrt(nodeIds.length));
  let maxCol = 0;
  let maxRow = 0;

  for (let i = 0; i < nodeIds.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    maxCol = Math.max(maxCol, col);
    maxRow = Math.max(maxRow, row);

    positions.set(nodeIds[i], {
      x: innerX + col * (NODE_WIDTH + NODE_GAP_X),
      y: innerY + row * (NODE_HEIGHT + NODE_GAP_Y),
    });
  }

  return {
    positions,
    width: (maxCol + 1) * (NODE_WIDTH + NODE_GAP_X) - NODE_GAP_X,
    height: (maxRow + 1) * (NODE_HEIGHT + NODE_GAP_Y) - NODE_GAP_Y,
  };
}

/**
 * Compute positions for all nodes, grouping connected nodes together.
 * Clusters are arranged left-to-right, wrapping to new rows.
 * Returns positions and cluster metadata (for rendering group sections).
 */
export function computeClusteredLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
): ClusteredLayoutResult {
  if (nodes.length === 0) return { positions: new Map(), clusters: [] };

  const clusters = findClusters(nodes, edges);
  const allPositions = new Map<string, { x: number; y: number }>();
  const clusterInfos: ClusterInfo[] = [];

  // Arrange clusters in rows, wrapping when too wide
  const MAX_ROW_WIDTH = 1400;
  let cursorX = 50;
  let cursorY = 50;
  let rowMaxHeight = 0;

  // Separate multi-node clusters from singletons
  const multiClusters = clusters.filter((c) => c.length > 1);
  const singletons = clusters.filter((c) => c.length === 1);

  // Layout multi-node clusters first
  for (const cluster of multiClusters) {
    const { positions, width, height } = layoutCluster(cluster, cursorX, cursorY);

    // Total outer dimensions including padding and label
    const outerWidth = width + CLUSTER_PADDING * 2;
    const outerHeight = height + CLUSTER_PADDING * 2 + CLUSTER_LABEL_HEIGHT;

    // Wrap to next row if this cluster would exceed max width
    if (cursorX > 50 && cursorX + outerWidth > MAX_ROW_WIDTH) {
      cursorX = 50;
      cursorY += rowMaxHeight + CLUSTER_GAP;
      rowMaxHeight = 0;

      // Re-layout at new position
      const repositioned = layoutCluster(cluster, cursorX, cursorY);
      const reOuterWidth = repositioned.width + CLUSTER_PADDING * 2;
      const reOuterHeight = repositioned.height + CLUSTER_PADDING * 2 + CLUSTER_LABEL_HEIGHT;

      for (const [id, pos] of repositioned.positions) {
        allPositions.set(id, pos);
      }

      clusterInfos.push({
        nodeIds: cluster,
        bounds: { x: cursorX, y: cursorY, width: reOuterWidth, height: reOuterHeight },
      });

      cursorX += reOuterWidth + CLUSTER_GAP;
      rowMaxHeight = Math.max(rowMaxHeight, reOuterHeight);
    } else {
      for (const [id, pos] of positions) {
        allPositions.set(id, pos);
      }

      clusterInfos.push({
        nodeIds: cluster,
        bounds: { x: cursorX, y: cursorY, width: outerWidth, height: outerHeight },
      });

      cursorX += outerWidth + CLUSTER_GAP;
      rowMaxHeight = Math.max(rowMaxHeight, outerHeight);
    }
  }

  // Layout singletons in a compact grid below groups
  if (singletons.length > 0) {
    cursorX = 50;
    cursorY += rowMaxHeight + CLUSTER_GAP;
    rowMaxHeight = 0;

    const cols = Math.ceil(Math.sqrt(singletons.length));
    for (let i = 0; i < singletons.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const id = singletons[i][0];
      const x = cursorX + col * (NODE_WIDTH + SINGLETON_GAP);
      const y = cursorY + row * (NODE_HEIGHT + SINGLETON_GAP);
      allPositions.set(id, { x, y });

      clusterInfos.push({
        nodeIds: [id],
        bounds: { x, y, width: NODE_WIDTH, height: NODE_HEIGHT },
      });
    }
  }

  return { positions: allPositions, clusters: clusterInfos };
}
