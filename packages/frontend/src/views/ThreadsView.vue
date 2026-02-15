<template>
  <div class="h-full overflow-y-auto">
    <div class="max-w-3xl mx-auto p-6">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-lg font-semibold">All Threads</h1>
          <p class="text-xs text-black/50 dark:text-white/50 mt-0.5">
            {{ conversations.length }} conversation{{ conversations.length === 1 ? '' : 's' }}
          </p>
        </div>
        <RouterLink
          to="/chat"
          class="px-4 py-2 border border-gray-300 dark:border-gray-700 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors text-sm"
        >
          New Conversation
        </RouterLink>
      </div>

      <div v-if="conversations.length === 0" class="text-center py-16 text-sm text-black/40 dark:text-white/40">
        No conversations yet. Start one from the Chat page.
      </div>

      <div v-else class="space-y-1">
        <RouterLink
          v-for="conv in conversations"
          :key="conv.id"
          :to="`/chat/${conv.id}`"
          class="group w-full flex items-center justify-between px-4 py-3 border border-gray-200 dark:border-gray-800 hover:border-black dark:hover:border-white transition-colors text-left"
        >
          <div class="min-w-0 flex-1 mr-4">
            <p class="text-sm font-medium truncate">
              {{ conv.title || 'Untitled conversation' }}
            </p>
            <p class="text-[11px] text-black/40 dark:text-white/40 mt-0.5">
              {{ formatDate(conv.updatedAt) }}
              <span class="mx-1">&middot;</span>
              {{ conv.messageCount }} message{{ conv.messageCount === 1 ? '' : 's' }}
            </p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span
              @click.prevent="deleteConversation(conv.id)"
              class="text-[11px] text-black/20 dark:text-white/20 hover:text-red-500 dark:hover:text-red-400 transition-colors px-1"
              title="Delete"
            >&times;</span>
            <svg class="w-4 h-4 text-black/20 dark:text-white/20 group-hover:text-black dark:group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </div>
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { useAgentStore } from '../stores/agent';
import { storeToRefs } from 'pinia';

const agentStore = useAgentStore();
const { conversations } = storeToRefs(agentStore);

function formatDate(date: Date | string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Unknown';

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

function deleteConversation(id: string) {
  agentStore.deleteConversation(id);
}

onMounted(() => {
  agentStore.fetchConversations();
});
</script>
