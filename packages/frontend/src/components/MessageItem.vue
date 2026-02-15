<template>
  <div
    :class="[
      'flex',
      message.role === 'user' ? 'justify-end' : 'justify-start',
    ]"
  >
    <div
      :class="[
        'max-w-3xl w-full text-sm',
        message.role === 'user'
          ? 'bg-black dark:bg-white text-white dark:text-black px-4 py-3 max-w-xl'
          : '',
      ]"
    >
      <!-- User messages: simple -->
      <template v-if="message.role === 'user'">
        <div class="whitespace-pre-wrap">{{ message.content }}</div>
        <div class="text-xs mt-2 text-white/60 dark:text-black/60">
          {{ formatTimestamp(message.timestamp) }}
        </div>
      </template>

      <!-- Assistant messages: collapsible activity + final answer -->
      <template v-else>
        <!-- Collapsible tool calls + reasoning -->
        <details v-if="hasActivity" class="mb-4 group">
          <summary class="flex items-center gap-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
            <svg class="w-3 h-3 text-black/30 dark:text-white/30 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <div class="w-1 h-1 bg-black dark:bg-white rounded-full" />
            <span class="text-[11px] font-medium uppercase tracking-wider text-black/40 dark:text-white/40">
              {{ toolCount }} tool {{ toolCount === 1 ? 'call' : 'calls' }}
            </span>
            <span
              v-for="integration in uniqueIntegrations"
              :key="integration"
              class="px-1.5 py-0.5 text-[10px] uppercase tracking-wider border border-gray-300 dark:border-gray-700 text-black/40 dark:text-white/40"
            >
              {{ integration }}
            </span>
            <span v-if="errorCount > 0" class="text-[10px] text-red-500">
              {{ errorCount }} failed
            </span>
            <span v-if="totalExecutionTime" class="text-[10px] text-black/30 dark:text-white/30 tabular-nums ml-auto">
              {{ totalExecutionTime }}
            </span>
          </summary>
          <div class="mt-2 ml-5 space-y-2">
            <!-- Tool calls -->
            <div v-if="message.toolUses && message.toolUses.length > 0" class="space-y-1.5">
              <ToolUsageIndicator
                v-for="toolUse in message.toolUses"
                :key="toolUse.id"
                :tool-use="toolUse"
              />
            </div>
            <!-- Reasoning / evaluations -->
            <div
              v-for="entry in (message.reasoning || [])"
              :key="'r-' + entry.iteration"
              class="border-l-2 border-black/15 dark:border-white/15 pl-3 py-1.5 text-xs text-black/70 dark:text-white/70"
            >
              <div class="flex items-center gap-2 mb-1">
                <span class="font-medium text-black/50 dark:text-white/50">Evaluation</span>
                <span class="tabular-nums">{{ entry.evaluation.confidence }}%</span>
                <span class="uppercase tracking-wider text-[10px] text-black/40 dark:text-white/40">{{ entry.evaluation.status }}</span>
              </div>
              <p class="leading-relaxed">{{ entry.evaluation.summary }}</p>
            </div>
          </div>
        </details>

        <!-- Final answer -->
        <div
          v-if="message.content"
          class="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:p-4 prose-pre:rounded prose-pre:overflow-x-auto prose-pre:text-xs prose-pre:leading-relaxed prose-code:text-xs prose-code:before:content-none prose-code:after:content-none prose-table:border prose-table:border-gray-200 dark:prose-table:border-gray-700 prose-th:border prose-th:border-gray-200 dark:prose-th:border-gray-700 prose-th:px-3 prose-th:py-1.5 prose-td:border prose-td:border-gray-200 dark:prose-td:border-gray-700 prose-td:px-3 prose-td:py-1.5"
          v-html="renderMarkdown(message.content)"
        />

        <div class="text-xs mt-3 text-black/30 dark:text-white/30">
          {{ formatTimestamp(message.timestamp) }}
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import MarkdownIt from 'markdown-it';
import ToolUsageIndicator from './ToolUsageIndicator.vue';
import type { Message } from '../types';

const props = defineProps<{
  message: Message;
}>();

const INTEGRATION_LABELS: Record<string, string> = {
  newrelic: 'New Relic',
  sentry: 'Sentry',
  aws: 'AWS',
  github: 'GitHub',
  pagerduty: 'PagerDuty',
};

const toolCount = computed(() => props.message.toolUses?.length ?? 0);
const evalCount = computed(() => props.message.reasoning?.length ?? 0);
const hasActivity = computed(() => toolCount.value > 0 || evalCount.value > 0);

const uniqueIntegrations = computed(() => {
  if (!props.message.toolUses) return [];
  const seen = new Set<string>();
  for (const t of props.message.toolUses) {
    if (t.integration) seen.add(t.integration);
  }
  return [...seen].map((k) => INTEGRATION_LABELS[k] || k);
});

const errorCount = computed(() => {
  if (!props.message.toolUses) return 0;
  return props.message.toolUses.filter((t) => t.status === 'error').length;
});

const totalExecutionTime = computed(() => {
  if (!props.message.toolUses) return null;
  let total = 0;
  let hasAny = false;
  for (const t of props.message.toolUses) {
    if (t.executionTimeMs) {
      total += t.executionTimeMs;
      hasAny = true;
    }
  }
  if (!hasAny) return null;
  return total >= 1000 ? `${(total / 1000).toFixed(1)}s` : `${total}ms`;
});

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

function renderMarkdown(content: string): string {
  return md.render(content);
}

function formatTimestamp(timestamp: Date | string): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
</script>
