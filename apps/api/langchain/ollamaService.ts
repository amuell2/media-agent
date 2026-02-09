/**
 * ollamaService.ts — LangChain + Ollama Integration with ReAct Agent Loop
 *
 * This file is the brain of the AI chat system. It wires together three
 * major technologies:
 *
 *   1. Ollama     — A local LLM runtime that runs models on your machine.
 *                   Instead of calling OpenAI's API over the internet, Ollama
 *                   downloads and runs open-source models (like Llama, Mistral,
 *                   Qwen) directly on your hardware. This means zero API costs,
 *                   full privacy, and no rate limits.
 *
 *   2. LangChain  — An orchestration framework that provides abstractions for
 *                   working with LLMs. It doesn't run models itself — it wraps
 *                   model providers (Ollama, OpenAI, etc.) with a unified API
 *                   and adds higher-level features like tool binding, message
 *                   history management, and streaming.
 *
 *   3. MCP Tools  — Tools discovered from MCP servers (see mcp/ folder) are
 *                   converted into LangChain-compatible tools so the LLM can
 *                   call them autonomously during conversation.
 *
 * Data flow for a single chat message:
 *
 *   User message
 *       │
 *       ▼
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │  streamChatCompletion()                                        │
 *   │                                                                 │
 *   │  1. Build Ollama model via LangChain (ChatOllama)              │
 *   │  2. Convert MCP tools → LangChain DynamicStructuredTools       │
 *   │  3. Bind tools to the model (model.bindTools)                  │
 *   │  4. Inject ReAct system prompt                                 │
 *   │  5. Enter ReAct loop:                                          │
 *   │     ┌──────────────────────────────────────────────┐           │
 *   │     │  Stream model response (thinking + tokens)   │           │
 *   │     │  If model emits tool_calls:                  │           │
 *   │     │    → Execute each tool via MCP               │           │
 *   │     │    → Feed results back as ToolMessages       │           │
 *   │     │    → Loop again (model decides next action)  │           │
 *   │     │  If no tool_calls:                           │           │
 *   │     │    → Final answer, exit loop                 │           │
 *   │     └──────────────────────────────────────────────┘           │
 *   │  6. Yield chunks as they arrive (SSE to browser)              │
 *   └─────────────────────────────────────────────────────────────────┘
 */

import { ChatOllama } from "@langchain/ollama";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  ToolMessage,
  BaseMessage,
} from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { ChatMessage } from "../types/chatTypes.js";
import { getMcpClientManager } from "../mcp/client.js";

/**
 * Configuration passed to the chat completion function.
 * These values come from the API server's DEFAULT_CONFIG in index.ts.
 */
export interface ChatConfig {
  systemPrompt: string;
  temperature: number;
  maxTokens?: number;
  model?: string;
}

/**
 * Convert our app's message format into LangChain's message classes.
 *
 * LangChain uses a class hierarchy for messages because different message
 * types carry different semantics for the LLM:
 *
 *   - SystemMessage  → Instructions for the model's behavior (not shown to users)
 *   - HumanMessage   → User input
 *   - AIMessage      → Previous model responses (for conversation continuity)
 *   - ToolMessage    → Results from tool execution (see ReAct loop below)
 *
 * This conversion is necessary because our API stores messages as plain objects
 * (with a `role` string), but LangChain's model.stream() expects typed instances.
 */
export function toLangChainMessages(
  messages: Array<{ role: string; content: string }>,
) {
  return messages.map((m) => {
    if (m.role === "system") return new SystemMessage(m.content);
    if (m.role === "assistant") return new AIMessage(m.content);
    return new HumanMessage(m.content);
  });
}

