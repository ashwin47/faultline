<template>
  <div>
    <label class="block text-xs font-medium mb-1.5">
      {{ label }}
      <span v-if="required">*</span>
    </label>
    <input
      :type="type"
      :value="modelValue"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      :placeholder="placeholder"
      :required="required"
      class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 focus:outline-none text-sm bg-transparent"
    />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  type: string;
  modelValue?: string;
  placeholder?: string;
  required?: boolean;
}>();

defineEmits<{
  'update:modelValue': [value: string];
}>();
</script>
