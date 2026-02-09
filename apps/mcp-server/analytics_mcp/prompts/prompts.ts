/**
 * prompts.ts — MCP Prompt Registration for the Analytics Server
 *
 * This prompt demonstrates an ADVANCED pattern: server-side data pre-fetching.
 *
 * The broadcasting server's prompt (draft_broadcast_report) returns pure
 * INSTRUCTIONS — it tells the LLM which tools to call and what report to
 * produce. The LLM then fetches the data itself during the ReAct loop.
 *
 * This analytics prompt takes a different approach: it fetches data FROM
 * MULTIPLE API ENDPOINTS at prompt-resolution time and EMBEDS the data
 * directly into the prompt message. The LLM receives the data pre-loaded
 * and only needs to analyze and format it — no tool calls required.
 *
 * Comparison of the two approaches:
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  Broadcasting prompt (instruction-only):                        │
 *   │    Prompt → "Call list_broadcasts tool, then write a report"    │
 *   │    LLM   → Calls tools in ReAct loop → Writes report           │
 *   │    Pros: Flexible, LLM can adapt its queries                    │
 *   │    Cons: Multiple ReAct cycles, slower, tool calls may fail     │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │  Analytics prompt (data pre-fetched):                           │
 *   │    Prompt → Fetches 4 APIs → Embeds all data in message         │
 *   │    LLM   → Already has all data → Writes analysis immediately   │
 *   │    Pros: Faster (no ReAct loop), guaranteed data availability   │
 *   │    Cons: Less flexible, data is a snapshot (may be stale)       │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * This pattern is ideal when:
 *   - You know EXACTLY which data the LLM needs (no exploratory queries)
 *   - The data comes from multiple endpoints that must be combined
 *   - You want fast, predictable results without tool-calling overhead
 *   - The data is small enough to fit in the prompt context window
 *
 * The handler fetches from 4 Analytics API endpoints in parallel:
 *   1. /analytics/broadcasts/{id}              → Core viewer metrics
 *   2. /analytics/broadcasts/{id}/engagement   → Engagement rates, chat activity
 *   3. /analytics/broadcasts/{id}/quality      → Stream quality (bitrate, buffering)
 *   4. /analytics/broadcasts/{id}/demographics → Audience breakdown by region/device
 *
 * All four responses are assembled into a single prompt message with
 * clearly labeled sections, so the LLM can easily reference each data source.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/** Base URL for the Analytics REST API */
const ANALYTICS_API_URL =
  process.env.ANALYTICS_API_URL || "http://localhost:3005";

/**
 * Entry point: register all analytics-related prompts.
 * Called from index.ts during server initialization.
 */
export function registerPrompts(server: McpServer) {
  registerAnalyzeBroadcastPerformancePrompt(server);
}

/**
 * Register the "analyze_broadcast_performance" prompt.
 *
 * Unlike the broadcasting server's prompt (which returns instructions and
 * lets the LLM fetch data via tools), this prompt PRE-FETCHES all required
 * data and embeds it directly into the message. This means the LLM can
 * produce a complete analysis in a single generation pass without any
 * tool calls, making it faster and more reliable.
 *
 * The tradeoff is flexibility — the data is a snapshot taken at prompt
 * resolution time. If the user asks follow-up questions that need
 * different data, the LLM would need to fall back to tool calls.
 *
 * This prompt has a REQUIRED argument (broadcastId), unlike the broadcasting
 * prompt where arguments are optional. The broadcastId is essential because
 * the handler needs to know which broadcast to fetch data for.
 */
