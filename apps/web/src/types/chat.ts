export interface ToolCall {
  id: string;
  name: string;
  message?: string;
  result?: string;
  observation?: string;
}

export interface RagSource {
  source: string;
  section?: string;
  score: number;
  preview?: string;
}

export interface AttachedResourceInfo {
  uri: string;
  name: string;
  content: string;
  mimeType?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  thinkingSystem?: string;
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
  ragSources?: RagSource[];
  attachedResources?: AttachedResourceInfo[];
}

export interface SSEEvent {
  event: string;
  data: unknown;
}
