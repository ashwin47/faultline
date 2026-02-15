<template>
  <div
    class="group border border-gray-300 dark:border-gray-700 bg-white dark:bg-black px-3 py-2 min-w-[180px] max-w-[240px] shadow-sm hover:border-black dark:hover:border-white transition-colors !h-auto"
  >
    <div class="flex items-center gap-2">
      <!-- Platform icon -->
      <div class="shrink-0">
        <component :is="typeIcon" class="w-4 h-4 text-black/60 dark:text-white/60" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-xs font-medium truncate leading-tight">{{ data.name }}</p>
        <div class="flex items-center gap-1.5">
          <span class="text-[10px] text-black/40 dark:text-white/40 uppercase tracking-wide leading-tight">{{ typeLabel }}</span>
          <Icon
            v-if="sourceIconName"
            :icon="sourceIconName"
            class="w-3 h-3 text-black/30 dark:text-white/30"
          />
          <span v-if="statusText" class="w-1.5 h-1.5 rounded-full" :class="statusColor" />
        </div>
      </div>
      <a
        v-if="externalUrl"
        :href="externalUrl"
        target="_blank"
        rel="noopener noreferrer"
        @click.stop
        class="shrink-0 p-0.5 text-black/20 dark:text-white/20 hover:text-black dark:hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
        title="Open in source"
      >
        <ArrowTopRightOnSquareIcon class="w-3.5 h-3.5" />
      </a>
    </div>

    <Handle type="target" :position="Position.Left" class="!w-2 !h-2 !bg-gray-400 dark:!bg-gray-600 !border-0" />
    <Handle type="source" :position="Position.Right" class="!w-2 !h-2 !bg-gray-400 dark:!bg-gray-600 !border-0" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import { Icon } from '@iconify/vue';
import {
  ArrowTopRightOnSquareIcon,
  ServerIcon,
  CircleStackIcon,
  BoltIcon,
  CloudIcon,
  CpuChipIcon,
  GlobeAltIcon,
  DocumentTextIcon,
} from '@heroicons/vue/24/outline';
import type { ResourceNode } from '../../types';

const props = defineProps<{
  data: ResourceNode;
}>();


const typeIcon = computed(() => {
  switch (props.data.type) {
    case 'ec2': return ServerIcon;
    case 'rds': return CircleStackIcon;
    case 'lambda': return BoltIcon;
    case 'apm_application': return CpuChipIcon;
    case 'browser_application': return GlobeAltIcon;
    case 'service': return DocumentTextIcon;
    case 'project': return CloudIcon;
    default: return CloudIcon;
  }
});

const typeLabel = computed(() => {
  const labels: Record<string, string> = {
    'ec2': 'EC2',
    'rds': 'RDS',
    'lambda': 'Lambda',
    'apm_application': 'APM',
    'browser_application': 'Browser',
    'service': 'Service',
    'project': 'Project',
  };
  return labels[props.data.type] || props.data.type;
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

const externalUrl = computed<string | null>(() => {
  const { source, type, externalId, name, attrs } = props.data;
  if (!externalId) return null;

  switch (source) {
    case 'newrelic': {
      const base = attrs.region === 'eu'
        ? 'https://one.eu.newrelic.com'
        : 'https://one.newrelic.com';
      return `${base}/redirect/entity/${externalId}`;
    }
    case 'aws': {
      const region = attrs.region || 'us-east-1';
      switch (type) {
        case 'ec2':
          return `https://${region}.console.aws.amazon.com/ec2/home?region=${region}#InstanceDetails:instanceId=${externalId}`;
        case 'lambda':
          return `https://${region}.console.aws.amazon.com/lambda/home?region=${region}#/functions/${encodeURIComponent(name)}`;
        case 'rds':
          return `https://${region}.console.aws.amazon.com/rds/home?region=${region}#database:id=${encodeURIComponent(name)}`;
        default:
          return null;
      }
    }
    case 'pagerduty':
      return `https://app.pagerduty.com/services/${externalId}`;
    case 'sentry': {
      const org = attrs.org;
      if (!org) return null;
      return `https://sentry.io/organizations/${org}/projects/${externalId}/`;
    }
    default:
      return null;
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
