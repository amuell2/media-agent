/**
 * client.ts — Barrel re-export file for the MCP module
 *
 * This file serves as the public API surface for the `mcp/` module. Instead
 * of importing directly from individual files (McpClient.ts, McpClientManager.ts),
 * consumers import from this single entry point:
 *
 *   import { getMcpClientManager, type McpServerConfig } from "./mcp/client.js";
 *
 * This pattern provides several benefits:
 *
 *   1. Encapsulation — Internal file structure can change (rename, split, merge)
 *      without breaking imports across the codebase.
 *
 *   2. Discoverability — One file shows everything the module offers.
 *
 *   3. Controlled surface — Only symbols explicitly re-exported here are
 *      considered part of the module's public API. Internal helpers stay hidden.
 *
 * Currently two consumers rely on this barrel:
 *   - apps/api/index.ts         → imports getMcpClientManager + McpServerConfig
 *   - apps/api/langchain/ollamaService.ts → imports getMcpClientManager
 */

export {
  McpClient,
  type McpClientOptions,
  type ToolCallResult,
  type Tool,
  type Prompt,
  type Resource,
  type ResourceContent,
} from "./McpClient.js";

export {
  McpClientManager,
  type McpServerConfig,
  getMcpClientManager,
} from "./McpClientManager.js";
