/**
 * index.ts — RAG (Retrieval-Augmented Generation) Pipeline
 *
 * RAG is a technique that enhances an LLM's responses by injecting relevant
 * information from a knowledge base directly into the prompt. Instead of
 * relying solely on the model's training data (which may be outdated or
 * lack domain-specific knowledge), RAG retrieves the most relevant documents
 * and includes them as context.
 *
 * Why RAG matters:
 *   - LLMs have a knowledge cutoff date — they don't know about recent events
 *   - LLMs can hallucinate facts — RAG grounds responses in real documents
 *   - Domain knowledge (e.g. StreamVerse's API docs) isn't in public training data
 *   - RAG is cheaper than fine-tuning and works with any model
 *
 * The RAG pipeline has 5 stages:
 *
 *   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
 *   │  1. LOAD  │───►│ 2. CHUNK │───►│ 3. EMBED │───►│ 4. STORE │───►│5. RETRIEVE│
 *   │          │    │          │    │          │    │          │    │          │
 *   │ Read .md │    │ Split    │    │ Convert  │    │ Save in  │    │ Find the │
 *   │ files    │    │ into     │    │ text to  │    │ vector   │    │ most     │
 *   │ from     │    │ smaller  │    │ numeric  │    │ store    │    │ relevant │
 *   │ disk     │    │ pieces   │    │ vectors  │    │ (in-mem) │    │ chunks   │
 *   └──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
 *
 * Stages 1-4 happen once at startup (indexing). Stage 5 happens on every
 * user message (retrieval). The retrieved chunks are injected into the
 * system prompt so the LLM can reference them when generating its answer.
 *
 * Key concepts:
 *
 *   Vector embeddings:
 *     Text is converted into arrays of numbers (vectors) that capture semantic
 *     meaning. Similar texts produce similar vectors. For example, "stream is
 *     buffering" and "video playback lag" would have nearby vectors even though
 *     they share no words. We use Ollama's embedding model (nomic-embed-text)
 *     running locally — same as chat, no external API calls needed.
 *
 *   Similarity search:
 *     When the user asks a question, we embed THEIR question into a vector too,
 *     then find the stored document chunks whose vectors are closest to the
 *     question's vector (using cosine similarity). The closest chunks are the
 *     most semantically relevant to the user's question.
 *
 *   Chunking:
 *     Documents are split into smaller pieces because: (a) embedding models
 *     have input limits, (b) smaller chunks produce more precise matches,
 *     and (c) we don't want to stuff the entire knowledge base into the prompt.
 *     We use RecursiveCharacterTextSplitter which tries to split at natural
 *     boundaries (headings, paragraphs) before falling back to character limits.
 */

import { OllamaEmbeddings } from "@langchain/ollama";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { readdir, readFile } from "fs/promises";
import { join, basename } from "path";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default path to RAG data — markdown files in the mock-services/rag-data directory
const DEFAULT_RAG_DATA_PATH = path.resolve(
  __dirname,
  "../../../mock-services/rag-data",
);

/**
 * Configuration for the RAG pipeline.
 *
 * - ragDataPath:    Directory containing .md knowledge base files
 * - embeddingModel: Ollama model used to generate vector embeddings.
 *                   "nomic-embed-text" is a small, fast embedding model
 *                   specifically designed for text retrieval tasks.
 * - ollamaBaseUrl:  Where Ollama is running (same instance used for chat)
 * - chunkSize:      Target size of each text chunk in characters (~250 tokens).
 *                   Smaller = more precise matches but more chunks to search.
 *                   Larger = more context per chunk but less precise matching.
 * - chunkOverlap:   How many characters overlap between adjacent chunks.
 *                   Overlap prevents information loss at chunk boundaries
 *                   (e.g. a sentence split across two chunks).
 * - topK:           How many chunks to retrieve per query. More chunks =
 *                   more context for the LLM, but also more prompt tokens.
 */
export interface RagConfig {
  ragDataPath?: string;
  embeddingModel?: string;
  ollamaBaseUrl?: string;
  chunkSize?: number;
  chunkOverlap?: number;
  topK?: number;
}

/**
 * A single retrieved chunk with its relevance score.
 * The score is a cosine similarity value (0 to 1, higher = more relevant).
 */
export interface RetrievalResult {
  content: string;
  source: string;
  section?: string;
  score: number;
}

/**
 * The complete result of a retrieval operation: the raw chunks plus
 * a pre-formatted string ready to inject into the system prompt.
 */
export interface RagContext {
  chunks: RetrievalResult[];
  formattedContext: string;
}

// Singleton instance — only one RAG service per API process
let ragServiceInstance: RagService | null = null;

