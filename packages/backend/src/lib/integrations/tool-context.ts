/**
 * Tool execution context (Task #41)
 */
import type { PermissionRequest } from '../permission-system';
import { eventBus, EventType } from '../event-bus';
import type { Message } from '../../types/index';

export interface ToolMetadata {
  title?: string;
  description?: string;
  [key: string]: any;
}

export interface ToolContextData {
  sessionId: string;
  messageId: string;
  partId?: string;
  agentName: string;
  abort: AbortSignal;
  messages: Message[];
  accountId?: string;
}

/**
 * Tool execution context passed to all tool handlers
 */
export class ToolContext {
  readonly sessionId: string;
  readonly messageId: string;
  readonly partId?: string;
  readonly agentName: string;
  readonly abort: AbortSignal;
  readonly messages: Message[];
  readonly accountId?: string;

  private _metadata: ToolMetadata = {};
  private _permissionCallbacks = new Map<string, (granted: boolean) => void>();

  constructor(data: ToolContextData) {
    this.sessionId = data.sessionId;
    this.messageId = data.messageId;
    this.partId = data.partId;
    this.agentName = data.agentName;
    this.abort = data.abort;
    this.messages = data.messages;
    this.accountId = data.accountId;
  }

  /**
   * Update tool metadata (emits event)
   */
  setMetadata(metadata: ToolMetadata): void {
    this._metadata = { ...this._metadata, ...metadata };

    // Emit metadata update event
    eventBus.emit(EventType.PART_DELTA, {
      sessionId: this.sessionId,
      messageId: this.messageId,
      partId: this.partId,
      field: 'metadata',
      value: this._metadata,
    });
  }

  /**
   * Get current metadata
   */
  getMetadata(): ToolMetadata {
    return { ...this._metadata };
  }

  /**
   * Request permission from user (async)
   */
  async ask(request: PermissionRequest): Promise<boolean> {
    return new Promise((resolve) => {
      const requestId = `${this.sessionId}_${Date.now()}`;

      // Store callback
      this._permissionCallbacks.set(requestId, resolve);

      // Emit permission request event
      eventBus.emit(EventType.PERMISSION_REQUESTED, {
        requestId,
        sessionId: this.sessionId,
        messageId: this.messageId,
        agentName: this.agentName,
        request,
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        if (this._permissionCallbacks.has(requestId)) {
          this._permissionCallbacks.delete(requestId);
          resolve(false); // Default to deny
        }
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Resolve a permission request (called by UI)
   */
  resolvePermission(requestId: string, granted: boolean): void {
    const callback = this._permissionCallbacks.get(requestId);
    if (callback) {
      this._permissionCallbacks.delete(requestId);
      callback(granted);

      // Emit permission response event
      eventBus.emit(
        granted ? EventType.PERMISSION_GRANTED : EventType.PERMISSION_DENIED,
        {
          requestId,
          sessionId: this.sessionId,
          granted,
        }
      );
    }
  }

  /**
   * Check if aborted
   */
  isAborted(): boolean {
    return this.abort.aborted;
  }

  /**
   * Throw if aborted
   */
  throwIfAborted(): void {
    if (this.abort.aborted) {
      throw new Error('Tool execution aborted');
    }
  }

  /**
   * Get conversation history
   */
  getHistory(): Message[] {
    return [...this.messages];
  }

  /**
   * Get last user message
   */
  getLastUserMessage(): Message | null {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === 'user') {
        return this.messages[i];
      }
    }
    return null;
  }

  /**
   * Get conversation context (last N messages)
   */
  getRecentContext(count: number = 5): Message[] {
    return this.messages.slice(-count);
  }

  /**
   * Create a child context (for subtasks)
   */
  createChild(overrides: Partial<ToolContextData>): ToolContext {
    return new ToolContext({
      sessionId: overrides.sessionId || this.sessionId,
      messageId: overrides.messageId || this.messageId,
      partId: overrides.partId || this.partId,
      agentName: overrides.agentName || this.agentName,
      abort: overrides.abort || this.abort,
      messages: overrides.messages || this.messages,
      accountId: overrides.accountId || this.accountId,
    });
  }
}
