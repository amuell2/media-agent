/**
 * McpClient.ts — MCP (Model Context Protocol) Client Implementation
 *
 * MCP is an open protocol (created by Anthropic) that standardizes how AI
 * applications communicate with external data sources and tools. Think of it
 * as a "USB-C port for AI" — a universal interface that lets any AI model
 * talk to any compatible service without custom integration code.
 *
 * Architecture overview:
 *
 *   ┌──────────────┐        JSON-RPC 2.0        ┌──────────────┐
 *   │  MCP Client  │  ◄──── over HTTP/SSE ────►  │  MCP Server  │
 *   │  (this file) │        (transport)          │ (tools, etc) │
 *   └──────────────┘                             └──────────────┘
 *
 * Under the hood, MCP uses JSON-RPC 2.0 as its wire format. Every request
 * (e.g. "list tools", "call tool X") is a JSON-RPC message with a method
 * name and params. The SDK abstracts this — we call `client.request()` with
 * a typed request object and a schema to validate the response.
 *
 * MCP servers expose three types of capabilities:
 *
 *   1. Tools     — Functions the LLM can call (e.g. "list_broadcasts",
 *                  "broadcast_analytics"). These are the primary way
 *                  an AI agent interacts with external systems.
 *
 *   2. Resources — Read-only data the client can fetch (e.g. a live feed
 *                  of active broadcasts). Resources are identified by URIs
 *                  like "broadcasts://active" and can be static or templated.
 *
 *   3. Prompts   — Reusable prompt templates stored on the server (e.g.
 *                  "draft_broadcast_report"). The server resolves arguments
 *                  and returns pre-built message arrays ready for the LLM.
 *
 * Transport:
 *   This client uses the Streamable HTTP transport, which combines standard
 *   HTTP POST for requests with Server-Sent Events (SSE) for streaming
 *   responses. Each connection establishes a session (identified by a
 *   session ID header) so the server can maintain state across requests.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  ListToolsResultSchema,
  CallToolResultSchema,
  ListPromptsResultSchema,
  GetPromptResultSchema,
  ListResourcesResultSchema,
  ReadResourceResultSchema,
  type CallToolRequest,
  type GetPromptRequest,
  type ListPromptsRequest,
  type ListResourcesRequest,
  type ListToolsRequest,
  type ReadResourceRequest,
} from "@modelcontextprotocol/sdk/types.js";

export interface McpClientOptions {
  serverUrl: string;
  clientName?: string;
  clientVersion?: string;
}

/**
 * The result of calling an MCP tool. Content is an array because a single
 * tool call can return multiple content blocks (text, images, etc.),
 * following the MCP content model.
 */
export interface ToolCallResult {
  content: Array<{
    type: string;
    text?: string;
    [key: string]: unknown;
  }>;
}

/**
 * A tool definition as advertised by an MCP server. The `inputSchema` is
 * a JSON Schema object describing the tool's parameters — this gets
 * converted to a Zod schema in ollamaService.ts so LangChain can
 * validate arguments before calling the tool.
 */
export interface Tool {
  name: string;
  title?: string | undefined;
  description?: string;
  inputSchema?: unknown;
  serverName?: string; // Track which server provides this tool
}

/**
 * An MCP prompt template. Prompts are server-side message templates that
 * accept arguments and return pre-built message arrays. Unlike tools
 * (which the LLM calls autonomously), prompts are typically selected
 * by the user to kick off a specific workflow.
 */
export interface Prompt {
  name: string;
  title?: string | undefined;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
  serverName?: string;
}

/**
 * An MCP resource descriptor. Resources are read-only data endpoints
 * identified by URIs (e.g. "broadcasts://active"). They can be:
 *   - Static: a fixed URI returning live data (like a REST GET endpoint)
 *   - Templated: a URI with placeholders (e.g. "analytics://broadcasts/{id}")
 *     that the server resolves dynamically
 */
export interface Resource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string | undefined;
  serverName?: string;
}

/**
 * The content returned when reading an MCP resource. Can be text
 * (e.g. JSON) or a base64-encoded blob (e.g. images).
 */
export interface ResourceContent {
  uri: string;
  mimeType?: string | undefined;
  text?: string;
  blob?: string;
}

