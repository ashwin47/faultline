<template>
  <div class="border border-gray-300 dark:border-gray-700 p-4 mb-4">
    <!-- Header -->
    <div class="flex items-start justify-between mb-3">
      <h3 class="font-semibold text-xs">{{ title }}</h3>
      <span class="text-xs border border-gray-300 dark:border-gray-700 px-2 py-0.5 font-medium uppercase tracking-wide">
        {{ severity }}
      </span>
    </div>

    <!-- Description -->
    <p v-if="description" class="text-sm mb-3 text-black/80">
      {{ description }}
    </p>

    <!-- Metrics/Data -->
    <div v-if="data && Object.keys(data).length > 0" class="mb-3">
      <div class="border border-gray-300 dark:border-gray-700 p-3 text-sm">
        <dl class="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div v-for="(value, key) in data" :key="key" class="flex justify-between">
            <dt class="font-medium capitalize">{{ formatKey(key) }}:</dt>
            <dd>{{ formatValue(value) }}</dd>
          </div>
        </dl>
      </div>
    </div>

    <!-- Recommendations -->
    <div v-if="recommendations && recommendations.length > 0" class="mb-3">
      <h4 class="text-xs font-semibold mb-2 uppercase tracking-wide">Recommended Actions:</h4>
      <ul class="list-disc list-inside space-y-1 text-xs text-black/80">
        <li v-for="(rec, index) in recommendations" :key="index">
          {{ rec }}
        </li>
      </ul>
    </div>

    <!-- Related Links -->
    <div v-if="links && links.length > 0" class="flex flex-wrap gap-2">
      <a
        v-for="(link, index) in links"
        :key="index"
        :href="link.url"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center text-xs underline hover:no-underline"
      >
        {{ link.label }} ↗
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  severity: 'critical' | 'warning' | 'info' | 'success';
  description?: string;
  data?: Record<string, any>;
  recommendations?: string[];
  links?: Array<{ label: string; url: string }>;
}>();

function formatKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim();
}

function formatValue(value: any): string {
  if (typeof value === 'number') {
    return value.toLocaleString();
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (value instanceof Date) {
    return value.toLocaleString();
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}
</script>
