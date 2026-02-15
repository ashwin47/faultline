<template>
  <div class="h-full flex flex-col">
    <!-- Top bar -->
    <div class="border-b border-gray-300 dark:border-gray-700 px-4 py-3 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-3 min-w-0">
        <RouterLink
          to="/resource-maps"
          class="text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors"
        >
          <ArrowLeftIcon class="w-4 h-4" />
        </RouterLink>
        <div class="min-w-0">
          <input
            v-if="isEditingName"
            ref="nameInput"
            v-model="editName"
            class="text-sm font-semibold bg-transparent border-b border-black dark:border-white focus:outline-none w-full"
            @blur="saveName"
            @keydown.enter="saveName"
            @keydown.escape="cancelEditName"
          />
          <h1
            v-else
            @click="startEditName"
            class="text-sm font-semibold cursor-pointer hover:text-black/60 dark:hover:text-white/60 truncate"
          >
            {{ currentMap?.name || 'Loading...' }}
          </h1>
          <p v-if="currentMap?.lastSyncedAt" class="text-[10px] text-black/40 dark:text-white/40 mt-0.5">
            Synced {{ formatDate(currentMap.lastSyncedAt) }}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button
          v-if="flowNodes.length > 0"
          @click="handleReorganize"
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-700 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
        >
          <ViewColumnsIcon class="w-3.5 h-3.5" />
          Reorganize
        </button>
        <button
          @click="handleSync"
          :disabled="syncing"
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-700 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors disabled:opacity-30"
        >
          <ArrowPathIcon class="w-3.5 h-3.5" :class="syncing && 'animate-spin'" />
          {{ syncing ? 'Syncing...' : 'Sync Resources' }}
        </button>
      </div>
    </div>

    <!-- Graph canvas -->
    <div class="flex-1 relative">
      <!-- Empty state -->
      <div
        v-if="!loading && currentMap && flowNodes.length === 0"
        class="absolute inset-0 flex items-center justify-center"
      >
        <div class="text-center">
          <MapIcon class="w-10 h-10 text-black/10 dark:text-white/10 mx-auto mb-3" />
          <p class="text-sm text-black/40 dark:text-white/40">No resources discovered yet</p>
          <button
            @click="handleSync"
            :disabled="syncing"
            class="mt-3 px-4 py-2 text-xs border border-gray-300 dark:border-gray-700 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors disabled:opacity-30"
          >
            {{ syncing ? 'Syncing...' : 'Sync Resources' }}
          </button>
        </div>
      </div>

      <!-- Loading -->
      <div v-else-if="loading" class="absolute inset-0 flex items-center justify-center">
        <p class="text-sm text-black/40 dark:text-white/40">Loading...</p>
      </div>

      <!-- Vue Flow graph -->
      <VueFlow
        v-else-if="flowNodes.length > 0"
        :nodes="flowNodes"
        :edges="flowEdges"
        :node-types="nodeTypes"
        :default-viewport="{ x: 50, y: 50, zoom: 0.85 }"
        :min-zoom="0.2"
        :max-zoom="2"
        :snap-to-grid="true"
        :snap-grid="[20, 20]"
        fit-view-on-init
        class="w-full h-full"
        @node-drag-stop="onNodeDragStop"
        @node-click="onNodeClick"
        @connect="onConnect"
        @edge-click="onEdgeClick"
        @pane-click="editingGroupId = null"
      >
        <Background />
        <Controls position="bottom-right" />
      </VueFlow>
    </div>

    <!-- Edit Resource Modal -->
    <ResourceNodeEditModal
      :visible="showEditModal"
      :node="editingNode"
      @close="closeModal"
      @save="handleSaveNode"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, markRaw } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { VueFlow } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  MapIcon,
  ViewColumnsIcon,
} from '@heroicons/vue/24/outline';
import { computeClusteredLayout } from '../utils/graphLayout';
import type { ClusteredLayoutResult } from '../utils/graphLayout';
import { useResourceMapsStore } from '../stores/resourceMaps';
import { storeToRefs } from 'pinia';
import ResourceNodeCard from '../components/resource-map/ResourceNodeCard.vue';
import ResourceGroupNode from '../components/resource-map/ResourceGroupNode.vue';
import ResourceNodeEditModal from '../components/resource-map/ResourceNodeEditModal.vue';
import type { ResourceNode, ResourceEdge, ResourceGroup } from '../types';

const route = useRoute();
const store = useResourceMapsStore();
const { currentMap, loading, syncing } = storeToRefs(store);

const nodeTypes: Record<string, any> = {
  resource: markRaw(ResourceNodeCard),
  resourceGroup: markRaw(ResourceGroupNode),
};

// Inline editing
const isEditingName = ref(false);
const editName = ref('');
const nameInput = ref<HTMLInputElement | null>(null);

// Edit modal state
const showEditModal = ref(false);
const editingNode = ref<ResourceNode | null>(null);

// Group rename state
const editingGroupId = ref<string | null>(null);

