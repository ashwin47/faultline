import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import axios from 'axios';
import { useAgentStore } from '../stores/agent';
import { useAuthStore } from '../stores/auth';
import { useWebSocket } from './useWebSocket';

interface ModelOption {
  id: string;
  label: string;
}

// Persist model choice across sessions
const storedModel = localStorage.getItem('faultline:model') || 'gpt-4.1';
const selectedModel = ref(storedModel);
const availableModels = ref<ModelOption[]>([]);
const modelsLoading = ref(false);

export function useAgent() {
  const agentStore = useAgentStore();
  const { messages, isThinking, isStreaming, error } = storeToRefs(agentStore);
  const { sendMessage: sendWebSocketMessage, stopAgent } = useWebSocket();
  const inputMessage = ref('');

  function setModel(model: string) {
    selectedModel.value = model;
    localStorage.setItem('faultline:model', model);
  }

  /**
   * Fetch available models from the OpenAI API via our backend
   */
  async function fetchModels() {
    if (availableModels.value.length > 0 || modelsLoading.value) return;
    modelsLoading.value = true;

    try {
      const authStore = useAuthStore();
      const response = await axios.get(`/api/accounts/${authStore.currentAccount?.id}/agent/models`);
      const all: Array<{ id: string; label: string }> = response.data.models;

      availableModels.value = all.map((m) => ({
        id: m.id,
        label: m.label || m.id,
      }));

      // If stored model isn't in the list, reset to first available
      if (availableModels.value.length > 0 && !availableModels.value.find((m) => m.id === selectedModel.value)) {
        setModel(availableModels.value[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch models:', err);
    } finally {
      modelsLoading.value = false;
    }
  }

  /**
   * Send a message to the agent
   */
  function sendMessage() {
    const message = inputMessage.value.trim();

    if (!message) {
      return;
    }

    // Add user message to store
    agentStore.addUserMessage({
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    });

    // Send via WebSocket with selected model
    sendWebSocketMessage(
      message,
      agentStore.currentConversation?.id,
      selectedModel.value,
    );

    // Clear input
    inputMessage.value = '';
  }

  /**
   * Start a new conversation
   */
  function newConversation() {
    agentStore.createNewConversation();
  }

  /**
   * Load a conversation
   */
  async function loadConversation(id: string) {
    await agentStore.fetchConversation(id);
  }

  return {
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
    newConversation,
    loadConversation,
  };
}
