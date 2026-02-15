import { Router, Request, Response } from 'express';
import type { Router as ExpressRouter } from 'express';
import OpenAI from 'openai';
import { Conversation } from '../models/conversation.model';
import { Setting } from '../models/setting.model';
import { MCPClientManager } from '../../lib/integrations/mcp/client-manager';
import { toolRegistry } from '../../lib/integrations/tool-registry';
import { ToolContext } from '../../lib/integrations/tool-context';
import { logger } from '../../lib/utils/logger';

const router: ExpressRouter = Router({ mergeParams: true });

/**
 * GET /api/agent/conversations
 * Get all conversations (without full message history)
 */
router.get('/conversations', (req: Request, res: Response) => {
  try {
    const accountId = req.params.accountId;
    const conversations = Conversation.all(accountId);
    res.json({ conversations });
  } catch (error) {
    logger.error({ error }, 'Error fetching conversations');
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

/**
 * GET /api/agent/conversations/:id
 * Get a specific conversation with full message history
 */
router.get('/conversations/:id', (req: Request, res: Response) => {
  try {
    const accountId = req.params.accountId;
    const { id } = req.params;
    const conversation = Conversation.find(accountId, id);

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    res.json(conversation);
  } catch (error) {
    logger.error({ error }, 'Error fetching conversation');
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

/**
 * DELETE /api/agent/conversations/:id
 * Delete a conversation
 */
router.delete('/conversations/:id', (req: Request, res: Response) => {
  try {
    const accountId = req.params.accountId;
    const { id } = req.params;
    Conversation.destroy(accountId, id);

    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Error deleting conversation');
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

/**
 * Human-readable labels for known OpenAI models.
 */
const MODEL_LABELS: Record<string, string> = {
  'gpt-4.1': 'GPT-4.1',
  'gpt-4.1-mini': 'GPT-4.1 Mini',
  'gpt-4.1-nano': 'GPT-4.1 Nano',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  'gpt-4-turbo': 'GPT-4 Turbo',
  'gpt-4': 'GPT-4',
  'gpt-3.5-turbo': 'GPT-3.5 Turbo',
  'o4-mini': 'o4 Mini',
  'o3': 'o3',
  'o3-mini': 'o3 Mini',
  'o3-pro': 'o3 Pro',
  'o1': 'o1',
  'o1-mini': 'o1 Mini',
  'o1-pro': 'o1 Pro',
};

/** Only surface chat-capable models, not embeddings/tts/whisper/dall-e etc. */
const CHAT_MODEL_PREFIXES = ['gpt-', 'o1', 'o3', 'o4', 'chatgpt-'];

/** Date-suffix pattern — models like gpt-4o-2024-08-06 are pinned snapshots */
const DATE_SUFFIX = /\d{4}-\d{2}-\d{2}/;

function isChatModel(id: string): boolean {
  return CHAT_MODEL_PREFIXES.some((p) => id.startsWith(p));
}

function labelFor(id: string): string {
  if (MODEL_LABELS[id]) return MODEL_LABELS[id];
  for (const [prefix, label] of Object.entries(MODEL_LABELS)) {
    if (id.startsWith(prefix + '-')) {
      const suffix = id.slice(prefix.length + 1);
      return `${label} (${suffix})`;
    }
  }
  return id;
}

/** Cached models list + the API key it was fetched with. */
let modelsCache: { apiKey: string; models: Array<{ id: string; label: string }>; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * GET /api/models
 * List available OpenAI chat models (cached for 10 minutes per API key)
 */
router.get('/models', async (req: Request, res: Response) => {
  try {
    const accountId = req.params.accountId;
    const apiKey = Setting.get(accountId, 'openai.api_key');
    if (!apiKey) {
      res.status(400).json({ error: 'OpenAI API key not configured' });
      return;
    }

    // Return cached if same key and still fresh
    if (
      modelsCache &&
      modelsCache.apiKey === apiKey &&
      Date.now() - modelsCache.fetchedAt < CACHE_TTL_MS
    ) {
      res.json({ models: modelsCache.models });
      return;
    }

    const client = new OpenAI({ apiKey });
    const list = await client.models.list();

    const chatModels = list.data
      .filter((m) => isChatModel(m.id))
      .map((m) => ({ id: m.id, label: labelFor(m.id), created: m.created }));

    const latest = chatModels
      .filter((m) => !DATE_SUFFIX.test(m.id))
      .sort((a, b) => b.created - a.created);
    const snapshots = chatModels
      .filter((m) => DATE_SUFFIX.test(m.id))
      .sort((a, b) => b.created - a.created);

    const models = [...latest, ...snapshots].map(({ id, label }) => ({ id, label }));

    modelsCache = { apiKey, models, fetchedAt: Date.now() };

    res.json({ models });
  } catch (error: any) {
    logger.error({ error }, 'Error fetching models');
    res.status(500).json({ error: error.message || 'Failed to fetch models' });
  }
});

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/test-mcp/:integration
 * Test an integration by calling a simple discovery tool.
 */
router.get('/test-mcp/:integration', async (req: Request, res: Response) => {
  const { integration } = req.params;
  const accountId = req.params.accountId;

  // ── AWS: test via custom tool registry ──
  if (integration === 'aws') {
    if (!toolRegistry.has('aws_get_caller_identity')) {
      res.status(404).json({
        error: 'AWS tools not registered — AWS credentials may not be configured',
      });
      return;
    }
    try {
      const start = Date.now();
      const ac = new AbortController();
      const ctx = new ToolContext({
        sessionId: 'test',
        messageId: 'test',
        agentName: 'test',
        abort: ac.signal,
        messages: [],
        accountId,
      });
      const result = await toolRegistry.execute('aws_get_caller_identity', {}, ctx);
      const elapsed = Date.now() - start;
      const awsToolNames = toolRegistry.getAll()
        .filter(t => t.category === 'aws')
        .map(t => t.name);
      res.json({
        integration,
        status: result.metadata?.status === 'error' ? 'error' : 'ok',
        tool: 'aws_get_caller_identity',
        elapsed: `${elapsed}ms`,
        result: result.output.substring(0, 500),
        availableTools: awsToolNames,
      });
    } catch (error: any) {
      res.json({
        integration,
        status: 'error',
        tool: 'aws_get_caller_identity',
        error: error.message,
      });
    }
    return;
  }

  // ── Other integrations: test via ephemeral MCP connection ──
  const mcp = new MCPClientManager(accountId);
  try {
    await mcp.initialize();

    const stats = mcp.getStats();

    if (!stats.toolsByServer[integration]) {
      res.status(404).json({
        error: `Integration "${integration}" is not connected`,
        connectedServers: Object.keys(stats.toolsByServer),
      });
      return;
    }

    const testTools: Record<string, { tool: string; args: Record<string, unknown> }> = {
      newrelic: { tool: 'get_entities', args: {} },
      sentry: { tool: 'list_organizations', args: {} },
      pagerduty: { tool: 'list_services', args: {} },
      github: { tool: 'list_repos', args: {} },
    };

    const allTools = mcp.getToolsForIntegrations([integration]);
    const toolNames = allTools.map(t => t.name);

    const testConfig = testTools[integration];
    let toolToCall = testConfig?.tool;
    let toolArgs = testConfig?.args || {};

    if (!toolToCall || !toolNames.includes(toolToCall)) {
      const descTools = toolNames.filter(n => n.includes('describe') || n.includes('list'));
      toolToCall = descTools[0] || toolNames[0];
      toolArgs = {};

      if (!toolToCall) {
        res.json({
          integration,
          status: 'connected_no_tools',
          message: 'MCP server is connected but no tools are available',
          availableTools: toolNames,
        });
        return;
      }
    }

    const start = Date.now();
    const result = await mcp.callTool(toolToCall, toolArgs);
    const elapsed = Date.now() - start;

    res.json({
      integration,
      status: 'ok',
      tool: toolToCall,
      elapsed: `${elapsed}ms`,
      result: typeof result === 'string' ? result.substring(0, 500) : JSON.stringify(result).substring(0, 500),
      availableTools: toolNames,
    });
  } catch (error: any) {
    res.json({
      integration,
      status: 'error',
      error: error.message,
    });
  } finally {
    await mcp.dispose();
  }
});

export default router;
