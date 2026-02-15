<template>
  <div class="space-y-6">
    <MessageItem
      v-for="message in messages"
      :key="message.id"
      :message="message"
    />
  </div>
</template>

<script setup lang="ts">
import MessageItem from './MessageItem.vue';
import type { Message } from '../types';

defineProps<{
  messages: Message[];
}>();
</script>
