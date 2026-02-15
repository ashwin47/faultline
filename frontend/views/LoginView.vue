<template>
  <div class="min-h-screen flex items-center justify-center bg-white dark:bg-black px-4">
    <div class="w-full max-w-sm">
      <div class="flex items-center gap-3 mb-8 justify-center">
        <img src="/logo.svg" alt="Faultline" class="w-10 h-10" />
        <div>
          <h1 class="text-xl font-semibold">Faultline</h1>
          <p class="text-xs text-black/50 dark:text-white/50">Your Infra AI Agent</p>
        </div>
      </div>

      <form @submit.prevent="handleLogin" class="space-y-4">
        <div>
          <label class="block text-xs font-medium mb-1">Email</label>
          <input
            v-model="email"
            type="email"
            required
            autocomplete="email"
            class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-sm bg-white dark:bg-black focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white"
          />
        </div>

        <div>
          <label class="block text-xs font-medium mb-1">Password</label>
          <input
            v-model="password"
            type="password"
            required
            autocomplete="current-password"
            class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-sm bg-white dark:bg-black focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white"
          />
        </div>

        <div v-if="error" class="text-xs text-red-600 dark:text-red-400">
          {{ error }}
        </div>

        <button
          type="submit"
          :disabled="loading"
          class="w-full py-2 text-sm font-medium bg-black dark:bg-white text-white dark:text-black rounded-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {{ loading ? 'Signing in...' : 'Sign In' }}
        </button>
      </form>

      <div class="mt-6 text-center space-y-2">
        <p class="text-xs text-black/50 dark:text-white/50">
          Don't have an account?
          <RouterLink to="/signup" class="underline text-black dark:text-white">Sign up</RouterLink>
        </p>
        <p class="text-xs text-black/50 dark:text-white/50">
          <RouterLink to="/resend-verification" class="underline text-black dark:text-white">Resend verification email</RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const authStore = useAuthStore();

const email = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');

async function handleLogin() {
  error.value = '';
  loading.value = true;
  try {
    await authStore.login(email.value, password.value);
    const pendingToken = localStorage.getItem('faultline:pendingInviteToken');
    if (pendingToken) {
      router.push(`/accept-invite?token=${pendingToken}`);
    } else {
      router.push('/chat');
    }
  } catch (err: any) {
    error.value = err.response?.data?.error || err.message || 'Login failed';
  } finally {
    loading.value = false;
  }
}
</script>
