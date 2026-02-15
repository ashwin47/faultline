<template>
  <teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center"
    >
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/30" @click="close" />

      <!-- Modal -->
      <div class="relative bg-white dark:bg-black border border-gray-300 dark:border-gray-700 w-full max-w-md mx-4 shadow-xl">
        <div class="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h2 class="text-sm font-semibold">{{ isEditing ? 'Edit Resource' : 'Add Resource' }}</h2>
          <button @click="close" class="text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white">
            <XMarkIcon class="w-4 h-4" />
          </button>
        </div>

        <form @submit.prevent="handleSubmit" class="px-5 py-4 space-y-4">
          <!-- Name -->
          <div>
            <label class="block text-[11px] text-black/50 dark:text-white/50 uppercase tracking-wide mb-1">Name *</label>
            <input
              v-model="form.name"
              type="text"
              required
              class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 bg-transparent focus:outline-none focus:border-black dark:focus:border-white"
              placeholder="e.g. payment-api"
            />
          </div>

          <!-- Type -->
          <div>
            <label class="block text-[11px] text-black/50 dark:text-white/50 uppercase tracking-wide mb-1">Type *</label>
            <select
              v-model="form.type"
              required
              class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 bg-transparent focus:outline-none focus:border-black dark:focus:border-white"
            >
              <option value="" disabled>Select type...</option>
              <option v-for="t in resourceTypes" :key="t.value" :value="t.value">{{ t.label }}</option>
            </select>
          </div>

          <!-- Source (auto-set, read-only) -->
          <div>
            <label class="block text-[11px] text-black/50 dark:text-white/50 uppercase tracking-wide mb-1">Source</label>
            <input
              :value="computedSource"
              type="text"
              readonly
              class="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/30 text-black/60 dark:text-white/60 cursor-not-allowed"
            />
          </div>

          <!-- External ID -->
          <div>
            <label class="block text-[11px] text-black/50 dark:text-white/50 uppercase tracking-wide mb-1">External ID</label>
            <input
              v-model="form.externalId"
              type="text"
              class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 bg-transparent focus:outline-none focus:border-black dark:focus:border-white"
              placeholder="e.g. i-0abc123, GUID, slug"
            />
          </div>

          <!-- Attributes (key-value pairs) -->
          <div>
            <label class="block text-[11px] text-black/50 dark:text-white/50 uppercase tracking-wide mb-1">Attributes</label>
            <div class="space-y-2">
              <div v-for="(attr, index) in form.attrs" :key="index" class="flex gap-2">
                <input
                  v-model="attr.key"
                  type="text"
                  placeholder="key"
                  class="flex-1 px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-700 bg-transparent focus:outline-none focus:border-black dark:focus:border-white"
                />
                <input
                  v-model="attr.value"
                  type="text"
                  placeholder="value"
                  class="flex-1 px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-700 bg-transparent focus:outline-none focus:border-black dark:focus:border-white"
                />
                <button
                  type="button"
                  @click="removeAttr(index)"
                  class="px-1.5 text-black/30 dark:text-white/30 hover:text-red-500 dark:hover:text-red-400"
                >
                  <XMarkIcon class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <button
              type="button"
              @click="addAttr"
              class="mt-2 text-[11px] text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white"
            >
              + Add attribute
            </button>
          </div>

          <!-- Actions -->
          <div class="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              @click="close"
              class="px-4 py-2 text-xs border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="px-4 py-2 text-xs bg-black dark:bg-white text-white dark:text-black hover:opacity-90 transition-opacity"
            >
              {{ isEditing ? 'Save' : 'Add' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { XMarkIcon } from '@heroicons/vue/24/outline';
import type { ResourceNode } from '../../types';

const props = defineProps<{
  visible: boolean;
  node?: ResourceNode | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', data: { name: string; type: string; source: string; externalId: string; attrs: Record<string, string> }): void;
}>();

const isEditing = computed(() => !!props.node);

const resourceTypes = [
  { value: 'ec2', label: 'EC2 Instance' },
  { value: 'rds', label: 'RDS Database' },
  { value: 'lambda', label: 'Lambda Function' },
  { value: 'newrelic_app', label: 'New Relic Application' },
  { value: 'pagerduty_service', label: 'PagerDuty Service' },
  { value: 'sentry_project', label: 'Sentry Project' },
];

const typeToSource: Record<string, string> = {
  ec2: 'aws',
  rds: 'aws',
  lambda: 'aws',
  newrelic_app: 'newrelic',
  pagerduty_service: 'pagerduty',
  sentry_project: 'sentry',
};

const form = ref({
  name: '',
  type: '',
  externalId: '',
  attrs: [] as { key: string; value: string }[],
});

const computedSource = computed(() => typeToSource[form.value.type] || '');

// Reset form when modal opens
watch(() => props.visible, (visible) => {
  if (visible) {
    if (props.node) {
      form.value = {
        name: props.node.name,
        type: props.node.type,
        externalId: props.node.externalId || '',
        attrs: Object.entries(props.node.attrs).map(([key, value]) => ({ key, value })),
      };
    } else {
      form.value = { name: '', type: '', externalId: '', attrs: [] };
    }
  }
});

function addAttr() {
  form.value.attrs.push({ key: '', value: '' });
}

function removeAttr(index: number) {
  form.value.attrs.splice(index, 1);
}

function close() {
  emit('close');
}

function handleSubmit() {
  const attrs: Record<string, string> = {};
  for (const { key, value } of form.value.attrs) {
    if (key.trim()) {
      attrs[key.trim()] = value;
    }
  }

  emit('save', {
    name: form.value.name.trim(),
    type: form.value.type,
    source: computedSource.value,
    externalId: form.value.externalId.trim(),
    attrs,
  });

  close();
}
</script>
