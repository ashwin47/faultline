<template>
  <div class="space-y-6">
    <template v-for="(group, gi) in groupedMessages" :key="gi">
      <!-- Collapsible activity group (tool_use + evaluation before an assistant text) -->
      <div v-if="group.type === 'activity'" class="max-w-5xl mx-auto">
        <details class="group">
          <summary class="cursor-pointer select-none text-xs text-black/40 dark:text-white/40 hover:text-black/60 dark:hover:text-white/60 flex items-center gap-1.5 py-1">
            <svg class="w-3 h-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            {{ toolCallCount(group.messages) }} tool {{ toolCallCount(group.messages) === 1 ? 'call' : 'calls' }}
            <template v-for="tag in integrationTags(group.messages)" :key="tag.key">
              <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/[0.05] dark:bg-white/[0.07]">
                <Icon :icon="tag.icon" class="w-3 h-3" />
                <span>{{ tag.label }}</span>
              </span>
            </template>
          </summary>
          <div class="mt-2 space-y-2">
            <MessageItem
              v-for="message in group.messages"
              :key="message.id"
              :message="message"
            />
          </div>
        </details>
      </div>

      <!-- Regular message (user / assistant text) -->
      <MessageItem
        v-else
        :message="group.message"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import MessageItem from './MessageItem.vue';
import type { Message } from '../types';

const INTEGRATION_META: Record<string, { label: string; icon: string }> = {
  newrelic:   { label: 'New Relic',  icon: 'simple-icons:newrelic' },
  sentry:     { label: 'Sentry',     icon: 'simple-icons:sentry' },
  aws:        { label: 'AWS',        icon: 'simple-icons:amazonwebservices' },
  github:     { label: 'GitHub',     icon: 'simple-icons:github' },
  pagerduty:  { label: 'PagerDuty',  icon: 'simple-icons:pagerduty' },
};

const props = defineProps<{
  messages: Message[];
}>();

function toolCallCount(msgs: Message[]): number {
  return msgs.filter(m => m.messageType === 'tool_use').length;
}

function integrationTags(msgs: Message[]): { key: string; label: string; icon: string }[] {
  const seen = new Set<string>();
  const tags: { key: string; label: string; icon: string }[] = [];
  for (const msg of msgs) {
    const integration = msg.toolUses?.integration;
    if (integration && !seen.has(integration)) {
      seen.add(integration);
      const meta = INTEGRATION_META[integration];
      if (meta) {
        tags.push({ key: integration, ...meta });
      }
    }
  }
  return tags;
}

type MessageGroup =
  | { type: 'activity'; messages: Message[] }
  | { type: 'message'; message: Message };

const groupedMessages = computed<MessageGroup[]>(() => {
  const groups: MessageGroup[] = [];
  let activityBuffer: Message[] = [];

  for (const msg of props.messages) {
    if (msg.messageType === 'tool_use' || msg.messageType === 'evaluation') {
      activityBuffer.push(msg);
    } else {
      // Flush activity buffer before this message
      if (activityBuffer.length > 0) {
        groups.push({ type: 'activity', messages: activityBuffer });
        activityBuffer = [];
      }
      groups.push({ type: 'message', message: msg });
    }
  }

  // Trailing activity (agent still running, no final message yet) — show ungrouped
  if (activityBuffer.length > 0) {
    for (const msg of activityBuffer) {
      groups.push({ type: 'message', message: msg });
    }
  }

  return groups;
});
</script>
