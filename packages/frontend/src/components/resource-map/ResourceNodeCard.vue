<template>
  <div
    class="group border border-gray-300 dark:border-gray-700 bg-white dark:bg-black px-3 py-2.5 min-w-[180px] max-w-[240px] shadow-sm hover:border-black dark:hover:border-white transition-colors"
  >
    <div class="flex items-start gap-2">
      <!-- Platform icon -->
      <div class="shrink-0 mt-0.5">
        <component :is="typeIcon" class="w-4 h-4 text-black/60 dark:text-white/60" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-xs font-medium truncate">{{ data.name }}</p>
        <div class="flex items-center gap-1.5 mt-0.5">
          <span class="text-[10px] text-black/40 dark:text-white/40 uppercase tracking-wide">{{ data.type }}</span>
          <!-- Integration badge -->
          <Icon
            v-if="sourceIconName"
            :icon="sourceIconName"
            class="w-3 h-3 text-black/30 dark:text-white/30"
          />
        </div>
        <!-- Status -->
        <div v-if="statusText" class="flex items-center gap-1 mt-1">
          <span
            class="w-1.5 h-1.5 rounded-full"
            :class="statusColor"
          />
          <span class="text-[10px] text-black/40 dark:text-white/40">{{ statusText }}</span>
        </div>
      </div>

      <!-- Actions (visible on hover) -->
      <div class="shrink-0 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          @click.stop="$emit('edit', data)"
          class="p-0.5 text-black/30 dark:text-white/30 hover:text-black dark:hover:text-white"
          title="Edit"
        >
          <PencilSquareIcon class="w-3.5 h-3.5" />
        </button>
        <button
          @click.stop="$emit('delete', data.id)"
          class="p-0.5 text-black/30 dark:text-white/30 hover:text-red-500 dark:hover:text-red-400"
          title="Delete"
        >
          <TrashIcon class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Connection handles -->
    <Handle type="target" :position="Position.Left" class="!w-2 !h-2 !bg-gray-400 dark:!bg-gray-600 !border-0" />
    <Handle type="source" :position="Position.Right" class="!w-2 !h-2 !bg-gray-400 dark:!bg-gray-600 !border-0" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import { Icon } from '@iconify/vue';
import {
  ServerIcon,
  CircleStackIcon,
  BoltIcon,
  CloudIcon,
  CpuChipIcon,
  DocumentTextIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline';
import type { ResourceNode } from '../../types';

const props = defineProps<{
  data: ResourceNode;
}>();

defineEmits<{
  (e: 'edit', node: ResourceNode): void;
  (e: 'delete', nodeId: string): void;
}>();

const typeIcon = computed(() => {
  switch (props.data.type) {
    case 'ec2': return ServerIcon;
    case 'rds': return CircleStackIcon;
    case 'lambda': return BoltIcon;
    case 'newrelic_app': return CpuChipIcon;
    case 'pagerduty_service': return DocumentTextIcon;
    case 'sentry_project': return CloudIcon;
    default: return CloudIcon;
  }
});

const sourceIconName = computed(() => {
  switch (props.data.source) {
    case 'aws': return 'simple-icons:amazonaws';
    case 'newrelic': return 'simple-icons:newrelic';
    case 'pagerduty': return 'simple-icons:pagerduty';
    case 'sentry': return 'simple-icons:sentry';
    default: return null;
  }
});

const statusText = computed(() => {
  return props.data.attrs.state || props.data.attrs.status || null;
});

const statusColor = computed(() => {
  const s = statusText.value?.toLowerCase();
  if (!s) return 'bg-gray-400';
  if (['running', 'active', 'reporting', 'available', 'ok'].includes(s)) return 'bg-green-500';
  if (['stopped', 'inactive', 'disabled'].includes(s)) return 'bg-gray-400';
  if (['error', 'critical', 'failing', 'failed'].includes(s)) return 'bg-red-500';
  if (['warning', 'degraded', 'pending'].includes(s)) return 'bg-yellow-500';
  return 'bg-gray-400';
});
</script>
