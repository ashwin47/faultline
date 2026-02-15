<template>
  <div class="border-l-2 pl-3 py-1.5 text-xs" :class="borderClass">
    <!-- Header row: status + icon + name + time -->
    <div class="flex items-center gap-2">
      <!-- Status dot -->
      <div class="w-1.5 h-1.5 shrink-0 rounded-full" :class="dotClass" />

      <!-- Integration icon -->
      <Icon
        v-if="integrationIcon"
        :icon="integrationIcon"
        class="w-3.5 h-3.5 shrink-0 text-black/50 dark:text-white/50"
      />

      <!-- Tool name -->
      <span class="font-medium text-black dark:text-white">{{ displayName }}</span>

      <!-- Integration badge -->
      <span
        v-if="integrationLabel"
        class="px-1.5 py-0.5 text-[10px] uppercase tracking-wider border border-gray-300 dark:border-gray-700 text-black/50 dark:text-white/50"
      >
        {{ integrationLabel }}
      </span>

      <!-- Execution time -->
      <span v-if="toolUse.executionTimeMs" class="text-black/40 dark:text-white/40 ml-auto tabular-nums">
        {{ toolUse.executionTimeMs }}ms
      </span>
      <span v-else-if="toolUse.status === 'running'" class="text-black/40 dark:text-white/40 ml-auto">
        <span class="inline-flex gap-0.5">
          <span class="w-1 h-1 bg-black/40 dark:bg-white/40 rounded-full animate-pulse" />
          <span class="w-1 h-1 bg-black/40 dark:bg-white/40 rounded-full animate-pulse" style="animation-delay:150ms" />
          <span class="w-1 h-1 bg-black/40 dark:bg-white/40 rounded-full animate-pulse" style="animation-delay:300ms" />
        </span>
      </span>
    </div>

    <!-- Error -->
    <div v-if="toolUse.error" class="mt-1 text-red-600 dark:text-red-400">
      {{ toolUse.error }}
    </div>

    <!-- Input parameters -->
    <details v-if="hasInput" class="mt-1 group">
      <summary class="cursor-pointer text-black/40 dark:text-white/40 hover:text-black/60 dark:hover:text-white/60 select-none">
        Input
      </summary>
      <SensitiveText>
        <pre class="mt-1 p-2 bg-black/[0.03] dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 overflow-x-auto text-[11px] leading-relaxed max-h-48 text-black/70 dark:text-white/70">{{ formattedInput }}</pre>
      </SensitiveText>
    </details>

    <!-- Output -->
    <details v-if="toolUse.status === 'success' && toolUse.output" class="mt-1 group">
      <summary class="cursor-pointer text-black/40 dark:text-white/40 hover:text-black/60 dark:hover:text-white/60 select-none">
        Output
      </summary>
      <SensitiveText>
        <pre class="mt-1 p-2 bg-black/[0.03] dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 overflow-x-auto text-[11px] leading-relaxed max-h-64 text-black/70 dark:text-white/70">{{ formattedOutput }}</pre>
      </SensitiveText>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import SensitiveText from './SensitiveText.vue';
import type { ToolUse } from '../types';

const props = defineProps<{
  toolUse: ToolUse;
}>();

const borderClass = computed(() => {
  switch (props.toolUse.status) {
    case 'running': return 'border-black/20 dark:border-white/20';
    case 'success': return 'border-black dark:border-white';
    case 'error': return 'border-red-500';
    default: return 'border-gray-300 dark:border-gray-700';
  }
});

const dotClass = computed(() => {
  switch (props.toolUse.status) {
    case 'running': return 'bg-black/30 dark:bg-white/30 animate-pulse';
    case 'success': return 'bg-black dark:bg-white';
    case 'error': return 'bg-red-500';
    default: return 'bg-gray-400';
  }
});

/** Map backend integration names to display labels and icons */
const INTEGRATION_META: Record<string, { label: string; icon: string }> = {
  newrelic:   { label: 'New Relic',  icon: 'simple-icons:newrelic' },
  sentry:     { label: 'Sentry',     icon: 'simple-icons:sentry' },
  aws:        { label: 'AWS',        icon: 'simple-icons:amazonwebservices' },
  github:     { label: 'GitHub',     icon: 'simple-icons:github' },
  pagerduty:  { label: 'PagerDuty',  icon: 'simple-icons:pagerduty' },
};

const integrationLabel = computed(() => {
  const key = props.toolUse.integration;
  return key ? INTEGRATION_META[key]?.label ?? key : null;
});

const integrationIcon = computed(() => {
  const key = props.toolUse.integration;
  return key ? INTEGRATION_META[key]?.icon ?? null : null;
});

/** Format tool_name_like_this into Tool Name Like This */
const displayName = computed(() => {
  return props.toolUse.name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
});

const hasInput = computed(() => {
  return props.toolUse.input && Object.keys(props.toolUse.input).length > 0;
});

const formattedInput = computed(() => {
  return JSON.stringify(props.toolUse.input, null, 2);
});

const formattedOutput = computed(() => {
  const output = props.toolUse.output;
  if (typeof output === 'string') {
    try {
      return JSON.stringify(JSON.parse(output), null, 2);
    } catch {
      return output.length > 2000 ? output.substring(0, 2000) + '\n...' : output;
    }
  }
  const str = JSON.stringify(output, null, 2);
  return str.length > 2000 ? str.substring(0, 2000) + '\n...' : str;
});
</script>
