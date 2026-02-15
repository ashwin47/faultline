<template>
  <div class="border border-gray-300 dark:border-gray-700 p-5">
    <div class="mb-4">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-xs font-semibold uppercase tracking-wide">{{ title }}</h3>
          <p class="text-xs text-black/50 dark:text-white/50 mt-1">{{ description }}</p>
        </div>
        <div
          v-if="connected !== undefined"
          :class="['w-2 h-2 shrink-0', connected ? 'bg-black dark:bg-white' : 'bg-black/20 dark:bg-white/20']"
        />
      </div>
    </div>
    <div class="space-y-3">
      <slot />
    </div>
    <div class="flex items-center justify-between mt-4 pt-3 border-t border-gray-200 dark:border-gray-800">
      <p v-if="status" class="text-xs" :class="statusError ? 'text-red-600 dark:text-red-400' : 'text-black/50 dark:text-white/50'">
        {{ status }}
      </p>
      <span v-else />
      <button
        type="button"
        @click="$emit('save')"
        :disabled="saving"
        class="px-4 py-1.5 bg-black dark:bg-white text-white dark:text-black text-xs hover:bg-black/90 dark:hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {{ saving ? 'Saving...' : 'Save' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  description: string;
  connected?: boolean;
  saving?: boolean;
  status?: string;
  statusError?: boolean;
}>();

defineEmits<{
  save: [];
}>();
</script>