/**
 * RagService implements the full RAG pipeline:
 *   - Indexing (load → chunk → embed → store) at initialization
 *   - Retrieval (embed query → similarity search → return chunks) per query
 *
 * It uses LangChain's abstractions for each stage, with Ollama as the
 * embedding provider and an in-memory vector store for simplicity.
 * In production, you'd swap MemoryVectorStore for a persistent store
 * like Pinecone, Weaviate, or pgvector.
 */
export class RagService {
  /**
   * The vector store holds all document chunks as vectors in memory.
   * It provides similaritySearchWithScore() for retrieval.
   */
  private vectorStore: MemoryVectorStore | null = null;

  /**
   * OllamaEmbeddings wraps Ollama's /api/embeddings endpoint.
   * It converts text strings into numeric vectors using the configured
   * embedding model. The same model must be used for both indexing
   * (document chunks) and querying (user questions) so the vectors
   * live in the same semantic space and can be compared meaningfully.
   */
  private embeddings: OllamaEmbeddings;

  private config: Required<RagConfig>;
  private isInitialized: boolean = false;

  /**
   * Guards against concurrent initialization. If initialize() is called
   * while already in progress, subsequent callers await the same promise
   * instead of starting duplicate work.
   */
  private initPromise: Promise<void> | null = null;

  constructor(config: RagConfig) {
    this.config = {
      ragDataPath: config.ragDataPath || DEFAULT_RAG_DATA_PATH,
      embeddingModel: config.embeddingModel || "nomic-embed-text",
      ollamaBaseUrl: config.ollamaBaseUrl || "http://127.0.0.1:11434",
      chunkSize: config.chunkSize || 1000,
      chunkOverlap: config.chunkOverlap || 200,
      topK: config.topK || 5,
    };

    // Create the embedding model instance. This doesn't make any network
    // calls yet — embeddings are generated lazily when we call
    // MemoryVectorStore.fromDocuments() or similaritySearchWithScore().
    this.embeddings = new OllamaEmbeddings({
      model: this.config.embeddingModel,
      baseUrl: this.config.ollamaBaseUrl,
    });
  }

  // ─── Initialization (indexing pipeline) ─────────────────────────────

  /**
   * Initialize the RAG service by running the full indexing pipeline.
   * This is idempotent — calling it multiple times is safe.
   */
  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    if (this.isInitialized) {
      return;
    }

