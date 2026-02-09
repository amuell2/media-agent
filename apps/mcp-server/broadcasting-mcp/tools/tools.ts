/**
 * tools.ts — MCP Tool Registration for the Broadcasting Server
 *
 * MCP Tools are the primary way an LLM interacts with external systems.
 * A tool is essentially a function that the AI model can call autonomously
 * during a conversation when it needs real-time data or wants to perform
 * an action.
 *
 * How tools work end-to-end:
 *
 *   1. REGISTRATION (this file):
 *      We call server.registerTool() to register a tool with:
 *        - A unique name (e.g. "list_broadcasts")
 *        - A human-readable description (the LLM reads this to decide WHEN to use the tool)
 *        - A parameter schema (Zod validators that define WHAT arguments the tool accepts)
 *        - An async handler function (the code that runs WHEN the tool is called)
 *
 *   2. DISCOVERY (client side):
 *      When the API server connects, it sends a "tools/list" JSON-RPC request.
 *      The MCP SDK automatically returns all registered tools with their names,
 *      descriptions, and JSON Schema representations of the Zod parameter schemas.
 *
 *   3. CONVERSION (ollamaService.ts):
 *      The API server converts these MCP tool definitions into LangChain
 *      DynamicStructuredTools, translating JSON Schema → Zod schemas so
 *      LangChain can validate arguments before calling.
 *
 *   4. BINDING (ollamaService.ts):
 *      LangChain binds the tools to the Ollama model via model.bindTools().
 *      This includes tool definitions in every prompt sent to the LLM,
 *      so the model knows what tools are available and how to call them.
 *
 *   5. INVOCATION (ReAct loop in ollamaService.ts):
 *      During a conversation, if the LLM decides it needs broadcast data,
 *      it emits a structured tool_call (not text) with the tool name and
 *      arguments. LangChain intercepts this, validates the args against
 *      the Zod schema, and calls the tool's func() — which routes through
 *      McpClientManager → McpClient → back to THIS server's handler.
 *
 *   6. EXECUTION (this file's handler):
 *      The handler function runs (e.g. fetches data from the Broadcast API),
 *      and returns a CallToolResult with content blocks. This result flows
 *      back through the chain as a ToolMessage that the LLM reads as an
 *      "observation" in the ReAct loop.
 *
 * Tool design best practices:
 *   - Descriptions matter: The LLM uses the description to decide when to call
 *     a tool. Be specific about what the tool does and what it returns.
 *   - Mark optional params clearly: LLMs often struggle with optional parameters.
 *     Use .optional() and descriptive .describe() strings so the model knows
 *     it can omit them.
 *   - Return structured data: JSON output lets the LLM parse and reason about
 *     the data. Avoid returning raw HTML or unstructured text.
 *   - Handle errors gracefully: Return { isError: true } with an error message
 *     instead of throwing. This lets the LLM see the error and try a different
 *     approach in the next ReAct cycle.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

/**
 * Base URL for the Broadcast REST API (a separate mock service that
 * stores broadcast data). The MCP server acts as a bridge between the
 * AI system and this API — the LLM can't call REST APIs directly, but
 * it CAN call MCP tools, which in turn call the REST API.
 */
const BROADCAST_API_URL =
  process.env.BROADCAST_API_URL || "http://localhost:3003";

/**
 * Entry point: register all broadcasting-related tools on the MCP server.
 * Called from index.ts during server initialization.
 *
 * Each tool is registered in its own function for clarity and to make it
 * easy to add more tools later (just add a new register function and
 * call it here).
 */
export function registerTools(server: McpServer) {
  registerListBroadcastTool(server);
}

/**
 * Register the "list_broadcasts" tool.
 *
 * This tool allows the LLM to query broadcast data with optional filters.
 * It's the most frequently called tool in the system — the ReAct agent
 * uses it whenever the user asks about broadcasts, channels, or streaming.
 *
 * Parameter design:
 *   Both `status` and `channelId` are OPTIONAL. This is important because:
 *   - The LLM can call with {} to get ALL broadcasts (most common case)
 *   - The LLM can filter by status ("live", "scheduled", "completed")
 *   - The LLM can filter by channel ("ch_001", etc.)
 *   - Filters can be combined (status + channelId)
 *
 *   The .describe() strings are critical — the LLM reads them to understand
 *   what values are valid and when to use each parameter.
 */
function registerListBroadcastTool(server: McpServer) {
  server.registerTool(
    // ── Tool name ──────────────────────────────────────────────────
    // This is the identifier the LLM uses in tool_calls. It should be
    // snake_case, descriptive, and unique across all MCP servers
    // (the McpClientManager aggregates tools from multiple servers).
    "list_broadcasts",

    // ── Tool config ────────────────────────────────────────────────
    {
      // ── Tool description ─────────────────────────────────────────
      // The LLM reads this description to decide WHETHER and WHEN to call
      // the tool. A good description explains:
      //   - What the tool does ("List all broadcasts")
      //   - What it returns (implied by "list")
      //   - How to call it ("Call with empty object {} to get all")
      //   - What the optional parameters do
      description:
        "List all broadcasts. Call with empty object {} to get all broadcasts. Optionally filter by status or channelId - both parameters are OPTIONAL.",

      // ── Input schema (Zod) ───────────────────────────────────────
      // The MCP SDK uses Zod schemas to define and validate tool parameters.
      // At registration time, the SDK converts these to JSON Schema for the
      // "tools/list" response. At call time, the SDK validates incoming
      // arguments against the Zod schema before invoking the handler.
      //
      // .max(50) / .max(25) add length limits to prevent abuse or
      // unexpectedly large inputs from the LLM.
      inputSchema: {
        status: z
          .string()
          .max(50)
          .optional()
          .describe(
            "OPTIONAL: Filter by status (e.g., 'live', 'scheduled', 'completed'). Omit to get all statuses.",
          ),
        channelId: z
          .string()
          .max(25)
          .optional()
          .describe(
            "OPTIONAL: Filter by channel id. Omit to get all channels.",
          ),
      },
    },

    // ── Handler function ───────────────────────────────────────────
    // This runs when the tool is called. The destructured parameters
    // ({ status, channelId }) are already validated by Zod. The handler:
    //   1. Builds a URL with optional query parameters
    //   2. Fetches data from the Broadcast REST API
    //   3. Returns the result as a CallToolResult
    //
    // CallToolResult contains an array of "content" blocks. Each block
    // has a type ("text", "image", "resource") and type-specific fields.
    // For API data, we return a single text block with formatted JSON.
    async ({ status, channelId }): Promise<CallToolResult> => {
      try {
        // Build the URL with optional query parameters.
        // If the LLM called the tool with {}, both params are undefined
        // and we fetch all broadcasts without filters.
        const params = new URLSearchParams();
        if (status) params.append("status", status);
        if (channelId) params.append("channelId", channelId);

        const url = `${BROADCAST_API_URL}/api/broadcasts${params.toString() ? `?${params.toString()}` : ""}`;
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(
            `Broadcast API returned ${response.status}: ${response.statusText}`,
          );
        }

        const data = await response.json();

        // ── Success response ────────────────────────────────────────
        // Return the data as pretty-printed JSON in a text content block.
        // The LLM will parse this JSON, extract the relevant information,
        // and use it to formulate its answer to the user.
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (error) {
        // ── Error response ──────────────────────────────────────────
        // Instead of throwing (which would crash the MCP request), we
        // return an error result with isError: true. The LLM receives
        // this as an "observation" in the ReAct loop and can decide how
        // to handle it — retry with different params, try another tool,
        // or inform the user about the issue.
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Error fetching broadcasts: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
