import { logger } from './utils/logger';

export type EventHandler<T = any> = (data: T) => void | Promise<void>;

export interface BusEvent {
  type: string;
  data: any;
  timestamp: Date;
  sessionId?: string;
  messageId?: string;
}

export enum EventType {
  // Session events
  SESSION_CREATED = 'session:created',
  SESSION_UPDATED = 'session:updated',
  SESSION_COMPLETED = 'session:completed',
  SESSION_ERROR = 'session:error',

  // Message events
  MESSAGE_CREATED = 'message:created',
  MESSAGE_UPDATED = 'message:updated',
  MESSAGE_DELTA = 'message:delta',

  // Part events
  PART_CREATED = 'part:created',
  PART_DELTA = 'part:delta',
  PART_COMPLETED = 'part:completed',

  // Tool events
  TOOL_EXECUTE_BEFORE = 'tool:execute:before',
  TOOL_EXECUTE_AFTER = 'tool:execute:after',
  TOOL_EXECUTE_ERROR = 'tool:execute:error',

  // Agent events
  AGENT_MAX_STEPS_REACHED = 'agent:max_steps_reached',
  AGENT_DOOM_LOOP_DETECTED = 'agent:doom_loop_detected',
  AGENT_SELF_CORRECTION = 'agent:self_correction',

  // Compaction events
  COMPACTION_TRIGGERED = 'compaction:triggered',
  COMPACTION_COMPLETED = 'compaction:completed',

  // Permission events
  PERMISSION_REQUESTED = 'permission:requested',
  PERMISSION_GRANTED = 'permission:granted',
  PERMISSION_DENIED = 'permission:denied',

  // Plugin events
  PLUGIN_LOADED = 'plugin:loaded',
  PLUGIN_ERROR = 'plugin:error',
}

class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private wildcardHandlers = new Set<EventHandler>();

  on(event: string | EventType, handler: EventHandler): () => void {
    if (event === '*') {
      this.wildcardHandlers.add(handler);
      return () => this.wildcardHandlers.delete(handler);
    }

    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }

    this.handlers.get(event)!.add(handler);

    return () => {
      const handlers = this.handlers.get(event);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.handlers.delete(event);
        }
      }
    };
  }

  once(event: string | EventType, handler: EventHandler): () => void {
    const wrappedHandler: EventHandler = async (data) => {
      unsubscribe();
      await handler(data);
    };

    const unsubscribe = this.on(event, wrappedHandler);
    return unsubscribe;
  }

  async emit(event: string | EventType, data?: any): Promise<void> {
    const busEvent: BusEvent = {
      type: event as string,
      data,
      timestamp: new Date(),
      sessionId: data?.sessionId || data?.sessionID,
      messageId: data?.messageId || data?.messageID,
    };

    const wildcardPromises = Array.from(this.wildcardHandlers).map((handler) =>
      this.safeCall(handler, busEvent),
    );

    const handlers = this.handlers.get(event) || new Set();
    const handlerPromises = Array.from(handlers).map((handler) =>
      this.safeCall(handler, data),
    );

    try {
      await Promise.all([...wildcardPromises, ...handlerPromises]);
    } catch (error) {
      logger.error({ error, event }, 'Error in event handlers');
    }
  }

  private async safeCall(handler: EventHandler, data: any): Promise<void> {
    try {
      await handler(data);
    } catch (error) {
      logger.error({ error }, 'Event handler error');
    }
  }

  off(event: string | EventType): void {
    this.handlers.delete(event);
  }

  clear(): void {
    this.handlers.clear();
    this.wildcardHandlers.clear();
  }

  listenerCount(event: string | EventType): number {
    return this.handlers.get(event)?.size || 0;
  }

  eventNames(): string[] {
    return Array.from(this.handlers.keys());
  }
}

export const eventBus = new EventBus();