    this.initPromise = this._initialize();
    await this.initPromise;
    this.initPromise = null;
  }

  /**
   * The actual indexing pipeline: Load → Chunk → Embed → Store
   *
   * This runs once at startup and can take several seconds because
   * generating embeddings requires sending each chunk to Ollama's
   * embedding model. For a small knowledge base (~15 documents),
   * this typically takes 5-15 seconds.
   */
  private async _initialize(): Promise<void> {
    console.log("Initializing RAG service...");
    console.log(`   Embedding model: ${this.config.embeddingModel}`);
    console.log(`   Data path: ${this.config.ragDataPath}`);

    try {
      // Stage 1: LOAD — Read markdown files from disk into Document objects
      const documents = await this.loadDocuments();
      console.log(`   Loaded ${documents.length} documents`);

      // Stage 2: CHUNK — Split documents into smaller, searchable pieces
      const chunks = await this.chunkDocuments(documents);
      console.log(`   Created ${chunks.length} chunks`);

      // Stages 3 & 4: EMBED + STORE — Convert chunks to vectors and index them.
      // MemoryVectorStore.fromDocuments() handles both stages:
      //   a) Sends each chunk's text to Ollama's embedding endpoint
      //   b) Stores the resulting vectors alongside the original text
      // This is the slowest step because it makes N API calls to Ollama
      // (one per chunk) to generate embeddings.
      console.log("   Creating embeddings (this may take a moment)...");
      this.vectorStore = await MemoryVectorStore.fromDocuments(
        chunks,
        this.embeddings,
      );

      this.isInitialized = true;
      console.log("RAG service initialized successfully");
    } catch (error) {
      console.error("Failed to initialize RAG service:", error);
      throw error;
    }
  }

  // ─── Stage 1: Document loading ──────────────────────────────────────

  /**
   * Load all markdown files from the RAG data directory.
   *
   * Each file becomes a LangChain Document with:
   *   - pageContent: the full text of the file
   *   - metadata: source filename, document type, file path
   *
   * Metadata flows through the entire pipeline and ends up attached to
   * retrieved chunks, so we can tell the user "this info came from
   * streaming-api.md, section: Authentication".
   */
  private async loadDocuments(): Promise<Document[]> {
    const documents: Document[] = [];

    try {
      const files = await readdir(this.config.ragDataPath);
      const mdFiles = files.filter((f) => f.endsWith(".md"));

      for (const file of mdFiles) {
        const filePath = join(this.config.ragDataPath, file);
        const content = await readFile(filePath, "utf-8");
        const fileName = basename(file, ".md");
        const docType = this.getDocType(fileName);

        documents.push(
          new Document({
            pageContent: content,
            metadata: {
              source: file,
              fileName,
              docType,
              path: filePath,
            },
          }),
        );
      }
    } catch (error) {
      console.error("Error loading documents:", error);
      throw error;
    }

    return documents;
  }

  /**
   * Classify a document by its filename to aid retrieval relevance.
   * The docType metadata can be used for filtered searches (e.g. only
   * search API docs when the user asks about endpoints).
   */
  private getDocType(fileName: string): string {
    const typeMap: Record<string, string> = {
      "streaming-api": "api",
      "broadcast-api": "api",
      "analytics-service": "api",
      "cdn-service": "api",
      "data-models": "reference",
      "streaming-concepts": "concepts",
      workflows: "guide",
      troubleshooting: "guide",
      "company-info": "company",
      "pricing-plans": "business",
      "policies-guidelines": "policy",
      "support-contacts": "support",
      "creators-partners": "business",
      faqs: "faq",
    };

    return typeMap[fileName] || "general";
  }

  // ─── Stage 2: Document chunking ─────────────────────────────────────

  /**
   * Split documents into smaller chunks for embedding and retrieval.
   *
   * Why chunk?
   *   - Embedding models have input size limits (typically 512-8192 tokens)
   *   - Smaller chunks produce more precise similarity matches
   *   - Only relevant portions of a document get included in the prompt,
   *     saving precious context window space
   *
   * RecursiveCharacterTextSplitter tries to split at semantic boundaries
   * in order of preference:
   *   1. "## " (markdown H2 headings) — best, preserves section structure
   *   2. "### " (H3 headings)
   *   3. "#### " (H4 headings)
   *   4. "\n\n" (paragraph breaks)
   *   5. "\n" (line breaks)
   *   6. " " (word boundaries) — last resort
   *
   * The "recursive" part means: try the first separator; if the resulting
   * pieces are still too large, recursively split them with the next separator.
   *
   * chunkOverlap ensures continuity — the end of chunk N overlaps with the
   * start of chunk N+1, so information that spans a split boundary isn't lost.
   */
  private async chunkDocuments(documents: Document[]): Promise<Document[]> {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: this.config.chunkSize,
      chunkOverlap: this.config.chunkOverlap,
      separators: ["\n## ", "\n### ", "\n#### ", "\n\n", "\n", " "],
    });

    const allChunks: Document[] = [];

    for (const doc of documents) {
      const chunks = await splitter.splitDocuments([doc]);

      // Enrich each chunk's metadata with its section heading (if found)
      // and a unique index for debugging/tracing.
      for (const chunk of chunks) {
        const section = this.extractSection(chunk.pageContent);
        chunk.metadata = {
          ...chunk.metadata,
          section,
          chunkIndex: allChunks.length,
        };
        allChunks.push(chunk);
      }
    }

    return allChunks;
  }

  /**
   * Extract the first markdown heading from a chunk's content.
   * This becomes the "section" metadata, which helps users understand
   * WHERE in a document the retrieved information came from.
   */
  private extractSection(content: string): string {
    const headerMatch = content.match(/^#+\s+(.+)$/m);
    if (headerMatch && headerMatch[1]) {
      return headerMatch[1].trim();
    }
    return "Unknown Section";
  }

  // ─── Stage 5: Retrieval ─────────────────────────────────────────────

  /**
   * Retrieve the most relevant document chunks for a user's query.
   *
   * This is the "R" in RAG — it runs on every user message:
   *
   *   1. The user's query is embedded into a vector (using the same
   *      Ollama embedding model used during indexing)
   *   2. The vector store finds the chunks whose vectors are closest
   *      to the query vector (cosine similarity)
   *   3. Results below the minimum score threshold are filtered out
   *      (to avoid including irrelevant chunks)
   *   4. The top-K results are returned with their content, source,
   *      section, and relevance score
   *
   * The formatted context string is ready to be injected into the
   * system prompt via createRagSystemPrompt().
   *
   * We fetch topK * 2 results initially and then filter by score,
   * because some results may be below the relevance threshold.
   * This ensures we still get topK results even after filtering.
   */
  async retrieve(
    query: string,
    options?: {
      topK?: number;
      minScore?: number;
    },
  ): Promise<RagContext> {
    if (!this.isInitialized || !this.vectorStore) {
      throw new Error("RAG service not initialized. Call initialize() first.");
    }

    const topK = options?.topK || this.config.topK;
    const minScore = options?.minScore || 0.3;

    // similaritySearchWithScore returns [Document, score] pairs.
    // The score is cosine similarity: 0 = completely unrelated, 1 = identical.
    // We request 2x topK to have headroom for filtering low-quality matches.
    const results = await this.vectorStore.similaritySearchWithScore(
      query,
      topK * 2,
    );

    // Filter out low-relevance results and take only the top K
    const filteredResults = results
      .filter(([_doc, score]: [Document, number]) => score >= minScore)
      .slice(0, topK);

    const chunks: RetrievalResult[] = filteredResults.map(
      ([doc, score]: [Document, number]) => ({
        content: doc.pageContent,
        source: doc.metadata.source || "unknown",
        section: doc.metadata.section,
        score: score,
      }),
    );

    const formattedContext = this.formatContext(chunks);

    return {
      chunks,
      formattedContext,
    };
  }

  /**
   * Format retrieved chunks into a string suitable for prompt injection.
   *
   * Each chunk is tagged with its source file and section heading so the
   * LLM can cite its sources (e.g. "According to the streaming-api docs...").
   * Chunks are separated by horizontal rules for visual clarity.
   */
  private formatContext(chunks: RetrievalResult[]): string {
    if (chunks.length === 0) {
      return "No relevant information found in the knowledge base.";
    }

    const contextParts = chunks.map((chunk) => {
      return `[Source: ${chunk.source}${chunk.section ? ` | Section: ${chunk.section}` : ""}]
${chunk.content}`;
    });

    return contextParts.join("\n\n---\n\n");
  }

  // ─── Service lifecycle ──────────────────────────────────────────────

  /**
   * Check if the service is ready to handle retrieval queries.
   */
  isReady(): boolean {
    return this.isInitialized && this.vectorStore !== null;
  }

  /**
   * Reinitialize the service (useful after adding new documents).
   * Discards the existing vector store and rebuilds from scratch.
   */
  async reinitialize(): Promise<void> {
    this.isInitialized = false;
    this.vectorStore = null;
    await this.initialize();
  }
}

