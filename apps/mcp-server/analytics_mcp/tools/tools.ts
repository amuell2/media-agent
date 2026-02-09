/**
 * tools.ts — MCP Tool Registration for the Analytics Server
 *
 * This follows the same tool registration pattern as the broadcasting server
 * (see broadcasting-mcp/tools/tools.ts for a detailed explanation of how MCP
 * tools work end-to-end: registration → discovery → conversion → binding →
 * invocation → execution).
 *
 * Key difference from the broadcasting tool:
 *
 *   broadcasting "list_broadcasts"     →  ALL params optional, returns a LIST
 *   analytics   "broadcast_analytics"  →  broadcastId REQUIRED, returns a SINGLE record
 *
 *   The broadcasting tool is a "search/filter" tool — the LLM calls it to
 *   browse broadcasts. The analytics tool is a "detail/lookup" tool — the LLM
 *   calls it when it needs deep metrics for a specific broadcast. These two
 *   tools often work together in a ReAct loop:
 *
 *     1. LLM calls list_broadcasts → gets broadcast IDs
 *     2. LLM calls broadcast_analytics(broadcastId) → gets detailed metrics
 *     3. LLM synthesizes both results into its answer
 *
 *   The McpClientManager routes step 1 to the broadcasting server (port 3000)
 *   and step 2 to this analytics server (port 3010) — transparently.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

/**
 * Base URL for the Analytics REST API (a separate mock service that stores
 * viewer metrics, engagement data, quality stats, and demographics).
 */
const ANALYTICS_API_URL =
  process.env.ANALYTICS_API_URL || "http://localhost:3005";

/**
 * Entry point: register all analytics-related tools.
 * Called from index.ts during server initialization.
 */
export function registerTools(server: McpServer) {
  registerBroadcastAnalytics(server);
}

/**
 * Register the "broadcast_analytics" tool.
 *
 * Unlike the broadcasting server's "list_broadcasts" (which has all-optional
 * params), this tool has a REQUIRED parameter — `broadcastId`. This means
 * the LLM must know which broadcast to analyze before calling this tool.
 * Typically the LLM discovers broadcast IDs by calling list_broadcasts first.
 *
 * The tool returns detailed analytics for a single broadcast: viewer counts,
 * peak viewers, watch time, engagement metrics, and more. The LLM uses this
 * data to answer questions like "How is broadcast br_001 performing?" or to
 * compile the analytics section of a broadcast report.
 */
function registerBroadcastAnalytics(server: McpServer) {
  server.registerTool(
    "broadcast_analytics",
    {
      description: "Returns analytics data for a specific broadcast",
      inputSchema: {
        // Unlike list_broadcasts (where all params are optional), broadcastId
        // is REQUIRED here — z.string() without .optional() means the LLM
        // must provide a value. The LLM learns which IDs exist by first
        // calling list_broadcasts on the other MCP server.
        broadcastId: z.string().max(25).describe("Broadcast ID"),
      },
    },
    async ({ broadcastId }): Promise<CallToolResult> => {
      try {
        // Fetch detailed analytics from the Analytics REST API.
        // The broadcastId is interpolated into the URL path (not as a query param)
        // because this is a single-resource lookup, not a filtered list.
        const url = `${ANALYTICS_API_URL}/api/analytics/broadcasts/${broadcastId}`;
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(
            `Analytics API returned ${response.status}: ${response.statusText}`,
          );
        }

        const data = await response.json();

        // Return analytics data as pretty-printed JSON. The LLM parses
        // this to extract viewer metrics, engagement rates, quality stats,
        // etc. for its answer.
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (error) {
        // Return errors as content with isError flag (same pattern as
        // broadcasting tools — see broadcasting-mcp/tools/tools.ts for
        // a detailed explanation of error handling in MCP tools).
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Error fetching analytics: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