function registerAnalyzeBroadcastPerformancePrompt(server: McpServer) {
  server.registerPrompt(
    "analyze_broadcast_performance",
    {
      description:
        "Generates a detailed performance analysis for a specific broadcast, including viewer metrics, engagement, quality, and demographics",
      argsSchema: {
        // REQUIRED argument — unlike the broadcasting prompt's optional args.
        // The user must provide a broadcast ID (e.g. "br_001") so the handler
        // knows which broadcast's data to pre-fetch from the Analytics API.
        broadcastId: z
          .string()
          .describe("The broadcast ID to analyze (e.g., 'br_001')"),
      },
    },

    // ── Handler: pre-fetch data from 4 API endpoints ─────────────────
    // This is the key difference from the broadcasting prompt. Instead of
    // returning instructions like "call the broadcast_analytics tool", we
    // fetch the data ourselves and embed it in the prompt message. The LLM
    // gets a complete data package and can focus purely on analysis.
    async ({ broadcastId }) => {
      // Variables to hold the fetched data (or error messages if fetches fail)
      let analyticsData: string;
      let engagementData: string;
      let qualityData: string;
      let demographicsData: string;

      try {
        // ── Parallel data fetching ──────────────────────────────────
        // Fetch all 4 API endpoints concurrently using Promise.all.
        // This is much faster than sequential fetches and ensures the
        // prompt resolves quickly. Each endpoint provides a different
        // facet of the broadcast's performance:
        //
        //   analytics    → Core metrics (viewers, peak, duration)
        //   engagement   → Interaction metrics (chat, likes, shares)
        //   quality      → Stream health (bitrate, buffering, startup time)
        //   demographics → Audience breakdown (region, device, platform)
        const [analyticsRes, engagementRes, qualityRes, demographicsRes] =
          await Promise.all([
            fetch(
              `${ANALYTICS_API_URL}/api/analytics/broadcasts/${broadcastId}`,
            ),
            fetch(
              `${ANALYTICS_API_URL}/api/analytics/broadcasts/${broadcastId}/engagement`,
            ),
            fetch(
              `${ANALYTICS_API_URL}/api/analytics/broadcasts/${broadcastId}/quality`,
            ),
            fetch(
              `${ANALYTICS_API_URL}/api/analytics/broadcasts/${broadcastId}/demographics`,
            ),
          ]);

        // ── Graceful per-endpoint error handling ─────────────────────
        // Each endpoint is checked independently. If one fails (e.g. the
        // demographics service is down), we include an error message for
        // that section but still provide data from the others. The LLM
        // can still produce a partial analysis with whatever data is available.
        analyticsData = analyticsRes.ok
          ? JSON.stringify(await analyticsRes.json(), null, 2)
          : `Error fetching analytics: ${analyticsRes.status} ${analyticsRes.statusText}`;

        engagementData = engagementRes.ok
          ? JSON.stringify(await engagementRes.json(), null, 2)
          : `Error fetching engagement: ${engagementRes.status} ${engagementRes.statusText}`;

        qualityData = qualityRes.ok
          ? JSON.stringify(await qualityRes.json(), null, 2)
          : `Error fetching quality: ${qualityRes.status} ${qualityRes.statusText}`;

        demographicsData = demographicsRes.ok
          ? JSON.stringify(await demographicsRes.json(), null, 2)
          : `Error fetching demographics: ${demographicsRes.status} ${demographicsRes.statusText}`;
      } catch (error) {
        // ── Total failure: all fetches failed ───────────────────────
        // If Promise.all rejects (e.g. network error, service unreachable),
        // we return an error message as a prompt. The LLM sees this and
        // can inform the user about the issue instead of hallucinating
        // analytics data.
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          messages: [
            {
              role: "user" as const,
              content: {
                type: "text" as const,
                text: `Unable to fetch analytics data for broadcast ${broadcastId}: ${errorMessage}. Please check that the analytics service is running and the broadcast ID is valid.`,
              },
            },
          ],
        };
      }

      // ── Assemble the prompt with pre-fetched data ─────────────────
      // The resolved prompt combines:
      //   1. Analysis instructions (what the LLM should do)
      //   2. Report structure (the 5 sections to produce)
      //   3. All pre-fetched data (embedded directly in the message)
      //
      // The data is placed AFTER the instructions, separated by a
      // horizontal rule (---) and labeled with ### headings. This
      // structure helps the LLM distinguish instructions from data
      // and correctly attribute information to its source.
      //
      // Because all data is already in the message, the LLM can produce
      // the full analysis in a single generation pass — no ReAct loop,
      // no tool calls, no waiting for API responses. This is significantly
      // faster than the instruction-only approach used by the broadcasting
      // prompt.
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Please provide a comprehensive performance analysis for broadcast "${broadcastId}" using the data below. Structure your analysis into these sections:

1. **Overview** — Summarize the broadcast's key metrics (current viewers, peak viewers, total views, duration).
2. **Engagement Analysis** — Evaluate engagement rate, chat activity, likes, shares, and what they indicate about audience interest.
3. **Stream Quality Assessment** — Assess bitrate, buffering rate, startup time, rebuffer count, and overall quality rating. Flag any concerns.
4. **Audience Demographics** — Break down the audience by region, device, and platform. Highlight the dominant segments and any opportunities for growth.
5. **Recommendations** — Based on the data, provide 3-5 actionable recommendations to improve future broadcast performance.

---

### Analytics Data
${analyticsData}

### Engagement Metrics
${engagementData}

### Quality Metrics
${qualityData}

### Demographics
${demographicsData}`,
            },
          },
        ],
      };
    },
  );
}