/**
 * Bridge MCP tools into LangChain's tool system.
 *
 * This is the critical integration point between MCP and LangChain:
 *
 *   MCP Tool (from server)          LangChain DynamicStructuredTool
 *   ┌──────────────────────┐        ┌──────────────────────────────┐
 *   │ name: "list_broadcasts"│  ──►  │ name: "list_broadcasts"      │
 *   │ description: "..."    │        │ description: "..."           │
 *   │ inputSchema: {        │        │ schema: z.object({           │
 *   │   type: "object",     │  ──►  │   status: z.string()...      │
 *   │   properties: {...}   │        │ })                           │
 *   │ }                     │        │ func: (input) => {           │
 *   └──────────────────────┘        │   mcpManager.callTool(...)   │
 *                                    │ }                            │
 *                                    └──────────────────────────────┘
 *
 * The key transformation is converting JSON Schema → Zod schema. LangChain
 * requires Zod schemas because they provide runtime validation — when the
 * LLM generates tool call arguments, LangChain validates them against the
 * Zod schema BEFORE calling the tool function. This catches malformed
 * arguments early instead of sending bad data to the MCP server.
 *
 * The `func` callback is the actual tool execution: it calls back into
 * the MCP client manager, which routes the call to the correct MCP server.
 */
async function getMcpTools(): Promise<DynamicStructuredTool[]> {
  try {
    const mcpManager = getMcpClientManager();

    if (!mcpManager.hasConnectedClients()) {
      console.log("No MCP clients connected, skipping tools");
      return [];
    }

    // Fetch tool definitions from all connected MCP servers
    const mcpTools = await mcpManager.listAllTools();

    return mcpTools.map((tool) => {
      // ── JSON Schema → Zod Schema conversion ──────────────────────
      // MCP tools describe their parameters using JSON Schema (the web standard).
      // LangChain needs Zod schemas (TypeScript-native validation library).
      // We manually convert each property based on its declared type.
      let zodSchema = z.object({});

      if (tool.inputSchema && typeof tool.inputSchema === "object") {
        const schema = tool.inputSchema as any;
        const properties = schema.properties || {};
        const required = schema.required || [];

        const zodProps: Record<string, z.ZodTypeAny> = {};

        for (const [key, prop] of Object.entries(properties)) {
          const p = prop as any;
          let zodType: z.ZodTypeAny;

          // Map JSON Schema types to their Zod equivalents
          switch (p.type) {
            case "string":
              zodType = z.string();
              break;
            case "number":
              zodType = z.number();
              break;
            case "integer":
              zodType = z.number().int();
              break;
            case "boolean":
              zodType = z.boolean();
              break;
            default:
              zodType = z.string();
          }

          // Zod `.describe()` attaches a description that LangChain includes
          // in the tool definition sent to the LLM, helping it understand
          // what each parameter does.
          if (p.description) {
            zodType = zodType.describe(p.description);
          }

          // Mark non-required fields as optional so the LLM knows it can
          // omit them. This is important for tools like "list_broadcasts"
          // where all parameters are optional filters.
          if (!required.includes(key)) {
            zodType = zodType.optional();
          }

          zodProps[key] = zodType;
        }

        zodSchema = z.object(zodProps);
      }

      // ── Enhanced description ──────────────────────────────────────
      // We append information about optional parameters to the tool's
      // description. This helps the LLM understand that it can call the
      // tool with an empty object {} to get unfiltered results — many
      // models otherwise try to guess required parameter values.
      let description = tool.description || tool.title || tool.name;
      const schema = tool.inputSchema as any;
      const required = schema?.required || [];
      const properties = schema?.properties || {};

      const optionalParams = Object.keys(properties).filter(
        (k) => !required.includes(k),
      );
      if (optionalParams.length > 0) {
        description += ` (All parameters are optional: ${optionalParams.join(", ")}. You can call this with no arguments or {} to get all results.)`;
      }

      // ── Create the LangChain tool ─────────────────────────────────
      // DynamicStructuredTool is LangChain's way of defining tools at
      // runtime (as opposed to static tool definitions). The `func`
      // callback is what actually executes when the LLM decides to call
      // this tool during the ReAct loop.
      return new DynamicStructuredTool({
        name: tool.name,
        description,
        schema: zodSchema,
        func: async (input) => {
          try {
            // Route the tool call through the MCP client manager,
            // which finds the correct MCP server and sends the request.
            const result = await mcpManager.callTool(tool.name, input);

            // MCP returns content as an array of typed blocks. We extract
            // text blocks and join them — this becomes the "observation"
            // that feeds back into the LLM in the ReAct loop.
            const textContent = result.content
              .filter((c) => c.type === "text")
              .map((c) => c.text)
              .join("\n");

            return textContent || JSON.stringify(result.content);
          } catch (error: any) {
            // Return errors as text rather than throwing — this lets the
            // LLM see the error and potentially try a different approach
            // instead of crashing the entire ReAct loop.
            return `Error calling tool ${tool.name}: ${error?.message || error}`;
          }
        },
      });
    });
  } catch (error) {
    console.error("Error loading MCP tools:", error);
    return [];
  }
}

