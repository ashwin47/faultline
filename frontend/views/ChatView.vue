<template>
  <ChatInterface />
</template>

<script setup lang="ts">
import { watch, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import ChatInterface from '../components/ChatInterface.vue';
import { useAgentStore } from '../stores/agent';
import { useWebSocket } from '../composables/useWebSocket';

const route = useRoute();
const agentStore = useAgentStore();
const { joinConversation, leaveConversation } = useWebSocket();

let currentRoomId: string | undefined;

// Join/leave conversation rooms when route param changes.
// Join first (to catch in-flight streams), then fetch history.
watch(
  () => route.params.id as string | undefined,
  (newId, oldId) => {
    // Leave old room
    if (oldId) {
      leaveConversation(oldId);
    }

    if (newId) {
      // Join new room first (catch in-flight streams)
      joinConversation(newId);
      currentRoomId = newId;

      // Then fetch history (skip if already loaded)
      if (agentStore.currentConversation?.id !== newId) {
        agentStore.fetchConversation(newId);
      }
    } else {
      currentRoomId = undefined;
      agentStore.createNewConversation();
    }
  },
  { immediate: true }
);

// Leave room when navigating away from chat entirely
onUnmounted(() => {
  if (currentRoomId) {
    leaveConversation(currentRoomId);
  }
});
</script>
