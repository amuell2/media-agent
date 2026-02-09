/**
 * McpClientManager.ts — Multi-Server MCP Client Orchestrator
 *
 * In a real-world AI application, you rarely talk to just one MCP server.
 * Different domains (broadcasting, analytics, billing, etc.) each run
 * their own MCP server with domain-specific tools, resources, and prompts.
 *
 * This manager solves the multi-server problem:
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │                    McpClientManager                        │
 *   │                                                             │
 *   │  "list_broadcasts" ──► broadcast server (port 3000)        │
 *   │  "broadcast_analytics" ──► analytics server (port 3010)    │
 *   │                                                             │
 *   │  The LLM just calls a tool by name — the manager figures   │
 *   │  out which server owns it and routes the call accordingly.  │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Key responsibilities:
 *
 *   1. Connection lifecycle — Connect/disconnect to multiple MCP servers,
 *      handling failures gracefully (one server failing doesn't block others).
 *
 *   2. Tool routing — Maintains a cache mapping tool names to server names.
 *      When the LLM calls "list_broadcasts", the manager knows to route it
 *      to the "broadcast" server without checking every server.
 *
 *   3. Capability aggregation — Merges tools, prompts, and resources from
 *      all connected servers into unified lists. The rest of the application
 *      doesn't need to know which server provides what.
 *
 *   4. Singleton access — A module-level singleton provides easy access
 *      from anywhere in the API (e.g. from ollamaService.ts when building
 *      LangChain tools, or from index.ts when handling REST endpoints).
 */

import {
  McpClient,
  type McpClientOptions,
  type Tool,
  type Prompt,
  type Resource,
  type ToolCallResult,
} from "./McpClient.js";

/**
 * Configuration for a single MCP server connection.
 * The API server maintains an array of these configs (one per MCP server)
 * and passes them to the manager during startup.
 */
export interface McpServerConfig {
  name: string;
  url: string;
  enabled?: boolean;
}

/**
 * Manager for multiple MCP clients.
 *
 * This class is the single point of contact between the API server and
 * all MCP servers. It abstracts away the complexity of managing multiple
 * connections and routing requests to the right server.
 */
export class McpClientManager {
  /**
   * Map of server name → McpClient instance.
   * Each entry represents an active connection to one MCP server.
   */
  private clients: Map<string, McpClient> = new Map();

  /**
   * Tool routing cache: maps tool name → server name.
   *
   * When a tool is first discovered (during `addServer`), we record which
   * server provides it. This lets `callTool` route directly to the correct
   * server in O(1) without querying all servers every time.
   *
   * If a tool isn't in the cache (e.g. a server added a tool dynamically),
   * `callTool` falls back to searching all servers and updates the cache.
   */
  private toolToServerMap: Map<string, string> = new Map();

  private clientName: string;
  private clientVersion: string;

  constructor(
    clientName: string = "api-mcp-client",
    clientVersion: string = "1.0.0",
  ) {
    this.clientName = clientName;
    this.clientVersion = clientVersion;
  }

  /**
   * Add and connect to an MCP server.
   *
   * This is called during API startup for each configured server. The
   * method is resilient — if a server fails to connect, it logs the error
   * but doesn't throw, allowing other servers to still be added.
   *
   * After connecting, it eagerly fetches the server's tool list to
   * populate the tool routing cache.
   */
  async addServer(config: McpServerConfig): Promise<void> {
    if (config.enabled === false) {
      console.log(`MCP server "${config.name}" is disabled, skipping`);
      return;
    }

    if (this.clients.has(config.name)) {
      console.log(`MCP server "${config.name}" already exists, skipping`);
      return;
    }

    const client = new McpClient(
      {
        serverUrl: config.url,
        clientName: this.clientName,
        clientVersion: this.clientVersion,
      },
      config.name,
    );

    try {
      await client.connect();
      this.clients.set(config.name, client);

      // Eagerly cache tool-to-server mappings so callTool can route
      // requests without querying servers at call time.
      const tools = await client.listTools();
      for (const tool of tools) {
        this.toolToServerMap.set(tool.name, config.name);
      }

      console.log(
        `Added MCP server "${config.name}" with ${tools.length} tools`,
      );
    } catch (error) {
      console.error(`Failed to connect to MCP server "${config.name}":`, error);
      // Don't throw — allow other servers to connect even if one fails.
      // The system degrades gracefully: tools from this server won't be
      // available, but everything else still works.
    }
  }

  /**
   * Add multiple servers concurrently.
   * Uses Promise.all so all servers connect in parallel for faster startup.
   */
  async addServers(configs: McpServerConfig[]): Promise<void> {
    await Promise.all(configs.map((config) => this.addServer(config)));
  }

  /**
   * Get all connected clients.
   * Used by REST endpoints (e.g. /mcp/prompts/:name) that need to search
   * across servers for a specific capability.
   */
  getAllClients(): McpClient[] {
    return Array.from(this.clients.values());
  }

  /**
   * Check if any client is connected.
   * Used as a guard before attempting MCP operations — if no servers are
   * connected, the API returns 503 instead of failing with cryptic errors.
   */
  hasConnectedClients(): boolean {
    return Array.from(this.clients.values()).some((client) =>
      client.isConnected(),
    );
  }

