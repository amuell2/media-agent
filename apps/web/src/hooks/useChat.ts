import { useState, useRef, useCallback } from "react";
import type { Message, ToolCall, SSEEvent, RagSource } from "@/types/chat";
import type { AttachedResource } from "@/components/McpAttachMenu";

const API_URL = "http://127.0.0.1:3001";

function parseSseChunk(buffer: string): { events: SSEEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const complete = parts.slice(0, -1);
  const rest = parts[parts.length - 1] ?? "";
  const events: SSEEvent[] = [];

  for (const msg of complete) {
    let eventName = "message";
    const dataLines: string[] = [];

    for (const line of msg.split("\n")) {
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      if (line.startsWith("data:")) {
        let dataLine = line.slice(5);
        if (dataLine.startsWith(" ")) dataLine = dataLine.slice(1);
        dataLines.push(dataLine);
      }
    }

    const dataStr = dataLines.join("\n");

    try {
      const data = dataStr ? JSON.parse(dataStr) : {};
      events.push({ event: eventName, data });
    } catch {
      events.push({ event: eventName, data: dataStr });
    }
  }

  return { events, rest };
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [attachedResources, setAttachedResources] = useState<
    AttachedResource[]
  >([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const clearChat = useCallback(async () => {
    try {
      await fetch(`${API_URL}/messages`, {
        method: "DELETE",
      });
    } catch (error) {
      console.error("Error clearing chat:", error);
    }
    setMessages([]);
    setInput("");
    setAttachedResources([]);
  }, []);

  const addAttachedResource = useCallback((resource: AttachedResource) => {
    setAttachedResources((prev) => {
      // Don't add duplicates
      if (prev.some((r) => r.uri === resource.uri)) return prev;
      return [...prev, resource];
    });
  }, []);

  const removeAttachedResource = useCallback((uri: string) => {
    setAttachedResources((prev) => prev.filter((r) => r.uri !== uri));
  }, []);

  const handleUsePrompt = useCallback((promptText: string) => {
    setInput(promptText);
  }, []);

  const sendMessage = useCallback(async () => {
    const hasContent = input.trim() || attachedResources.length > 0;
    if (!hasContent || isLoading) return;

    // Build the message content, prepending resource context if attached
    let messageContent = input.trim();
    if (attachedResources.length > 0) {
      const resourceContext = attachedResources
        .map(
          (r) =>
            `[Attached resource "${r.name}" (${r.uri})]\n${r.content}\n[End of resource "${r.name}"]`,
        )
        .join("\n\n");

      messageContent = messageContent
        ? `${resourceContext}\n\n${messageContent}`
        : resourceContext;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content:
        input.trim() ||
        `(attached ${attachedResources.length} resource${attachedResources.length !== 1 ? "s" : ""})`,
      ...(attachedResources.length > 0 && {
        attachedResources: attachedResources.map((r) => ({
          uri: r.uri,
          name: r.name,
          content: r.content,
          mimeType: r.mimeType,
        })),
      }),
    };

    const assistantId = crypto.randomUUID();

    setMessages((prev) => [
      ...prev,
      userMessage,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        thinking: "",
        thinkingSystem: "",
        isStreaming: true,
      },
    ]);
    setInput("");
    setAttachedResources([]);
    setIsLoading(true);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: messageContent,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("Response body is null");
      }

      let accumulatedThinking = "";
      let accumulatedThinkingSystem = "";
      let accumulatedContent = "";
      const toolCalls: ToolCall[] = [];
      let ragSources: RagSource[] = [];
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseChunk(buffer);
        buffer = parsed.rest;

        for (const evt of parsed.events) {
          if (evt.event === "thinking") {
            const thinkingToken =
              typeof evt.data === "string"
                ? evt.data
                : typeof evt.data === "object" &&
                    evt.data !== null &&
                    "token" in evt.data &&
                    typeof evt.data.token === "string"
                  ? evt.data.token
                  : "";

            const thinkingType =
              typeof evt.data === "object" &&
              evt.data !== null &&
              "thinkingType" in evt.data &&
              typeof evt.data.thinkingType === "string"
                ? evt.data.thinkingType
                : "llm_reasoning";

            if (thinkingToken !== "") {
              if (thinkingType === "system_message") {
                accumulatedThinkingSystem += thinkingToken;
              } else {
                accumulatedThinking += thinkingToken;
              }

              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: accumulatedContent,
                        thinking: accumulatedThinking,
                        thinkingSystem: accumulatedThinkingSystem,
                        isStreaming: true,
                      }
                    : m,
                ),
              );
            }
          } else if (evt.event === "token") {
            const contentTokenRaw =
              typeof evt.data === "string"
                ? evt.data
                : typeof evt.data === "object" &&
                    evt.data !== null &&
                    "token" in evt.data &&
                    typeof evt.data.token === "string"
                  ? evt.data.token
                  : "";
            if (contentTokenRaw !== "") {
              accumulatedContent += contentTokenRaw;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: accumulatedContent,
                        thinking: accumulatedThinking,
                        thinkingSystem: accumulatedThinkingSystem,
                        isStreaming: true,
                      }
                    : m,
                ),
              );
            }
          } else if (evt.event === "tool_call") {
            const toolCallData =
              typeof evt.data === "object" &&
              evt.data !== null &&
              "toolName" in evt.data &&
              typeof evt.data.toolName === "string"
                ? (evt.data as { toolName: string; message?: string })
                : null;

            if (toolCallData && toolCallData.toolName) {
              const toolCall: ToolCall = {
                id: crypto.randomUUID(),
                name: toolCallData.toolName,
                message:
                  typeof toolCallData.message === "string"
                    ? toolCallData.message
                    : `Calling tool: ${toolCallData.toolName}`,
              };
              toolCalls.push(toolCall);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: accumulatedContent,
                        thinking: accumulatedThinking,
                        thinkingSystem: accumulatedThinkingSystem,
                        toolCalls: [...toolCalls],
                        isStreaming: true,
                      }
                    : m,
                ),
              );
            }
          } else if (evt.event === "tool_result") {
            const toolResultData =
              typeof evt.data === "object" &&
              evt.data !== null &&
              "toolName" in evt.data &&
              typeof evt.data.toolName === "string"
                ? (evt.data as { toolName: string; result?: string })
                : null;

            if (toolResultData && toolResultData.toolName) {
              const existingCall = [...toolCalls]
                .reverse()
                .find(
                  (tc) => tc.name === toolResultData.toolName && !tc.result,
                );
              if (existingCall) {
                existingCall.result =
                  typeof toolResultData.result === "string"
                    ? toolResultData.result
                    : "";
              } else {
                toolCalls.push({
                  id: crypto.randomUUID(),
                  name: toolResultData.toolName,
                  result:
                    typeof toolResultData.result === "string"
                      ? toolResultData.result
                      : "",
                });
              }
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: accumulatedContent,
                        thinking: accumulatedThinking,
                        thinkingSystem: accumulatedThinkingSystem,
                        toolCalls: [...toolCalls],
                        isStreaming: true,
                      }
                    : m,
                ),
              );
            }
          } else if (evt.event === "observation") {
            const observationData =
              typeof evt.data === "object" &&
              evt.data !== null &&
              "toolName" in evt.data &&
              typeof evt.data.toolName === "string"
                ? (evt.data as { toolName: string; content?: string })
                : null;

            if (observationData && observationData.toolName) {
              const existingCall = [...toolCalls]
                .reverse()
                .find(
                  (tc) =>
                    tc.name === observationData.toolName && !tc.observation,
                );
              if (existingCall) {
                existingCall.observation =
                  typeof observationData.content === "string"
                    ? observationData.content
                    : "";
              } else {
                toolCalls.push({
                  id: crypto.randomUUID(),
                  name: observationData.toolName,
                  observation:
                    typeof observationData.content === "string"
                      ? observationData.content
                      : "",
                });
              }
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: accumulatedContent,
                        thinking: accumulatedThinking,
                        toolCalls: [...toolCalls],
                        isStreaming: true,
                      }
                    : m,
                ),
              );
            }
          } else if (evt.event === "rag_context") {
            const ragData =
              typeof evt.data === "object" &&
              evt.data !== null &&
              "chunks" in evt.data &&
              Array.isArray(evt.data.chunks)
                ? (evt.data as { chunks: RagSource[]; chunkCount: number })
                : null;

            if (ragData && ragData.chunks.length > 0) {
              ragSources = ragData.chunks;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        ragSources: [...ragSources],
                        isStreaming: true,
                      }
                    : m,
                ),
              );
            }
          } else if (evt.event === "done") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: accumulatedContent,
                      thinking: accumulatedThinking,
                      thinkingSystem: accumulatedThinkingSystem,
                      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                      ragSources:
                        ragSources.length > 0 ? ragSources : undefined,
                      isStreaming: false,
                    }
                  : m,
              ),
            );
          } else if (evt.event === "error") {
            console.error("Stream error:", evt.data);
            const errorMessage =
              typeof evt.data === "object" &&
              evt.data !== null &&
              "message" in evt.data &&
              typeof evt.data.message === "string"
                ? evt.data.message
                : "Unknown error";

            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: `Error: ${errorMessage}`,
                      isStreaming: false,
                    }
                  : m,
              ),
            );
          }
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        console.log("Request aborted");
      } else {
        console.error("Error sending message:", error);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: `Error: ${error instanceof Error ? error.message : String(error)}`,
                  isStreaming: false,
                }
              : m,
          ),
        );
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [input, isLoading, attachedResources]);

  return {
    messages,
    input,
    setInput,
    isLoading,
    sendMessage,
    clearChat,
    attachedResources,
    addAttachedResource,
    removeAttachedResource,
    handleUsePrompt,
  };
}
