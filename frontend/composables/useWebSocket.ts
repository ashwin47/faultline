import { useRouter } from 'vue-router';
import { useAgentStore } from '../stores/agent';
import { useSocket } from './useSocket';
import { toCamelCase, toSnakeCase } from '../lib/case-converter';
import type { Subscription } from '@rails/actioncable';

// Track active conversation subscription
let conversationSub: Subscription | null = null;
let accountSub: Subscription | null = null;

export function useWebSocket() {
  const router = useRouter();
  const agentStore = useAgentStore();
  const { getConsumer, connected } = useSocket();

  /**
   * Handle incoming data from the ConversationChannel.
   */
  function handleConversationData(raw: any) {
    const data = toCamelCase<any>(raw);
    const type = data.type;

    switch (type) {
      case 'agent:active':
      case 'thinking':
        agentStore.startThinking();
        break;

      case 'iteration_start':
        agentStore.setIteration(data.iteration);
        break;

      case 'reasoning':
        agentStore.startStreaming();
        agentStore.setReasoning(data.iteration, data.evaluation);
        break;

      case 'text_delta':
        agentStore.startStreaming();
        agentStore.appendStreamingText(data.text);
        break;

      case 'tool_use':
        agentStore.startStreaming();
        agentStore.updateToolUse(data.toolUse);
        break;

      case 'sub_agent_start':
        agentStore.startStreaming();
        agentStore.startSubAgent(data);
        break;

      case 'sub_agent_complete':
        agentStore.completeSubAgent(data);
        break;

      case 'message:created':
        agentStore.handleServerMessage(data.message);
        break;

      case 'note:created':
        agentStore.handleNoteCreated(data.message);
        break;

      case 'agent:conversation_created':
        agentStore.setConversationId(data.conversationId);
        router.replace(`/chat/${data.conversationId}`);
        break;

      case 'title_generated':
        agentStore.setConversationTitle(data.conversationId, data.title);
        break;

      case 'error':
        console.error('Agent error:', data.error);
        agentStore.setError(data.error);
        break;

      case 'agent:stopped':
        agentStore.stopAgent();
        break;

      case 'token_usage':
        // Token usage events are handled by the store if needed
        break;
    }
  }

  /**
   * Subscribe to the AccountChannel for account-level updates.
   */
  function subscribeToAccount() {
    const consumer = getConsumer();
    if (!consumer || accountSub) return;

    accountSub = consumer.subscriptions.create('AccountChannel', {
      received(raw: any) {
        const data = toCamelCase<any>(raw);
        // Account-level events like conversation:created, conversation:updated
        // These are handled by the conversation list component
      },
    });
  }

  /**
   * Join a conversation room by subscribing to ConversationChannel.
   */
  function joinConversation(conversationId: string) {
    const consumer = getConsumer();
    if (!consumer) return;

    // Unsubscribe from previous conversation if any
    if (conversationSub) {
      conversationSub.unsubscribe();
      conversationSub = null;
    }

    conversationSub = consumer.subscriptions.create(
      { channel: 'ConversationChannel', conversation_id: conversationId },
      {
        received(data: any) {
          handleConversationData(data);
        },
        connected() {
          console.log(`Subscribed to conversation: ${conversationId}`);
        },
        disconnected() {
          console.log(`Disconnected from conversation: ${conversationId}`);
        },
      }
    );

    // Also subscribe to account channel if not already
    subscribeToAccount();
  }

  /**
   * Leave a conversation room by unsubscribing.
   */
  function leaveConversation(_conversationId: string) {
    if (conversationSub) {
      conversationSub.unsubscribe();
      conversationSub = null;
    }
  }

  /**
   * Send a message to the agent via the ConversationChannel.
   */
  function sendMessage(message: string, conversationId?: string, model?: string) {
    const consumer = getConsumer();
    if (!consumer) {
      agentStore.setError('WebSocket not connected. Make sure the backend is running on port 3000.');
      return;
    }

    if (conversationSub) {
      // Send via existing subscription
      conversationSub.send(toSnakeCase({ message, conversationId, model }));
    } else {
      // For new conversations — create a temporary subscription that will receive the
      // conversation_created event and then we'll re-subscribe to the proper channel
      const tempSub = consumer.subscriptions.create(
        { channel: 'ConversationChannel', conversation_id: 'new' },
        {
          connected() {
            tempSub.send(toSnakeCase({ message, model }));
          },
          received(data: any) {
            if (data.type === 'agent:conversation_created') {
              // Switch to the real conversation subscription
              tempSub.unsubscribe();
              joinConversation(data.conversationId);
            }
            handleConversationData(data);
          },
        }
      );
      conversationSub = tempSub;
    }
  }

  /**
   * Send a private note to the conversation (not sent to the agent).
   */
  function sendNote(content: string, userId?: string, mentions?: Array<{ userId: string; name: string }>) {
    if (!conversationSub) return;
    conversationSub.perform('add_note', toSnakeCase({ content, userId, mentions }));
  }

  /**
   * Stop the agent for the current conversation.
   */
  function stopAgent() {
    const conversationId = agentStore.currentConversation?.id;
    if (!conversationId || !conversationSub) return;
    conversationSub.perform('stop_agent', toSnakeCase({ conversationId }));
  }

  return {
    joinConversation,
    leaveConversation,
    sendMessage,
    sendNote,
    stopAgent,
  };
}
