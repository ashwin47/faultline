<template>
  <div class="flex flex-col h-screen bg-white dark:bg-black">
    <!-- Header (only when there's an active thread) -->
    <div v-if="hasActiveThread" class="border-b border-gray-300 dark:border-gray-700 px-6 py-4">
      <div class="flex items-center justify-between">
        <h1 class="text-sm font-medium truncate mr-4">
          {{ conversationTitle }}
        </h1>
        <button
          @click="newConversation"
          class="shrink-0 px-4 py-2 border border-gray-300 dark:border-gray-700 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors text-sm"
        >
          New Conversation
        </button>
      </div>
    </div>

    <!-- Messages wrapper (relative for toast positioning) -->
    <div class="flex-1 relative overflow-hidden">
      <div
        ref="messagesContainer"
        @scroll="handleScroll"
        class="h-full overflow-y-auto px-6 py-4"
      >
        <WelcomeScreen
          v-if="!hasActiveThread"
          @use-example="useExample"
        />
        <MessageList v-if="messages.length > 0" :messages="messages" />

        <!-- Live agent activity (during streaming) -->
        <div v-if="isStreaming || isThinking" class="mt-4">
          <div class="max-w-3xl w-full space-y-2">

            <!-- Thinking indicator (only when nothing else is showing yet) -->
            <div v-if="isThinking && currentToolUses.length === 0 && reasoningHistory.length === 0 && activeSubAgents.length === 0" class="flex items-center gap-2 text-sm text-black/50 dark:text-white/50">
              <span class="inline-flex gap-0.5">
                <span class="w-1 h-1 bg-black/40 dark:bg-white/40 rounded-full animate-pulse" />
                <span class="w-1 h-1 bg-black/40 dark:bg-white/40 rounded-full animate-pulse" style="animation-delay:150ms" />
                <span class="w-1 h-1 bg-black/40 dark:bg-white/40 rounded-full animate-pulse" style="animation-delay:300ms" />
              </span>
              <span>Investigating...</span>
            </div>

            <!-- Flat sequential log of all activity -->
            <template v-for="item in activityLog" :key="item.key">
              <!-- Reasoning entry -->
              <div v-if="item.type === 'reasoning'" class="border-l-2 border-black/15 dark:border-white/15 pl-3 py-1.5 text-xs text-black/70 dark:text-white/70">
                <div class="flex items-center gap-2 mb-1">
                  <span class="font-medium text-black/50 dark:text-white/50">Evaluation</span>
                  <span class="tabular-nums">{{ item.data.evaluation.confidence }}%</span>
                  <span class="uppercase tracking-wider text-[10px] text-black/40 dark:text-white/40">{{ item.data.evaluation.status }}</span>
                </div>
                <p class="leading-relaxed">{{ item.data.evaluation.summary }}</p>
                <div v-if="item.data.evaluation.next_steps?.length > 0" class="mt-1 space-y-0.5">
                  <div v-for="(step, i) in item.data.evaluation.next_steps" :key="i" class="text-black/50 dark:text-white/50">
                    &rarr; {{ step }}
                  </div>
                </div>
              </div>

              <!-- Sub-agent start -->
              <div v-else-if="item.type === 'sub_agent_start'" class="flex items-center gap-2 text-xs text-black/50 dark:text-white/50 pl-3">
                <span class="w-1.5 h-1.5 bg-black/40 dark:bg-white/40 rounded-full animate-pulse" />
                <span class="font-medium">{{ agentLabel(item.data.agentId) }}</span>
                <span class="truncate">{{ item.data.task }}</span>
              </div>

              <!-- Sub-agent complete -->
              <div v-else-if="item.type === 'sub_agent_complete'" class="flex items-center gap-2 text-xs text-black/50 dark:text-white/50 pl-3">
                <span class="w-1.5 h-1.5 bg-black dark:bg-white rounded-full" />
                <span class="font-medium">{{ agentLabel(item.data.agentId) }}</span>
                <span>done</span>
              </div>

              <!-- Tool call -->
              <div v-else-if="item.type === 'tool'" class="flex items-start gap-1.5">
                <span v-if="item.data.agentId" class="shrink-0 text-[9px] uppercase tracking-wider text-black/30 dark:text-white/30 w-16 text-right mt-2">{{ agentLabel(item.data.agentId) }}</span>
                <ToolUsageIndicator :tool-use="item.data" class="flex-1" />
              </div>
            </template>

            <!-- Thinking indicator at the end so users know it's still working -->
            <div v-if="isAgentRunning && activityLog.length > 0" class="flex items-center gap-2 text-sm text-black/50 dark:text-white/50 pl-3">
              <span class="inline-flex gap-0.5">
                <span class="w-1 h-1 bg-black/40 dark:bg-white/40 rounded-full animate-pulse" />
                <span class="w-1 h-1 bg-black/40 dark:bg-white/40 rounded-full animate-pulse" style="animation-delay:150ms" />
                <span class="w-1 h-1 bg-black/40 dark:bg-white/40 rounded-full animate-pulse" style="animation-delay:300ms" />
              </span>
            </div>

          </div>
        </div>

        <!-- Error -->
        <div v-if="error" class="mt-4 p-4 border border-red-300 dark:border-red-800 text-sm">
          <p class="font-medium text-red-600 dark:text-red-400">Error</p>
          <p class="mt-1 text-red-600 dark:text-red-400">{{ error }}</p>
        </div>
      </div>

      <!-- New activity toast (Slack-style, above input) -->
      <transition
        enter-active-class="transition-all duration-200 ease-out"
        leave-active-class="transition-all duration-150 ease-in"
        enter-from-class="opacity-0 translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 translate-y-2"
      >
        <button
          v-if="showNewActivityToast"
          @click="jumpToBottom"
          class="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-black dark:bg-white text-white dark:text-black text-xs font-medium shadow-lg hover:opacity-90 transition-opacity"
        >
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
          </svg>
          New activity
        </button>
      </transition>
    </div>

    <!-- Input -->
    <div class="border-t border-gray-300 dark:border-gray-700 px-6 py-4">
      <form @submit.prevent="sendMessage">
        <div class="flex items-start gap-3">
          <textarea
            v-model="inputMessage"
            @keydown.enter.exact.prevent="sendMessage"
            placeholder="Ask about errors, performance, infrastructure..."
            rows="2"
            class="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-700 focus:outline-none focus:border-black dark:focus:border-white resize-none text-sm bg-transparent transition-colors"
            :disabled="isAgentRunning"
          />
          <button
            v-if="isAgentRunning"
            type="button"
            @click="stopAgent"
            class="px-6 py-3 border border-red-400 dark:border-red-600 text-red-600 dark:text-red-400 hover:bg-red-600 hover:text-white dark:hover:bg-red-500 dark:hover:text-white text-sm transition-colors"
          >
            Stop
          </button>
          <button
            v-else
            type="submit"
            :disabled="!inputMessage.trim()"
            class="px-6 py-3 bg-black dark:bg-white text-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed text-sm transition-opacity"
          >
            Send
          </button>
        </div>
        <div class="flex items-center justify-between mt-1.5">
          <div class="flex items-center gap-2">
            <p class="text-[11px] text-black/30 dark:text-white/30">Enter to send, Shift+Enter for new line</p>
          </div>
          <select
            :value="selectedModel"
            @change="setModel(($event.target as HTMLSelectElement).value)"
            :disabled="modelsLoading"
            class="text-[11px] text-black/50 dark:text-white/50 bg-transparent border border-gray-200 dark:border-gray-800 px-2 py-0.5 focus:outline-none focus:border-black dark:focus:border-white cursor-pointer disabled:opacity-40"
          >
            <option v-if="modelsLoading" disabled>Loading models...</option>
            <option
              v-for="m in availableModels"
              :key="m.id"
              :value="m.id"
              class="bg-white dark:bg-black"
            >
              {{ m.label }}
            </option>
          </select>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useAgent } from '../composables/useAgent';
