<template>
  <span
    v-if="redact"
    class="sensitive-text inline"
    :class="{ 'is-revealed': revealed }"
    @mouseenter="revealed = true"
    @mouseleave="revealed = false"
  >
    <slot />
  </span>
  <slot v-else />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const redact = route.query.redact !== undefined;
const revealed = ref(false);
</script>

<style scoped>
.sensitive-text {
  filter: blur(5px);
  transition: filter 0.2s ease;
  cursor: pointer;
  user-select: none;
}

.sensitive-text.is-revealed {
  filter: none;
  user-select: auto;
}
</style>
