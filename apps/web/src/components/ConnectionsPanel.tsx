import { useState, useEffect, useCallback } from "react";
import { ScrollArea } from "./ui/scroll-area";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import {
  Plug,
  Wrench,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Server,
  X,
  BookOpen,
  FileText,
  MessageSquare,
  Database,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface Tool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: unknown;
  serverName?: string;
}

interface Prompt {
  name: string;
  title?: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
  serverName?: string;
}

interface Resource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  serverName?: string;
}

interface MCPServer {
  name: string;
  url: string;
  connected: boolean;
  sessionId?: string;
}

interface MCPStatus {
  servers: MCPServer[];
  connectedCount: number;
  totalCount: number;
}

interface RagSource {
  fileName: string;
  name: string;
  title: string;
  sections: string[];
  content: string;
  size: number;
  lastModified: string;
}

interface RagStatus {
  sources: RagSource[];
  totalCount: number;
  ragReady: boolean;
}

interface ConnectionsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ConnectionsPanel({ isOpen, onClose }: ConnectionsPanelProps) {
  const [status, setStatus] = useState<MCPStatus | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(
    new Set(),
  );
  const [expandedResources, setExpandedResources] = useState<Set<string>>(
    new Set(),
  );
  const [expandedServers, setExpandedServers] = useState<Set<string>>(
    new Set(),
  );
  const [expandedRagSources, setExpandedRagSources] = useState<Set<string>>(
    new Set(),
  );
  const [ragStatus, setRagStatus] = useState<RagStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMCPData = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);

    try {
      // Fetch MCP status
      const statusResponse = await fetch("http://127.0.0.1:3001/mcp/status");
      const statusData = await statusResponse.json();
      setStatus(statusData);

      // Only fetch tools if at least one server is connected
      if (statusData.connectedCount > 0) {
        const [toolsResponse, promptsResponse, resourcesResponse] =
          await Promise.all([
            fetch("http://127.0.0.1:3001/mcp/tools"),
            fetch("http://127.0.0.1:3001/mcp/prompts"),
            fetch("http://127.0.0.1:3001/mcp/resources"),
          ]);
        if (toolsResponse.ok) {
          const toolsData = await toolsResponse.json();
          setTools(toolsData.tools || []);
        }
        if (promptsResponse.ok) {
          const promptsData = await promptsResponse.json();
          setPrompts(promptsData.prompts || []);
        }
        if (resourcesResponse.ok) {
          const resourcesData = await resourcesResponse.json();
          setResources(resourcesData.resources || []);
        }
      } else {
        setTools([]);
        setPrompts([]);
        setResources([]);
      }

      // Fetch RAG sources
      try {
        const ragResponse = await fetch("http://127.0.0.1:3001/rag/sources");
        if (ragResponse.ok) {
          const ragData = await ragResponse.json();
          setRagStatus(ragData);
        }
      } catch (ragErr) {
        console.error("Failed to load RAG sources:", ragErr);
      }
    } catch (err) {
      console.error("Failed to load MCP data:", err);
      setError("Failed to connect to API server");
      setStatus(null);
      setTools([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadMCPData();
      // Auto-refresh every 5 seconds when panel is open
      const interval = setInterval(() => {
        loadMCPData(false);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isOpen, loadMCPData]);

  const toggleToolExpanded = (toolName: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolName)) {
        next.delete(toolName);
      } else {
        next.add(toolName);
      }
      return next;
    });
  };

  const togglePromptExpanded = (promptName: string) => {
    setExpandedPrompts((prev) => {
      const next = new Set(prev);
      if (next.has(promptName)) {
        next.delete(promptName);
      } else {
        next.add(promptName);
      }
      return next;
    });
  };

  const toggleResourceExpanded = (resourceUri: string) => {
    setExpandedResources((prev) => {
      const next = new Set(prev);
      if (next.has(resourceUri)) {
        next.delete(resourceUri);
      } else {
        next.add(resourceUri);
      }
      return next;
    });
  };

  const toggleServerExpanded = (serverName: string) => {
    setExpandedServers((prev) => {
      const next = new Set(prev);
      if (next.has(serverName)) {
        next.delete(serverName);
      } else {
        next.add(serverName);
      }
      return next;
    });
  };

  const toggleRagSourceExpanded = (sourceName: string) => {
    setExpandedRagSources((prev) => {
      const next = new Set(prev);
      if (next.has(sourceName)) {
        next.delete(sourceName);
      } else {
        next.add(sourceName);
      }
      return next;
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Handle ESC key to close panel
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    },
    [isOpen, onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const formatInputSchema = (schema: unknown): string => {
    if (!schema) return "No parameters";
    try {
      return JSON.stringify(schema, null, 2);
    } catch {
      return "Unable to display schema";
    }
  };

  // Group tools by server
  const toolsByServer = tools.reduce(
    (acc, tool) => {
      const serverName = tool.serverName || "unknown";
      if (!acc[serverName]) {
        acc[serverName] = [];
      }
      acc[serverName].push(tool);
      return acc;
    },
    {} as Record<string, Tool[]>,
  );

  const hasConnectedServers = status && status.connectedCount > 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          />

          {/* Panel - slides in from right */}
          <motion.div
            initial={{ x: 400 }}
            animate={{ x: 0 }}
            exit={{ x: 400 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-96 bg-background border-l shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="p-4 border-b bg-muted/30">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Plug className="h-5 w-5 text-emerald-600" />
                  Connections & Knowledge
                </h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => loadMCPData()}
                    disabled={isLoading || isRefreshing}
                    className="h-8 w-8"
                    title="Refresh"
                  >
                    <RefreshCw
                      className={cn("h-4 w-4", isRefreshing && "animate-spin")}
                    />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    title="Close panel (ESC)"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Connection Status Summary */}
              {status && (
                <Card
                  className={cn(
                    "p-3 transition-all",
                    status.connectedCount === status.totalCount
                      ? "border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/20"
                      : status.connectedCount > 0
                        ? "border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20"
                        : "border-red-500/50 bg-red-50 dark:bg-red-950/20",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {status.connectedCount === status.totalCount ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : status.connectedCount > 0 ? (
                      <CheckCircle2 className="h-5 w-5 text-yellow-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">
                        {status.connectedCount} of {status.totalCount} servers
                        connected
                      </p>
                    </div>
                  </div>
                </Card>
              )}

              {error && (
                <Card className="p-3 border-red-500/50 bg-red-50 dark:bg-red-950/20 mt-2">
                  <p className="text-sm text-red-600">{error}</p>
                </Card>
              )}
            </div>

            {/* Server List and Tools */}
            <ScrollArea className="flex-1 p-4">
              {isLoading ? (
                <div className="flex items-center justify-center p-8 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                </div>
              ) : !status || status.totalCount === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                  <XCircle className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-sm">No MCP servers configured</p>
                  <p className="text-xs mt-1">
                    Configure MCP servers in the API
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Server List */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Server className="h-4 w-4 text-blue-600" />
                      <h3 className="font-semibold text-sm">
                        Servers ({status.servers.length})
                      </h3>
                    </div>
                    <div className="space-y-2">
                      {status.servers.map((server) => (
                        <Card
                          key={server.name}
                          className={cn(
                            "transition-all cursor-pointer",
                            server.connected
                              ? "border-emerald-500/30 hover:border-emerald-400"
                              : "border-red-500/30 hover:border-red-400",
                            expandedServers.has(server.name) &&
                              server.connected &&
                              "bg-emerald-50/50 dark:bg-emerald-950/20",
                          )}
                          onClick={() => toggleServerExpanded(server.name)}
                        >
                          <div className="p-3">
                            <div className="flex items-start gap-2">
                              <div className="mt-0.5">
                                {expandedServers.has(server.name) ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-sm capitalize">
                                    {server.name}
                                  </p>
                                  {server.connected ? (
                                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">
                                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                      Connected
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded">
                                      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                                      Disconnected
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                  {server.url}
                                </p>
                              </div>
                            </div>

                            {/* Expanded content */}
                            <AnimatePresence>
                              {expandedServers.has(server.name) && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="mt-3 pt-3 border-t space-y-2">
                                    {server.sessionId && (
                                      <div>
                                        <p className="text-xs font-semibold text-muted-foreground">
                                          Session ID:
                                        </p>
                                        <p className="text-xs font-mono text-muted-foreground truncate">
                                          {server.sessionId}
                                        </p>
                                      </div>
                                    )}
                                    {toolsByServer[server.name] && (
                                      <div>
                                        <p className="text-xs font-semibold text-muted-foreground">
                                          Tools:{" "}
                                          {toolsByServer[server.name].length}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          {toolsByServer[server.name]
                                            .map((t) => t.name)
                                            .join(", ")}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>

                  {/* Tools List */}
                  {hasConnectedServers && tools.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Wrench className="h-4 w-4 text-violet-600" />
                        <h3 className="font-semibold text-sm">
                          Available Tools ({tools.length})
                        </h3>
                      </div>
                      <div className="space-y-2">
                        {tools.map((tool) => (
                          <Card
                            key={`${tool.serverName}-${tool.name}`}
                            className={cn(
                              "transition-all cursor-pointer hover:border-violet-400",
                              expandedTools.has(tool.name) &&
                                "border-violet-500 bg-violet-50/50 dark:bg-violet-950/20",
                            )}
                            onClick={() => toggleToolExpanded(tool.name)}
                          >
                            <div className="p-3">
                              <div className="flex items-start gap-2">
                                <div className="mt-0.5">
                                  {expandedTools.has(tool.name) ? (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="font-mono text-sm font-semibold text-violet-600 truncate">
                                      {tool.name}
                                    </p>
                                    {tool.serverName && (
                                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                        {tool.serverName}
                                      </span>
                                    )}
                                  </div>
                                  {tool.title && (
                                    <p className="text-xs text-foreground mt-0.5">
                                      {tool.title}
                                    </p>
                                  )}
                                  {tool.description && (
                                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                      {tool.description}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Expanded content */}
                              <AnimatePresence>
                                {expandedTools.has(tool.name) && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="mt-3 pt-3 border-t">
                                      <p className="text-xs font-semibold text-muted-foreground mb-2">
                                        Input Schema:
                                      </p>
                                      <pre className="text-xs bg-muted/50 p-2 rounded-md overflow-x-auto font-mono text-muted-foreground">
                                        {formatInputSchema(tool.inputSchema)}
                                      </pre>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Resources List */}
                  {hasConnectedServers && resources.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Database className="h-4 w-4 text-sky-600" />
                        <h3 className="font-semibold text-sm">
                          Resources ({resources.length})
                        </h3>
                      </div>
                      <div className="space-y-2">
                        {resources.map((resource) => (
                          <Card
                            key={`${resource.serverName}-${resource.uri}`}
                            className={cn(
                              "transition-all cursor-pointer hover:border-sky-400",
                              expandedResources.has(resource.uri) &&
                                "border-sky-500 bg-sky-50/50 dark:bg-sky-950/20",
                            )}
                            onClick={() => toggleResourceExpanded(resource.uri)}
                          >
                            <div className="p-3">
                              <div className="flex items-start gap-2">
                                <div className="mt-0.5">
                                  {expandedResources.has(resource.uri) ? (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="font-mono text-sm font-semibold text-sky-600 truncate">
                                      {resource.name}
                                    </p>
                                    {resource.serverName && (
                                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                        {resource.serverName}
                                      </span>
                                    )}
                                  </div>
                                  {resource.description && (
                                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                      {resource.description}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Expanded content */}
                              <AnimatePresence>
                                {expandedResources.has(resource.uri) && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="mt-3 pt-3 border-t space-y-2">
                                      <div>
                                        <p className="text-xs font-semibold text-muted-foreground">
                                          URI:
                                        </p>
                                        <p className="text-xs font-mono text-muted-foreground break-all">
                                          {resource.uri}
                                        </p>
                                      </div>
                                      {resource.mimeType && (
                                        <div>
                                          <p className="text-xs font-semibold text-muted-foreground">
                                            MIME Type:
                                          </p>
                                          <p className="text-xs text-muted-foreground">
                                            {resource.mimeType}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Prompts List */}
                  {hasConnectedServers && prompts.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <MessageSquare className="h-4 w-4 text-amber-600" />
                        <h3 className="font-semibold text-sm">
                          Prompts ({prompts.length})
                        </h3>
                      </div>
                      <div className="space-y-2">
                        {prompts.map((prompt) => (
                          <Card
                            key={`${prompt.serverName}-${prompt.name}`}
                            className={cn(
                              "transition-all cursor-pointer hover:border-amber-400",
                              expandedPrompts.has(prompt.name) &&
                                "border-amber-500 bg-amber-50/50 dark:bg-amber-950/20",
                            )}
                            onClick={() => togglePromptExpanded(prompt.name)}
                          >
                            <div className="p-3">
                              <div className="flex items-start gap-2">
                                <div className="mt-0.5">
                                  {expandedPrompts.has(prompt.name) ? (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="font-mono text-sm font-semibold text-amber-600 truncate">
                                      {prompt.name}
                                    </p>
                                    {prompt.serverName && (
                                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                        {prompt.serverName}
                                      </span>
                                    )}
                                  </div>
                                  {prompt.title && (
                                    <p className="text-xs text-foreground mt-0.5">
                                      {prompt.title}
                                    </p>
                                  )}
                                  {prompt.description && (
                                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                      {prompt.description}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Expanded content */}
                              <AnimatePresence>
                                {expandedPrompts.has(prompt.name) && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="mt-3 pt-3 border-t space-y-2">
                                      {prompt.arguments &&
                                        prompt.arguments.length > 0 && (
                                          <div>
                                            <p className="text-xs font-semibold text-muted-foreground mb-1">
                                              Arguments:
                                            </p>
                                            <div className="space-y-1.5">
                                              {prompt.arguments.map((arg) => (
                                                <div
                                                  key={arg.name}
                                                  className="text-xs bg-muted/50 p-2 rounded-md"
                                                >
                                                  <div className="flex items-center gap-1.5">
                                                    <span className="font-mono font-semibold text-amber-700 dark:text-amber-300">
                                                      {arg.name}
                                                    </span>
                                                    {arg.required && (
                                                      <span className="text-[10px] text-red-500 bg-red-100 dark:bg-red-900/30 px-1 py-0.5 rounded">
                                                        required
                                                      </span>
                                                    )}
                                                  </div>
                                                  {arg.description && (
                                                    <p className="text-muted-foreground mt-0.5">
                                                      {arg.description}
                                                    </p>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      {(!prompt.arguments ||
                                        prompt.arguments.length === 0) && (
                                        <p className="text-xs text-muted-foreground">
                                          No arguments
                                        </p>
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  {hasConnectedServers &&
                    tools.length === 0 &&
                    resources.length === 0 &&
                    prompts.length === 0 && (
                      <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                        <Wrench className="h-12 w-12 mb-3 opacity-30" />
                        <p className="text-sm">
                          No tools, resources, or prompts available
                        </p>
                        <p className="text-xs mt-1">
                          The connected MCP servers have no registered
                          capabilities
                        </p>
                      </div>
                    )}

                  {/* RAG Knowledge Base Sources */}
                  {ragStatus && ragStatus.sources.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <BookOpen className="h-4 w-4 text-emerald-600" />
                        <h3 className="font-semibold text-sm">
                          Knowledge Base ({ragStatus.sources.length})
                        </h3>
                        {ragStatus.ragReady && (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Ready
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {ragStatus.sources.map((source) => (
                          <Card
                            key={source.fileName}
                            className={cn(
                              "transition-all cursor-pointer hover:border-emerald-400",
                              expandedRagSources.has(source.fileName) &&
                                "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20",
                            )}
                            onClick={() =>
                              toggleRagSourceExpanded(source.fileName)
                            }
                          >
                            <div className="p-3">
                              <div className="flex items-start gap-2">
                                <div className="mt-0.5">
                                  {expandedRagSources.has(source.fileName) ? (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </div>
                                <FileText className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 truncate">
                                      {source.title}
                                    </p>
                                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                      {formatFileSize(source.size)}
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {source.fileName}
                                  </p>
                                  {source.sections.length > 0 &&
                                    !expandedRagSources.has(
                                      source.fileName,
                                    ) && (
                                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                                        {source.sections.slice(0, 3).join(", ")}
                                        {source.sections.length > 3 &&
                                          ` +${source.sections.length - 3} more`}
                                      </p>
                                    )}
                                </div>
                              </div>

                              {/* Expanded content */}
                              <AnimatePresence>
                                {expandedRagSources.has(source.fileName) && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="mt-3 pt-3 border-t space-y-3">
                                      {source.sections.length > 0 && (
                                        <div>
                                          <p className="text-xs font-semibold text-muted-foreground mb-1">
                                            Sections ({source.sections.length}):
                                          </p>
                                          <div className="flex flex-wrap gap-1">
                                            {source.sections.map(
                                              (section, idx) => (
                                                <span
                                                  key={idx}
                                                  className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded"
                                                >
                                                  {section}
                                                </span>
                                              ),
                                            )}
                                          </div>
                                        </div>
                                      )}
                                      <div>
                                        <p className="text-xs font-semibold text-muted-foreground mb-2">
                                          Full Content:
                                        </p>
                                        <pre className="text-xs bg-muted/50 p-2 rounded-md overflow-x-auto overflow-y-auto max-h-96 font-mono text-muted-foreground whitespace-pre-wrap">
                                          {source.content}
                                        </pre>
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>

            {/* Footer */}
            <div className="p-4 border-t bg-muted/30 text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span>
                    {tools.length} tool{tools.length !== 1 ? "s" : ""}
                  </span>
                  {resources.length > 0 && (
                    <span>
                      {resources.length} resource
                      {resources.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  {prompts.length > 0 && (
                    <span>
                      {prompts.length} prompt
                      {prompts.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  {ragStatus && (
                    <span>
                      {ragStatus.sources.length} source
                      {ragStatus.sources.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                {(hasConnectedServers || ragStatus?.ragReady) && (
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    Live
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
