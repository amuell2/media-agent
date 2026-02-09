/**
 * resources.ts — MCP Resource Registration for the Broadcasting Server
 *
 * MCP Resources are read-only data endpoints that provide contextual
 * information to AI applications. They are conceptually similar to GET
 * endpoints in a REST API — they return data but don't cause side effects.
 *
 * Resources vs Tools — when to use which:
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  Resources                        │  Tools                      │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │  Read-only data                   │  Can read AND write         │
 *   │  Selected by the USER             │  Called by the LLM          │
 *   │  Attached as context              │  Invoked during ReAct loop  │
 *   │  Identified by URI                │  Identified by name         │
 *   │  Like a GET endpoint              │  Like a POST/RPC endpoint   │
 *   │  "Here's some data for context"   │  "Go fetch/do this thing"   │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 *   In practice, a USER browses available resources in the UI (via the
 *   attach menu), selects one, and its content is included in the next
 *   message as context. The LLM sees the data but didn't request it —
 *   the user decided it was relevant.
 *
 *   Tools, on the other hand, are called AUTONOMOUSLY by the LLM during
 *   the ReAct loop when it decides it needs more information.
 *
 * Resource URI schemes:
 *
 *   Resources are identified by URIs with custom schemes, similar to how
 *   "mailto:" or "tel:" work in the browser. For example:
 *
 *     broadcasts://active        → All currently live broadcasts
 *     analytics://channels/overview → Channel analytics summary
 *     analytics://broadcasts/{id}   → Analytics for a specific broadcast
 *
 *   The scheme (e.g. "broadcasts://") is arbitrary — it's just a namespace
 *   convention that helps organize resources logically. MCP clients use
 *   these URIs to identify and fetch resources via "resources/read" requests.
 *
 * Static vs Templated resources:
 *
 *   Static resources have a fixed URI (e.g. "broadcasts://active").
 *   They always return the same "kind" of data, though the data itself
 *   may change over time (e.g. the list of active broadcasts updates
 *   as broadcasts start and end).
 *
 *   Templated resources (see analytics_mcp/resources/resources.ts for an
 *   example) use URI templates with placeholders like {broadcastId}. The
 *   server expands these into concrete URIs via a `list` callback, enabling
 *   dynamic resource discovery (e.g. one resource per broadcast).
 *
 *   This file registers a STATIC resource — "broadcasts://active" always
 *   points to the same endpoint, but the returned data reflects the
 *   current live broadcasts at the time of the read.
 *
 * Registration flow:
 *
 *   1. server.registerResource() stores the resource definition
 *   2. When a client sends "resources/list", the SDK returns all
 *      registered resources with their URIs, names, and descriptions
 *   3. When a client sends "resources/read" with a specific URI,
 *      the SDK invokes the matching handler function
 *   4. The handler fetches the data (here, from the Broadcast REST API)
 *      and returns it as content blocks
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Base URL for the Broadcast REST API. The MCP resource handler fetches
 * live broadcast data from this service and returns it to the client.
 */
const BROADCAST_API_URL =
  process.env.BROADCAST_API_URL || "http://localhost:3003";

/**
 * Entry point: register all broadcasting-related resources.
 * Called from index.ts during server initialization.
 */
export function registerResources(server: McpServer) {
  registerActiveBroadcastsResource(server);
}

/**
 * Register the "active-broadcasts" resource.
 *
 * This is a STATIC resource — it has a fixed URI ("broadcasts://active")
 * that always returns the currently live broadcasts. The data changes
 * over time (as broadcasts start and end), but the URI is constant.
 *
 * server.registerResource() takes four arguments:
 *
 *   1. name — A unique identifier used internally by the SDK to match
 *      incoming "resources/read" requests to the correct handler.
 *
 *   2. uri — The resource's URI string. This is what clients see in
 *      "resources/list" responses and use in "resources/read" requests.
 *      For static resources, this is a plain string. For templated
 *      resources, this would be a ResourceTemplate instance.
 *
 *   3. metadata — Additional information about the resource:
 *        - description: Human-readable text shown in the UI
 *        - mimeType: The content type of the returned data. Clients
 *          can use this to decide how to render the content (e.g.
 *          JSON viewer vs plain text vs markdown).
 *
 *   4. handler — An async function called when a client reads this
 *      resource. Receives the parsed URI and must return an object
 *      with a `contents` array of content blocks.
 */
function registerActiveBroadcastsResource(server: McpServer) {
  server.registerResource(
    // Resource name (internal identifier)
    "active-broadcasts",

    // Resource URI — the stable identifier clients use to read this resource.
    // Uses a custom "broadcasts://" scheme to namespace broadcasting resources
    // separately from analytics resources ("analytics://").
    "broadcasts://active",

    // Resource metadata — displayed in the UI's resource list and attach menu
    {
      description:
        "A live-updating list of all currently active (live) broadcasts, including viewer counts, channels, and stream metadata.",
      mimeType: "application/json",
    },

    // Handler function — called when a client sends "resources/read"
    // with uri "broadcasts://active". The `uri` parameter is a URL
    // object parsed from the resource URI string.
    async (uri) => {
      try {
        // Fetch live broadcasts from the Broadcast REST API.
        // The ?status=live filter ensures we only return currently
        // active broadcasts, matching the resource's description.
        const url = `${BROADCAST_API_URL}/api/broadcasts?status=live`;
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(
            `Broadcast API returned ${response.status}: ${response.statusText}`,
          );
        }

        const data = await response.json();

        // ── Success response ────────────────────────────────────────
        // Return the data as a content block. The structure mirrors
        // tool results (array of typed content blocks), but resources
        // also include the URI so clients can correlate the content
        // with the resource that produced it.
        //
        // uri.href gives us the string form of the URI ("broadcasts://active")
        // to include in the response.
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (error) {
        // ── Error handling ───────────────────────────────────────────
        // Unlike tools (which have an `isError` flag), resources return
        // errors as content — the URI and mimeType are still present,
        // but the text contains an error message wrapped in JSON.
        // This ensures the client always gets a valid response structure.
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(
                { error: `Failed to fetch active broadcasts: ${errorMessage}` },
                null,
                2,
              ),
            },
          ],
        };
      }
    },
  );
}