// Compute clustered positions for nodes without saved positions
const clusteredLayout = computed<ClusteredLayoutResult>(() => {
  if (!currentMap.value?.nodes || !currentMap.value?.edges) return { positions: new Map(), clusters: [] };
  const nodesWithoutPosition = currentMap.value.nodes.filter((n) => !n.position);
  if (nodesWithoutPosition.length === 0) return { positions: new Map(), clusters: [] };
  return computeClusteredLayout(currentMap.value.nodes, currentMap.value.edges);
});

// Build group nodes from saved groups, computing bounding box from member node positions
const groupFlowNodes = computed(() => {
  if (!currentMap.value) return [];
  const groups = currentMap.value.groups || [];
  if (groups.length === 0) return [];

  const padding = 30;
  const labelHeight = 32;
  const nodeW = 220;
  const nodeH = 80;

  return groups.map((group) => {
    const memberPositions = group.nodeIds
      .map((nid) => {
        const node = currentMap.value!.nodes.find((n) => n.id === nid);
        if (!node) return null;
        return node.position || clusteredLayout.value.positions.get(nid);
      })
      .filter(Boolean) as { x: number; y: number }[];

    if (memberPositions.length === 0) return null;

    const minX = Math.min(...memberPositions.map((p) => p.x));
    const minY = Math.min(...memberPositions.map((p) => p.y));
    const maxX = Math.max(...memberPositions.map((p) => p.x));
    const maxY = Math.max(...memberPositions.map((p) => p.y));

    const w = (maxX - minX) + nodeW + padding * 2;
    const h = (maxY - minY) + nodeH + padding * 2 + labelHeight;

    return {
      id: `group-${group.id}`,
      type: 'resourceGroup',
      position: { x: minX - padding, y: minY - labelHeight - padding },
      draggable: false,
      selectable: false,
      zIndex: 0,
      class: '!pointer-events-auto',
      style: { width: `${w}px`, height: `${h}px` },
      data: {
        groupId: group.id,
        name: group.name,
        width: w,
        height: h,
        editing: editingGroupId.value === group.id,
        onRename: (name: string) => { store.renameGroup(group.id, name); editingGroupId.value = null; },
        onCancelEdit: () => { editingGroupId.value = null; },
      },
    };
  }).filter((n): n is NonNullable<typeof n> => n !== null);
});

// Convert ResourceNode[] to Vue Flow nodes (resource nodes + group nodes)
const flowNodes = computed(() => {
  if (!currentMap.value?.nodes) return [];

  const resourceNodes = currentMap.value.nodes.map((node: ResourceNode) => ({
    id: node.id,
    type: 'resource',
    zIndex: 1,
    position: node.position || clusteredLayout.value.positions.get(node.id) || { x: 50, y: 50 },
    data: node,
    events: {
      edit: () => handleEditNode(node),
      delete: () => handleDeleteNode(node.id),
    },
  }));

  return [...groupFlowNodes.value, ...resourceNodes] as any[];
});

// Convert ResourceEdge[] to Vue Flow edges
const flowEdges = computed(() => {
  if (!currentMap.value?.edges) return [];

  return currentMap.value.edges.map((edge: ResourceEdge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    label: edge.label || '',
    animated: (edge.confidence || 0) < 0.8,
    style: {
      stroke: edgeColor(edge.type),
      strokeWidth: 1.5,
      cursor: 'pointer',
    },
    labelStyle: {
      fontSize: '10px',
      fill: '#888',
    },
  }));
});