import { useAgentStore } from '../stores/agent';
import MessageList from './MessageList.vue';
import WelcomeScreen from './WelcomeScreen.vue';
import ToolUsageIndicator from './ToolUsageIndicator.vue';

const router = useRouter();
const messagesContainer = ref<HTMLElement | null>(null);
const agentStore = useAgentStore();

const currentToolUses = computed(() => agentStore.currentToolUses);
const reasoningHistory = computed(() => agentStore.reasoningHistory);
const activeSubAgents = computed(() => agentStore.activeSubAgents);
const subAgentResults = computed(() => agentStore.subAgentResults);

const {
  inputMessage,
  messages,
  isThinking,
  isStreaming,
  error,
  selectedModel,
  availableModels,
  modelsLoading,
  setModel,
  fetchModels,
  sendMessage,
  stopAgent,
} = useAgent();

const isAgentRunning = computed(() => isThinking.value || isStreaming.value);

const hasActiveThread = computed(() =>
  messages.value.length > 0 || isThinking.value || isStreaming.value
);

const conversationTitle = computed(() =>
  agentStore.currentConversation?.title || 'New Conversation'
);

// ── Flat activity log ────────────────────────────────────────────
// Merges reasoning, sub-agent events, and tool calls into a single
// sequential list — displayed line by line, nothing hidden.
type ActivityItem =
  | { type: 'reasoning'; key: string; data: { evaluation: any } }
  | { type: 'sub_agent_start'; key: string; data: { agentId: string; task: string } }
  | { type: 'sub_agent_complete'; key: string; data: { agentId: string } }
  | { type: 'tool'; key: string; data: any };

