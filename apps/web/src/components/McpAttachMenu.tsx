import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import {
  Plus,
  Database,
  MessageSquare,
  ChevronRight,
  Loader2,
  X,
  ArrowLeft,
  Send,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const API_URL = "http://127.0.0.1:3001";

interface Resource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  serverName?: string;
}

interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

interface Prompt {
  name: string;
  title?: string;
  description?: string;
  arguments?: PromptArgument[];
  serverName?: string;
}

export interface AttachedResource {
  uri: string;
  name: string;
  content: string;
  mimeType?: string;
}

interface McpAttachMenuProps {
  onAttachResource: (resource: AttachedResource) => void;
  onUsePrompt: (promptText: string) => void;
  isLoading: boolean;
}

type MenuView = "main" | "prompt-args";

export function McpAttachMenu({
  onAttachResource,
  onUsePrompt,
  isLoading,
}: McpAttachMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [resources, setResources] = useState<Resource[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [readingUri, setReadingUri] = useState<string | null>(null);
  const [resolvingPrompt, setResolvingPrompt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuView, setMenuView] = useState<MenuView>("main");
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
  const [promptArgs, setPromptArgs] = useState<Record<string, string>>({});
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const fetchData = useCallback(async () => {
    setIsFetching(true);
    setError(null);

    try {
      const [resourcesRes, promptsRes] = await Promise.all([
        fetch(`${API_URL}/mcp/resources`),
        fetch(`${API_URL}/mcp/prompts`),
      ]);

      if (resourcesRes.ok) {
        const data = await resourcesRes.json();
        setResources(data.resources || []);
      }
      if (promptsRes.ok) {
        const data = await promptsRes.json();
        setPrompts(data.prompts || []);
      }
    } catch {
      setError("Failed to load MCP data");
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    } else {
      setMenuView("main");
      setSelectedPrompt(null);
      setPromptArgs({});
      setError(null);
    }
  }, [isOpen, fetchData]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        if (menuView === "prompt-args") {
          setMenuView("main");
          setSelectedPrompt(null);
          setPromptArgs({});
        } else {
          setIsOpen(false);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, menuView]);

  const handleReadResource = async (resource: Resource) => {
    setReadingUri(resource.uri);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/mcp/resources/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uri: resource.uri }),
      });

      if (!response.ok) {
        throw new Error(`Failed to read resource: ${response.statusText}`);
      }

      const data = await response.json();
      const contents = data.contents || [];

      const textContent = contents
        .map((c: { text?: string; blob?: string }) => c.text || c.blob || "")
        .filter(Boolean)
        .join("\n");

      if (textContent) {
        onAttachResource({
          uri: resource.uri,
          name: resource.name,
          content: textContent,
          mimeType: resource.mimeType,
        });
        setIsOpen(false);
      } else {
        setError("Resource returned no content");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to read resource",
      );
    } finally {
      setReadingUri(null);
    }
  };

  const handlePromptClick = (prompt: Prompt) => {
    if (prompt.arguments && prompt.arguments.length > 0) {
      setSelectedPrompt(prompt);
      setPromptArgs({});
      setMenuView("prompt-args");
    } else {
      resolvePrompt(prompt.name, {});
    }
  };

  const handlePromptArgsSubmit = () => {
    if (!selectedPrompt) return;
    resolvePrompt(selectedPrompt.name, promptArgs);
  };

  const resolvePrompt = async (
    promptName: string,
    args: Record<string, string>,
  ) => {
    setResolvingPrompt(promptName);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/mcp/prompts/${promptName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });

      if (!response.ok) {
        throw new Error(`Failed to resolve prompt: ${response.statusText}`);
      }

      const data = await response.json();
      const messages: Array<{ role: string; content: { type: string; text: string } }> =
        data.messages || [];

      // Extract text from user-role messages, or fall back to all messages
      const userMessages = messages.filter((m) => m.role === "user");
      const targetMessages = userMessages.length > 0 ? userMessages : messages;

      const promptText = targetMessages
        .map((m) => {
          if (typeof m.content === "string") return m.content;
          if (m.content && typeof m.content === "object" && "text" in m.content)
            return m.content.text;
          return "";
        })
        .filter(Boolean)
        .join("\n\n");

      if (promptText) {
        onUsePrompt(promptText);
        setIsOpen(false);
      } else {
        setError("Prompt returned no content");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to resolve prompt",
      );
    } finally {
      setResolvingPrompt(null);
    }
  };

  const hasItems = resources.length > 0 || prompts.length > 0;

  return (
    <div className="relative">
      <Button
        ref={buttonRef}
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className={cn(
          "h-[52px] w-[52px] shrink-0 rounded-xl border-2 border-dashed border-muted-foreground/30 hover:border-primary hover:bg-primary/5 transition-all duration-200",
          isOpen && "border-primary bg-primary/5",
        )}
        title="Attach resource or use prompt"
      >
        <Plus
          className={cn(
            "h-5 w-5 transition-transform duration-200",
            isOpen && "rotate-45",
          )}
        />
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full mb-2 left-0 w-80 z-50"
          >
            <Card className="shadow-2xl border-2 overflow-hidden">
              {/* Header */}
              <div className="px-3 py-2.5 border-b bg-muted/30">
                {menuView === "main" ? (
                  <p className="text-sm font-semibold">
                    Attach to conversation
                  </p>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setMenuView("main");
                        setSelectedPrompt(null);
                        setPromptArgs({});
                        setError(null);
                      }}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <p className="text-sm font-semibold truncate">
                      {selectedPrompt?.name}
                    </p>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="max-h-72 overflow-y-auto">
                {isFetching ? (
                  <div className="flex items-center justify-center p-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : menuView === "main" ? (
                  <>
                    {!hasItems && (
                      <div className="p-6 text-center text-sm text-muted-foreground">
                        No resources or prompts available.
                        <br />
                        <span className="text-xs">
                          Make sure MCP servers are connected.
                        </span>
                      </div>
                    )}

                    {/* Resources Section */}
                    {resources.length > 0 && (
                      <div>
                        <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 bg-muted/20">
                          <Database className="h-3 w-3" />
                          Resources
                        </div>
                        {resources.map((resource) => (
                          <button
                            key={`${resource.serverName}-${resource.uri}`}
                            onClick={() => handleReadResource(resource)}
                            disabled={readingUri !== null}
                            className={cn(
                              "w-full text-left px-3 py-2.5 hover:bg-sky-50 dark:hover:bg-sky-950/20 transition-colors border-b last:border-b-0 flex items-start gap-2.5 group disabled:opacity-50",
                            )}
                          >
                            {readingUri === resource.uri ? (
                              <Loader2 className="h-4 w-4 mt-0.5 shrink-0 animate-spin text-sky-600" />
                            ) : (
                              <Database className="h-4 w-4 mt-0.5 shrink-0 text-sky-500 group-hover:text-sky-600 transition-colors" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-medium truncate">
                                  {resource.name}
                                </span>
                                {resource.serverName && (
                                  <span className="text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded shrink-0">
                                    {resource.serverName}
                                  </span>
                                )}
                              </div>
                              {resource.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                  {resource.description}
                                </p>
                              )}
                            </div>
                            <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Prompts Section */}
                    {prompts.length > 0 && (
                      <div>
                        <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 bg-muted/20">
                          <MessageSquare className="h-3 w-3" />
                          Prompts
                        </div>
                        {prompts.map((prompt) => (
                          <button
                            key={`${prompt.serverName}-${prompt.name}`}
                            onClick={() => handlePromptClick(prompt)}
                            disabled={resolvingPrompt !== null}
                            className={cn(
                              "w-full text-left px-3 py-2.5 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors border-b last:border-b-0 flex items-start gap-2.5 group disabled:opacity-50",
                            )}
                          >
                            {resolvingPrompt === prompt.name ? (
                              <Loader2 className="h-4 w-4 mt-0.5 shrink-0 animate-spin text-amber-600" />
                            ) : (
                              <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-amber-500 group-hover:text-amber-600 transition-colors" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-medium truncate">
                                  {prompt.name}
                                </span>
                                {prompt.serverName && (
                                  <span className="text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded shrink-0">
                                    {prompt.serverName}
                                  </span>
                                )}
                              </div>
                              {prompt.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                  {prompt.description}
                                </p>
                              )}
                            </div>
                            <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  /* Prompt Arguments Form */
                  <div className="p-3 space-y-3">
                    {selectedPrompt?.description && (
                      <p className="text-xs text-muted-foreground">
                        {selectedPrompt.description}
                      </p>
                    )}
                    {selectedPrompt?.arguments?.map((arg) => (
                      <div key={arg.name}>
                        <label className="block text-xs font-semibold mb-1">
                          <span className="text-foreground">{arg.name}</span>
                          {arg.required && (
                            <span className="text-red-500 ml-0.5">*</span>
                          )}
                        </label>
                        {arg.description && (
                          <p className="text-[11px] text-muted-foreground mb-1">
                            {arg.description}
                          </p>
                        )}
                        <input
                          type="text"
                          value={promptArgs[arg.name] || ""}
                          onChange={(e) =>
                            setPromptArgs((prev) => ({
                              ...prev,
                              [arg.name]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handlePromptArgsSubmit();
                            }
                          }}
                          placeholder={arg.description || arg.name}
                          className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                        />
                      </div>
                    ))}
                    <Button
                      size="sm"
                      onClick={handlePromptArgsSubmit}
                      disabled={
                        resolvingPrompt !== null ||
                        (selectedPrompt?.arguments?.some(
                          (a) => a.required && !promptArgs[a.name]?.trim(),
                        ) ??
                          false)
                      }
                      className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                    >
                      {resolvingPrompt ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      Use Prompt
                    </Button>
                  </div>
                )}
              </div>

              {/* Error */}
              {error && (
                <div className="px-3 py-2 border-t bg-red-50 dark:bg-red-950/20">
                  <p className="text-xs text-red-600">{error}</p>
                </div>
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Chips row showing attached resources above the input */
export function AttachedResourcesBar({
  attachedResources,
  onRemove,
}: {
  attachedResources: AttachedResource[];
  onRemove: (uri: string) => void;
}) {
  if (attachedResources.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-4 pt-3 pb-1">
      {attachedResources.map((resource) => (
        <span
          key={resource.uri}
          className="inline-flex items-center gap-1.5 text-xs bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 pl-2 pr-1 py-1 rounded-md border border-sky-200 dark:border-sky-800 max-w-[200px]"
        >
          <Database className="h-3 w-3 shrink-0" />
          <span className="truncate">{resource.name}</span>
          <button
            onClick={() => onRemove(resource.uri)}
            className="shrink-0 p-0.5 rounded hover:bg-sky-200 dark:hover:bg-sky-800 transition-colors"
            title="Remove"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
