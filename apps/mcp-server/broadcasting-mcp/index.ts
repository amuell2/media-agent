/**
 * Broadcasting MCP Server — Server-Side MCP Implementation
 *
 * This file implements an MCP (Model Context Protocol) server that exposes
 * broadcasting-related capabilities to AI applications. While McpClient.ts
 * (in the API) is the CLIENT side of MCP, this file is the SERVER side.
 *
 * MCP Server Architecture:
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │                    Broadcasting MCP Server                       │
 *   │                                                                  │
 *   │  Capabilities registered at startup:                            │
 *   │    - Tools:     list_broadcasts (query broadcast data)          │
 *   │    - Resources: broadcasts://active (live broadcast feed)       │
 *   │    - Prompts:   draft_broadcast_report (report template)        │
 *   │                                                                  │
 *   │  Transport: Streamable HTTP (JSON-RPC over HTTP POST + SSE)     │
 *   │  Endpoint:  POST/GET/DELETE /mcp                                │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * How MCP servers work:
 *
 *   1. The server creates an McpServer instance and registers capabilities
 *      (tools, resources, prompts) — these are the things AI clients can use.
 *
 *   2. When a client connects (POST /mcp with an "initialize" request),
 *      the server creates a new StreamableHTTPServerTransport for that
 *      session and connects it to a fresh McpServer instance.
 *
 *   3. The client and server exchange JSON-RPC 2.0 messages:
 *        - Client sends: "tools/list", "tools/call", "prompts/get", etc.
 *        - Server responds with results (tool output, prompt messages, etc.)
 *
 *   4. Each client gets its own session (identified by Mcp-Session-Id header)
 *      and its own McpServer + Transport pair. This enables stateful
 *      interactions and prevents cross-client interference.
 *
 * Session lifecycle:
 *
 *   POST /mcp (no session ID, body is "initialize")
 *     → Create new transport + server
 *     → Return session ID in Mcp-Session-Id header
 *
 *   POST /mcp (with session ID)
 *     → Route to existing transport for that session
 *     → Process JSON-RPC request (tool call, prompt get, etc.)
 *
 *   GET /mcp (with session ID)
 *     → Open an SSE stream for server-initiated notifications
 *
 *   DELETE /mcp (with session ID)
 *     → Terminate the session and clean up resources
 */

import { randomUUID } from "node:crypto";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import cors from "cors";
import type { Request, Response } from "express";
import { registerTools } from "./tools/tools";
import { registerResources } from "./resources/resources";
import { registerPrompts } from "./prompts/prompts";

/**
 * Factory function that creates a fresh McpServer instance.
 *
 * A new server is created for each client session (not shared globally).
 * This per-session model avoids concurrency issues and lets the MCP SDK
 * manage session state independently for each connected client.
 *
 * The `capabilities` object advertises what this server supports.
 * Clients use this during the "initialize" handshake to discover what
 * they can do (e.g. "this server has tools and prompts but no sampling").
 */
const getServer = () => {
  const server = new McpServer(
    {
      name: "broadcasting-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        logging: {}, // Server can emit log messages to the client
        tools: {}, // Server exposes callable tools (e.g. list_broadcasts)
        resources: {}, // Server exposes readable resources (e.g. broadcasts://active)
        prompts: {}, // Server exposes prompt templates (e.g. draft_broadcast_report)
      },
    },
  );

  // Register all capabilities from their respective modules.
  // Each register function calls server.registerTool(), server.registerResource(),
  // or server.registerPrompt() to add capabilities to this server instance.
  registerTools(server);
  registerResources(server);
  registerPrompts(server);

  return server;
};

const MCP_PORT = process.env.BROADCASTING_MCP_PORT
  ? Number.parseInt(process.env.BROADCASTING_MCP_PORT, 10)
  : 3000;

// createMcpExpressApp() returns an Express app pre-configured for MCP.
// It's essentially express() with sensible defaults for JSON-RPC handling.
const app = createMcpExpressApp();

// Enable CORS so the API server (on a different port) can connect.
// The exposed headers are MCP-specific — the client needs to read
// Mcp-Session-Id from responses and send it back in subsequent requests.
app.use(
  cors({
    exposedHeaders: [
      "WWW-Authenticate",
      "Mcp-Session-Id", // Session identifier for stateful communication
      "Last-Event-Id", // SSE reconnection support
      "Mcp-Protocol-Version", // MCP protocol version negotiation
    ],
    origin: "*",
  }),
);

