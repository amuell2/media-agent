/**
 * ChatMessage — The core message type that flows through the entire system.
 *
 * This type represents a single message in the conversation and is used at
 * every stage of the chat pipeline:
 *
 *   1. API layer (index.ts):
 *      User messages are created here and pushed to conversationHistory.
 *      Assistant messages are assembled from streamed chunks and stored.
 *
 *   2. LangChain layer (ollamaService.ts):
 *      An array of ChatMessages is passed to streamChatCompletion(), which
 *      converts them to LangChain's typed message classes (SystemMessage,
 *      HumanMessage, AIMessage) via toLangChainMessages().
 *
 *   3. Ollama:
 *      LangChain's ChatOllama adapter translates these into Ollama's
 *      /api/chat format and sends them to the local LLM.
 *
 * The three roles map to distinct purposes:
 *   - "system"    → Behavioral instructions (persona, RAG context, ReAct rules).
 *                   Never shown to the user. Set once at the start of each request.
 *   - "user"      → The human's input. Stored in conversation history for context.
 *   - "assistant" → The LLM's response. Includes optional metadata like thinking
 *                   (chain-of-thought reasoning), tool calls, and RAG sources.
 *
 * Optional fields are populated depending on what happened during generation:
 *   - thinking:   The model's chain-of-thought reasoning (if the model supports it
 *                 and the `think: true` option is set in ChatOllama config)
 *   - toolCalls:  Records of MCP tools the model called during the ReAct loop,
 *                 including the tool name, arguments, and result
 *   - timestamp:  ISO 8601 timestamp for UI display and ordering
 */
export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  thinking?: string;
  timestamp?: string;
  toolCalls?: Array<{
    name: string;
    args: any;
    result: string;
  }>;
};
