import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Setting } from "../../../app/models/setting.model";
import { logger } from "../../utils/logger";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface MCPServerConfig {
  name: string;
  transport: "stdio" | "streamable-http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string; // For SSE or streamable-http transport
  headers?: Record<string, string>; // For HTTP-based transports
  /** When set, only tools whose names match at least one pattern are registered. */
  allowTools?: RegExp[];
}

/**
 * Faultline is a read-only investigation agent. MCP servers expose many
 * write/mutate tools the agent should never call. Dropping them at
 * registration time keeps us well under OpenAI's 128-tool limit and
 * prevents accidental mutations.
 */
const WRITE_TOOL_PATTERN =
  /^(create|update|delete|remove|set|add|edit|close|merge|assign|resolve|acknowledge|snooze|put|post|fork|transfer|enable|disable|approve|reject|reopen|escalate|reassign|archive|unarchive|lock|unlock|comment|reply|subscribe|unsubscribe|invite|revoke|push|publish|deploy|trigger|run|execute|start|stop|restart|cancel|retry|dismiss|mute|unmute|upload|write|insert|modify|patch|toggle|revert|reset|clear|purge|rename|move|copy|clone|link|unlink|attach|detach)_/;

class MCPClientManager {
  private clients: Map<string, Client> = new Map();
  private tools: Map<string, { server: string; tool: Tool }> = new Map();
  private accountId: string;

  constructor(accountId: string) {
    this.accountId = accountId;
  }

  /**
   * Get MCP server configurations from settings
   */
  private getMCPServerConfigs(): MCPServerConfig[] {
    const configs: MCPServerConfig[] = [];

    // New Relic is handled by custom NerdGraph tools (see integrations/newrelic/), not MCP.

    // AWS API MCP Server (stdio) — uses first configured instance
    const awsInstances = Setting.getInstances(this.accountId, "aws");
    if (awsInstances.length > 0) {
      const aws = awsInstances[0];
      if (aws.access_key_id && aws.secret_access_key) {
        configs.push({
          name: "aws",
          transport: "stdio",
          command: "uvx",
          args: ["awslabs.aws-api-mcp-server@latest"],
          env: {
            AWS_ACCESS_KEY_ID: aws.access_key_id,
            AWS_SECRET_ACCESS_KEY: aws.secret_access_key,
            AWS_REGION: aws.region || "us-east-1",
          },
        });
      }
    }

    // Sentry MCP Server (stdio) — uses first configured instance
    const sentryInstances = Setting.getInstances(this.accountId, "sentry");
    if (sentryInstances.length > 0) {
      const sentry = sentryInstances[0];
      if (sentry.auth_token && sentry.org) {
        configs.push({
          name: "sentry",
          transport: "stdio",
          command: "npx",
          args: ["-y", "@sentry/mcp-server", "--organization-slug", sentry.org],
          env: {
            SENTRY_ACCESS_TOKEN: sentry.auth_token,
          },
        });
      }
    }

    // GitHub MCP Server (stdio) — uses first configured instance
    const githubInstances = Setting.getInstances(this.accountId, "github");
    if (githubInstances.length > 0) {
      const github = githubInstances[0];
      if (github.token) {
        configs.push({
          name: "github",
          transport: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: {
            GITHUB_PERSONAL_ACCESS_TOKEN: github.token,
          },
        });
      }
    }

    // PagerDuty MCP Server (streamable-http) — uses first configured instance
    const pdInstances = Setting.getInstances(this.accountId, "pagerduty");
    if (pdInstances.length > 0) {
      const pd = pdInstances[0];
      if (pd.api_key) {
        configs.push({
          name: "pagerduty",
          transport: "streamable-http",
          url: "https://mcp.pagerduty.com/mcp",
          headers: {
            Authorization: `Token token=${pd.api_key}`,
          },
        });
      }
    }

    return configs;
  }

  /**
   * Initialize all configured MCP servers
   */
  async initialize(): Promise<void> {
    const configs = this.getMCPServerConfigs();

    logger.info({ serverCount: configs.length }, "Initializing MCP servers");

    for (const config of configs) {
      try {
        await this.connectServer(config);
      } catch (error: any) {
        logger.warn(
          {
            error: error.message || error,
            code: error.code,
            server: config.name,
            command: config.command,
            args: config.args,
          },
          "Failed to connect to MCP server - tools will not be available",
        );

        // Continue without this server — don't block the agent run
      }
    }

    logger.info(
      {
        connectedServers: this.clients.size,
        totalTools: this.tools.size,
      },
      "MCP servers initialized",
    );
  }