/**
 * McpClient wraps the official MCP SDK Client, providing a simplified
 * interface for connecting to a single MCP server and interacting with
 * its tools, prompts, and resources.
 *
 * Lifecycle:
 *   1. Construct with server URL and optional client identity
 *   2. Call connect() — establishes transport + session
 *   3. Use listTools/callTool/listPrompts/getPrompt/listResources/readResource
 *   4. Call disconnect() when done
 */
export class McpClient {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  private serverUrl: string;
  private clientName: string;
  private clientVersion: string;
  /**
   * Session ID persists across the connection lifetime. MCP servers use
   * this to associate multiple requests with the same logical session,
   * enabling stateful interactions (e.g. caching, context tracking).
   */
  private sessionId?: string | undefined;
  private serverIdentifier: string;

  constructor(options: McpClientOptions, serverIdentifier?: string) {
    this.serverUrl = options.serverUrl;
    this.clientName = options.clientName || "api-mcp-client";
    this.clientVersion = options.clientVersion || "1.0.0";
    this.serverIdentifier = serverIdentifier || "default";
  }

  /**
   * Get the server identifier
   */
  getServerIdentifier(): string {
    return this.serverIdentifier;
  }

  /**
   * Connect to the MCP server.
   *
   * This performs the MCP handshake:
   *   1. Creates a Client instance with our identity (name + version)
   *   2. Opens a StreamableHTTPClientTransport to the server URL
   *   3. The SDK sends an "initialize" JSON-RPC request under the hood,
   *      which negotiates capabilities and establishes a session
   *   4. The server responds with a session ID (sent via the
   *      "Mcp-Session-Id" header), which we store for subsequent requests
   */
  async connect(): Promise<void> {
    if (this.client) {
      throw new Error("Already connected. Disconnect first.");
    }

    // Create the MCP client with our identity. The server sees this
    // during the initialize handshake.
    this.client = new Client(
      {
        name: this.clientName,
        version: this.clientVersion,
      },
      {
        capabilities: {
          // Declare client-side capabilities. Elicitation allows the server
          // to request additional input from the user via structured forms.
          elicitation: {
            form: {},
          },
        },
      },
    );

    // Set up error handler
    this.client.onerror = (error) => {
      console.error(`MCP Client error (${this.serverIdentifier}):`, error);
    };

    // Create the transport layer. StreamableHTTPClientTransport sends
    // JSON-RPC requests via HTTP POST and receives streaming responses
    // via SSE (Server-Sent Events). If we have an existing session ID
    // (e.g. from a previous connection), we include it so the server
    // can resume our session state.
    this.transport = new StreamableHTTPClientTransport(
      new URL(this.serverUrl),
      this.sessionId ? { sessionId: this.sessionId } : undefined,
    );

    // Connect triggers the MCP "initialize" handshake — the client and
    // server exchange their capabilities and agree on a protocol version.
    await this.client.connect(this.transport as any);
    this.sessionId = this.transport.sessionId ?? undefined;

    console.log(
      `Connected to MCP server "${this.serverIdentifier}" at ${this.serverUrl}`,
    );
    console.log(`Session ID: ${this.sessionId}`);
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    if (!this.client || !this.transport) {
      return;
    }

    try {
      await this.transport.close();
      this.client = null;
      this.transport = null;
      console.log(`Disconnected from MCP server "${this.serverIdentifier}"`);
    } catch (error) {
      console.error(
        `Error disconnecting from ${this.serverIdentifier}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.client !== null && this.transport !== null;
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string | undefined {
    return this.sessionId ?? undefined;
  }

  /**
   * Get the server URL
   */
  getServerUrl(): string {
    return this.serverUrl;
  }

  // ─── Tools ──────────────────────────────────────────────────────────
  // Tools are functions that the LLM can decide to call autonomously.
  // The server describes each tool's name, description, and parameter
  // schema. The LLM uses this information to decide WHEN to call a tool
  // and WHAT arguments to pass.

  /**
   * List all tools the server offers.
   *
   * Sends a "tools/list" JSON-RPC request. The server responds with an
   * array of tool definitions including their JSON Schema input schemas.
   * We tag each tool with our serverIdentifier so the McpClientManager
   * can route tool calls to the correct server.
   */
  async listTools(): Promise<Tool[]> {
    if (!this.client) {
      throw new Error("Not connected to server");
    }

    const request: ListToolsRequest = {
      method: "tools/list",
      params: {},
    };

    const result = await this.client.request(request, ListToolsResultSchema);
    return result.tools.map((tool: any) => ({
      name: tool.name,
      title: ("title" in tool ? (tool.title as string) : undefined) as
        | string
        | undefined,
      description: tool.description,
      inputSchema: tool.inputSchema,
      serverName: this.serverIdentifier,
    }));
  }

  /**
   * Call a tool by name with arguments.
   *
   * Sends a "tools/call" JSON-RPC request. The server executes the tool
   * (e.g. fetching data from a REST API) and returns the result as an
   * array of content blocks. The result flows back to the LLM as an
   * "observation" in the ReAct loop (see ollamaService.ts).
   */
  async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<ToolCallResult> {
    if (!this.client) {
      throw new Error("Not connected to server");
    }

    const request: CallToolRequest = {
      method: "tools/call",
      params: {
        name,
        arguments: args,
      },
    };

    const result = await this.client.request(request, CallToolResultSchema);
    return result;
  }

  // ─── Prompts ────────────────────────────────────────────────────────
  // Prompts are reusable message templates stored on the server.
  // Unlike tools (which the LLM calls), prompts are chosen by the USER
  // to provide structured instructions to the LLM. The server resolves
  // any template arguments and returns ready-to-use message arrays.

  /**
   * List all prompt templates available on this server.
   *
   * Sends a "prompts/list" JSON-RPC request. Each prompt includes its
   * name, description, and a list of arguments it accepts.
   */
  async listPrompts(): Promise<Prompt[]> {
    if (!this.client) {
      throw new Error("Not connected to server");
    }

    const request: ListPromptsRequest = {
      method: "prompts/list",
      params: {},
    };

    const result = await this.client.request(request, ListPromptsResultSchema);
    return result.prompts.map((prompt: any) => ({
      name: prompt.name,
      title: ("title" in prompt ? (prompt.title as string) : undefined) as
        | string
        | undefined,
      description: prompt.description,
      arguments: prompt.arguments,
      serverName: this.serverIdentifier,
    }));
  }

  /**
   * Resolve a prompt template with arguments.
   *
   * Sends a "prompts/get" JSON-RPC request. The server fills in the
   * template variables and may also fetch live data to include in the
   * prompt (e.g. the analytics prompt fetches real broadcast data and
   * embeds it directly into the message text).
   */
  async getPrompt(
    name: string,
    args: Record<string, string> = {},
  ): Promise<unknown> {
    if (!this.client) {
      throw new Error("Not connected to server");
    }

    const request: GetPromptRequest = {
      method: "prompts/get",
      params: {
        name,
        arguments: args,
      },
    };

    const result = await this.client.request(request, GetPromptResultSchema);
    return result;
  }

  // ─── Resources ──────────────────────────────────────────────────────
  // Resources are read-only data endpoints identified by URIs. They let
  // the user (or the application) attach contextual data to a conversation
  // without requiring the LLM to call a tool. Resources are similar to
  // GET endpoints in REST — they provide data but don't cause side effects.

  /**
   * List all resources this server makes available.
   *
   * Sends a "resources/list" JSON-RPC request. The server returns both
   * static resources (fixed URIs) and any resources generated from
   * templates (e.g. one entry per broadcast for a templated resource).
   */
  async listResources(): Promise<Resource[]> {
    if (!this.client) {
      throw new Error("Not connected to server");
    }

    const request: ListResourcesRequest = {
      method: "resources/list",
      params: {},
    };

    const result = await this.client.request(
      request,
      ListResourcesResultSchema,
    );
    return result.resources.map((resource: any) => ({
      uri: resource.uri,
      name: resource.name,
      description: resource.description,
      mimeType: resource.mimeType as string | undefined,
      serverName: this.serverIdentifier,
    }));
  }

  /**
   * Read a resource's content by URI.
   *
   * Sends a "resources/read" JSON-RPC request. The server fetches the
   * data (e.g. from an internal API) and returns it as content blocks.
   * Content can be text (JSON, markdown, etc.) or base64-encoded blobs.
   */
  async readResource(uri: string): Promise<ResourceContent[]> {
    if (!this.client) {
      throw new Error("Not connected to server");
    }

    const request: ReadResourceRequest = {
      method: "resources/read",
      params: { uri },
    };

    const result = await this.client.request(request, ReadResourceResultSchema);
    return result.contents.map((content: any) => ({
      uri: content.uri,
      mimeType: content.mimeType as string | undefined,
      text: content.text,
      blob: content.blob,
    }));
  }
}
