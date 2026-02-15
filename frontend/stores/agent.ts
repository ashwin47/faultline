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

  // Chronological activity stream — events pushed in real-time order
  type StreamEvent =
    | { type: 'iteration_start'; iteration: number }
    | { type: 'sub_agent_start'; agentId: string; agentType: string; task: string }
    | { type: 'sub_agent_complete'; agentId: string; findings: string }
    | { type: 'tool_use'; toolUse: ToolUse }
    | { type: 'reasoning'; iteration: number; evaluation: EvaluationResult };

  const activityStream = ref<StreamEvent[]>([]);

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
      // Reset running state — the WebSocket subscription for this conversation
      // will re-set these if the agent is actually still active.
      isThinking.value = false;
      isStreaming.value = false;
      currentStreamingMessage.value = '';
      currentToolUses.value = [];
      currentIteration.value = 0;
      currentReasoning.value = null;
      reasoningHistory.value = [];
      activeSubAgents.value = [];
      subAgentResults.value = [];
      activityStream.value = [];

      const response = await axios.get(`${accountBase()}/agent/conversations/${id}`);
      const conv = response.data;
      // Sort messages by timestamp to ensure chronological order
      if (conv.messages) {
        conv.messages.sort((a: Message, b: Message) => {
          const ta = new Date(a.createdAt).getTime();
          const tb = new Date(b.createdAt).getTime();
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
    isThinking.value = false;
    isStreaming.value = false;
    currentIteration.value = 0;
    currentReasoning.value = null;
    reasoningHistory.value = [];
    activeSubAgents.value = [];
    subAgentResults.value = [];
    activityStream.value = [];
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
    activityStream.value = [];
    error.value = null;
  }

  /**
   * Update the current iteration number
   */
  function setIteration(iteration: number) {
    currentIteration.value = iteration;
    currentReasoning.value = null;
    activityStream.value = [...activityStream.value, { type: 'iteration_start', iteration }];
  }

  /**
   * Set reasoning/evaluation for the current iteration
   */
  function setReasoning(iteration: number, evaluation: EvaluationResult) {
    currentReasoning.value = evaluation;
    reasoningHistory.value = [...reasoningHistory.value, { iteration, evaluation }];
    activityStream.value = [...activityStream.value, { type: 'reasoning', iteration, evaluation }];
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
    activityStream.value = [...activityStream.value, {
      type: 'sub_agent_start', agentId: data.agentId, agentType: data.agentType, task: data.task,
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
    activityStream.value = [...activityStream.value, {
      type: 'sub_agent_complete', agentId: data.agentId, findings: data.findings,
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
      // Update in-place in the activity stream too
      const streamIdx = activityStream.value.findIndex(
        (e) => e.type === 'tool_use' && e.toolUse.id === toolUse.id,
      );
      if (streamIdx >= 0) {
        const updated = [...activityStream.value];
        updated[streamIdx] = { type: 'tool_use', toolUse };
        activityStream.value = updated;
      }
    } else {
      currentToolUses.value = [...existing, toolUse];
      activityStream.value = [...activityStream.value, { type: 'tool_use', toolUse }];
    }
  }

  /**
   * Handle a note broadcast from the server.
   * Notes are private messages between team members, not sent to the agent.
   */
  function handleNoteCreated(message: Message) {
    if (!currentConversation.value) return;

    // Dedup by ID
    if (currentConversation.value.messages.some(m => m.id === message.id)) return;

    currentConversation.value.messages = [
      ...currentConversation.value.messages,
      message,
    ];
  }

  /**
   * Handle a message broadcast from the server (via model callback).
   * Only text messages are broadcast via message:created.
   * Deduplicates user messages (added optimistically) and replaces with server version.
   */
  async function handleServerMessage(message: Message) {
    if (!currentConversation.value) return;

    // Dedup by ID first (exact match)
    if (currentConversation.value.messages.some(m => m.id === message.id)) return;

    // For user messages: replace the optimistic message (matched by role+content)
    if (message.role === 'user') {
      const optimisticIdx = currentConversation.value.messages.findIndex(
        m => m.role === 'user' && m.content === message.content && !m.id.includes('-'),
      );
      if (optimisticIdx >= 0) {
        const msgs = [...currentConversation.value.messages];
        msgs[optimisticIdx] = message;
        currentConversation.value.messages = msgs;
        return;
      }
      currentConversation.value.messages = [
        ...currentConversation.value.messages,
        message,
      ];
      return;
    }

    // Assistant text message = response complete
    // Fetch full conversation to get all saved rows (tool_use, evaluation, text)
    isThinking.value = false;
    isStreaming.value = false;
    currentStreamingMessage.value = '';
    currentToolUses.value = [];
    activityStream.value = [];
    currentIteration.value = 0;
    currentReasoning.value = null;
    reasoningHistory.value = [];
    activeSubAgents.value = [];
    subAgentResults.value = [];

    await fetchConversation(currentConversation.value.id);
    fetchConversations();
  }

  /**
   * Stop the agent — clear streaming state without adding an error message
   */
  function stopAgent() {
    const wasRunning = isThinking.value || isStreaming.value;

    isThinking.value = false;
    isStreaming.value = false;
    currentStreamingMessage.value = '';
    currentToolUses.value = [];
    currentIteration.value = 0;
    currentReasoning.value = null;
    reasoningHistory.value = [];
    activeSubAgents.value = [];
    subAgentResults.value = [];
    activityStream.value = [];

    // Refetch conversation to pick up any final messages that may have
    // been persisted (e.g. agent:stopped arrives as a safety net after
    // the response was already saved but message:created was missed).
    if (wasRunning && currentConversation.value?.id) {
      fetchConversation(currentConversation.value.id);
      fetchConversations();
    }
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
    activityStream,
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
    handleNoteCreated,
    handleServerMessage,
    stopAgent,
    setError,
    setConversationId,
    setConversationTitle,
    addConversationToList,
    updateConversationInList,
    deleteConversation,
  };
});
