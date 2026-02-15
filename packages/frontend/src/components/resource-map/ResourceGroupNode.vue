<template>
  <div
    class="rounded-lg border border-dashed"
    :class="[
      'border-black/20 dark:border-white/20',
      'bg-black/[0.04] dark:bg-white/[0.06]',
    ]"
    :style="{ width: `${data.width}px`, height: `${data.height}px` }"
  >
    <div class="flex items-center gap-1.5 px-3 py-1.5">
      <input
        v-if="data.editing"
        ref="nameInput"
        v-model="editValue"
        class="text-[11px] font-medium tracking-wide uppercase bg-transparent border-b border-black/30 dark:border-white/30 focus:outline-none text-black/60 dark:text-white/50 w-full max-w-[200px]"
        @blur="save"
        @keydown.enter="save"
        @keydown.escape="cancel"
        @mousedown.stop
        @pointerdown.stop
      />
      <span
        v-else
        class="text-[11px] font-medium tracking-wide uppercase text-black/50 dark:text-white/40 cursor-text hover:text-black/70 dark:hover:text-white/60 transition-colors select-none"
      >
        {{ data.name }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';

const props = defineProps<{
  data: {
    groupId: string;
    name: string;
    width: number;
    height: number;
    editing: boolean;
    onRename: (name: string) => void;
    onCancelEdit: () => void;
  };
}>();

const editValue = ref('');
const nameInput = ref<HTMLInputElement | null>(null);

watch(() => props.data.editing, (val) => {
  if (val) {
    editValue.value = props.data.name;
    nextTick(() => nameInput.value?.focus());
  }
});

function save() {
  const trimmed = editValue.value.trim();
  if (trimmed && trimmed !== props.data.name) {
    props.data.onRename(trimmed);
  } else {
    props.data.onCancelEdit();
  }
}

function cancel() {
  props.data.onCancelEdit();
}
</script>
