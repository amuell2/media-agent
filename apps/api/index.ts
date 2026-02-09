/**
 * index.ts — API Server (Central Orchestrator)
 *
 * This is the main entry point for the backend API. It acts as the central
 * hub that ties together all the AI subsystems:
 *
 *   ┌─────────────┐       ┌─────────────────────────────────────────────┐
 *   │  Web UI      │◄─────►│              API Server (this file)         │
 *   │  (React)     │  HTTP │                                             │
 *   └─────────────┘       │  Orchestrates:                              │
 *                          │    1. MCP   — Tool/resource/prompt access   │
 *                          │    2. RAG   — Knowledge base retrieval      │
 *                          │    3. LLM   — Chat via Ollama + LangChain  │
 *                          │                                             │
 *                          │  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
 *                          │  │ MCP      │  │ RAG      │  │ LangChain│  │
 *                          │  │ Client   │  │ Service  │  │ + Ollama │  │
 *                          │  │ Manager  │  │          │  │          │  │
 *                          │  └────┬─────┘  └──────────┘  └────┬─────┘  │
 *                          └───────┼──────────────────────────┼────────┘
 *                                  │                          │
 *                          ┌───────▼──────┐           ┌───────▼──────┐
 *                          │ MCP Servers  │           │   Ollama     │
 *                          │ (broadcast,  │           │ (local LLM)  │
 *                          │  analytics)  │           │              │
 *                          └──────────────┘           └──────────────┘
 *
 * The API exposes several route groups:
 *
 *   /chat          — The main chat endpoint (POST, SSE streaming)
 *   /messages      — Conversation history management (GET, DELETE)
 *   /mcp/*         — Proxy routes for MCP tools, prompts, resources, status
 *   /rag/*         — RAG service status and knowledge base sources
 *   /health        — Health check
 *
 * Chat flow (what happens when the user sends a message):
 *
 *   1. User message arrives via POST /chat
 *   2. If RAG is enabled, retrieve relevant knowledge base chunks
 *   3. Build a system prompt (optionally augmented with RAG context)
 *   4. Pass the full conversation to LangChain's streamChatCompletion()
 *   5. LangChain sends messages to Ollama, which runs the local LLM
 *   6. If the LLM calls tools, LangChain routes them through MCP
 *   7. Each chunk (thinking, tokens, tool calls, results) is streamed
 *      back to the browser via Server-Sent Events (SSE)
 */

// Disable LangSmith/LangChain telemetry — we're running locally,
// no need to send usage data to LangChain's cloud service.
process.env.LANGCHAIN_TRACING_V2 = "false";
process.env.LANGSMITH_TRACING = "false";

import express from "express";
import cors from "cors";
import type { ChatMessage } from "./types/chatTypes.js";
import { streamChatCompletion } from "./langchain/ollamaService.js";
import { getMcpClientManager, type McpServerConfig } from "./mcp/client.js";
import {
  initializeRag,
  isRagReady,
  getRag,
  createRagSystemPrompt,
} from "./rag/index.js";

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// ─── In-memory conversation history ──────────────────────────────────
// A single shared conversation stored in memory. In a real app, this
// would be per-user and persisted to a database. The conversation includes
// all user and assistant messages, enabling multi-turn context.
let conversationHistory: ChatMessage[] = [];

// ─── Default LLM configuration ──────────────────────────────────────
// These defaults are used for every chat request. The system prompt sets
// the AI's persona, and the model/temperature control generation behavior.
const DEFAULT_CONFIG = {
  systemPrompt:
    "You are a helpful AI assistant for StreamVerse, a media streaming and broadcasting platform. Be concise, accurate, and thoughtful in your responses.",
  temperature: 0.7,
  maxTokens: 4096,
  model: "gpt-oss:20b",
};

// ─── RAG configuration ──────────────────────────────────────────────
// Controls the Retrieval-Augmented Generation pipeline. When enabled,
// user messages are first matched against the knowledge base, and
// relevant documents are injected into the system prompt before the
// message reaches the LLM. See rag/index.ts for pipeline details.
const RAG_CONFIG = {
  enabled: process.env.RAG_ENABLED !== "false", // Enabled by default
  embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text",
  topK: parseInt(process.env.RAG_TOP_K || "5", 10),
};

