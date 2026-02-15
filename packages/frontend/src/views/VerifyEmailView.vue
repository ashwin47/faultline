<template>
  <div class="min-h-screen flex items-center justify-center bg-white dark:bg-black px-4">
    <div class="w-full max-w-sm text-center">
      <div class="flex items-center gap-3 mb-8 justify-center">
        <img src="/logo.svg" alt="Faultline" class="w-10 h-10" />
        <h1 class="text-xl font-semibold">Faultline</h1>
      </div>

      <div v-if="loading" class="text-sm text-black/50 dark:text-white/50">
        Verifying your email...
      </div>

      <div v-else-if="success" class="space-y-4">
        <p class="text-sm">Email verified successfully!</p>
        <RouterLink
          to="/login"
          class="inline-block px-4 py-2 text-sm font-medium bg-black dark:bg-white text-white dark:text-black rounded-sm hover:opacity-90 transition-opacity"
        >
          Go to Login
        </RouterLink>
      </div>

      <div v-else class="space-y-4">
        <p class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>
        <RouterLink to="/login" class="text-xs underline">Back to Login</RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import axios from 'axios';

const route = useRoute();
const loading = ref(true);
const success = ref(false);
const error = ref('');

onMounted(async () => {
  const token = route.query.token as string;
  if (!token) {
    error.value = 'Missing verification token';
    loading.value = false;
    return;
  }

  try {
    await axios.get(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
    success.value = true;
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Verification failed';
  } finally {
    loading.value = false;
  }
});
</script>