function generateGroupName(nodeIds: string[]): string {
  if (!currentMap.value) return 'Group';
  const nodes = nodeIds
    .map((id) => currentMap.value!.nodes.find((n) => n.id === id))
    .filter(Boolean) as ResourceNode[];

  if (nodes.length === 0) return 'Group';

  // Try to find a common normalized name prefix
  const normalizedNames = nodes.map((n) => n.normalizedName).filter((n) => n && n.length > 0);
  if (normalizedNames.length >= 2) {
    let prefix = normalizedNames[0];
    for (let i = 1; i < normalizedNames.length; i++) {
      while (prefix.length > 0 && !normalizedNames[i].startsWith(prefix)) {
        prefix = prefix.slice(0, -1);
      }
    }
    if (prefix.length >= 3) {
      return prefix.charAt(0).toUpperCase() + prefix.slice(1);
    }
  }

  // Fall back: use the dominant source label
  const sourceCounts = new Map<string, number>();
  for (const n of nodes) {
    sourceCounts.set(n.source, (sourceCounts.get(n.source) || 0) + 1);
  }
  const topSource = [...sourceCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const sourceLabels: Record<string, string> = {
    aws: 'AWS', newrelic: 'New Relic', pagerduty: 'PagerDuty', sentry: 'Sentry',
  };

  if (topSource && sourceCounts.size === 1) {
    const types = [...new Set(nodes.map((n) => n.type))];
    const typeLabels: Record<string, string> = {
      ec2: 'EC2 Instances', rds: 'Databases', lambda: 'Functions',
      newrelic_app: 'Applications', pagerduty_service: 'Services', sentry_project: 'Projects',
    };
    if (types.length === 1 && typeLabels[types[0]]) {
      return `${sourceLabels[topSource] || topSource} ${typeLabels[types[0]]}`;
    }
    return `${sourceLabels[topSource] || topSource} Resources`;
  }

  // Mixed sources — use the most common node name
  return nodes[0].name;
}

function handleReorganize() {
  if (!currentMap.value) return;
  const result = computeClusteredLayout(currentMap.value.nodes, currentMap.value.edges);
  const updatedNodes = currentMap.value.nodes.map((node) => ({
    ...node,
    position: result.positions.get(node.id) || node.position || { x: 50, y: 50 },
  }));

  // Generate groups from clusters, preserving user-edited names where possible
  const existingGroups = currentMap.value.groups || [];
  const groups: ResourceGroup[] = result.clusters
    .filter((c) => c.nodeIds.length > 1)
    .map((cluster) => {
      const clusterSet = new Set(cluster.nodeIds);
      const match = existingGroups.find((g) => {
        const overlap = g.nodeIds.filter((id) => clusterSet.has(id)).length;
        return overlap > 0 && overlap >= Math.min(g.nodeIds.length, cluster.nodeIds.length) / 2;
      });
      return {
        id: match?.id || crypto.randomUUID(),
        name: match?.name || generateGroupName(cluster.nodeIds),
        nodeIds: cluster.nodeIds,
      };
    });

  currentMap.value.nodes = updatedNodes;
  currentMap.value.groups = groups;
  store.saveGraph(currentMap.value.id, updatedNodes, currentMap.value.edges, groups);
}

function edgeColor(type: string): string {
  switch (type) {
    case 'name_match': return '#6366f1';
    case 'security_group': return '#f59e0b';
    case 'subnet_group': return '#10b981';
    case 'tag_link': return '#8b5cf6';
    case 'manual': return '#6b7280';
    default: return '#9ca3af';
  }
}

// Debounce for saving positions
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function onNodeDragStop() {
  if (!currentMap.value) return;

  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    if (!currentMap.value) return;

    const updatedNodes = currentMap.value.nodes.map((node) => {
      const flowNode = flowNodes.value.find((fn) => fn.id === node.id);
      if (flowNode?.position) {
        return { ...node, position: { x: flowNode.position.x, y: flowNode.position.y } };
      }
      return node;
    });

    store.saveGraph(currentMap.value.id, updatedNodes, currentMap.value.edges);
  }, 500);
}

function onNodeClick({ node }: { node: { id: string; type: string } }) {
  if (node.type === 'resourceGroup') {
    const groupId = node.id.replace('group-', '');
    editingGroupId.value = groupId;
  } else {
    editingGroupId.value = null;
  }
}

// Edge creation via handle drag
function onConnect(params: { source: string; target: string }) {
  if (params.source === params.target) return;
  const exists = currentMap.value?.edges.some(
    (e) =>
      (e.sourceNodeId === params.source && e.targetNodeId === params.target) ||
      (e.sourceNodeId === params.target && e.targetNodeId === params.source),
  );
  if (exists) return;
  store.addEdge(params.source, params.target);
}

// Edge deletion via click
function onEdgeClick({ edge }: { edge: { id: string } }) {
  if (confirm('Delete this edge?')) {
    store.deleteEdge(edge.id);
  }
}

// Node editing
function handleEditNode(node: ResourceNode) {
  editingNode.value = node;
  showEditModal.value = true;
}

function handleDeleteNode(nodeId: string) {
  if (confirm('Delete this resource and its connections?')) {
    store.deleteNode(nodeId);
  }
}

function closeModal() {
  showEditModal.value = false;
  editingNode.value = null;
}

function handleSaveNode(data: { name: string; type: string; source: string; externalId: string; attrs: Record<string, string> }) {
  if (editingNode.value) {
    store.updateNode(editingNode.value.id, {
      name: data.name,
      type: data.type,
      source: data.source,
      externalId: data.externalId || undefined,
      attrs: data.attrs,
    });
  }
}

function formatDate(date: Date | string | null): string {
  if (!date) return 'never';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'unknown';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();

  if (diffMs < 0) return 'just now';
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return d.toLocaleDateString();
}

function startEditName() {
  editName.value = currentMap.value?.name || '';
  isEditingName.value = true;
  nextTick(() => nameInput.value?.focus());
}

function saveName() {
  if (!currentMap.value || !editName.value.trim()) {
    cancelEditName();
    return;
  }
  if (editName.value.trim() !== currentMap.value.name) {
    store.updateMap(currentMap.value.id, { name: editName.value.trim() });
  }
  isEditingName.value = false;
}

function cancelEditName() {
  isEditingName.value = false;
}

function handleSync() {
  if (!currentMap.value) return;
  store.syncMap(currentMap.value.id);
}

// Auto-reorganize after sync completes
watch(syncing, (newVal, oldVal) => {
  if (oldVal && !newVal && currentMap.value && currentMap.value.nodes.length > 0) {
    handleReorganize();
  }
});

// Fetch map on mount or route change
watch(() => route.params.id, (id) => {
  if (id && typeof id === 'string') {
    store.fetchMap(id);
  }
}, { immediate: true });
</script>