const activityLog = computed<ActivityItem[]>(() => {
  const items: ActivityItem[] = [];

  // 1. Sub-agents (reason — what agents were dispatched)
  for (const result of subAgentResults.value) {
    items.push({ type: 'sub_agent_complete', key: `sac-${result.agentId}`, data: result });
  }
  for (const agent of activeSubAgents.value) {
    items.push({ type: 'sub_agent_start', key: `sa-${agent.agentId}`, data: agent });
  }

  // 2. Tool calls
  for (const tool of currentToolUses.value) {
    items.push({ type: 'tool', key: `t-${tool.id}`, data: tool });
  }

  // 3. Evaluation (reasoning results — last)
  for (const entry of reasoningHistory.value) {
    items.push({ type: 'reasoning', key: `r-${entry.iteration}`, data: entry });
  }

  return items;
});

// Sub-agent display labels
const agentLabels: Record<string, string> = {
  apm: 'APM',
  error_monitoring: 'Error Monitoring',
  infrastructure: 'Infrastructure',
  alerting: 'Alerting',
};

function agentLabel(agentId: string): string {
  return agentLabels[agentId] || agentId;
}

// ── Scroll tracking ──────────────────────────────────────────────
const isNearBottom = ref(true);
const showNewActivityToast = ref(false);
const SCROLL_THRESHOLD = 120; // px from bottom to count as "at bottom"

function handleScroll() {
  if (!messagesContainer.value) return;
  const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value;
  const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
  isNearBottom.value = distanceFromBottom <= SCROLL_THRESHOLD;

  // User scrolled back to bottom — dismiss toast
  if (isNearBottom.value) {
    showNewActivityToast.value = false;
  }
}

/** Called by watchers when new content arrives. Scrolls only if user hasn't scrolled up. */
function autoScroll() {
  if (!isNearBottom.value) {
    // User scrolled up — show toast instead
    if (isAgentRunning.value) {
      showNewActivityToast.value = true;
    }
    return;
  }
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
}

/** User-initiated scroll (toast click, send message). Always scrolls. */
function jumpToBottom() {
  showNewActivityToast.value = false;
  isNearBottom.value = true;
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTo({
        top: messagesContainer.value.scrollHeight,
        behavior: 'smooth',
      });
    }
  });
}

// ── Misc ─────────────────────────────────────────────────────────

function newConversation() {
  agentStore.createNewConversation();
  router.push('/chat');
}

function useExample(example: string) {
  inputMessage.value = example;
  sendMessage();
}

// ── Lifecycle & watchers ─────────────────────────────────────────

onMounted(() => {
  fetchModels();
});

// Dismiss toast when agent finishes
watch(isAgentRunning, (running) => {
  if (!running) {
    showNewActivityToast.value = false;
  }
});

// When user sends a message, always jump to bottom
watch(messages, (newVal, oldVal) => {
  const lastMsg = newVal[newVal.length - 1];
  if (lastMsg?.role === 'user' && newVal.length > (oldVal?.length ?? 0)) {
    // User just sent a message — force scroll
    jumpToBottom();
  } else {
    autoScroll();
  }
}, { deep: true });

watch([isStreaming, isThinking], () => autoScroll());
watch(activityLog, () => autoScroll(), { deep: true });
</script>
