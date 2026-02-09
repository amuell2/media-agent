/**
 * prompts.ts — MCP Prompt Registration for the Broadcasting Server
 *
 * MCP Prompts are reusable message templates stored on the server. They
 * provide a way to package complex, multi-step instructions into a single
 * selectable action that the user can trigger from the UI.
 *
 * Prompts vs Tools vs Resources — the three MCP capabilities:
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  Prompts                                                        │
 *   │    - Selected by the USER (not the LLM)                        │
 *   │    - Return pre-built MESSAGE ARRAYS (not raw data)            │
 *   │    - Act as "workflow starters" — they tell the LLM what to do │
 *   │    - Can accept arguments for customization                     │
 *   │    - Example: "Draft a broadcast report for channel X"          │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │  Tools                                                          │
 *   │    - Called by the LLM autonomously during the ReAct loop      │
 *   │    - Return raw data (JSON, text, etc.)                        │
 *   │    - Act as "data fetchers" — they give the LLM information    │
 *   │    - Example: "list_broadcasts" → returns broadcast JSON       │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │  Resources                                                      │
 *   │    - Attached by the USER as context                           │
 *   │    - Return read-only data snapshots                           │
 *   │    - Act as "context providers" — background info for the LLM  │
 *   │    - Example: "broadcasts://active" → current live broadcasts  │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * How prompts work end-to-end:
 *
 *   1. REGISTRATION (this file):
 *      We call server.registerPrompt() to define a prompt template with:
 *        - A unique name (e.g. "draft_broadcast_report")
 *        - A description (shown in the UI's attach menu)
 *        - An argument schema (Zod validators for template parameters)
 *        - A handler that resolves arguments into a message array
 *
 *   2. DISCOVERY (client side):
 *      When the API server sends "prompts/list", the MCP SDK returns all
 *      registered prompts with their names, descriptions, and argument
 *      definitions. The web UI displays these in the attach menu.
 *
 *   3. SELECTION (user action):
 *      The user clicks a prompt in the UI's attach menu, optionally fills
 *      in arguments (e.g. channel ID, status filter), and submits.
 *
 *   4. RESOLUTION (this file's handler):
 *      The API sends "prompts/get" with the prompt name and arguments.
 *      The handler function runs, substitutes arguments into the template,
 *      and returns an array of messages ready for the LLM.
 *
 *   5. INJECTION (web UI):
 *      The resolved prompt text is inserted into the chat input field.
 *      When the user sends the message, it flows through the normal
 *      chat pipeline (RAG retrieval → LangChain → Ollama → ReAct loop).
 *
 * Why prompts are powerful:
 *
 *   - They encode EXPERT KNOWLEDGE about how to ask the LLM for specific
 *     outputs. Instead of the user guessing "how should I ask for a
 *     broadcast report?", the prompt template includes the exact structure,
 *     sections, and instructions that produce the best results.
 *
 *   - They can reference TOOLS by name in their instructions (e.g.
 *     "Start by calling the list_broadcasts tool..."), guiding the LLM's
 *     ReAct loop toward the right sequence of actions.
 *
 *   - They standardize outputs across users — everyone gets the same
 *     report format regardless of how they phrase their request.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Entry point: register all broadcasting-related prompts.
 * Called from index.ts during server initialization.
 */
export function registerPrompts(server: McpServer) {
  registerDraftBroadcastReport(server);
}

/**
 * Register the "draft_broadcast_report" prompt.
 *
 * This prompt generates a comprehensive broadcast status report. When
 * resolved, it returns a message that instructs the LLM to:
 *   1. Use the list_broadcasts tool to gather data
 *   2. Organize the data into specific report sections
 *   3. Format the output as clean Markdown
 *
 * The prompt accepts two optional arguments (channelId and status) that
 * let the user scope the report to a specific channel or broadcast state.
 *
 * server.registerPrompt() takes three arguments:
 *
 *   1. name — The prompt's unique identifier. Clients use this in
 *      "prompts/get" requests. Should be snake_case and descriptive.
 *
 *   2. config — An object containing:
 *        - description: Human-readable text shown in the UI's prompt list
 *        - argsSchema: A Zod schema defining the prompt's parameters.
 *          Unlike tool schemas (which validate LLM-generated arguments),
 *          prompt schemas validate USER-provided arguments from the UI.
 *          The MCP SDK converts these to JSON Schema for the "prompts/list"
 *          response, and the web UI renders form fields from them.
 *
 *   3. handler — An async function that receives the validated arguments
 *      and returns an object with a `messages` array. Each message has
 *      a `role` ("user" or "assistant") and `content` (with type + text).
 *      The messages are returned to the client as-is — the client decides
 *      how to use them (typically injecting the text into the chat input).
 */