/**
 * Create and configure the Ollama model via LangChain.
 *
 * ChatOllama is LangChain's wrapper around Ollama's local API. It
 * translates LangChain's generic chat interface into Ollama's HTTP API
 * calls (POST http://localhost:11434/api/chat).
 *
 * Key configuration:
 *   - baseUrl: Where Ollama is running (default: localhost:11434)
 *   - model: Which model to use (e.g. "gpt-oss:20b", "llama3", "qwen2.5")
 *   - think: Enables "thinking" mode — some models (like QwQ, DeepSeek)
 *            can output their reasoning process separately from the answer.
 *            LangChain surfaces this via `additional_kwargs.reasoning_content`.
 *   - keepAlive: How long (in minutes) Ollama keeps the model loaded in
 *                memory after the last request. Avoids cold-start latency.
 *
 * Tool binding:
 *   If MCP tools are available, we call model.bindTools(tools). This doesn't
 *   change the model itself — it configures LangChain to include tool
 *   definitions in every request to Ollama, and to parse tool_calls from
 *   the model's response. Ollama passes these tool definitions to the model
 *   using its native tool/function-calling format.
 */
export async function createOllamaModel(config: ChatConfig) {
  const tools = await getMcpTools();

  const model = new ChatOllama({
    baseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
    model: config.model || "gpt-oss:20b",
    temperature: config.temperature,
    maxRetries: 2,
    keepAlive: 10,
    think: true,
    ...(config.maxTokens && {
      // numPredict is Ollama's equivalent of OpenAI's max_tokens —
      // it limits how many tokens the model generates in one response.
      numPredict: config.maxTokens,
    }),
  });

  // Bind tools to the model so it can call them during generation.
  // When tools are bound, Ollama includes tool definitions in the prompt
  // and the model can respond with structured tool_call objects instead
  // of (or in addition to) regular text.
  if (tools.length > 0) {
    console.log(`Binding ${tools.length} MCP tools to Ollama model`);
    return model.bindTools(tools);
  }

  return model;
}

/**
 * Create the ReAct system prompt by augmenting the base prompt.
 *
 * ReAct (Reasoning + Acting) is an agent pattern where the LLM follows
 * an explicit loop:
 *
 *   THOUGHT → ACTION → OBSERVATION → THOUGHT → ... → FINAL ANSWER
 *
 * Instead of answering immediately, the model:
 *   1. Thinks about what information it needs
 *   2. Calls a tool to get that information
 *   3. Observes the result
 *   4. Decides if it needs more information (loop) or can answer (exit)
 *
 * The system prompt encodes these rules so the model knows to follow
 * this pattern. Without it, models often try to answer directly without
 * using tools, or call tools redundantly.
 *
 * The "CRITICAL RULES" section prevents common failure modes:
 *   - Calling the same tool twice with identical arguments
 *   - Entering infinite loops of tool calls
 *   - Failing to produce a final answer after gathering data
 */