// ─── Module-level helpers ───────────────────────────────────────────────
// These functions provide a simple interface for the rest of the API to
// interact with the RAG service singleton without managing instances.

/**
 * Initialize the RAG service singleton.
 *
 * Called once during API startup (in index.ts). Creates the RagService
 * instance, runs the indexing pipeline, and stores the result in the
 * module-level singleton.
 */
export async function initializeRag(config?: RagConfig): Promise<RagService> {
  const ragConfig: RagConfig = {
    embeddingModel:
      config?.embeddingModel ||
      process.env.OLLAMA_EMBEDDING_MODEL ||
      "nomic-embed-text",
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
  };

  if (config?.ragDataPath) {
    ragConfig.ragDataPath = config.ragDataPath;
  }
  if (config?.chunkSize) {
    ragConfig.chunkSize = config.chunkSize;
  }
  if (config?.chunkOverlap) {
    ragConfig.chunkOverlap = config.chunkOverlap;
  }
  if (config?.topK) {
    ragConfig.topK = config.topK;
  }

  ragServiceInstance = new RagService(ragConfig);

  await ragServiceInstance.initialize();
  return ragServiceInstance;
}

/**
 * Get the RAG service instance (or null if not initialized).
 * Used by the chat endpoint to retrieve context for user messages.
 */
export function getRag(): RagService | null {
  return ragServiceInstance;
}

/**
 * Check if RAG is initialized and ready for retrieval.
 * Used as a guard in the chat endpoint and health check.
 */
export function isRagReady(): boolean {
  return ragServiceInstance?.isReady() || false;
}

/**
 * Create a RAG-enhanced system prompt by appending retrieved context.
 *
 * This is where RAG meets the LLM — the retrieved document chunks are
 * injected directly into the system prompt, appearing as "knowledge base
 * context" that the model can reference. The guidelines section instructs
 * the model to:
 *
 *   1. Prioritize knowledge base information over its training data
 *   2. Cite sources so users can verify the information
 *   3. Acknowledge gaps rather than hallucinating
 *   4. Fall back to tools (MCP) if the knowledge base doesn't have the answer
 *
 * This augmented system prompt replaces the default one for the current
 * request only — it doesn't modify any stored configuration.
 */
export function createRagSystemPrompt(
  basePrompt: string,
  ragContext: string,
): string {
  return `${basePrompt}

## Knowledge Base Context

You have access to the following information from the StreamVerse knowledge base. Use this to provide accurate, specific answers:

${ragContext}

## Guidelines

- Prioritize information from the knowledge base context when answering questions
- If information is missing call the relevant tools
- Cite sources (e.g., "According to the streaming-api documentation...")
- If the knowledge base doesn't contain relevant information, acknowledge this
- You can combine knowledge base information with your general knowledge when appropriate`;
}
