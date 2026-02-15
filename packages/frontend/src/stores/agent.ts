import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import axios from 'axios';
import { useAuthStore } from './auth';
import type { Message, Conversation, ToolUse, EvaluationResult, AgentSubAgentStartEvent, AgentSubAgentCompleteEvent } from '../types';

export const useAgentStore = defineStore('agent', () => {
  function accountBase() {
    const authStore = useAuthStore();
    return `/api/accounts/${authStore.currentAccount?.id}`;
  }

  const currentConversation = ref<Conversation | null>(null);
  const conversations = ref<Conversation[]>([]);
  const isThinking = ref(false);
  const isStreaming = ref(false);
  const error = ref<string | null>(null);

  // Current streaming message
  const currentStreamingMessage = ref<string>('');
  const currentToolUses = ref<ToolUse[]>([]);

  // Iteration tracking for the self-evaluating agent loop
  const currentIteration = ref<number>(0);
  const currentReasoning = ref<EvaluationResult | null>(null);
  const reasoningHistory = ref<Array<{ iteration: number; evaluation: EvaluationResult }>>([]);

  // Sub-agent tracking
  const activeSubAgents = ref<Array<{ agentId: string; agentType: string; task: string }>>([]);
  const subAgentResults = ref<Array<{ agentId: string; findings: string }>>([]);

  /**
   * Get messages for the current conversation.
   * Streaming content is rendered separately by ChatInterface's live activity
   * section — do NOT append a synthetic streaming message here or it will
   * appear twice (once in MessageList and once in the live block).
   */
  const messages = computed(() => {
    if (!currentConversation.value) {
      return [];
    }

    return [...currentConversation.value.messages];
  });

  /**
   * Fetch all conversations
   */
  async function fetchConversations() {
    try {
      const response = await axios.get(`${accountBase()}/agent/conversations`);
      const list = response.data.conversations as Array<any>;
      // Ensure newest-first regardless of backend ordering
      list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      conversations.value = list;
    } catch (err: any) {
      console.error('Error fetching conversations:', err);
      error.value = err.message || 'Failed to fetch conversations';
    }
  }

  /**
   * Fetch a specific conversation
   */
  async function fetchConversation(id: string) {
    try {
      const response = await axios.get(`${accountBase()}/agent/conversations/${id}`);
      const conv = response.data;
      // Sort messages by timestamp to ensure chronological order
      if (conv.messages) {
        conv.messages.sort((a: Message, b: Message) => {
          const ta = new Date(a.timestamp).getTime();
          const tb = new Date(b.timestamp).getTime();
          return ta - tb;
        });
      }
      currentConversation.value = conv;
    } catch (err: any) {
      console.error('Error fetching conversation:', err);
      error.value = err.message || 'Failed to fetch conversation';
    }
  }

  /**
   * Create a new conversation
   */
  function createNewConversation() {
    currentConversation.value = null;
    currentStreamingMessage.value = '';
    currentToolUses.value = [];
    error.value = null;
  }

  /**
   * Add a user message (used by WebSocket handler)
   */
  function addUserMessage(message: Message) {
    console.log('👤 Adding user message:', message);

    if (!currentConversation.value) {
      currentConversation.value = {
        id: 'temp',
        title: null,
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    // Ensure reactivity by creating new array
    currentConversation.value.messages = [
      ...currentConversation.value.messages,
      message
    ];

    console.log('📋 Current messages count:', currentConversation.value.messages.length);
  }

  /**
   * Start thinking state
   */
  function startThinking() {
    isThinking.value = true;
    isStreaming.value = false;
    currentStreamingMessage.value = '';
    currentToolUses.value = [];
    currentIteration.value = 0;
    currentReasoning.value = null;
    reasoningHistory.value = [];
    activeSubAgents.value = [];
    subAgentResults.value = [];
    error.value = null;
  }

  /**
   * Update the current iteration number
   */
  function setIteration(iteration: number) {
    currentIteration.value = iteration;
    currentReasoning.value = null; // Reset reasoning for new iteration
  }

  /**
   * Set reasoning/evaluation for the current iteration
   */
  function setReasoning(iteration: number, evaluation: EvaluationResult) {
    currentReasoning.value = evaluation;
    reasoningHistory.value = [...reasoningHistory.value, { iteration, evaluation }];
  }

  /**
   * Start a sub-agent (from WebSocket event)
   */
  function startSubAgent(data: AgentSubAgentStartEvent) {
    activeSubAgents.value = [...activeSubAgents.value, {
      agentId: data.agentId,
      agentType: data.agentType,
      task: data.task,
    }];
  }

  /**
   * Complete a sub-agent (from WebSocket event)
   */
  function completeSubAgent(data: AgentSubAgentCompleteEvent) {
    activeSubAgents.value = activeSubAgents.value.filter(a => a.agentId !== data.agentId);
    subAgentResults.value = [...subAgentResults.value, {
      agentId: data.agentId,
      findings: data.findings,
    }];
  }

  /**
   * Start streaming
   */
  function startStreaming() {
    isThinking.value = false;
    isStreaming.value = true;
  }

  /**
   * Append text to streaming message
   */
  function appendStreamingText(text: string) {
    currentStreamingMessage.value += text;
  }

  /**
   * Update or add tool use — always creates a new array to guarantee reactivity.
   * Deduplicates: if a completed tool call has the same name + input as an
   * earlier entry, the earlier one is dropped (same query repeated across iterations).
   */
  function updateToolUse(toolUse: ToolUse) {
    const existing = currentToolUses.value;
    const idx = existing.findIndex((t) => t.id === toolUse.id);

    if (idx >= 0) {
      currentToolUses.value = [
        ...existing.slice(0, idx),
        toolUse,
        ...existing.slice(idx + 1),
      ];
    } else {
      currentToolUses.value = [...existing, toolUse];
    }
  }

  /**
   * Complete the response
   */
  function completeResponse(conversationId?: string) {
    if (conversationId && (!currentConversation.value || currentConversation.value.id !== conversationId)) {
      currentConversation.value = {
        id: conversationId,
        title: null,
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    // Capture streaming data before clearing
    const content = currentStreamingMessage.value;
    const tools = currentToolUses.value.length > 0 ? [...currentToolUses.value] : undefined;
    const reasoning = reasoningHistory.value.length > 0 ? [...reasoningHistory.value] : undefined;

    // Clear streaming state FIRST so the live activity block disappears
    isThinking.value = false;
    isStreaming.value = false;
    currentStreamingMessage.value = '';
    currentToolUses.value = [];
    currentIteration.value = 0;
    currentReasoning.value = null;
    reasoningHistory.value = [];
    activeSubAgents.value = [];
    subAgentResults.value = [];

    // Then add the permanent message (dedup: skip if identical assistant content already exists)
    if (currentConversation.value && content) {
      const isDuplicate = currentConversation.value.messages.some(
        (m) => m.role === 'assistant' && m.content === content
      );
      if (!isDuplicate) {
        currentConversation.value.messages = [
          ...currentConversation.value.messages,
          {
            id: Date.now().toString(),
            role: 'assistant',
            content,
            timestamp: new Date(),
            toolUses: tools,
            reasoning,
          }
        ];
      }
    }

    // Refresh the conversations list so the new/updated thread appears
    fetchConversations();
  }

  /**
   * Stop the agent — clear streaming state without adding an error message
   */
  function stopAgent() {
    isThinking.value = false;
    isStreaming.value = false;
    currentStreamingMessage.value = '';
    currentToolUses.value = [];
    currentIteration.value = 0;
    currentReasoning.value = null;
    reasoningHistory.value = [];
    activeSubAgents.value = [];
    subAgentResults.value = [];
  }

  /**
   * Set error state
   */
  function setError(errorMessage: string) {
    error.value = errorMessage;
    isThinking.value = false;
    isStreaming.value = false;
  }

  /**
   * Set conversation ID
   */
  function setConversationId(id: string) {
    if (currentConversation.value) {
      currentConversation.value.id = id;
    }
  }

  /**
   * Set conversation title (from backend title generation)
   */
  function setConversationTitle(id: string, title: string) {
    if (currentConversation.value?.id === id) {
      // New object reference guarantees Vue reactivity
      currentConversation.value = { ...currentConversation.value, title };
    }
    // Replace in conversations list with new array + object reference
    conversations.value = conversations.value.map((c) =>
      c.id === id ? { ...c, title } : c
    );
  }

  /**
   * Add a new conversation to the list (from account-level WebSocket event).
   * Deduplicates by id.
   */
  function addConversationToList(conv: { id: string; title: string | null; createdAt: string; updatedAt: string; messageCount?: number }) {
    if (conversations.value.some((c) => c.id === conv.id)) return;
    conversations.value = [
      { ...conv, messages: [] } as Conversation,
      ...conversations.value,
    ];
  }

  /**
   * Update a conversation in the list (from account-level WebSocket event).
   * Merges partial data and re-sorts by updatedAt.
   */
  function updateConversationInList(data: { id: string; title?: string; updatedAt: string }) {
    conversations.value = conversations.value.map((c) =>
      c.id === data.id ? { ...c, ...data } : c
    );
    conversations.value.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  /**
   * Delete a conversation
   */
  async function deleteConversation(id: string) {
    try {
      await axios.delete(`${accountBase()}/agent/conversations/${id}`);

      // Remove from list
      conversations.value = conversations.value.filter((c) => c.id !== id);

      // Clear current if it was deleted
      if (currentConversation.value?.id === id) {
        currentConversation.value = null;
      }
    } catch (err: any) {
      console.error('Error deleting conversation:', err);
      error.value = err.message || 'Failed to delete conversation';
    }
  }

  return {
    currentConversation,
    conversations,
    messages,
    isThinking,
    isStreaming,
    error,
    currentStreamingMessage,
    currentToolUses,
    currentIteration,
    currentReasoning,
    reasoningHistory,
    activeSubAgents,
    subAgentResults,
    fetchConversations,
    fetchConversation,
    createNewConversation,
    addUserMessage,
    startThinking,
    startStreaming,
    appendStreamingText,
    updateToolUse,
    setIteration,
    setReasoning,
    startSubAgent,
    completeSubAgent,
    completeResponse,
    stopAgent,
    setError,
    setConversationId,
    setConversationTitle,
    addConversationToList,
    updateConversationInList,
    deleteConversation,
  };
});
