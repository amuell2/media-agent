/**
 * resources.ts — MCP Resource Registration for the Analytics Server
 *
 * This file registers two MCP resources that demonstrate both resource types:
 *
 *   1. STATIC resource — "analytics://channels/overview"
 *      A fixed URI that always returns a channel-level analytics summary.
 *      Same pattern as the broadcasting server's "broadcasts://active"
 *      (see broadcasting-mcp/resources/resources.ts for a detailed
 *      explanation of static resources).
 *
 *   2. TEMPLATED resource — "analytics://broadcasts/{broadcastId}"
 *      A URI template with a placeholder. The server expands this into
 *      concrete URIs (one per broadcast) via a `list` callback, enabling
 *      DYNAMIC RESOURCE DISCOVERY.
 *
 * Static vs Templated resources:
 *
 *   Static:    "analytics://channels/overview"
 *              → One fixed URI, one handler
 *              → Client always knows the URI upfront
 *
 *   Templated: "analytics://broadcasts/{broadcastId}"
 *              → URI pattern with placeholders
 *              → Server provides a `list` callback that returns concrete URIs
 *                (e.g. "analytics://broadcasts/br_001", ".../br_002", etc.)
 *              → Each concrete URI resolves to different data
 *              → The set of available URIs changes dynamically as broadcasts
 *                are created or removed
 *
 * Templated resources are powerful for domains where the set of available
 * data items isn't known in advance. The MCP client calls "resources/list"
 * and gets back a dynamically generated list of resources — one per
 * broadcast, one per user, one per channel, etc.
 */

import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";

/** Base URL for the Analytics REST API (viewer metrics, engagement, etc.) */
const ANALYTICS_API_URL =
  process.env.ANALYTICS_API_URL || "http://localhost:3005";

/** Base URL for the Broadcast REST API (broadcast metadata, used to discover broadcast IDs) */
const BROADCAST_API_URL =
  process.env.BROADCAST_API_URL || "http://localhost:3003";

/**
 * Entry point: register all analytics-related resources.
 * Called from index.ts during server initialization.
 */
export function registerResources(server: McpServer) {
  registerChannelsOverviewResource(server);
  registerBroadcastAnalyticsResource(server);
}

/**
 * Register the "channels-overview" STATIC resource.
 *
 * This is a static resource (fixed URI) that aggregates data from BOTH
 * the Broadcast API and the Analytics API to produce a channel-level
 * summary. It demonstrates that resource handlers can combine data from
 * multiple sources — something the LLM would need multiple tool calls
 * to achieve on its own.
 *
 * The handler:
 *   1. Fetches all broadcasts from the Broadcast API
 *   2. Groups them by channel and computes per-channel statistics
 *   3. Enriches each channel with analytics data (current viewers, watch time)
 *   4. Returns the combined overview as a single JSON document
 *
 * This makes it ideal as an "attach and go" resource — the user attaches
 * it to a message and the LLM immediately has a full picture of all
 * channels without needing to make any tool calls.
 */
