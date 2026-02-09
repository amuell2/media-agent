import { useState, memo, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  Bot,
  User,
  Brain,
  Wrench,
  Eye,
  Info,
  ChevronRight,
  BookOpen,
  FileText,
  Database,
} from "lucide-react";
import { MarkdownContent } from "./MarkdownContent";
import type { AttachedResourceInfo, RagSource } from "@/types/chat";

export type MessageRole = "user" | "assistant";

export interface ChatMessageProps {
  id?: string;
  role: MessageRole;
  content: string;
  thinking?: string;
  thinkingSystem?: string;
  isStreaming?: boolean;
  toolCalls?: Array<{
    id: string;
    name: string;
    message?: string;
    result?: string;
    observation?: string;
  }>;
  ragSources?: RagSource[];
  attachedResources?: AttachedResourceInfo[];
}

function RagSourceItem({ source }: { source: RagSource }) {
  const [isTextExpanded, setIsTextExpanded] = useState(false);

  return (
    <div className="rounded-lg bg-white/60 dark:bg-black/20 border border-emerald-200/50 dark:border-emerald-800/50 overflow-hidden">
      <button
        onClick={() => setIsTextExpanded(!isTextExpanded)}
        className="w-full flex items-start gap-2 p-2 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20 transition-colors cursor-pointer text-left"
      >
        <span
          className={cn(
            "transition-transform duration-200 mt-0.5",
            isTextExpanded && "rotate-90",
          )}
        >
          <ChevronRight className="h-3 w-3 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
        </span>
        <FileText className="h-4 w-4 text-emerald-500 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs sm:text-sm font-medium text-emerald-900 dark:text-emerald-200">
              {source.source}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
              {(source.score * 100).toFixed(0)}% match
            </span>
          </div>
          {source.section && (
            <div className="text-xs text-emerald-700/70 dark:text-emerald-300/70 mt-0.5">
              Section: {source.section}
            </div>
          )}
          {source.preview && !isTextExpanded && (
            <div className="text-xs text-emerald-800/60 dark:text-emerald-200/60 mt-1 line-clamp-2">
              {source.preview}
            </div>
          )}
        </div>
      </button>

      {/* Expanded full text */}
      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          isTextExpanded
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          {source.preview && (
            <div className="px-3 pb-3 pt-1 ml-7">
              <div className="text-xs text-emerald-900/80 dark:text-emerald-100/80 whitespace-pre-wrap bg-emerald-50/50 dark:bg-emerald-950/30 rounded-md p-2 border border-emerald-200/30 dark:border-emerald-800/30 max-h-96 overflow-y-auto">
                {source.preview}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RagSourcesSection({ sources }: { sources: RagSource[] }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="group/rag relative rounded-xl border-2 border-emerald-300/60 dark:border-emerald-700/60 bg-gradient-to-br from-emerald-50/90 to-teal-50/70 dark:from-emerald-950/50 dark:to-teal-950/40 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-teal-500/5 to-green-500/5 opacity-0 group-hover/rag:opacity-100 transition-opacity duration-500" />

      <div className="relative">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full p-3 sm:p-4 flex items-center gap-2 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30 transition-colors cursor-pointer"
        >
          <span
            className={cn(
              "transition-transform duration-200",
              isExpanded && "rotate-90",
            )}
          >
            <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          </span>
          <BookOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          <span className="text-xs sm:text-sm font-semibold text-emerald-900 dark:text-emerald-300">
            Knowledge Base Sources
          </span>
          <span className="ml-2 px-2 py-0.5 rounded-full bg-emerald-200/60 dark:bg-emerald-800/60 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            {sources.length} {sources.length === 1 ? "source" : "sources"}
          </span>
          <span className="text-xs text-emerald-600/70 dark:text-emerald-400/70 ml-auto">
            {isExpanded ? "Click to collapse" : "Click to expand"}
          </span>
        </button>

        <div
          className={cn(
            "grid transition-all duration-300 ease-in-out",
            isExpanded
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2">
              {sources.map((source, index) => (
                <RagSourceItem key={index} source={source} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ObservationSection({ observation }: { observation: string }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="group/observation relative rounded-xl border-2 border-blue-300/60 dark:border-blue-700/60 bg-gradient-to-br from-blue-50/90 to-cyan-50/70 dark:from-blue-950/50 dark:to-cyan-950/40 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-cyan-500/5 to-sky-500/5 opacity-0 group-hover/observation:opacity-100 transition-opacity duration-500" />

      <div className="relative">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full p-3 sm:p-4 flex items-center gap-2 hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors cursor-pointer"
        >
          <span
            className={cn(
              "transition-transform duration-200",
              isExpanded && "rotate-90",
            )}
          >
            <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          </span>
          <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          <span className="text-xs sm:text-sm font-semibold text-blue-900 dark:text-blue-300">
            Observation
          </span>
          <span className="text-xs text-blue-600/70 dark:text-blue-400/70 ml-auto">
            {isExpanded ? "Click to collapse" : "Click to expand"}
          </span>
        </button>

        <div
          className={cn(
            "grid transition-all duration-300 ease-in-out",
            isExpanded
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <div className="px-3 sm:px-4 pb-3 sm:pb-4">
              <div className="observation-content text-xs sm:text-sm leading-relaxed text-blue-900/90 dark:text-blue-100/90 bg-white/60 dark:bg-black/20 rounded-lg border border-blue-200/50 dark:border-blue-800/50 max-w-full">
                <pre className="whitespace-pre m-0 p-3 font-mono text-xs sm:text-sm overflow-x-auto">
                  {observation}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AttachedResourceItem({
  resource,
}: {
  resource: AttachedResourceInfo;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-lg bg-white/60 dark:bg-black/20 border border-sky-200/50 dark:border-sky-800/50 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-start gap-2 p-2 hover:bg-sky-50/50 dark:hover:bg-sky-900/20 transition-colors cursor-pointer text-left"
      >
        <span
          className={cn(
            "transition-transform duration-200 mt-0.5",
            isExpanded && "rotate-90",
          )}
        >
          <ChevronRight className="h-3 w-3 text-sky-500 dark:text-sky-400 flex-shrink-0" />
        </span>
        <Database className="h-4 w-4 text-sky-500 dark:text-sky-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs sm:text-sm font-medium text-sky-900 dark:text-sky-200">
              {resource.name}
            </span>
            {resource.mimeType && (
              <span className="px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/50 text-[10px] font-mono text-sky-600 dark:text-sky-400">
                {resource.mimeType}
              </span>
            )}
          </div>
          <div className="text-xs text-sky-700/70 dark:text-sky-300/70 mt-0.5 truncate">
            {resource.uri}
          </div>
        </div>
      </button>

      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          isExpanded
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3 pt-1 ml-7">
            <div className="text-xs text-sky-900/80 dark:text-sky-100/80 whitespace-pre-wrap bg-sky-50/50 dark:bg-sky-950/30 rounded-md p-2 border border-sky-200/30 dark:border-sky-800/30 max-h-96 overflow-y-auto font-mono">
              {resource.content}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AttachedResourcesSection({
  resources,
}: {
  resources: AttachedResourceInfo[];
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="group/resources relative rounded-xl border-2 border-sky-300/60 dark:border-sky-700/60 bg-gradient-to-br from-sky-50/90 to-cyan-50/70 dark:from-sky-950/50 dark:to-cyan-950/40 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="absolute inset-0 bg-gradient-to-r from-sky-500/5 via-cyan-500/5 to-blue-500/5 opacity-0 group-hover/resources:opacity-100 transition-opacity duration-500" />

      <div className="relative">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full p-3 sm:p-4 flex items-center gap-2 hover:bg-sky-100/50 dark:hover:bg-sky-900/30 transition-colors cursor-pointer"
        >
          <span
            className={cn(
              "transition-transform duration-200",
              isExpanded && "rotate-90",
            )}
          >
            <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-sky-600 dark:text-sky-400 flex-shrink-0" />
          </span>
          <Database className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-sky-600 dark:text-sky-400 flex-shrink-0" />
          <span className="text-xs sm:text-sm font-semibold text-sky-900 dark:text-sky-300">
            Attached Resources
          </span>
          <span className="ml-2 px-2 py-0.5 rounded-full bg-sky-200/60 dark:bg-sky-800/60 text-xs font-medium text-sky-700 dark:text-sky-300">
            {resources.length}{" "}
            {resources.length === 1 ? "resource" : "resources"}
          </span>
          <span className="text-xs text-sky-600/70 dark:text-sky-400/70 ml-auto">
            {isExpanded ? "Click to collapse" : "Click to expand"}
          </span>
        </button>

        <div
          className={cn(
            "grid transition-all duration-300 ease-in-out",
            isExpanded
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2">
              {resources.map((resource) => (
                <AttachedResourceItem key={resource.uri} resource={resource} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Memoize the message component to prevent unnecessary re-renders during streaming
export const ChatMessage = memo(function ChatMessage({
  role,
  content,
  thinking,
  thinkingSystem,
  isStreaming,
  toolCalls,
  ragSources,
  attachedResources,
}: ChatMessageProps) {
  const isUser = role === "user";
  const [isVisible, setIsVisible] = useState(false);

  // Trigger entrance animation on mount
  useEffect(() => {
    const timer = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  return (
    <div
      className={cn(
        "group relative flex gap-3 sm:gap-4 p-4 sm:p-6 rounded-2xl transition-all duration-300 ease-out",
        isUser
          ? "bg-gradient-to-br from-primary/5 to-primary/10 hover:shadow-md"
          : "bg-gradient-to-br from-background to-muted/30 hover:shadow-lg",
        // Entrance animation
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 select-none items-center justify-center rounded-xl shadow-md transition-all duration-300 ease-out",
          isUser
            ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground ring-2 ring-primary/20"
            : "bg-gradient-to-br from-violet-500 to-purple-600 text-white ring-2 ring-violet-500/20",
          // Entrance animation for avatar
          isVisible ? "scale-100 opacity-100" : "scale-0 opacity-0",
        )}
        style={{ transitionDelay: "50ms" }}
      >
        {isUser ? (
          <User className="h-4 w-4 sm:h-5 sm:w-5" />
        ) : (
          <Bot className="h-4 w-4 sm:h-5 sm:w-5" />
        )}
      </div>

      <div className="flex-1 space-y-3 min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm sm:text-base font-semibold leading-none bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
            {isUser ? "You" : "Assistant"}
          </p>
          {isStreaming && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 animate-in fade-in duration-200">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] sm:text-xs font-medium text-green-700 dark:text-green-400">
                Streaming
              </span>
            </div>
          )}
        </div>

        {/* Attached Resources Section */}
        {attachedResources && attachedResources.length > 0 && (
          <AttachedResourcesSection resources={attachedResources} />
        )}

        {/* RAG Sources Section */}
        {ragSources && ragSources.length > 0 && (
          <RagSourcesSection sources={ragSources} />
        )}

        {/* Tool Calls Section */}
        {toolCalls && toolCalls.length > 0 && (
          <div className="space-y-3">
            {toolCalls.map((toolCall, index) => (
              <div
                key={toolCall.id}
                className="space-y-2 animate-in fade-in slide-in-from-left-2 duration-300"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Tool Call - Invocation */}
                <div className="group/tool relative overflow-hidden rounded-xl border border-amber-300/50 dark:border-amber-700/50 bg-gradient-to-br from-amber-50/80 to-orange-50/60 dark:from-amber-950/50 dark:to-orange-950/30 p-3 sm:p-3.5">
                  <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 via-orange-500/5 to-yellow-500/5 opacity-0 group-hover/tool:opacity-100 transition-opacity duration-500" />

                  <div className="relative flex items-start gap-2">
                    <Wrench className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs sm:text-sm font-semibold text-amber-900 dark:text-amber-300 mb-1">
                        {toolCall.name}
                      </div>
                      {toolCall.message && (
                        <div className="text-xs text-amber-700/90 dark:text-amber-200/70 break-words">
                          {toolCall.message}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Observation - ReAct Phase (Collapsible) */}
                {toolCall.observation && (
                  <ObservationSection observation={toolCall.observation} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* System Messages Section */}
        {thinkingSystem && (
          <div className="group/system relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700/50 bg-gradient-to-br from-slate-50/50 to-gray-50/30 dark:from-slate-900/30 dark:to-gray-900/20 p-3 sm:p-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="absolute inset-0 bg-gradient-to-r from-slate-500/5 via-gray-500/5 to-slate-500/5 opacity-0 group-hover/system:opacity-100 transition-opacity duration-500" />

            <div className="relative">
              <div className="mb-2 flex items-center gap-2">
                <Info className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-600 dark:text-slate-400" />
                <span className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-300">
                  System Info
                </span>
              </div>
              <div className="text-xs sm:text-sm leading-relaxed text-slate-700/90 dark:text-slate-300/80 whitespace-pre-wrap break-words">
                {thinkingSystem}
              </div>
            </div>
          </div>
        )}

        {/* Thinking Section */}
        {thinking && (
          <div className="group/thinking relative overflow-hidden rounded-xl border-2 border-dashed border-violet-200 dark:border-violet-800/50 bg-gradient-to-br from-violet-50/50 to-purple-50/30 dark:from-violet-950/30 dark:to-purple-950/20 p-3 sm:p-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="absolute inset-0 bg-gradient-to-r from-violet-500/5 via-purple-500/5 to-pink-500/5 opacity-0 group-hover/thinking:opacity-100 transition-opacity duration-500" />

            <div className="relative">
              <div className="mb-2 flex items-center gap-2">
                <Brain className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-violet-600 dark:text-violet-400" />
                <span className="text-xs sm:text-sm font-semibold text-violet-900 dark:text-violet-300">
                  LLM Reasoning
                </span>
              </div>
              <div className="text-xs sm:text-sm leading-relaxed text-violet-800/90 dark:text-violet-200/80 whitespace-pre-wrap break-words font-mono">
                {thinking}
              </div>
            </div>
          </div>
        )}

        {/* Content Section */}
        {content && (
          <div className="overflow-hidden">
            <MarkdownContent content={content} isStreaming={isStreaming} />
          </div>
        )}

        {/* Loading Animation */}
        {!content && !thinking && isStreaming && (
          <div className="flex items-center gap-1.5 sm:gap-2 animate-in fade-in duration-300">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-gradient-to-r from-violet-500 to-purple-600 animate-bounce"
                style={{
                  animationDelay: `${i * 150}ms`,
                  animationDuration: "1s",
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Decorative gradient overlay */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-transparent via-transparent to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
    </div>
  );
});