/**
 * Active session registry: maps session IDs to their transports.
 *
 * Each connected client gets a unique session ID and a dedicated
 * StreamableHTTPServerTransport. The transport manages the JSON-RPC
 * message framing, SSE streaming, and request/response correlation
 * for that specific session.
 *
 * Sessions are cleaned up when:
 *   - The client sends a DELETE /mcp request (graceful termination)
 *   - The transport's onclose handler fires (connection dropped)
 */
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// ─── POST /mcp — Main JSON-RPC endpoint ──────────────────────────────
// All MCP requests arrive here as JSON-RPC 2.0 messages. The handler
// either creates a new session (for "initialize" requests) or routes
// to an existing session's transport.

const mcpPostHandler = async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId) {
    console.log(`Received MCP request for session: ${sessionId}`);
  } else {
    console.log("New MCP request");
  }

  try {
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      // ── Existing session: reuse the transport ───────────────────
      // The client included a session ID and we have a matching transport.
      // Route the request to that transport for processing.
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // ── New session: MCP handshake ──────────────────────────────
      // The client is connecting for the first time and sending the
      // "initialize" JSON-RPC request (no session ID yet).
      //
      // We create a new transport with a UUID session ID generator.
      // The onsessioninitialized callback fires after the handshake
      // completes, at which point we store the transport in our registry.
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          console.log(`Session initialized with ID: ${sessionId}`);
          transports[sessionId] = transport;
        },
      });

      // Clean up the session registry when the transport closes
      // (e.g. client disconnects, network error, explicit termination).
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          console.log(`Transport closed for session ${sid}`);
          delete transports[sid];
        }
      };

      // Create a fresh McpServer for this session and wire it to the transport.
      // The server handles the "initialize" request internally — negotiating
      // capabilities and protocol version with the client.
      const server = getServer();
      await server.connect(transport);

      // Let the transport process the initialize request and send the response.
      // This sets the Mcp-Session-Id response header that the client will
      // include in all subsequent requests.
      await transport.handleRequest(req, res, req.body);
      return;
    } else {
      // ── Invalid request: no session and not an initialize request ─
      // This happens when a client sends a regular request without
      // establishing a session first, or with an expired/invalid session ID.
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided",
        },
        id: null,
      });
      return;
    }

    // Handle the request with the existing session's transport.
    // The transport deserializes the JSON-RPC request, routes it to the
    // McpServer, and serializes the response back to HTTP.
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
};

app.post("/mcp", mcpPostHandler);

// ─── GET /mcp — SSE stream for server-initiated notifications ────────
// MCP supports server-to-client push notifications (e.g. "a resource
// list changed"). The client opens a long-lived SSE connection via GET
// and the server pushes events as they occur.
//
// The Last-Event-Id header enables reconnection — if the SSE connection
// drops, the client reconnects and asks for events it missed.

const mcpGetHandler = async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  const lastEventId = req.headers["last-event-id"] as string | undefined;
  if (lastEventId) {
    console.log(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
  } else {
    console.log(`Establishing new SSE stream for session ${sessionId}`);
  }

  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
};

app.get("/mcp", mcpGetHandler);

// ─── DELETE /mcp — Session termination ───────────────────────────────
// The client sends DELETE when it's done with the session. This allows
// the server to clean up any session-specific state (the transport's
// onclose handler removes it from the registry).

const mcpDeleteHandler = async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  console.log(`Received session termination request for session ${sessionId}`);

  try {
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error("Error handling session termination:", error);
    if (!res.headersSent) {
      res.status(500).send("Error processing session termination");
    }
  }
};

app.delete("/mcp", mcpDeleteHandler);

// ─── Health check (non-MCP) ──────────────────────────────────────────
// A standard HTTP endpoint for monitoring. Reports the number of active
// MCP sessions, which is useful for debugging connection issues.
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    port: MCP_PORT,
    activeSessions: Object.keys(transports).length,
  });
});

const server = app.listen(MCP_PORT, () => {
  console.log(
    `Broadcasting MCP Streamable HTTP Server listening on port ${MCP_PORT}`,
  );
});

// ─── Graceful shutdown ───────────────────────────────────────────────
// On SIGINT/SIGTERM, close all active transports (which sends session
// termination to connected clients) and then shut down the HTTP server.
const shutdown = async () => {
  console.log("\nShutting down server...");

  // Close all active transports — each close triggers the onclose handler
  // which removes the transport from the registry.
  for (const sessionId in transports) {
    try {
      console.log(`Closing transport for session ${sessionId}`);
      await transports[sessionId]!.close();
      delete transports[sessionId];
    } catch (error) {
      console.error(`Error closing transport for session ${sessionId}:`, error);
    }
  }

  // Close HTTP server
  server.close(() => {
    console.log("Server shutdown complete");
    process.exit(0);
  });

  // Force exit if graceful shutdown takes too long
  setTimeout(() => {
    console.log("Server forced shutdown");
    process.exit(0);
  }, 3000);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
