<template>
  <div class="min-h-screen flex items-center justify-center bg-white dark:bg-black px-4">
    <div class="w-full max-w-sm">
      <div class="flex items-center gap-3 mb-8 justify-center">
        <img src="/logo.svg" alt="Faultline" class="w-10 h-10" />
        <div>
          <h1 class="text-xl font-semibold">Faultline</h1>
          <p class="text-xs text-black/50 dark:text-white/50">Create your account</p>
        </div>
      </div>

      <div v-if="success" class="text-sm text-center">
        <p class="mb-4">{{ successMessage }}</p>
        <RouterLink to="/login" class="underline">Go to Login</RouterLink>
      </div>

      <form v-else @submit.prevent="handleSignup" class="space-y-4">
        <div>
          <label class="block text-xs font-medium mb-1">Name</label>
          <input
            v-model="name"
            type="text"
            required
            autocomplete="name"
            class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-sm bg-white dark:bg-black focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white"
          />
        </div>

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
            minlength="8"
            autocomplete="new-password"
            class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-sm bg-white dark:bg-black focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white"
          />
        </div>

        <div>
          <label class="block text-xs font-medium mb-1">Confirm Password</label>
          <input
            v-model="confirmPassword"
            type="password"
            required
            autocomplete="new-password"
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
          {{ loading ? 'Creating account...' : 'Create Account' }}
        </button>
      </form>

      <div v-if="!success" class="mt-6 text-center">
        <p class="text-xs text-black/50 dark:text-white/50">
          Already have an account?
          <RouterLink to="/login" class="underline text-black dark:text-white">Sign in</RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const authStore = useAuthStore();

const name = ref('');
const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const loading = ref(false);
const error = ref('');
const success = ref(false);
const successMessage = ref('');

async function handleSignup() {
  error.value = '';

  if (password.value !== confirmPassword.value) {
    error.value = 'Passwords do not match';
    return;
  }

  if (password.value.length < 8) {
    error.value = 'Password must be at least 8 characters';
    return;
  }

  loading.value = true;
  try {
    const result = await authStore.signup(email.value, password.value, name.value);
    if (result.autoConfirmed) {
      router.push('/login');
    } else {
      success.value = true;
      successMessage.value = result.message;
    }
  } catch (err: any) {
    error.value = err.response?.data?.error || err.message || 'Signup failed';
  } finally {
    loading.value = false;
  }
}
</script>
