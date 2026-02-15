<template>
  <div class="h-full overflow-y-auto">
    <div class="max-w-3xl mx-auto p-6">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-lg font-semibold">Resource Maps</h1>
          <p class="text-xs text-black/50 dark:text-white/50 mt-0.5">
            {{ maps.length }} map{{ maps.length === 1 ? '' : 's' }}
          </p>
        </div>
        <button
          @click="showCreateModal = true"
          class="px-4 py-2 border border-gray-300 dark:border-gray-700 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors text-sm"
        >
          New Map
        </button>
      </div>

      <div v-if="loading && maps.length === 0" class="text-center py-16 text-sm text-black/40 dark:text-white/40">
        Loading...
      </div>

      <div v-else-if="maps.length === 0" class="text-center py-16 text-sm text-black/40 dark:text-white/40">
        No resource maps yet. Create one to discover and visualize your infrastructure.
      </div>

      <div v-else class="space-y-1">
        <RouterLink
          v-for="map in maps"
          :key="map.id"
          :to="`/resource-maps/${map.id}`"
          class="group w-full flex items-center justify-between px-4 py-3 border border-gray-200 dark:border-gray-800 hover:border-black dark:hover:border-white transition-colors text-left"
        >
          <div class="min-w-0 flex-1 mr-4">
            <p class="text-sm font-medium truncate">
              {{ map.name }}
            </p>
            <p class="text-[11px] text-black/40 dark:text-white/40 mt-0.5">
              {{ map.nodeCount }} resource{{ map.nodeCount === 1 ? '' : 's' }}
              <span class="mx-1">&middot;</span>
              {{ map.edgeCount }} connection{{ map.edgeCount === 1 ? '' : 's' }}
              <template v-if="map.lastSyncedAt">
                <span class="mx-1">&middot;</span>
                Synced {{ formatDate(map.lastSyncedAt) }}
              </template>
            </p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span
              @click.prevent="handleDelete(map.id)"
              class="text-[11px] text-black/20 dark:text-white/20 hover:text-red-500 dark:hover:text-red-400 transition-colors px-1"
              title="Delete"
            >&times;</span>
            <ChevronRightIcon class="w-4 h-4 text-black/20 dark:text-white/20 group-hover:text-black dark:group-hover:text-white transition-colors" />
          </div>
        </RouterLink>
      </div>
    </div>

    <!-- Create Modal -->
    <div v-if="showCreateModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="showCreateModal = false">
      <div class="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 p-6 w-full max-w-md">
        <h2 class="text-sm font-semibold mb-4">New Resource Map</h2>
        <div class="space-y-3">
          <div>
            <label class="text-[11px] text-black/50 dark:text-white/50 block mb-1">Name</label>
            <input
              v-model="newMapName"
              type="text"
              placeholder="e.g. Production"
              class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 bg-transparent focus:outline-none focus:border-black dark:focus:border-white"
              @keydown.enter="handleCreate"
            />
          </div>
          <div>
            <label class="text-[11px] text-black/50 dark:text-white/50 block mb-1">Description (optional)</label>
            <input
              v-model="newMapDescription"
              type="text"
              placeholder="e.g. Main production environment"
              class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 bg-transparent focus:outline-none focus:border-black dark:focus:border-white"
              @keydown.enter="handleCreate"
            />
          </div>
        </div>
        <div class="flex justify-end gap-2 mt-4">
          <button
            @click="showCreateModal = false"
            class="px-4 py-2 text-sm text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            @click="handleCreate"
            :disabled="!newMapName.trim()"
            class="px-4 py-2 text-sm bg-black dark:bg-white text-white dark:text-black disabled:opacity-30 transition-opacity"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { ChevronRightIcon } from '@heroicons/vue/24/outline';
import { useResourceMapsStore } from '../stores/resourceMaps';
import { storeToRefs } from 'pinia';

const router = useRouter();
const store = useResourceMapsStore();
const { maps, loading } = storeToRefs(store);

const showCreateModal = ref(false);
const newMapName = ref('');
const newMapDescription = ref('');

function formatDate(date: Date | string | null): string {
  if (!date) return 'never';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'unknown';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();

  if (diffMs < 0) return 'just now';

  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

async function handleCreate() {
  if (!newMapName.value.trim()) return;
  const map = await store.createMap(newMapName.value.trim(), newMapDescription.value.trim() || undefined);
  if (map) {
    showCreateModal.value = false;
    newMapName.value = '';
    newMapDescription.value = '';
    router.push(`/resource-maps/${map.id}`);
  }
}

function handleDelete(id: string) {
  store.deleteMap(id);
}

onMounted(() => {
  store.fetchMaps();
});
</script>