function registerDraftBroadcastReport(server: McpServer) {
  server.registerPrompt(
    // ── Prompt name ──────────────────────────────────────────────────
    // Used as the identifier in "prompts/get" requests.
    "draft_broadcast_report",

    // ── Prompt configuration ─────────────────────────────────────────
    {
      description:
        "Generate a comprehensive broadcast status report. Optionally filter by channel ID or broadcast status.",

      // ── Argument schema ────────────────────────────────────────────
      // These define the form fields shown in the UI when the user
      // selects this prompt. Both are optional — the user can submit
      // the prompt without any arguments to get an unfiltered report.
      //
      // The .describe() strings serve double duty:
      //   1. The MCP SDK includes them in the "prompts/list" response
      //      so the UI can show them as placeholder/help text
      //   2. They document the expected format and valid values
      argsSchema: {
        channelId: z
          .string()
          .optional()
          .describe(
            "Optional channel ID to scope the report to a specific channel (e.g. 'ch_001').",
          ),
        status: z
          .enum(["live", "scheduled", "completed"])
          .optional()
          .describe(
            "Optional broadcast status filter. One of: live, scheduled, completed.",
          ),
      },
    },

    // ── Handler function ─────────────────────────────────────────────
    // Called when the client sends "prompts/get" with this prompt's name.
    // The destructured arguments ({ channelId, status }) have already been
    // validated by the Zod schema above.
    //
    // The handler builds a detailed instruction message that tells the LLM
    // exactly what report to produce. This is where the "expert knowledge"
    // lives — the prompt author (a developer or domain expert) encodes
    // the ideal report structure, the tools to use, and the format to follow.
    //
    // Note that this handler does NOT call any tools itself — it just
    // produces instructions. The actual tool calls happen later when the
    // LLM processes this message through the ReAct loop.
    async ({ channelId, status }) => {
      // Build optional filter instructions based on provided arguments.
      // These are appended to the prompt text so the LLM knows to apply
      // them when calling the list_broadcasts tool.
      const filters: string[] = [];
      if (channelId) filters.push(`Channel ID: ${channelId}`);
      if (status) filters.push(`Status: ${status}`);

      const filterSection =
        filters.length > 0
          ? `\n\nApply the following filters:\n${filters.map((f) => `- ${f}`).join("\n")}`
          : "";

      // ── Return the resolved prompt as a message array ──────────────
      // The messages array follows the same structure as LLM chat messages.
      // Here we return a single "user" message containing detailed
      // instructions. When the web UI receives this, it extracts the text
      // and inserts it into the chat input field.
      //
      // The message explicitly references the "list_broadcasts" tool by
      // name, guiding the LLM's ReAct loop toward the right action. It
      // also specifies the exact report sections and formatting, ensuring
      // consistent output regardless of which user triggered the prompt.
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `You are a broadcasting operations analyst. Use the available tools to gather data and produce a detailed broadcast status report.${filterSection}

Your report should include the following sections:

1. **Executive Summary** — A brief overview of the current broadcasting state.
2. **Active Broadcasts** — List all currently live broadcasts with their title, channel, viewer count, and duration.
3. **Scheduled Broadcasts** — List upcoming scheduled broadcasts with their planned start times and expected viewership.
4. **Recently Completed** — Summarize broadcasts that have recently ended, including their final viewer counts and duration.
5. **Alerts & Issues** — Highlight any active alerts or unresolved issues across broadcasts.
6. **Recommendations** — Provide actionable recommendations based on the current data.

Start by calling the list_broadcasts tool to retrieve broadcast data, then compile the report from the results. Format the report in clean Markdown.`,
            },
          },
        ],
      };
    },
  );
}