function createReActSystemPrompt(originalPrompt: string): string {
  return `${originalPrompt}

You are a ReAct (Reasoning and Acting) agent. Follow this pattern when using tools:

1. THOUGHT: Analyze what information you need and which tool to use
2. ACTION: Call the appropriate tool with correct parameters
3. OBSERVATION: Review the tool's result
4. REPEAT steps 1-3 ONLY if you need MORE information
5. FINAL ANSWER: Once you have enough information, provide your complete answer WITHOUT calling more tools

CRITICAL RULES:
- If a tool successfully returns a result, DO NOT call it again with the same parameters
- A successful tool call means you have that information - use it in your answer
- When you have gathered sufficient information, respond directly to the user without further tool calls`;
}

/**
 * The main chat completion function — an async generator that streams
 * chunks back to the caller (the API's /chat endpoint).
 *
 * This function is an AsyncGenerator, meaning it yields values over time
 * rather than returning a single result. Each yielded chunk is one of:
 *
 *   - { type: "thinking" }   → Model's reasoning process or system status
 *   - { type: "token" }      → Part of the final answer text
 *   - { type: "tool_call" }  → The model decided to call a tool
 *   - { type: "observation" } → Raw result from a tool execution
 *   - { type: "tool_result" } → Processed tool result for the UI
 *
 * The API server (index.ts) iterates over these chunks with `for await`
 * and forwards each one to the browser as a Server-Sent Event (SSE).
 * This creates a real-time streaming experience — the user sees tokens
 * appear one by one as the model generates them.
 *
 * Two execution paths exist:
 *
 *   Path A — No tools available:
 *     Simply stream the model's response (thinking + tokens). No ReAct
 *     loop needed.
 *
 *   Path B — Tools available (ReAct loop):
 *     Run the model in a loop. Each iteration, check if the model wants
 *     to call tools. If yes, execute them and loop again. If no, the
 *     model's text output is the final answer — exit the loop.
 */
