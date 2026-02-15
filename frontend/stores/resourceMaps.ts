import { defineStore } from 'pinia';
import { ref } from 'vue';
import axios from 'axios';
import { useAuthStore } from './auth';
import { normalizeName } from '../utils/normalizeName';
import type { ResourceMap, ResourceMapSummary, ResourceNode, ResourceEdge, ResourceGroup } from '../types';

export const useResourceMapsStore = defineStore('resourceMaps', () => {
  function accountBase() {
    const authStore = useAuthStore();
    return `/api/accounts/${authStore.currentAccount?.id}`;
  }

  const maps = ref<ResourceMapSummary[]>([]);
  const currentMap = ref<ResourceMap | null>(null);
  const loading = ref(false);
  const syncing = ref(false);
  const error = ref<string | null>(null);
  const selectedMapId = ref<string | null>(null);

  async function fetchMaps() {
    loading.value = true;
    error.value = null;
    try {
      const response = await axios.get(`${accountBase()}/resource-maps`);
      maps.value = response.data.maps;
    } catch (err: any) {
      console.error('Error fetching resource maps:', err);
      error.value = err.message || 'Failed to fetch resource maps';
    } finally {
      loading.value = false;
    }
  }

  async function fetchMap(id: string) {
    loading.value = true;
    error.value = null;
    try {
      const response = await axios.get(`${accountBase()}/resource-maps/${id}`);
      currentMap.value = response.data;
    } catch (err: any) {
      console.error('Error fetching resource map:', err);
      error.value = err.message || 'Failed to fetch resource map';
    } finally {
      loading.value = false;
    }
  }

  async function createMap(name: string, description?: string): Promise<ResourceMap | null> {
    error.value = null;
    try {
      const response = await axios.post(`${accountBase()}/resource-maps`, { name, description });
      const map = response.data as ResourceMap;
      await fetchMaps();
      return map;
    } catch (err: any) {
      console.error('Error creating resource map:', err);
      error.value = err.message || 'Failed to create resource map';
      return null;
    }
  }

  async function updateMap(id: string, data: { name?: string; description?: string }) {
    error.value = null;
    try {
      await axios.put(`${accountBase()}/resource-maps/${id}`, data);
      if (currentMap.value?.id === id) {
        if (data.name !== undefined) currentMap.value.name = data.name;
        if (data.description !== undefined) currentMap.value.description = data.description;
      }
      await fetchMaps();
    } catch (err: any) {
      console.error('Error updating resource map:', err);
      error.value = err.message || 'Failed to update resource map';
    }
  }

  async function deleteMap(id: string) {
    error.value = null;
    try {
      await axios.delete(`${accountBase()}/resource-maps/${id}`);
      maps.value = maps.value.filter((m) => m.id !== id);
      if (currentMap.value?.id === id) {
        currentMap.value = null;
      }
    } catch (err: any) {
      console.error('Error deleting resource map:', err);
      error.value = err.message || 'Failed to delete resource map';
    }
  }

  async function syncMap(id: string) {
    syncing.value = true;
    error.value = null;
    try {
      const response = await axios.post(`${accountBase()}/resource-maps/${id}/sync`);
      currentMap.value = response.data;
      await fetchMaps();
    } catch (err: any) {
      console.error('Error syncing resource map:', err);
      error.value = err.message || 'Failed to sync resource map';
    } finally {
      syncing.value = false;
    }
  }

  async function saveGraph(id: string, nodes: ResourceNode[], edges: ResourceEdge[], groups?: ResourceGroup[]) {
    try {
      await axios.put(`${accountBase()}/resource-maps/${id}/graph`, { nodes, edges, groups });
    } catch (err: any) {
      console.error('Error saving graph:', err);
    }
  }

  function addNode(node: ResourceNode) {
    if (!currentMap.value) return;
    currentMap.value.nodes.push(node);
    saveGraph(currentMap.value.id, currentMap.value.nodes, currentMap.value.edges);
  }

  function updateNode(nodeId: string, updates: { name?: string; type?: string; source?: string; externalId?: string; attrs?: Record<string, string> }) {
    if (!currentMap.value) return;
    const idx = currentMap.value.nodes.findIndex((n) => n.id === nodeId);
    if (idx < 0) return;
    const node = currentMap.value.nodes[idx];
    if (updates.name !== undefined) {
      node.name = updates.name;
      node.normalizedName = normalizeName(updates.name);
    }
    if (updates.type !== undefined) node.type = updates.type;
    if (updates.source !== undefined) node.source = updates.source;
    if (updates.externalId !== undefined) node.externalId = updates.externalId;
    if (updates.attrs !== undefined) node.attrs = updates.attrs;
    saveGraph(currentMap.value.id, currentMap.value.nodes, currentMap.value.edges);
  }

  function deleteNode(nodeId: string) {
    if (!currentMap.value) return;
    currentMap.value.nodes = currentMap.value.nodes.filter((n) => n.id !== nodeId);
    currentMap.value.edges = currentMap.value.edges.filter(
      (e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId,
    );
    saveGraph(currentMap.value.id, currentMap.value.nodes, currentMap.value.edges);
  }

  function addEdge(sourceNodeId: string, targetNodeId: string) {
    if (!currentMap.value) return;
    const edge: ResourceEdge = {
      id: crypto.randomUUID(),
      sourceNodeId,
      targetNodeId,
      type: 'manual',
      label: 'Manual',
      confidence: 1.0,
    };
    currentMap.value.edges.push(edge);
    saveGraph(currentMap.value.id, currentMap.value.nodes, currentMap.value.edges);
  }

  function deleteEdge(edgeId: string) {
    if (!currentMap.value) return;
    currentMap.value.edges = currentMap.value.edges.filter((e) => e.id !== edgeId);
    // Recompute groups — splitting any that became disconnected
    currentMap.value.groups = recomputeGroups(
      currentMap.value.groups,
      currentMap.value.edges,
    );
    saveGraph(currentMap.value.id, currentMap.value.nodes, currentMap.value.edges, currentMap.value.groups);
  }

  /**
   * After an edge is removed, check each group for connectivity.
   * If a group's nodes split into multiple connected components,
   * create a new group for each component (keeping the original name
   * on the largest component).
   */
  function recomputeGroups(groups: ResourceGroup[], edges: ResourceEdge[]): ResourceGroup[] {
    // Build adjacency from current edges
    const adj = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!adj.has(e.sourceNodeId)) adj.set(e.sourceNodeId, new Set());
      if (!adj.has(e.targetNodeId)) adj.set(e.targetNodeId, new Set());
      adj.get(e.sourceNodeId)!.add(e.targetNodeId);
      adj.get(e.targetNodeId)!.add(e.sourceNodeId);
    }

    const result: ResourceGroup[] = [];

    for (const group of groups) {
      // Find connected components within this group's nodes
      const memberSet = new Set(group.nodeIds);
      const visited = new Set<string>();
      const components: string[][] = [];

      for (const nodeId of group.nodeIds) {
        if (visited.has(nodeId)) continue;
        const component: string[] = [];
        const queue = [nodeId];
        visited.add(nodeId);

        while (queue.length > 0) {
          const current = queue.shift()!;
          component.push(current);
          for (const neighbor of adj.get(current) || []) {
            if (memberSet.has(neighbor) && !visited.has(neighbor)) {
              visited.add(neighbor);
              queue.push(neighbor);
            }
          }
        }
        components.push(component);
      }

      if (components.length <= 1) {
        // Group is still connected
        result.push(group);
      } else {
        // Sort by size descending — largest keeps the original name
        components.sort((a, b) => b.length - a.length);
        for (let i = 0; i < components.length; i++) {
          if (components[i].length < 2) continue; // drop singletons from groups
          result.push({
            id: i === 0 ? group.id : crypto.randomUUID(),
            name: i === 0 ? group.name : `${group.name} ${i + 1}`,
            nodeIds: components[i],
          });
        }
      }
    }

    return result;
  }

  function renameGroup(groupId: string, name: string) {
    if (!currentMap.value) return;
    const group = currentMap.value.groups.find((g) => g.id === groupId);
    if (!group) return;
    group.name = name;
    saveGraph(currentMap.value.id, currentMap.value.nodes, currentMap.value.edges, currentMap.value.groups);
  }

  return {
    maps,
    currentMap,
    loading,
    syncing,
    error,
    selectedMapId,
    fetchMaps,
    fetchMap,
    createMap,
    updateMap,
    deleteMap,
    syncMap,
    saveGraph,
    addNode,
    updateNode,
    deleteNode,
    addEdge,
    deleteEdge,
    renameGroup,
  };
});