// ─── MCP server configuration ────────────────────────────────────────
// Each entry defines an MCP server that provides domain-specific tools,
// resources, and prompts. The API connects to these servers at startup
// and aggregates their capabilities into a unified interface.
//
// The broadcasting server (port 3000) provides tools like "list_broadcasts"
// and resources like "broadcasts://active".
//
// The analytics server (port 3010) provides tools like "broadcast_analytics"
// and resources like "analytics://channels/overview".
const MCP_SERVERS: McpServerConfig[] = [
  {
    name: "broadcast",
    url: process.env.MCP_BROADCAST_URL || "http://localhost:3000/mcp",
    enabled: true,
  },
  {
    name: "analytics",
    url: process.env.MCP_ANALYTICS_URL || "http://localhost:3010/mcp",
    enabled: true,
  },
];

// Create the singleton MCP client manager. This will be populated with
// server connections during startup (see initializeMcpClients below).
const mcpManager = getMcpClientManager("api-server", "1.0.0");

// Helper to wait for a specified time
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Connect to all configured MCP servers with retry logic.
 *
 * MCP servers may not be ready when the API starts (especially in
 * development with multiple processes). We retry each connection
 * up to `retries` times with a delay between attempts.
 *
 * Failures are non-fatal — if an MCP server is down, the API still
 * works but tools/resources from that server won't be available.
 */
async function initializeMcpClients(retries = 3, delayMs = 2000) {
  console.log("Initializing MCP clients...");

  for (const server of MCP_SERVERS) {
    let connected = false;
    let lastError: unknown;

    for (let attempt = 1; attempt <= retries && !connected; attempt++) {
      try {
        if (attempt > 1) {
          console.log(
            `Retrying connection to "${server.name}" (attempt ${attempt}/${retries})...`,
          );
          await delay(delayMs);
        }
        await mcpManager.addServer(server);
        connected = true;
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          console.log(
            `MCP server "${server.name}" not ready, will retry in ${delayMs}ms...`,
          );
        }
      }
    }

    if (!connected) {
      console.error(
        `Failed to connect to MCP server "${server.name}" after ${retries} attempts:`,
        lastError,
      );
    }
  }

  const status = mcpManager.getStatus();
  console.log(`\nMCP Client Status:`);
  for (const s of status) {
    console.log(
      `  - ${s.name}: ${s.connected ? "connected" : "disconnected"} (${s.url})`,
    );
  }
}

// ─── Health & History Routes ─────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    messageCount: conversationHistory.length,
    ragEnabled: RAG_CONFIG.enabled,
    ragReady: isRagReady(),
  });
});

// Get conversation history
app.get("/messages", (req, res) => {
  res.json({ messages: conversationHistory });
});

// Clear conversation history
app.delete("/messages", (req, res) => {
  conversationHistory = [];
  res.json({ success: true });
});

// ─── Chat Endpoint ───────────────────────────────────────────────────
//
// This is the main endpoint that the web UI calls. It uses Server-Sent
// Events (SSE) to stream the response back to the browser in real time.
//
// SSE is a one-way streaming protocol built on HTTP. The server sets
// Content-Type to "text/event-stream" and writes events as they occur.
// Each event has a type (e.g. "token", "thinking", "tool_call") and
// a JSON data payload. The browser's EventSource API (or fetch + reader)
// processes these events incrementally, giving users a live "typing" effect.
//
// Why SSE instead of WebSockets?
//   - Simpler: works over regular HTTP, no protocol upgrade needed
//   - One-way: perfect for streaming responses (we only need server→client)
//   - Reconnection: built-in auto-reconnect with Last-Event-ID
//   - Compatible: works through proxies, load balancers, and CDNs