export async function* streamChatCompletion(
  config: ChatConfig,
  messages: ChatMessage[],
): AsyncGenerator<{
  type: "thinking" | "token" | "tool_call" | "tool_result" | "observation";
  content: string;
  toolName?: string;
  thinkingType?: "llm_reasoning" | "system_message";
}> {
  const model = await createOllamaModel(config);
  const tools = await getMcpTools();

  // Inject ReAct instructions into the system prompt (first message).
  // We clone messages to avoid mutating the caller's array.
  const enhancedMessages = messages.map((msg, idx) => {
    if (idx === 0 && msg.role === "system") {
      return { ...msg, content: createReActSystemPrompt(msg.content) };
    }
    return msg;
  });

  // Convert our plain message objects to LangChain's typed message classes.
  const lcMessages: BaseMessage[] = toLangChainMessages(enhancedMessages);

  // ─── Path A: No tools — simple streaming ──────────────────────────
  // When no MCP servers are connected (or they have no tools), we skip
  // the ReAct loop entirely and just stream the model's response.
  if (tools.length === 0) {
    const stream = await model.stream(lcMessages);
    for await (const chunk of stream) {
      // Some models support "thinking" mode where they output their
      // reasoning process separately. LangChain surfaces this in
      // `additional_kwargs.reasoning_content`. We yield it as a
      // separate chunk type so the UI can display it differently
      // (e.g. in a collapsible "LLM Reasoning" section).
      const thinking = chunk.additional_kwargs?.reasoning_content;
      if (thinking && typeof thinking === "string" && thinking.length > 0) {
        yield {
          type: "thinking",
          content: thinking,
          thinkingType: "llm_reasoning",
        };
      }

      // Extract the text content from the chunk. LangChain's chunk.content
      // can be a string or an array of content blocks (for multimodal models).
      const token =
        typeof chunk.content === "string"
          ? chunk.content
          : Array.isArray(chunk.content)
            ? chunk.content.map(String).join("")
            : "";

      if (token !== undefined && token !== "") {
        yield { type: "token", content: token };
      }
    }
    return;
  }

  // ─── Path B: ReAct agent loop ─────────────────────────────────────
  //
  // The ReAct loop is the core agent pattern. Here's how one iteration works:
  //
  //   1. Send all messages (including previous tool results) to the model
  //   2. Stream the model's response, collecting tokens AND tool calls
  //   3. If the model made tool calls:
  //      a. Execute each tool via MCP
  //      b. Append tool results as ToolMessages to the conversation
  //      c. Go back to step 1 (the model sees the results and decides what's next)
  //   4. If the model made NO tool calls:
  //      → Its text output is the final answer. Exit the loop.
  //
  // The conversation grows with each iteration:
  //
  //   [System, User]                              ← Initial
  //   [System, User, AI+tool_calls]               ← Model requests tools
  //   [System, User, AI+tool_calls, ToolResults]  ← We add results
  //   [System, User, AI+tool_calls, ToolResults, AI(final answer)]  ← Done
  //
  // We cap iterations at maxIterations to prevent infinite loops
  // (e.g. if the model keeps calling tools without converging on an answer).

  let currentMessages: BaseMessage[] = [...lcMessages];
  const maxIterations = 10;
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;

    // Yield system-level thinking to show the user which ReAct cycle we're on.
    // This appears in the UI's "System Info" section, separate from the
    // model's own reasoning.
    yield {
      type: "thinking",
      content: `\n=== ReAct Cycle ${iteration}/${maxIterations} ===`,
      thinkingType: "system_message",
    };

    // Visual separator for the LLM reasoning section in the UI
    yield {
      type: "thinking",
      content: "\n==================================\n",
      thinkingType: "llm_reasoning",
    };

    // ── Stream the model's response ─────────────────────────────────
    // model.stream() sends the full message history to Ollama and returns
    // an async iterator of chunks. Each chunk may contain:
    //   - reasoning_content (thinking/CoT)
    //   - text content (answer tokens)
    //   - tool_calls (structured requests to call tools)
    //
    // We accumulate all three because we need the complete response to
    // construct the AIMessage that goes into the conversation history.
    const stream = await model.stream(currentMessages);
    let responseContent = "";
    let reasoningContent = "";
    let toolCalls: any[] = [];

    for await (const chunk of stream) {
      // Capture model's chain-of-thought reasoning (if the model supports it)
      const thinking = chunk.additional_kwargs?.reasoning_content;
      if (thinking && typeof thinking === "string" && thinking.length > 0) {
        reasoningContent += thinking;
        yield {
          type: "thinking",
          content: thinking,
          thinkingType: "llm_reasoning",
        };
      }

      // Capture and stream text tokens immediately as they arrive.
      // This is what gives the user the "typing" effect in the UI.
      const token =
        typeof chunk.content === "string"
          ? chunk.content
          : Array.isArray(chunk.content)
            ? chunk.content.map(String).join("")
            : "";

      if (token !== undefined && token !== "") {
        responseContent += token;
        yield { type: "token", content: token };
      }

      // Capture tool calls. The model emits these as structured objects
      // with a name and arguments — NOT as text. LangChain parses them
      // from Ollama's response format automatically because we used
      // model.bindTools() earlier.
      if (chunk.tool_calls && chunk.tool_calls.length > 0) {
        toolCalls = chunk.tool_calls;
      }
    }

    // ── Decision point: tools or final answer? ──────────────────────
    // If the model didn't request any tool calls, its text output is
    // the final answer. The tokens were already streamed above, so we
    // just exit the loop.
    if (toolCalls.length === 0) {
      yield {
        type: "thinking",
        content: "\nAgent has sufficient information. Providing final answer.",
        thinkingType: "system_message",
      };
      break;
    }

    // ── The model wants to call tools ───────────────────────────────
    // Add the AI's response (with tool_calls attached) to the message
    // history. This is important because the model needs to see its own
    // tool requests when processing the results in the next iteration.
    currentMessages.push(
      new AIMessage({ content: responseContent, tool_calls: toolCalls }),
    );

    // ── Execute each requested tool ─────────────────────────────────
    // The model may request multiple tools in a single turn (parallel
    // tool calling). We execute them sequentially and add each result
    // as a ToolMessage to the conversation history.
    for (const toolCall of toolCalls) {
      // Notify the UI that a tool is being called (shows the tool name
      // and arguments in the chat interface)
      yield {
        type: "tool_call",
        content: `Action: ${toolCall.name}\n Input: ${JSON.stringify(toolCall.args, null, 2)}`,
        toolName: toolCall.name,
      };

      try {
        // Find the matching LangChain tool (which wraps the MCP call)
        const tool = tools.find((t) => t.name === toolCall.name);
        if (!tool) {
          throw new Error(`Tool ${toolCall.name} not found`);
        }

        // Execute the tool. This calls the `func` we defined in getMcpTools(),
        // which routes through McpClientManager → McpClient → MCP Server.
        const result = await tool.func(toolCall.args);

        // Yield the observation (raw tool output) and processed result
        // as separate events so the UI can render them differently.
        yield {
          type: "observation",
          content: `Observation from ${toolCall.name}:\n${result}`,
          toolName: toolCall.name,
        };

        yield {
          type: "tool_result",
          content: result,
          toolName: toolCall.name,
        };

        // ── Feed the result back to the model ───────────────────────
        // ToolMessage is LangChain's way of returning tool results to the
        // model. The tool_call_id links this result back to the specific
        // tool call the model made, so it knows which request this answers.
        //
        // In the next loop iteration, the model sees:
        //   [...previous messages, AIMessage(tool_calls), ToolMessage(result)]
        // and decides whether to call more tools or produce a final answer.
        currentMessages.push(
          new ToolMessage({
            content: result,
            tool_call_id: toolCall.id || toolCall.name,
          }),
        );
      } catch (error: any) {
        const errorMsg = `Error: ${error?.message || error}`;

        yield {
          type: "observation",
          content: `Observation: Action failed\n${errorMsg}`,
          toolName: toolCall.name,
        };

        yield {
          type: "tool_result",
          content: errorMsg,
          toolName: toolCall.name,
        };

        // Even errors are fed back as ToolMessages — the model can
        // see that a tool failed and decide to try a different approach
        // (e.g. different arguments, or a different tool entirely).
        currentMessages.push(
          new ToolMessage({
            content: `Tool execution failed: ${errorMsg}`,
            tool_call_id: toolCall.id || toolCall.name,
          }),
        );
      }
    }

    // Signal that we're about to start the next iteration
    if (iteration < maxIterations) {
      yield {
        type: "thinking",
        content: `\nInformation gathered. Analyzing if more actions are needed...`,
        thinkingType: "system_message",
      };
    }
  }

  // ─── Safety valve: max iterations reached ───────────────────────────
  // If the model kept calling tools without converging on a final answer,
  // we force it to answer with whatever information it has gathered so far.
  // We do this by injecting a HumanMessage that explicitly tells the model
  // to stop using tools and provide its answer NOW.
  if (iteration >= maxIterations) {
    yield {
      type: "thinking",
      content: `\nReached maximum ${maxIterations} ReAct cycles. Providing answer with available information.`,
      thinkingType: "system_message",
    };

    currentMessages.push(
      new HumanMessage(
        "You have reached the maximum number of tool calls. You MUST provide your final answer NOW using the information you have gathered. Do NOT attempt to call any more tools.",
      ),
    );

    // Stream the forced final answer
    const finalStream = await model.stream(currentMessages);
    for await (const chunk of finalStream) {
      const thinking = chunk.additional_kwargs?.reasoning_content;
      if (thinking && typeof thinking === "string" && thinking.length > 0) {
        yield {
          type: "thinking",
          content: thinking,
          thinkingType: "llm_reasoning",
        };
      }

      const token =
        typeof chunk.content === "string"
          ? chunk.content
          : Array.isArray(chunk.content)
            ? chunk.content.map(String).join("")
            : "";

      if (token) {
        yield { type: "token", content: token };
      }
    }
  }
}
