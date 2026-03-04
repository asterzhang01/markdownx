/**
 * AI Service Interfaces (Phase 1: definition only, no implementation)
 *
 * All AI capabilities are injected via these interfaces,
 * keeping the core layer completely decoupled from any AI backend.
 *
 * Planned backends (Phase 4):
 *   • Ollama HTTP API
 *   • Apple Intelligence API
 *   • web-llm (WebGPU)
 *   • @xenova/transformers (local vectors)
 */
import type { AutomergeUrl } from "@automerge/automerge-repo";

/** Inline text completion (ghost text) */
export interface AICompletionProvider {
  complete(contextBefore: string, contextAfter: string): Promise<string | null>;
  isAvailable(): Promise<boolean>;
  cancel(): void;
}

/** Semantic search result from vector index */
export interface SemanticSearchResult {
  docUrl: AutomergeUrl;
  title: string;
  snippet: string;
  score: number;
}

/** Cross-document semantic search based on vector embeddings */
export interface AISemanticSearchProvider {
  search(query: string, limit?: number): Promise<SemanticSearchResult[]>;
  indexDocument(docUrl: AutomergeUrl, content: string): Promise<void>;
  removeDocument(docUrl: AutomergeUrl): Promise<void>;
  isAvailable(): Promise<boolean>;
}

/** Document analysis result */
export interface DocumentAnalysisResult {
  summary: string;
  tags: string[];
  estimatedReadingMinutes: number;
}

/** Document analysis (summary + tags) */
export interface AIDocumentAnalysisProvider {
  analyze(content: string): Promise<DocumentAnalysisResult>;
  isAvailable(): Promise<boolean>;
}

/**
 * Dependency-injection container for AI services.
 * All fields are optional — the app works fully without any AI backend.
 */
export interface AIServiceRegistry {
  completion?: AICompletionProvider;
  semanticSearch?: AISemanticSearchProvider;
  documentAnalysis?: AIDocumentAnalysisProvider;
}