  /**
   * Connect to a single MCP server
   */
  private async connectServer(config: MCPServerConfig): Promise<void> {
    const client = new Client(
      {
        name: `faultline-${config.name}`,
        version: "0.1.0",
      },
      {
        capabilities: {},
      },
    );

    // Create appropriate transport
    let transport;
    if (config.transport === "stdio") {
      if (!config.command) {
        throw new Error(`stdio transport requires command`);
      }
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        env: { ...process.env, ...config.env } as Record<string, string>,
      });
    } else if (config.transport === "streamable-http") {
      if (!config.url) {
        throw new Error(`streamable-http transport requires url`);
      }
      transport = new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: {
          headers: config.headers || {},
        },
      });
    } else {
      throw new Error(`Unknown transport: ${config.transport}`);
    }

    await client.connect(transport);

    // List available tools
    const { tools: allTools } = await client.listTools();

    // Filter out write/mutate tools — this agent is read-only.
    // Also apply per-server allowTools if configured.
    const tools = allTools.filter((t) => {
      if (WRITE_TOOL_PATTERN.test(t.name)) return false;
      if (config.allowTools && !config.allowTools.some((re) => re.test(t.name)))
        return false;
      return true;
    });

    const dropped = allTools.length - tools.length;
    logger.info(
      {
        server: config.name,
        registered: tools.length,
        dropped,
        total: allTools.length,
        tools: tools.map((t) => t.name),
      },
      "Connected to MCP server",
    );
    // Store client
    this.clients.set(config.name, client);

    // Store tools with server reference
    for (const tool of tools) {
      this.tools.set(tool.name, { server: config.name, tool });
    }
  }

  /**
   * Get all available tools from all connected servers
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values()).map((t) => t.tool);
  }

  /**
   * Get tools for specific integrations
   */
  getToolsForIntegrations(integrations: string[]): Tool[] {
    return Array.from(this.tools.values())
      .filter((t) => integrations.includes(t.server))
      .map((t) => t.tool);
  }

  /**
   * Call a tool
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<any> {
    const toolInfo = this.tools.get(toolName);
    if (!toolInfo) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    const client = this.clients.get(toolInfo.server);
    if (!client) {
      throw new Error(`Client not connected for server: ${toolInfo.server}`);
    }

    const result = await client.callTool({
      name: toolName,
      arguments: args,
    });

    // Extract text content from MCP response
    let extracted: any = result;
    if (
      result.content &&
      Array.isArray(result.content) &&
      result.content.length > 0
    ) {
      const textContent = result.content.find((c: any) => c.type === "text");
      if (textContent && "text" in textContent) {
        try {
          extracted = JSON.parse(textContent.text);
        } catch {
          extracted = textContent.text;
        }
      }
    }

    // Check for MCP-level errors — the server returned a result but flagged it as an error.
    // Throw so the agent loop sees it as a failure and reports it properly,
    // instead of silently treating error text as "no data."
    if (result.isError) {
      const errorText =
        typeof extracted === "string" ? extracted : JSON.stringify(extracted);
      throw new Error(`[${toolInfo.server}] ${toolName} error: ${errorText}`);
    }

    return extracted;
  }

  /**
   * Disconnect all servers
   */
  async dispose(): Promise<void> {
    for (const [name, client] of this.clients) {
      try {
        await client.close();
        logger.info({ server: name }, "Disconnected from MCP server");
      } catch (error) {
        logger.error(
          { error, server: name },
          "Error disconnecting from MCP server",
        );
      }
    }

    this.clients.clear();
    this.tools.clear();
  }

  /**
   * Get the server name (integration) a tool belongs to
   */
  getToolServer(toolName: string): string | null {
    return this.tools.get(toolName)?.server ?? null;
  }

  /**
   * Get stats about connected servers
   */
  getStats() {
    const stats: Record<string, number> = {};

    for (const toolInfo of this.tools.values()) {
      stats[toolInfo.server] = (stats[toolInfo.server] || 0) + 1;
    }

    return {
      connectedServers: this.clients.size,
      totalTools: this.tools.size,
      toolsByServer: stats,
    };
  }
}

export { MCPClientManager };
