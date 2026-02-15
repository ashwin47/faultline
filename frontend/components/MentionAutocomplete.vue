<template>
  <transition
    enter-active-class="transition duration-100 ease-out"
    leave-active-class="transition duration-75 ease-in"
    enter-from-class="opacity-0 translate-y-1"
    enter-to-class="opacity-100 translate-y-0"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 translate-y-1"
  >
    <div
      v-if="visible && filtered.length > 0"
      ref="dropdown"
      class="absolute bottom-full left-0 mb-1 w-56 bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-md shadow-xl z-50 overflow-hidden py-1"
    >
      <div class="px-2 py-1 text-[10px] text-black/40 dark:text-white/40 uppercase tracking-wider font-medium">
        Team members
      </div>
      <button
        v-for="(member, i) in filtered"
        :key="member.userId"
        @click="select(member)"
        @mouseenter="highlightIndex = i"
        :class="[
          'flex items-center gap-2.5 w-full px-2 py-1.5 text-xs text-left transition-colors',
          i === highlightIndex
            ? 'bg-black/5 dark:bg-white/5'
            : 'hover:bg-black/5 dark:hover:bg-white/5',
        ]"
      >
        <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-black/10 dark:bg-white/10 text-[10px] font-medium shrink-0">
          {{ initials(member.name) }}
        </span>
        <span class="truncate">{{ member.name }}</span>
        <span class="text-black/30 dark:text-white/30 ml-auto truncate text-[11px]">{{ member.email }}</span>
      </button>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useWorkspaceStore, type WorkspaceMember } from '../stores/workspace';

const props = defineProps<{
  visible: boolean;
  query: string;
}>();

const emit = defineEmits<{
  select: [member: { userId: string; name: string }];
  dismiss: [];
}>();

const workspaceStore = useWorkspaceStore();
const dropdown = ref<HTMLElement | null>(null);
const highlightIndex = ref(0);

const filtered = computed(() => {
  const q = props.query.toLowerCase();
  return workspaceStore.members.filter(
    (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
  ).slice(0, 6);
});

watch(() => props.query, () => {
  highlightIndex.value = 0;
});

onMounted(() => {
  if (workspaceStore.members.length === 0) {
    workspaceStore.fetchMembers();
  }
  document.addEventListener('click', handleClickOutside);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside);
});

function handleClickOutside(e: MouseEvent) {
  if (props.visible && dropdown.value && !dropdown.value.contains(e.target as Node)) {
    emit('dismiss');
  }
}

function select(member: WorkspaceMember) {
  emit('select', { userId: member.userId, name: member.name });
}

function moveHighlight(delta: number) {
  const len = filtered.value.length;
  if (len === 0) return;
  highlightIndex.value = (highlightIndex.value + delta + len) % len;
}

function selectHighlighted() {
  const member = filtered.value[highlightIndex.value];
  if (member) select(member);
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

defineExpose({ moveHighlight, selectHighlighted });
</script>