  /**
   * Get the connection status of all servers.
   * Powers the /mcp/status REST endpoint and the web UI's connections panel.
   */
  getStatus(): Array<{
    name: string;
    url: string;
    connected: boolean;
    sessionId?: string | undefined;
  }> {
    return Array.from(this.clients.entries()).map(([name, client]) => ({
      name,
      url: client.getServerUrl(),
      connected: client.isConnected(),
      sessionId: client.getSessionId(),
    }));
  }

  // ─── Aggregated capability accessors ──────────────────────────────
  // These methods collect capabilities from ALL connected servers into
  // unified lists. The consumers (LangChain tool builder, REST endpoints,
  // web UI) work with flat arrays without knowing about server boundaries.

  /**
   * List all tools from all connected servers.
   *
   * This is called by:
   *   - ollamaService.ts → to build LangChain DynamicStructuredTools
   *   - REST endpoint GET /mcp/tools → to show available tools in the UI
   *
   * Each tool already has a `serverName` field (set by McpClient.listTools)
   * so consumers can still identify which server a tool came from.
   */
  async listAllTools(): Promise<Tool[]> {
    const allTools: Tool[] = [];

    for (const client of this.clients.values()) {
      if (client.isConnected()) {
        try {
          const tools = await client.listTools();
          allTools.push(...tools);
        } catch (error) {
          console.error(
            `Error listing tools from ${client.getServerIdentifier()}:`,
            error,
          );
        }
      }
    }

    return allTools;
  }

  /**
   * Call a tool by name — automatically routes to the correct server.
   *
   * Routing strategy:
   *   1. Check the tool routing cache (fast path, O(1) lookup)
   *   2. If not cached, search all servers for the tool (slow path)
   *   3. If found, update the cache for future calls
   *   4. If not found anywhere, throw an error
   *
   * This is the method that ollamaService.ts calls from within the
   * LangChain DynamicStructuredTool's `func` callback — the LLM decides
   * to call a tool, LangChain validates the args, and we route the call
   * to the correct MCP server here.
   */
  async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<ToolCallResult> {
    // Fast path: use the cached server mapping
    const serverName = this.toolToServerMap.get(name);

    if (serverName) {
      const client = this.clients.get(serverName);
      if (client?.isConnected()) {
        return client.callTool(name, args);
      }
    }

    // Slow path: tool not in cache (maybe server added it dynamically),
    // so search all connected servers.
    for (const client of this.clients.values()) {
      if (client.isConnected()) {
        try {
          const tools = await client.listTools();
          const hasTool = tools.some((t) => t.name === name);
          if (hasTool) {
            // Update cache for future calls
            this.toolToServerMap.set(name, client.getServerIdentifier());
            return client.callTool(name, args);
          }
        } catch (error) {
          // Continue to next server — this one might be having issues
        }
      }
    }

    throw new Error(`Tool "${name}" not found on any connected MCP server`);
  }

  /**
   * List all prompts from all connected servers.
   * Powers the /mcp/prompts REST endpoint and the attach menu in the web UI.
   */
  async listAllPrompts(): Promise<Prompt[]> {
    const allPrompts: Prompt[] = [];

    for (const client of this.clients.values()) {
      if (client.isConnected()) {
        try {
          const prompts = await client.listPrompts();
          allPrompts.push(...prompts);
        } catch (error) {
          console.error(
            `Error listing prompts from ${client.getServerIdentifier()}:`,
            error,
          );
        }
      }
    }

    return allPrompts;
  }

  /**
   * List all resources from all connected servers.
   * Powers the /mcp/resources REST endpoint and the attach menu in the web UI.
   */
  async listAllResources(): Promise<Resource[]> {
    const allResources: Resource[] = [];

    for (const client of this.clients.values()) {
      if (client.isConnected()) {
        try {
          const resources = await client.listResources();
          allResources.push(...resources);
        } catch (error) {
          console.error(
            `Error listing resources from ${client.getServerIdentifier()}:`,
            error,
          );
        }
      }
    }

    return allResources;
  }

  /**
   * Disconnect all clients and clear internal state.
   * Called during graceful shutdown (SIGINT/SIGTERM) to cleanly close
   * all MCP sessions and free server-side resources.
   */
  async disconnectAll(): Promise<void> {
    for (const client of this.clients.values()) {
      try {
        await client.disconnect();
      } catch (error) {
        console.error(
          `Error disconnecting from ${client.getServerIdentifier()}:`,
          error,
        );
      }
    }
    this.clients.clear();
    this.toolToServerMap.clear();
  }
}

// ─── Singleton pattern ────────────────────────────────────────────────
// The MCP client manager is a singleton because we want exactly one set
// of MCP connections shared across the entire API process. Multiple
// consumers (the chat endpoint, REST proxy routes, LangChain tool builder)
// all need access to the same pool of connected MCP servers.
//
// Usage:
//   import { getMcpClientManager } from "./mcp/client.js";
//   const manager = getMcpClientManager();
//   const tools = await manager.listAllTools();

let mcpClientManagerInstance: McpClientManager | null = null;

/**
 * Get or create the MCP client manager singleton.
 *
 * The first call creates the instance with the provided client identity.
 * Subsequent calls return the same instance (arguments are ignored).
 */
export function getMcpClientManager(
  clientName?: string,
  clientVersion?: string,
): McpClientManager {
  if (!mcpClientManagerInstance) {
    mcpClientManagerInstance = new McpClientManager(clientName, clientVersion);
  }

  return mcpClientManagerInstance;
}
