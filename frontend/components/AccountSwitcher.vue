<template>
  <div class="relative" ref="dropdownRef">
    <button
      @click="open = !open"
      class="flex items-center gap-2 w-full px-2 py-2 text-xs rounded-sm hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left"
      :class="collapsed && 'justify-center'"
    >
      <div
        class="w-5 h-5 rounded-sm bg-black/10 dark:bg-white/10 flex items-center justify-center text-[10px] font-semibold shrink-0"
      >
        {{ initial }}
      </div>
      <span v-if="!collapsed" class="truncate flex-1">{{ authStore.currentAccount?.name || 'Workspace' }}</span>
      <ChevronUpDownIcon v-if="!collapsed" class="w-3 h-3 shrink-0 text-black/40 dark:text-white/40" />
    </button>

    <!-- Dropdown -->
    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="opacity-0 translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-75 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-1"
    >
      <div
        v-if="open"
        class="absolute bottom-full left-0 mb-1 w-60 bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-md shadow-xl z-50 overflow-hidden"
      >
        <!-- Workspaces -->
        <div class="p-1.5">
          <div class="px-2 py-1.5 text-[10px] text-black/40 dark:text-white/40 uppercase tracking-wider font-medium">
            Workspaces
          </div>
          <button
            v-for="account in authStore.accounts"
            :key="account.id"
            @click="switchTo(account.id)"
            class="flex items-center gap-2.5 w-full px-2 py-1.5 text-xs rounded-sm transition-colors text-left"
            :class="account.id === authStore.currentAccount?.id
              ? 'bg-black/5 dark:bg-white/5'
              : 'hover:bg-black/5 dark:hover:bg-white/5'"
          >
            <div
              class="w-5 h-5 rounded-sm flex items-center justify-center text-[10px] font-semibold shrink-0"
              :class="account.id === authStore.currentAccount?.id
                ? 'bg-black dark:bg-white text-white dark:text-black'
                : 'bg-black/10 dark:bg-white/10'"
            >
              {{ account.name.charAt(0).toUpperCase() }}
            </div>
            <span class="truncate flex-1">{{ account.name }}</span>
            <CheckIcon
              v-if="account.id === authStore.currentAccount?.id"
              class="w-3.5 h-3.5 shrink-0 text-black/50 dark:text-white/50"
            />
          </button>
        </div>

        <!-- Pending invites -->
        <template v-if="authStore.pendingInvites.length > 0">
          <div class="border-t border-gray-200 dark:border-gray-800" />
          <div class="p-1.5">
            <div class="px-2 py-1.5 text-[10px] text-black/40 dark:text-white/40 uppercase tracking-wider font-medium">
              Invitations
            </div>
            <div
              v-for="invite in authStore.pendingInvites"
              :key="invite.id"
              class="flex items-center gap-2.5 w-full px-2 py-1.5 text-xs rounded-sm"
            >
              <div class="w-5 h-5 rounded-sm border border-dashed border-black/20 dark:border-white/20 flex items-center justify-center text-[10px] text-black/40 dark:text-white/40 shrink-0">
                {{ invite.accountName.charAt(0).toUpperCase() }}
              </div>
              <span class="truncate flex-1 text-black/60 dark:text-white/60">{{ invite.accountName }}</span>
              <button
                @click="acceptInvite(invite.token)"
                :disabled="accepting === invite.id"
                class="px-2.5 py-0.5 text-[10px] font-medium rounded-sm bg-black dark:bg-white text-white dark:text-black hover:bg-black/80 dark:hover:bg-white/80 disabled:opacity-50 shrink-0 transition-colors"
              >
                {{ accepting === invite.id ? '...' : 'Join' }}
              </button>
            </div>
          </div>
        </template>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import axios from 'axios';
import { ChevronUpDownIcon, CheckIcon } from '@heroicons/vue/16/solid';
import { useAuthStore } from '../stores/auth';

defineProps<{ collapsed: boolean }>();

const authStore = useAuthStore();
const open = ref(false);
const accepting = ref<string | null>(null);
const dropdownRef = ref<HTMLElement | null>(null);

const initial = computed(() =>
  (authStore.currentAccount?.name || 'W').charAt(0).toUpperCase()
);

async function switchTo(accountId: string) {
  open.value = false;
  if (accountId === authStore.currentAccount?.id) return;

  await authStore.switchAccount(accountId);
  window.location.reload();
}

async function acceptInvite(token: string) {
  const invite = authStore.pendingInvites.find((i) => i.token === token);
  if (!invite) return;

  accepting.value = invite.id;
  try {
    await axios.post('/api/invites/accept', { token });
    await authStore.fetchCurrentUser();
    await authStore.switchAccount(invite.accountId);
    window.location.reload();
  } catch (err: any) {
    alert(err.response?.data?.error || 'Failed to accept invite');
  } finally {
    accepting.value = null;
  }
}

function handleClickOutside(e: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    open.value = false;
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside));
onUnmounted(() => document.removeEventListener('click', handleClickOutside));
</script>
