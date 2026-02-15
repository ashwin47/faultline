import { useRouter } from 'vue-router';
import { useAgentStore } from '../stores/agent';
import { useSocket } from './useSocket';
import type {
  AgentIterationStartEvent,
  AgentReasoningEvent,
  AgentTextDeltaEvent,
  AgentToolUseEvent,
  AgentErrorEvent,
  AgentResponseCompleteEvent,
  AgentConversationCreatedEvent,
  AgentTitleGeneratedEvent,
  AgentSubAgentStartEvent,
  AgentSubAgentCompleteEvent,
} from '../types';

// Track bound listeners so we can unbind them cleanly
let listenersBound = false;

export function useWebSocket() {
  const router = useRouter();
  const agentStore = useAgentStore();
  const { getSocket } = useSocket();

  /**
   * Bind conversation-level stream listeners to the global socket.
   */
  function bindStreamListeners() {
    const sock = getSocket();
    if (!sock || listenersBound) return;
    listenersBound = true;

    sock.on('agent:active', () => {
      // Joined a conversation with a running agent — show activity indicator
      agentStore.startThinking();
    });

    sock.on('agent:thinking', () => {
      agentStore.startThinking();
    });

    sock.on('agent:iteration_start', (data: AgentIterationStartEvent) => {
      agentStore.setIteration(data.iteration);
    });

    sock.on('agent:reasoning', (data: AgentReasoningEvent) => {
      agentStore.startStreaming();
      agentStore.setReasoning(data.iteration, data.evaluation);
    });

    sock.on('agent:text_delta', (data: AgentTextDeltaEvent) => {
      agentStore.startStreaming();
      agentStore.appendStreamingText(data.text);
    });

    sock.on('agent:tool_use', (data: AgentToolUseEvent) => {
      agentStore.startStreaming();
      agentStore.updateToolUse(data.toolUse);
    });

    sock.on('agent:sub_agent_start', (data: AgentSubAgentStartEvent) => {
      agentStore.startStreaming();
      agentStore.startSubAgent(data);
    });

    sock.on('agent:sub_agent_complete', (data: AgentSubAgentCompleteEvent) => {
      agentStore.completeSubAgent(data);
    });

    sock.on('agent:response_complete', (data: AgentResponseCompleteEvent) => {
      agentStore.completeResponse(data.conversationId);
    });

    sock.on('agent:conversation_created', (data: AgentConversationCreatedEvent) => {
      agentStore.setConversationId(data.conversationId);
      router.replace(`/chat/${data.conversationId}`);
    });

    sock.on('agent:title_generated', (data: AgentTitleGeneratedEvent) => {
      agentStore.setConversationTitle(data.conversationId, data.title);
    });

    sock.on('agent:error', (data: AgentErrorEvent) => {
      console.error('Agent error:', data.error);
      agentStore.setError(data.error);
    });

    sock.on('agent:stopped', () => {
      agentStore.stopAgent();
    });
  }

  /**
   * Unbind conversation-level stream listeners.
   */
  function unbindStreamListeners() {
    const sock = getSocket();
    if (!sock || !listenersBound) return;
    listenersBound = false;

    sock.off('agent:active');
    sock.off('agent:thinking');
    sock.off('agent:iteration_start');
    sock.off('agent:reasoning');
    sock.off('agent:text_delta');
    sock.off('agent:tool_use');
    sock.off('agent:sub_agent_start');
    sock.off('agent:sub_agent_complete');
    sock.off('agent:response_complete');
    sock.off('agent:conversation_created');
    sock.off('agent:title_generated');
    sock.off('agent:error');
    sock.off('agent:stopped');
  }

  /**
   * Join a conversation room and start listening for stream events.
   */
  function joinConversation(conversationId: string) {
    const sock = getSocket();
    sock?.emit('conversation:join', { conversationId });
    bindStreamListeners();
  }

  /**
   * Leave a conversation room and stop listening for stream events.
   */
  function leaveConversation(conversationId: string) {
    const sock = getSocket();
    sock?.emit('conversation:leave', { conversationId });
    unbindStreamListeners();
  }

  /**
   * Send a message to the agent.
   */
  function sendMessage(message: string, conversationId?: string, model?: string) {
    const sock = getSocket();
    if (!sock?.connected) {
      console.error('WebSocket not connected');
      agentStore.setError('WebSocket not connected. Make sure the backend is running on port 3000.');
      return;
    }

    // Ensure stream listeners are bound before sending (critical for first message
    // in a new conversation where no room has been joined yet)
    bindStreamListeners();

    sock.emit('agent:message', {
      message,
      conversationId,
      model,
    });
  }

  /**
   * Stop the agent for the current conversation.
   */
  function stopAgent() {
    const sock = getSocket();
    if (!sock?.connected) return;
    const conversationId = agentStore.currentConversation?.id;
    if (!conversationId) return;
    sock.emit('agent:stop', { conversationId });
  }

  return {
    joinConversation,
    leaveConversation,
    sendMessage,
    stopAgent,
  };
}
