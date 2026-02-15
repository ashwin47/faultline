<template>
  <div class="flex items-start justify-center h-full py-8 px-8">
    <div class="max-w-3xl w-full">
      <!-- Getting Started (only show if no conversations yet) -->
      <div v-if="recentThreads.length === 0" class="p-5 border border-gray-300 dark:border-gray-700 mb-8">
        <h3 class="font-semibold mb-3 text-xs uppercase tracking-wide">Getting Started</h3>
        <ol class="text-xs space-y-2 list-decimal list-inside text-black/60 dark:text-white/60">
          <li>Configure your integrations in Settings (OpenAI API key required)</li>
          <li>The agent will automatically discover ALL applications (New Relic) and projects (Sentry)</li>
          <li>Come back to Chat and ask a question about your entire infrastructure</li>
          <li>Get actionable insights and recommendations across all your services</li>
        </ol>
      </div>

      <!-- Example Queries -->
      <div class="mb-8">
        <h2 class="text-xs font-semibold mb-4 uppercase tracking-wide text-black/50 dark:text-white/50">
          Example Queries
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            v-for="example in examples"
            :key="example.query"
            @click="$emit('use-example', example.query)"
            class="group p-4 border border-gray-300 dark:border-gray-700 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors text-left"
          >
            <div class="flex items-start space-x-3">
              <Icon :icon="example.icon" class="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div class="min-w-0">
                <h3 class="font-semibold mb-1 text-xs">
                  {{ example.title }}
                </h3>
                <p class="text-xs text-black/60 dark:text-white/60 group-hover:text-white/80 dark:group-hover:text-black/80 mb-2">
                  {{ example.description }}
                </p>
                <p class="text-xs text-black/50 dark:text-white/50 group-hover:text-white/70 dark:group-hover:text-black/70">
                  "{{ example.query }}"
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>

      <!-- Recent Threads (last 3) -->
      <div v-if="recentThreads.length > 0" class="mb-8">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
            Recent Threads
          </h2>
          <RouterLink
            v-if="conversations.length > 3"
            to="/threads"
            class="text-xs text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors"
          >
            View all ({{ conversations.length }})
          </RouterLink>
        </div>
        <div class="space-y-1">
          <RouterLink
            v-for="conv in recentThreads"
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
            <svg class="w-4 h-4 text-black/20 dark:text-white/20 group-hover:text-black dark:group-hover:text-white transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </RouterLink>
        </div>
      </div>

      <!-- Integrations -->
      <div class="grid grid-cols-5 gap-6">
        <div
          v-for="feature in features"
          :key="feature.name"
          class="text-center"
        >
          <div class="w-10 h-10 border border-gray-300 dark:border-gray-700 flex items-center justify-center mx-auto mb-2">
            <Icon :icon="feature.icon" class="w-5 h-5" />
          </div>
          <h3 class="font-semibold text-xs mb-1">{{ feature.name }}</h3>
          <p class="text-xs text-black/50 dark:text-white/50">{{ feature.description }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { Icon } from '@iconify/vue';
import { useAgentStore } from '../stores/agent';
import { storeToRefs } from 'pinia';

const agentStore = useAgentStore();
const { conversations } = storeToRefs(agentStore);

const recentThreads = computed(() => conversations.value.slice(0, 3));

defineEmits<{
  'use-example': [query: string];
}>();

function formatDate(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

onMounted(() => {
  agentStore.fetchConversations();
});

const examples = [
  {
    title: 'Active Incidents',
    description: 'Check for active incidents and investigate root cause',
    query: "Are there any active incidents right now? Investigate what's causing them.",
    icon: 'simple-icons:pagerduty',
  },
  {
    title: 'Error Investigation',
    description: 'Find top errors, get stack traces, and check the code',
    query: "What are the top errors across all services in the last 24 hours? Get the stack traces and check the code.",
    icon: 'simple-icons:sentry',
  },
  {
    title: 'Performance Analysis',
    description: 'Find slow endpoints and high error rates',
    query: "Which services have the highest error rates and slowest response times?",
    icon: 'simple-icons:newrelic',
  },
  {
    title: 'Infrastructure Health',
    description: 'Check CloudWatch alarms and their impact on apps',
    query: "Are there any CloudWatch alarms firing? Check if they're affecting application performance.",
    icon: 'simple-icons:amazonwebservices',
  },
];

const features = [
  {
    name: 'New Relic',
    description: 'APM metrics & traces',
    icon: 'simple-icons:newrelic',
  },
  {
    name: 'Sentry',
    description: 'Error tracking',
    icon: 'simple-icons:sentry',
  },
  {
    name: 'AWS',
    description: 'Infrastructure monitoring',
    icon: 'simple-icons:amazonwebservices',
  },
  {
    name: 'GitHub',
    description: 'Code analysis',
    icon: 'simple-icons:github',
  },
  {
    name: 'PagerDuty',
    description: 'Incident management',
    icon: 'simple-icons:pagerduty',
  },
];
</script>
