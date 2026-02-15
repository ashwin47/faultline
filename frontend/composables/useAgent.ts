import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import axios from 'axios';
import { useAgentStore } from '../stores/agent';
import { useAuthStore } from '../stores/auth';
import { useWebSocket } from './useWebSocket';
import type { Mention } from '../types';

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
  const authStore = useAuthStore();
  const { messages, isThinking, isStreaming, error } = storeToRefs(agentStore);
  const { sendMessage: sendWebSocketMessage, sendNote: sendWebSocketNote, stopAgent } = useWebSocket();
  const inputMessage = ref('');
  const noteInput = ref('');
  const noteMode = ref(false);
  const pendingMentions = ref<Mention[]>([]);

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
      messageType: 'text',
      content: message,
      createdAt: new Date(),
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
   * Send a private note to the conversation
   */
  function sendNote() {
    const content = noteInput.value.trim();
    if (!content) return;

    const mentions = pendingMentions.value.length > 0 ? [...pendingMentions.value] : undefined;
    sendWebSocketNote(content, authStore.user?.id, mentions);
    noteInput.value = '';
    pendingMentions.value = [];
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
    noteInput,
    noteMode,
    pendingMentions,
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
    sendNote,
    stopAgent,
    newConversation,
    loadConversation,
  };
}
