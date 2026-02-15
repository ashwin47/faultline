<template>
  <div class="min-h-screen flex items-center justify-center bg-white dark:bg-black">
    <div class="w-full max-w-sm p-6">
      <h1 class="text-lg font-semibold mb-4">Accept Invitation</h1>

      <div v-if="loading" class="text-sm text-black/50 dark:text-white/50">
        Processing invite...
      </div>

      <div v-else-if="success" class="space-y-4">
        <p class="text-sm">You've been added to <strong>{{ accountName }}</strong>.</p>
        <button
          @click="switchAndGo"
          class="w-full py-2 bg-black dark:bg-white text-white dark:text-black text-sm hover:bg-black/90 dark:hover:bg-white/90"
        >
          Switch to {{ accountName }}
        </button>
        <button
          @click="$router.push('/chat')"
          class="w-full py-2 border border-gray-300 dark:border-gray-700 text-sm hover:bg-black/5 dark:hover:bg-white/5"
        >
          Stay in current workspace
        </button>
      </div>

      <div v-else-if="error" class="space-y-4">
        <p class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>
        <button
          @click="$router.push('/chat')"
          class="w-full py-2 border border-gray-300 dark:border-gray-700 text-sm hover:bg-black/5 dark:hover:bg-white/5"
        >
          Go to dashboard
        </button>
      </div>

      <div v-else-if="!isAuthenticated" class="space-y-4">
        <p class="text-sm text-black/70 dark:text-white/70">
          You need to sign up or log in first to accept this invitation. The invite link will be saved so you can accept it after logging in.
        </p>
        <button
          @click="$router.push('/login')"
          class="w-full py-2 bg-black dark:bg-white text-white dark:text-black text-sm hover:bg-black/90 dark:hover:bg-white/90"
        >
          Log In
        </button>
        <button
          @click="$router.push('/signup')"
          class="w-full py-2 border border-gray-300 dark:border-gray-700 text-sm hover:bg-black/5 dark:hover:bg-white/5"
        >
          Sign Up
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useWorkspaceStore } from '../stores/workspace';

const route = useRoute();
const authStore = useAuthStore();
const workspaceStore = useWorkspaceStore();

const loading = ref(false);
const success = ref(false);
const error = ref('');
const accountId = ref('');
const accountName = ref('');

const isAuthenticated = computed(() => authStore.isAuthenticated);

onMounted(async () => {
  const token = route.query.token as string;
  if (!token) {
    error.value = 'No invite token provided';
    return;
  }

  if (!isAuthenticated.value) {
    // Store token for after login
    localStorage.setItem('faultline:pendingInviteToken', token);
    return;
  }

  await acceptToken(token);
});

async function acceptToken(token: string) {
  loading.value = true;
  try {
    const result = await workspaceStore.acceptInvite(token);
    accountId.value = result.accountId;
    accountName.value = result.accountName;
    success.value = true;
    localStorage.removeItem('faultline:pendingInviteToken');
    // Refresh accounts list
    await authStore.fetchCurrentUser();
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to accept invite';
  } finally {
    loading.value = false;
  }
}

async function switchAndGo() {
  await authStore.switchAccount(accountId.value);
  window.location.href = '/chat';
}
</script>