app.post("/chat", async (req, res) => {
  // Helper to emit an SSE event. Each event consists of:
  //   event: <type>\n
  //   data: <json>\n\n
  // The double newline signals the end of the event.
  const sse = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Configure SSE headers. These tell the browser to expect a streaming
  // response and not to buffer or cache it.
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  const { message, useRag = true } = req.body as {
    message: string;
    useRag?: boolean;
  };

  if (!message) {
    sse("error", { message: "Message is required" });
    res.end();
    return;
  }

  // Determine if we should use RAG for this request.
  // RAG must be: globally enabled, not disabled per-request, and initialized.
  const shouldUseRag = RAG_CONFIG.enabled && useRag && isRagReady();

  // Allow the client to abort the request (e.g. navigating away)
  const ac = new AbortController();
  req.on("close", () => ac.abort());

  try {
    // ── Step 1: Record the user's message ─────────────────────────
    const userMessage: ChatMessage = {
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    };
    conversationHistory.push(userMessage);

    // ── Step 2: RAG retrieval (optional) ──────────────────────────
    // If RAG is enabled, we embed the user's question, search the
    // vector store for semantically similar document chunks, and
    // inject them into the system prompt. This gives the LLM access
    // to domain-specific knowledge it wasn't trained on.
    let systemPrompt = DEFAULT_CONFIG.systemPrompt;
    let ragContext = null;

    if (shouldUseRag) {
      try {
        const ragService = getRag();
        if (ragService) {
          sse("status", { status: "retrieving_context" });

          // Perform similarity search against the knowledge base
          const retrievalResult = await ragService.retrieve(message, {
            topK: RAG_CONFIG.topK,
          });

          if (retrievalResult.chunks.length > 0) {
            ragContext = retrievalResult;

            // Augment the system prompt with retrieved context.
            // The LLM will see these documents as part of its instructions
            // and can reference them when formulating its answer.
            systemPrompt = createRagSystemPrompt(
              DEFAULT_CONFIG.systemPrompt,
              retrievalResult.formattedContext,
            );

            // Send RAG context info to the UI so it can show which
            // knowledge base sources were used (the "Knowledge Base
            // Sources" section in chat messages).
            sse("rag_context", {
              chunks: retrievalResult.chunks.map((c) => ({
                source: c.source,
                section: c.section,
                score: c.score,
                preview: c.content,
              })),
              chunkCount: retrievalResult.chunks.length,
            });
          }
        }
      } catch (error) {
        console.error("RAG retrieval error (continuing without RAG):", error);
        sse("rag_error", {
          message: "RAG retrieval failed, using base knowledge",
        });
      }
    }

    // ── Step 3: Build the message array for the LLM ───────────────
    // The system prompt goes first (sets behavior), followed by the
    // full conversation history. System messages in the history are
    // filtered out since we provide our own system prompt.
    const messagesForModel: ChatMessage[] = [
      {
        role: "system",
        content: systemPrompt,
      },
      ...conversationHistory.filter((m) => m.role !== "system"),
    ];

    sse("status", { status: "connected" });
    sse("status", { status: "waiting_for_model" });

    // ── Step 4: Stream the LLM response ───────────────────────────
    // streamChatCompletion is an async generator that yields chunks
    // as the LLM produces them. It handles the full ReAct agent loop
    // internally (thinking → tool calls → observations → final answer).
    // We simply forward each chunk as an SSE event to the browser.
    const stream = streamChatCompletion(DEFAULT_CONFIG, messagesForModel);

    let accumulatedContent = "";
    let accumulatedThinking = "";
    let toolCalls: Array<{ name: string; args: any; result: string }> = [];

    for await (const chunk of stream) {
      // Each chunk has a type that maps to a different SSE event and
      // a different UI treatment in the browser:
      if (chunk.type === "thinking") {
        // Model's reasoning (chain-of-thought) or system status messages.
        // Displayed in collapsible "LLM Reasoning" / "System Info" sections.
        accumulatedThinking += chunk.content;
        sse("thinking", {
          token: chunk.content,
          thinkingType: chunk.thinkingType || "llm_reasoning",
        });
      } else if (chunk.type === "tool_call") {
        // The model decided to call an MCP tool. The UI shows the tool
        // name and arguments in the chat.
        sse("tool_call", {
          toolName: chunk.toolName,
          message: chunk.content,
        });
      } else if (chunk.type === "observation") {
        // Raw output from a tool execution. Shown in a collapsible
        // "Observation" section in the chat UI.
        sse("observation", {
          toolName: chunk.toolName,
          content: chunk.content,
        });
      } else if (chunk.type === "tool_result") {
        // Processed tool result. Tracked for conversation history.
        sse("tool_result", {
          toolName: chunk.toolName,
          result: chunk.content,
        });
        if (chunk.toolName) {
          toolCalls.push({
            name: chunk.toolName,
            args: {},
            result: chunk.content,
          });
        }
      } else if (chunk.type === "token") {
        // A token of the model's final answer text. These arrive one
        // at a time and are displayed with a typing effect in the UI.
        accumulatedContent += chunk.content;
        sse("token", { token: chunk.content });
      }
    }

    // ── Step 5: Save the assistant's response to history ──────────
    // The accumulated content, thinking, tool calls, and RAG sources
    // are stored so subsequent messages have full context.
    const assistantMessage: ChatMessage = {
      role: "assistant",
      content: accumulatedContent,
      timestamp: new Date().toISOString(),
      ...(accumulatedThinking && { thinking: accumulatedThinking }),
      ...(toolCalls.length > 0 && { toolCalls }),
      ...(ragContext && {
        ragSources: ragContext.chunks.map((c) => ({
          source: c.source,
          section: c.section,
        })),
      }),
    };
    conversationHistory.push(assistantMessage);

    // Signal that the response is complete
    sse("done", {});
    res.end();
  } catch (err: any) {
    if (ac.signal.aborted) return;
    console.error("Chat error:", err);
    sse("error", { message: err?.message ?? String(err) });
    res.end();
  }
});

