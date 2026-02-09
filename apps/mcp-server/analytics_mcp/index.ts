/**
 * Analytics MCP Server — Server-Side MCP Implementation for Analytics
 *
 * This is the second MCP server in the system (the first being the
 * broadcasting server on port 3000). It follows the exact same architecture
 * — see broadcasting-mcp/index.ts for a detailed explanation of MCP server
 * concepts, session management, and the Streamable HTTP transport.
 *
 * What's different about this server:
 *
 *   Domain:        Analytics data (viewer metrics, engagement, demographics)
 *   Port:          3010 (vs 3000 for broadcasting)
 *   Tools:         broadcast_analytics — fetch analytics for a specific broadcast
 *   Resources:     analytics://channels/overview — channel-level analytics summary
 *                  analytics://broadcasts/{id} — per-broadcast analytics (templated)
 *   Prompts:       analyze_broadcast_performance — detailed performance analysis
 *
 * Together, the two servers demonstrate how MCP enables domain separation:
 * each team (broadcasting, analytics) can own their MCP server independently,
 * while the McpClientManager in the API aggregates them into a unified interface.
 *
 * The LLM doesn't know or care that "list_broadcasts" and "broadcast_analytics"
 * live on different servers — it just sees a flat list of available tools and
 * calls whichever one it needs. The McpClientManager handles routing.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools/tools";
import { registerResources } from "./resources/resources";
import { registerPrompts } from "./prompts/prompts";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import cors from "cors";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";

/**
 * Factory: create a fresh McpServer for each client session.
 *
 * Same pattern as the broadcasting server — a new server instance per
 * session avoids shared state issues. Capabilities are identical
 * (logging, tools, resources, prompts), but the registered capabilities
 * come from the analytics domain modules.
 */
const getServer = () => {
  const server = new McpServer(
    {
      name: "analytics-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        logging: {},
        tools: {}, // broadcast_analytics tool
        resources: {}, // channels overview + per-broadcast analytics
        prompts: {}, // analyze_broadcast_performance prompt
      },
    },
  );

  // Register analytics-specific capabilities from domain modules
  registerTools(server);
  registerResources(server);
  registerPrompts(server);

  return server;
};

// Port 3010 — separate from the broadcasting server (3000) and the API (3001)
const MCP_PORT = process.env.ANALYTICS_MCP_PORT
  ? Number.parseInt(process.env.ANALYTICS_MCP_PORT, 10)
  : 3010;

const app = createMcpExpressApp();

// CORS config — identical to broadcasting server. The Mcp-Session-Id header
// must be exposed so the API's MCP client can read and persist session IDs.
app.use(
  cors({
    exposedHeaders: [
      "WWW-Authenticate",
      "Mcp-Session-Id",
      "Last-Event-Id",
      "Mcp-Protocol-Version",
    ],
    origin: "*",
  }),
);

// Active session registry (see broadcasting-mcp/index.ts for detailed explanation)
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// ─── MCP HTTP handlers ──────────────────────────────────────────────
// POST, GET, DELETE handlers follow the same pattern as the broadcasting
// server. See broadcasting-mcp/index.ts for detailed comments on the
// session lifecycle, transport management, and JSON-RPC routing.

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
      // Existing session — route to its transport
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New session — create transport, connect to fresh server instance
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          console.log(`Session initialized with ID: ${sessionId}`);
          transports[sessionId] = transport;
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          console.log(`Transport closed for session ${sid}`);
          delete transports[sid];
        }
      };

      const server = getServer();
      await server.connect(transport);

      await transport.handleRequest(req, res, req.body);
      return;
    } else {
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

// Health check — reports active session count for monitoring
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    port: MCP_PORT,
    activeSessions: Object.keys(transports).length,
  });
});

const server = app.listen(MCP_PORT, () => {
  console.log(
    `Analytics MCP Streamable HTTP Server listening on port ${MCP_PORT}`,
  );
});

// Graceful shutdown — close all MCP sessions before stopping the server
const shutdown = async () => {
  console.log("\nShutting down server...");

  // Close all active transports
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