function registerChannelsOverviewResource(server: McpServer) {
  server.registerResource(
    "channels-overview",
    "analytics://channels/overview",
    {
      description:
        "An overview of all channels with broadcast counts, total views, and current viewer numbers.",
    },
    async (uri) => {
      try {
        // Fetch all broadcasts to derive per-channel statistics
        const broadcastsResponse = await fetch(
          `${BROADCAST_API_URL}/api/broadcasts`,
        );

        if (!broadcastsResponse.ok) {
          throw new Error(
            `Broadcast API returned ${broadcastsResponse.status}: ${broadcastsResponse.statusText}`,
          );
        }

        const broadcastsData = await broadcastsResponse.json();
        const broadcasts = broadcastsData.broadcasts || [];

        // ── Aggregate broadcasts by channel ─────────────────────────
        // Build a per-channel summary by iterating through all broadcasts
        // and accumulating counts and metrics. This server-side aggregation
        // is more efficient than having the LLM do it from raw broadcast data.
        const channelMap: Record<
          string,
          {
            channelId: string;
            totalBroadcasts: number;
            liveBroadcasts: number;
            completedBroadcasts: number;
            scheduledBroadcasts: number;
            totalViews: number;
            peakViewersAllTime: number;
          }
        > = {};

        for (const broadcast of broadcasts) {
          const chId = broadcast.channelId;
          if (!channelMap[chId]) {
            channelMap[chId] = {
              channelId: chId,
              totalBroadcasts: 0,
              liveBroadcasts: 0,
              completedBroadcasts: 0,
              scheduledBroadcasts: 0,
              totalViews: 0,
              peakViewersAllTime: 0,
            };
          }

          const entry = channelMap[chId];
          entry.totalBroadcasts++;
          entry.totalViews += broadcast.totalViews || 0;
          entry.peakViewersAllTime = Math.max(
            entry.peakViewersAllTime,
            broadcast.peakViewers || 0,
          );

          if (broadcast.status === "live") entry.liveBroadcasts++;
          else if (broadcast.status === "completed")
            entry.completedBroadcasts++;
          else if (broadcast.status === "scheduled")
            entry.scheduledBroadcasts++;
        }

        // ── Enrich with analytics data ──────────────────────────────
        // For each channel, fetch additional analytics (current viewers,
        // watch time, etc.) from the Analytics API. This cross-service
        // join produces a richer dataset than either API alone.
        const channelIds = Object.keys(channelMap);
        const enrichedChannels = await Promise.all(
          channelIds.map(async (channelId) => {
            try {
              const analyticsResponse = await fetch(
                `${ANALYTICS_API_URL}/api/analytics/channels/${channelId}`,
              );
              if (analyticsResponse.ok) {
                const analyticsData = await analyticsResponse.json();
                return {
                  ...channelMap[channelId],
                  channelName: analyticsData.channelName,
                  currentViewers: analyticsData.summary?.currentViewers ?? 0,
                  averagePeakViewers:
                    analyticsData.summary?.averagePeakViewers ?? 0,
                  totalWatchTime: analyticsData.summary?.totalWatchTime ?? 0,
                };
              }
            } catch {
              // Fall through to default
            }
            return {
              ...channelMap[channelId],
              channelName: channelId,
              currentViewers: 0,
              averagePeakViewers: 0,
              totalWatchTime: 0,
            };
          }),
        );

        const overview = {
          generatedAt: new Date().toISOString(),
          totalChannels: enrichedChannels.length,
          channels: enrichedChannels,
        };

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(overview, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  error: `Failed to fetch channels overview: ${errorMessage}`,
                },
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

/**
 * Register the "broadcast-analytics" TEMPLATED resource.
 *
 * This demonstrates MCP's ResourceTemplate — a URI pattern with
 * placeholders that the server expands into concrete resources dynamically.
 *
 * The template "analytics://broadcasts/{broadcastId}" can match any
 * broadcast ID. But how does the client know which IDs exist? That's
 * where the `list` callback comes in:
 *
 *   1. Client sends "resources/list"
 *   2. The SDK calls our `list` callback
 *   3. We fetch ALL broadcasts from the Broadcast API
 *   4. We return one resource entry per broadcast, each with a concrete URI
 *      (e.g. "analytics://broadcasts/br_001", ".../br_002", etc.)
 *   5. The client displays these in its resource browser
 *   6. When the user selects one, the client sends "resources/read"
 *      with the concrete URI
 *   7. The SDK extracts {broadcastId} from the URI and passes it to
 *      our handler function
 *
 * This pattern is equivalent to a parameterized REST endpoint:
 *
 *   GET /api/analytics/broadcasts        → list (discover available IDs)
 *   GET /api/analytics/broadcasts/:id    → read (fetch specific data)
 *
 * But expressed in MCP's resource model with URI templates.
 *
 * Note: The `list` callback fetches broadcast IDs from the BROADCAST
 * API (port 3003), while the read handler fetches analytics from the
 * ANALYTICS API (port 3005). This cross-service coordination is invisible
 * to the MCP client — it just sees a list of resources it can read.
 */
function registerBroadcastAnalyticsResource(server: McpServer) {
  server.registerResource(
    "broadcast-analytics",

    // ── ResourceTemplate ────────────────────────────────────────────
    // The second argument is a ResourceTemplate (not a plain string).
    // The {broadcastId} placeholder is extracted from the URI when a
    // client reads a specific resource, and passed to the handler as
    // a named parameter.
    //
    // The `list` callback enables dynamic resource discovery — it's
    // called whenever a client requests "resources/list" and returns
    // the current set of available resources based on live data.
    new ResourceTemplate("analytics://broadcasts/{broadcastId}", {
      list: async () => {
        try {
          // Fetch all broadcasts to discover available IDs.
          // This cross-references the Broadcast API so the analytics
          // server doesn't need to maintain its own broadcast registry.
          const response = await fetch(`${BROADCAST_API_URL}/api/broadcasts`);
          if (!response.ok) return { resources: [] };

          const data = await response.json();
          const broadcasts = data.broadcasts || [];

          // Return one resource entry per broadcast. Each entry has a
          // concrete URI (template placeholder filled in), a human-readable
          // name, and a description. These appear in the UI's resource list.
          return {
            resources: broadcasts.map(
              (b: { id: string; title: string; status: string }) => ({
                uri: `analytics://broadcasts/${b.id}`,
                name: `Analytics: ${b.title}`,
                description: `Analytics data for broadcast "${b.title}" (status: ${b.status})`,
                mimeType: "application/json",
              }),
            ),
          };
        } catch {
          return { resources: [] };
        }
      },
    }),
    {
      description:
        "Analytics data for a specific broadcast including viewer metrics, engagement, demographics, and streaming quality.",
    },

    // ── Read handler ────────────────────────────────────────────────
    // Called when a client reads a specific broadcast's analytics.
    // The `broadcastId` is extracted from the URI by the SDK
    // (e.g. "analytics://broadcasts/br_001" → broadcastId = "br_001").
    async (uri, { broadcastId }) => {
      try {
        // Fetch analytics for the specific broadcast from the Analytics API
        const response = await fetch(
          `${ANALYTICS_API_URL}/api/analytics/broadcasts/${broadcastId}`,
        );

        if (!response.ok) {
          throw new Error(
            `Analytics API returned ${response.status}: ${response.statusText}`,
          );
        }

        const data = await response.json();

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
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  error: `Failed to fetch analytics for broadcast ${broadcastId}: ${errorMessage}`,
                },
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