// ─── MCP Proxy Routes ────────────────────────────────────────────────
//
// These REST endpoints expose MCP capabilities to the web UI. They act
// as a proxy layer between the browser and the MCP servers:
//
//   Browser  ──HTTP──►  API Server  ──MCP/JSON-RPC──►  MCP Servers
//
// The browser can't talk to MCP servers directly (different protocol),
// so the API translates REST requests into MCP protocol calls.
// This also centralizes authentication, error handling, and CORS.

/** List all tools from all connected MCP servers */
app.get("/mcp/tools", async (req, res) => {
  try {
    if (!mcpManager.hasConnectedClients()) {
      return res.status(503).json({ error: "No MCP clients connected" });
    }

    const tools = await mcpManager.listAllTools();
    res.json({ tools });
  } catch (error: any) {
    res.status(500).json({ error: error?.message ?? "Failed to list tools" });
  }
});

/** List all prompt templates from all connected MCP servers */
app.get("/mcp/prompts", async (req, res) => {
  try {
    if (!mcpManager.hasConnectedClients()) {
      return res.status(503).json({ error: "No MCP clients connected" });
    }

    const prompts = await mcpManager.listAllPrompts();
    res.json({ prompts });
  } catch (error: any) {
    res.status(500).json({ error: error?.message ?? "Failed to list prompts" });
  }
});

/**
 * Resolve a prompt template by name with the provided arguments.
 * Unlike tools (which are aggregated by the manager), prompt resolution
 * requires finding the specific server that owns the prompt, because
 * the server performs argument substitution and may fetch live data.
 */
app.post("/mcp/prompts/:promptName", async (req, res) => {
  try {
    if (!mcpManager.hasConnectedClients()) {
      return res.status(503).json({ error: "No MCP clients connected" });
    }

    const { promptName } = req.params;
    const args = req.body || {};

    // Search each server for the prompt and resolve it on the correct one
    for (const client of mcpManager.getAllClients()) {
      if (client.isConnected()) {
        try {
          const prompts = await client.listPrompts();
          if (prompts.some((p) => p.name === promptName)) {
            const result = await client.getPrompt(promptName, args);
            return res.json(result);
          }
        } catch (error) {
          // Continue to next server
        }
      }
    }

    res.status(404).json({ error: `Prompt "${promptName}" not found` });
  } catch (error: any) {
    res.status(500).json({ error: error?.message ?? "Failed to get prompt" });
  }
});

/** List all resources from all connected MCP servers */
app.get("/mcp/resources", async (req, res) => {
  try {
    if (!mcpManager.hasConnectedClients()) {
      return res.status(503).json({ error: "No MCP clients connected" });
    }

    const resources = await mcpManager.listAllResources();
    res.json({ resources });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error?.message ?? "Failed to list resources" });
  }
});

/**
 * Read a specific resource by URI.
 * Resources are identified by custom URI schemes (e.g. "broadcasts://active",
 * "analytics://channels/overview"). We try each connected server because
 * we don't know which server owns which URI scheme.
 */
app.post("/mcp/resources/read", async (req, res) => {
  try {
    if (!mcpManager.hasConnectedClients()) {
      return res.status(503).json({ error: "No MCP clients connected" });
    }

    const { uri } = req.body;
    if (!uri) {
      return res.status(400).json({ error: "URI is required" });
    }

    // Try each connected client to read the resource
    for (const client of mcpManager.getAllClients()) {
      if (client.isConnected()) {
        try {
          const contents = await client.readResource(uri);
          return res.json({ contents });
        } catch (error) {
          // Continue to next server — this one doesn't own this URI
        }
      }
    }

    res.status(404).json({ error: `Resource "${uri}" not found` });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error?.message ?? "Failed to read resource" });
  }
});

