/**
 * Tool wrapper with Zod validation (Task #41)
 */
import { z } from 'zod';
import type { ToolContext } from './tool-context';
import { logger } from '../utils/logger';
import { eventBus, EventType } from '../event-bus';

export interface ToolResult {
  title: string;
  output: string;
  metadata?: Record<string, any>;
  attachments?: ToolAttachment[];
}

export interface ToolAttachment {
  type: 'file' | 'image' | 'json';
  path?: string;
  content?: string;
  mimeType?: string;
}

export type ToolExecutor<TInput, TOutput = any> = (
  args: TInput,
  ctx: ToolContext
) => Promise<TOutput> | TOutput;

export interface ToolDefinition<TInput = any, TOutput = any> {
  name: string;
  description: string;
  parameters: z.ZodType<TInput>;
  execute: ToolExecutor<TInput, TOutput>;
  hidden?: boolean;
  category?: string;
}

/**
 * Tool registry and wrapper
 */
export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  /**
   * Define a new tool with Zod validation
   */
  define<TInput, TOutput = any>(
    definition: ToolDefinition<TInput, TOutput>
  ): ToolDefinition<TInput, TOutput> {
    this.tools.set(definition.name, definition as ToolDefinition);
    logger.debug({ toolName: definition.name }, 'Tool registered');
    return definition;
  }

  /**
   * Get tool definition
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all tools
   */
  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get visible tools (non-hidden)
   */
  getVisible(): ToolDefinition[] {
    return this.getAll().filter((tool) => !tool.hidden);
  }

  /**
   * Check if tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Execute a tool with validation and error handling
   */
  async execute<TInput = any>(
    name: string,
    args: unknown,
    ctx: ToolContext
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    const startTime = Date.now();

    try {
      // Validate input
      const validatedArgs = tool.parameters.parse(args) as TInput;

      // Emit before event
      await eventBus.emit(EventType.TOOL_EXECUTE_BEFORE, {
        sessionId: ctx.sessionId,
        messageId: ctx.messageId,
        toolName: name,
        args: validatedArgs,
      });

      // Execute tool
      const output = await tool.execute(validatedArgs, ctx);

      const executionTime = Date.now() - startTime;

      // Format result
      const result: ToolResult = this.formatResult(name, output);

      // Add execution metadata
      result.metadata = {
        ...result.metadata,
        executionTimeMs: executionTime,
        toolName: name,
        status: 'success',
      };

      // Emit after event
      await eventBus.emit(EventType.TOOL_EXECUTE_AFTER, {
        sessionId: ctx.sessionId,
        messageId: ctx.messageId,
        toolName: name,
        result,
        executionTime,
      });

      logger.info(
        { toolName: name, executionTime, sessionId: ctx.sessionId },
        'Tool executed successfully'
      );

      return result;
    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      // Emit error event
      await eventBus.emit(EventType.TOOL_EXECUTE_ERROR, {
        sessionId: ctx.sessionId,
        messageId: ctx.messageId,
        toolName: name,
        error: error.message,
        executionTime,
      });

      logger.error(
        { error, toolName: name, sessionId: ctx.sessionId },
        'Tool execution failed'
      );

      // Return error result
      return {
        title: `Error: ${name}`,
        output: `Tool execution failed: ${error.message}`,
        metadata: {
          executionTimeMs: executionTime,
          toolName: name,
          status: 'error',
          error: error.message,
        },
      };
    }
  }

  /**
   * Format tool output as ToolResult
   */
  private formatResult(toolName: string, output: any): ToolResult {
    // If already a ToolResult, return as-is
    if (
      output &&
      typeof output === 'object' &&
      'title' in output &&
      'output' in output
    ) {
      return output as ToolResult;
    }

    // Convert to ToolResult
    let outputStr: string;
    if (typeof output === 'string') {
      outputStr = output;
    } else if (typeof output === 'object') {
      outputStr = JSON.stringify(output, null, 2);
    } else {
      outputStr = String(output);
    }

    return {
      title: `Executed ${toolName}`,
      output: outputStr,
    };
  }

  /**
   * Convert tools of a specific category to OpenAI tool format
   */
  toOpenAIToolsByCategory(category: string): any[] {
    const tools = this.getAll().filter((t) => t.category === category);
    return tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: this.zodToJsonSchema(tool.parameters),
      },
    }));
  }

  /**
   * Convert to OpenAI tool format
   */
  toOpenAITools(toolNames?: string[]): any[] {
    const tools = toolNames
      ? toolNames.map((name) => this.tools.get(name)).filter(Boolean)
      : this.getVisible();

    return tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool!.name,
        description: tool!.description,
        parameters: this.zodToJsonSchema(tool!.parameters),
      },
    }));
  }

  /**
   * Convert Zod schema to JSON Schema
   */
  private zodToJsonSchema(schema: z.ZodType): any {
    // This is a simplified version - for production use zod-to-json-schema package
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const properties: any = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = this.zodToJsonSchema(value as z.ZodType);
        if (!(value instanceof z.ZodOptional)) {
          required.push(key);
        }
      }

      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
      };
    }

    if (schema instanceof z.ZodString) {
      return { type: 'string', description: schema.description };
    }

    if (schema instanceof z.ZodNumber) {
      return { type: 'number', description: schema.description };
    }

    if (schema instanceof z.ZodBoolean) {
      return { type: 'boolean', description: schema.description };
    }

    if (schema instanceof z.ZodArray) {
      return {
        type: 'array',
        items: this.zodToJsonSchema(schema.element),
        description: schema.description,
      };
    }

    if (schema instanceof z.ZodEnum) {
      return {
        type: 'string',
        enum: schema.options,
        description: schema.description,
      };
    }

    if (schema instanceof z.ZodOptional) {
      return this.zodToJsonSchema(schema.unwrap());
    }

    return { type: 'string' };
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
  }
}

// Export singleton
export const toolRegistry = new ToolRegistry();