/** Get connection status of all MCP servers (powers the UI's connections panel) */
app.get("/mcp/status", (req, res) => {
  const status = mcpManager.getStatus();
  res.json({
    servers: status,
    connectedCount: status.filter((s) => s.connected).length,
    totalCount: status.length,
  });
});

// ─── RAG Routes ──────────────────────────────────────────────────────
// These endpoints let the web UI inspect the RAG service's state and
// browse the knowledge base contents.

/**
 * List all knowledge base documents (RAG sources).
 * Reads the markdown files from disk and extracts their titles, sections,
 * and metadata. This powers the "Knowledge Base" section in the UI's
 * connections panel.
 */
app.get("/rag/sources", async (req, res) => {
  try {
    const { readdir, readFile, stat } = await import("fs/promises");
    const { join, basename } = await import("path");
    const path = await import("path");
    const { fileURLToPath } = await import("url");

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const ragDataPath = path.resolve(__dirname, "../../mock-services/rag-data");

    const files = await readdir(ragDataPath);
    const mdFiles = files.filter((f) => f.endsWith(".md"));

    const sources = await Promise.all(
      mdFiles.map(async (file) => {
        const filePath = join(ragDataPath, file);
        const content = await readFile(filePath, "utf-8");
        const stats = await stat(filePath);
        const fileName = basename(file, ".md");

        // Extract title from first heading
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title =
          titleMatch && titleMatch[1] ? titleMatch[1].trim() : fileName;

        // Extract sections (h2 headings)
        const sections: string[] = [];
        const sectionMatches = content.matchAll(/^##\s+(.+)$/gm);
        for (const match of sectionMatches) {
          if (match[1]) {
            sections.push(match[1].trim());
          }
        }

        return {
          fileName: file,
          name: fileName,
          title,
          sections,
          content,
          size: stats.size,
          lastModified: stats.mtime.toISOString(),
        };
      }),
    );

    res.json({
      sources,
      totalCount: sources.length,
      ragReady: isRagReady(),
    });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error?.message ?? "Failed to list RAG sources" });
  }
});

// ─── Server Startup ──────────────────────────────────────────────────
// The startup sequence initializes subsystems in order:
//   1. Start the HTTP server (so health checks pass immediately)
//   2. Connect to MCP servers (with retries for slow starts)
//   3. Initialize RAG service (loads documents, generates embeddings)
//
// Both MCP and RAG initialization are non-blocking — if either fails,
// the server continues running with reduced capabilities.

const server = app.listen(port, async () => {
  console.log(`API listening on http://localhost:${port}`);
  console.log(`Default model: ${DEFAULT_CONFIG.model}`);
  console.log(`\nConfigured MCP servers:`);
  for (const server of MCP_SERVERS) {
    console.log(
      `  - ${server.name}: ${server.url} (${server.enabled ? "enabled" : "disabled"})`,
    );
  }
  console.log("");

  // Initialize MCP clients (connects to broadcasting + analytics servers)
  await initializeMcpClients();

  // Initialize RAG service (loads knowledge base, generates embeddings)
  if (RAG_CONFIG.enabled) {
    console.log("\nInitializing RAG service...");
    console.log(`   Embedding model: ${RAG_CONFIG.embeddingModel}`);
    try {
      await initializeRag({
        embeddingModel: RAG_CONFIG.embeddingModel,
        topK: RAG_CONFIG.topK,
      });
      console.log("RAG service ready");
    } catch (error) {
      console.error("Failed to initialize RAG service:", error);
      console.log("   Chat will continue without RAG enhancement");
    }
  } else {
    console.log("\nRAG service disabled (set RAG_ENABLED=true to enable)");
  }
});

// ─── Graceful Shutdown ───────────────────────────────────────────────
// On SIGINT (Ctrl+C) or SIGTERM (container stop), we cleanly disconnect
// from all MCP servers and close the HTTP server. This ensures MCP
// sessions are properly terminated (the servers can free resources)
// and no in-flight requests are abruptly dropped.

const shutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  // Close HTTP server (stops accepting new requests)
  server.close(() => {
    console.log("HTTP server closed");
  });

  // Disconnect all MCP clients (sends session termination to each server)
  try {
    await mcpManager.disconnectAll();
    console.log("MCP clients disconnected");
  } catch (error) {
    console.error("Error disconnecting MCP clients:", error);
  }

  console.log("API shutdown complete");
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
