import { VectorStore } from './vectorStore';
import type { SearchResult } from '@/lib/types';
import {
  generateCitations,
  enhancePromptWithCitations,
} from './citation-generator';
import { formatDocumentContext } from './prompts';
import { classifyQuery, type QueryType } from './query-classifier';
import { BM25Service, type BM25Document } from './bm25-service';
import { HybridSearch } from './hybrid-search';
import { DocumentLoader, type FullDocumentContent } from './document-loader';
import { PromptCacheManager } from './prompt-cache-manager';

export interface RagOptions {
  maxResults?: number;
  minScore?: number;
  maxCitations?: number;
}

export interface RagResult {
  documentContext: string;
  citations: any[];
  documentSources: string[];
  queryType?: QueryType;
  fullDocumentLoaded?: boolean;
  cachedSystemMessage?: any; // Anthropic MessageCreateParamsNonStreaming['system']
}

export interface MessagePart {
  type: string;
  text?: string;
  url?: string;
  name?: string;
  mediaType?: string;
  [key: string]: any;
}

export interface Message {
  parts: MessagePart[];
  [key: string]: any;
}

export class DocumentRetrievalService {
  private vectorStore: VectorStore;
  private options: Required<RagOptions>;

  constructor(options: RagOptions = {}) {
    this.vectorStore = new VectorStore();
    this.options = {
      maxResults: options.maxResults ?? 100,
      minScore: options.minScore ?? 0.3,
      maxCitations: options.maxCitations ?? 30,
    };
  }

  async initialize(): Promise<void> {
    await this.vectorStore.initialize();
  }

  /**
   * Get document context for a user message using DUAL-PATH RAG
   * Routes to specific or broad query path based on query classification
   */
  async getDocumentContext(message: Message): Promise<RagResult> {
    const userMessageText = this.extractTextFromMessage(message);
    let documentContext = '';
    let citations: any[] = [];
    let documentSources: string[] = [];
    let queryType: QueryType = 'specific';
    let fullDocumentLoaded = false;
    let cachedSystemMessage: any = undefined;

    try {
      console.log('[RAG] ========== DUAL-PATH RAG ==========');
      console.log(`[RAG] Query: "${userMessageText.substring(0, 100)}..."`);

      // Step 1: Classify query type
      const classification = await classifyQuery(userMessageText);
      queryType = classification.type;

      console.log(
        `[RAG] Query classified as: ${queryType.toUpperCase()} (confidence: ${classification.confidence})`,
      );
      console.log(`[RAG] Reasoning: ${classification.reasoning}`);

      // Step 2: Check for image attachments (override classification)
      const fileParts = message.parts.filter(
        (part: any) =>
          part.type === 'file' && part.mediaType?.startsWith('image/'),
      );

      let similarDocs: SearchResult[] = [];

      if (fileParts.length > 0) {
        console.log('[RAG] Image attachment detected, using image search');
        similarDocs = await this.searchByImage(fileParts[0]);
      } else {
        // Step 3: Route based on query type
        if (queryType === 'specific') {
          // SPECIFIC PATH: Child chunks + hybrid search + parent context
          similarDocs = await this.getDocumentContextSpecific(
            userMessageText,
          );
        } else {
          // BROAD PATH: Document size check + full load with caching
          const broadResult = await this.getDocumentContextBroad(
            userMessageText,
          );

          similarDocs = broadResult.results;

          // If full document loaded, prepare cached system message
          if (broadResult.fullDocument) {
            fullDocumentLoaded = true;

            cachedSystemMessage = PromptCacheManager.createCachedSystemMessage(
              '', // Base prompt will be added later
              broadResult.fullDocument,
            );

            console.log(
              '[RAG] 💾 Prepared cached system message for full document',
            );

            // For full document, we'll use the document directly
            // instead of the normal context formatting
            documentContext = `[FULL_DOCUMENT_LOADED: ${broadResult.fullDocument.metadata.filename}]`;
          }
        }
      }

      console.log(
        `[RAG] Retrieved ${similarDocs.length} document(s) after ${queryType} path`,
      );

      if (similarDocs.length > 0) {
        this.logSearchResults(similarDocs);

        // Generate citations from search results
        citations = generateCitations(similarDocs, {
          maxCitations:
            queryType === 'specific' ? 12 : this.options.maxCitations,
          minScore: this.options.minScore,
          groupBySource: false,
        });

        console.log(`[Citations] Generated ${citations.length} citations`);

        // Create context from retrieved documents (if not using full document)
        if (!fullDocumentLoaded) {
          documentContext = formatDocumentContext(similarDocs);
        }

        this.logContextDebugInfo(documentContext, similarDocs);

        // Extract unique source filenames
        documentSources = Array.from(
          new Set(
            similarDocs
              .filter((doc) => doc.score > this.options.minScore)
              .map((doc) => doc.metadata.filename),
          ),
        );
      } else {
        console.log('[RAG] No relevant documents found for query.');
      }

      console.log('[RAG] ====================================');
    } catch (error) {
      console.error('[RAG] Error retrieving documents:', error);
      // Return empty context if there's an error
    }

    return {
      documentContext,
      citations,
      documentSources,
      queryType,
      fullDocumentLoaded,
      cachedSystemMessage,
    };
  }

  /**
   * Enhance system prompt with document context and citations
   */
  enhanceSystemPrompt(
    basePrompt: string,
    ragResult: RagResult,
  ): string {
    let enhancedPrompt = basePrompt;

    if (ragResult.documentContext) {
      enhancedPrompt += `\n\nRelevant engineering documents for reference:\n${ragResult.documentContext}`;
    }

    if (ragResult.citations.length > 0) {
      enhancedPrompt = enhancePromptWithCitations(
        enhancedPrompt,
        ragResult.citations,
      );
    }

    return enhancedPrompt;
  }

  /**
   * SPECIFIC QUERY PATH
   * For precise facts, citations, definitions
   * - Searches child chunks (150-250 tokens)
   * - Uses hybrid search (BM25 + embeddings)
   * - Retrieves 30-40 candidates
   * - Reranks to top 8-12
   * - Returns parent chunks for context
   */
  private async getDocumentContextSpecific(
    query: string,
  ): Promise<SearchResult[]> {
    console.log('[RAG] Using SPECIFIC query path (precise retrieval)');

    // Step 1: Search child chunks only
    const childChunks = await this.vectorStore.searchSimilar(
      query,
      40, // Retrieve 40 candidates
      undefined,
      false, // Don't use reranking yet, we'll do hybrid search first
    );

    // Filter to child chunks only (with fallback to legacy chunks if no child chunks exist)
    let childResults = childChunks.filter(
      (r) => r.metadata.chunkType === 'child',
    );

    // Fallback: if no child chunks found, use legacy chunks (documents uploaded before parent-child system)
    if (childResults.length === 0) {
      console.log(
        '[RAG] No child chunks found, using legacy chunks as fallback',
      );
      childResults = childChunks.filter((r) => !r.metadata.chunkType);
    }

    console.log(
      `[RAG] Retrieved ${childResults.length} ${childResults[0]?.metadata.chunkType === 'child' ? 'child' : 'legacy'} chunks for precise matching`,
    );

    // Step 2: Hybrid search with BM25
    // Index child chunks for BM25
    const bm25Docs: BM25Document[] = childResults.map((r) => ({
      id: r.metadata.contentHash || r.metadata.filename,
      content: r.metadata.content || '',
      metadata: r.metadata,
    }));

    const bm25 = new BM25Service();
    bm25.indexDocuments(bm25Docs);
    const bm25Results = bm25.search(query, 40);

    console.log(`[RAG] BM25 found ${bm25Results.length} keyword matches`);

    // Step 3: Fuse BM25 + semantic results
    const hybridResults = HybridSearch.fuseResults(
      bm25Results,
      childResults,
      'rrf', // Reciprocal Rank Fusion
    );

    console.log(
      `[RAG] Fused hybrid results: ${hybridResults.length} candidates`,
    );

    // Step 4: Rerank to top 8-12 chunks
    const topResults = HybridSearch.toSearchResults(
      hybridResults.slice(0, 12),
    );

    console.log(`[RAG] Reranked to top ${topResults.length} results`);

    // Step 5: Get parent chunks for full context
    const parentIds = [
      ...new Set(
        topResults
          .map((r) => r.metadata.parentChunkId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const parentChunks = await this.vectorStore.getParentChunksByIds(
      parentIds,
    );

    console.log(
      `[RAG] Retrieved ${parentChunks.length} parent chunks for context`,
    );

    // Return parent chunks (full context) with scores from child chunks
    return parentChunks.length > 0 ? parentChunks : topResults;
  }

  /**
   * BROAD QUERY PATH
   * For summaries, analysis, synthesis
   * - Checks document size
   * - If <200K tokens: loads entire document with prompt caching
   * - If >200K tokens: uses adaptive chunking (fallback to standard retrieval)
   */
  private async getDocumentContextBroad(
    query: string,
  ): Promise<{
    results: SearchResult[];
    fullDocument?: FullDocumentContent;
  }> {
    console.log(
      '[RAG] Using BROAD query path (comprehensive analysis)',
    );

    // Step 1: Get all relevant parent chunks from vector search
    const allResults = await this.vectorStore.searchSimilar(
      query,
      this.options.maxResults,
      undefined,
      true, // Use reranking
    );

    // Filter to parent chunks only (or legacy chunks without chunkType)
    const parentResults = allResults.filter(
      (r) =>
        r.metadata.chunkType === 'parent' || !r.metadata.chunkType,
    );

    console.log(
      `[RAG] Retrieved ${parentResults.length} parent chunks`,
    );

    if (parentResults.length === 0) {
      return { results: [] };
    }

    // Step 2: Analyze document size
    const docInfo = DocumentLoader.analyzeDocument(parentResults);

    console.log(
      `[RAG] Document "${docInfo.filename}": ${docInfo.totalTokens.toLocaleString()} tokens`,
    );

    // Step 3: Decide whether to load full document
    if (docInfo.canLoadFully) {
      console.log(
        `[RAG] ✅ Loading full document (under 200K token limit)`,
      );

      const fullDoc = DocumentLoader.loadFullDocument(parentResults);

      if (fullDoc) {
        console.log(
          `[RAG] 📄 Full document loaded: ${fullDoc.metadata.totalTokens.toLocaleString()} tokens`,
        );

        // Log cache efficiency info
        PromptCacheManager.logCacheInfo(fullDoc.metadata.totalTokens);

        return {
          results: parentResults,
          fullDocument: fullDoc,
        };
      }
    } else {
      console.log(
        `[RAG] ⚠️ Document exceeds 200K token limit, using standard retrieval`,
      );
    }

    // Fallback: return parent chunks (standard retrieval)
    return { results: parentResults };
  }

  /**
   * Search for documents using image or text search
   */
  private async searchDocuments(
    message: Message,
    userMessageText: string,
  ): Promise<SearchResult[]> {
    let similarDocs: SearchResult[] = [];

    // Check for file parts with images
    const fileParts = message.parts.filter(
      (part: any) =>
        part.type === 'file' && part.mediaType?.startsWith('image/'),
    );

    // Attempt image-based similarity search first if user provided image attachments
    if (fileParts.length > 0) {
      similarDocs = await this.searchByImage(fileParts[0]);
    }

    // Fall back to text search if no results from image search
    if (similarDocs.length === 0) {
      similarDocs = await this.searchByText(userMessageText);
    }

    return similarDocs;
  }

  /**
   * Search for similar documents using an image
   */
  private async searchByImage(imagePart: any): Promise<SearchResult[]> {
    try {
      console.log(
        `[VectorStore] Detected image attachment (${imagePart.name}). Performing image similarity search…`,
      );

      const imageResponse = await fetch(imagePart.url);

      if (!imageResponse.ok) {
        throw new Error(
          `Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`,
        );
      }

      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      const imageBase64 = imageBuffer.toString('base64');

      const docs = await this.vectorStore.searchSimilarByImage(
        imageBase64,
        this.options.maxResults,
      );

      console.log(
        `[VectorStore] Retrieved ${docs.length} document(s) from image search`,
      );

      return docs;
    } catch (error) {
      console.error(
        '[VectorStore] Image similarity search failed, falling back to text search:',
        error,
      );
      return [];
    }
  }

  /**
   * Search for similar documents using text
   */
  private async searchByText(userMessageText: string): Promise<SearchResult[]> {
    // Check if user is asking specifically about images/figures/photos
    const isImageQuery =
      /\b(imagen|foto|figura|diagrama|gráfico|chart|image|picture|photo|figure|diagram|visual|fotos|imágenes|figuras|diagramas|gráficos|mostrar|enseñar|ver)/i.test(
        userMessageText,
      );

    if (isImageQuery) {
      console.log(
        '[VectorStore] Detected image query - searching with boosted image results',
      );
      return await this.searchWithImageBoost(userMessageText);
    }

    return await this.vectorStore.searchSimilar(
      userMessageText,
      this.options.maxResults,
    );
  }

  /**
   * Search with boosted image results
   */
  private async searchWithImageBoost(
    query: string,
  ): Promise<SearchResult[]> {
    const allResults = await this.vectorStore.searchSimilar(
      query,
      this.options.maxResults,
    );

    // Boost image results by adding a score bonus and prioritize them
    return allResults
      .map((doc) => ({
        ...doc,
        score:
          doc.metadata.contentType === 'image'
            ? doc.score + 0.15
            : doc.score,
      }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Extract text content from message parts
   */
  private extractTextFromMessage(message: Message): string {
    return (
      message.parts.find((part) => part.type === 'text')?.text || ''
    );
  }

  /**
   * Log search results for debugging
   */
  private logSearchResults(docs: SearchResult[]): void {
    // Log top results with score and filename
    console.log(
      '[VectorStore] Top matches:',
      docs.slice(0, 5).map((doc) => ({
        score: doc.score.toFixed(3),
        file: doc.metadata.filename,
        page: doc.metadata.page ?? 'N/A',
        type: doc.metadata.contentType,
      })),
    );

    // Log content breakdown
    const imageResults = docs.filter(
      (doc) => doc.metadata.contentType === 'image',
    );
    const textResults = docs.filter(
      (doc) => doc.metadata.contentType === 'text',
    );
    console.log(
      `[VectorStore] Content breakdown: ${textResults.length} text, ${imageResults.length} images`,
    );

    // Log image results if present
    if (imageResults.length > 0) {
      console.log(
        '[VectorStore] Image results:',
        imageResults.slice(0, 3).map((doc) => ({
          score: doc.score.toFixed(3),
          file: doc.metadata.filename,
          page: doc.metadata.page ?? 'N/A',
          hasRelatedImages: !!(
            doc.metadata.relatedImageUrls &&
            (typeof doc.metadata.relatedImageUrls === 'string'
              ? JSON.parse(doc.metadata.relatedImageUrls).length > 0
              : doc.metadata.relatedImageUrls.length > 0)
          ),
        })),
      );
    }
  }

  /**
   * Log context debug information
   */
  private logContextDebugInfo(
    context: string,
    docs: SearchResult[],
  ): void {
    // Check if images are included in context
    if (context.includes('![')) {
      console.log('[VectorStore] ✅ Images included in context');
      console.log(
        '[VectorStore] Context preview:',
        `${context.substring(0, 500)}...`,
      );
    } else {
      const imageResults = docs.filter(
        (doc) => doc.metadata.contentType === 'image',
      );
      console.log('[VectorStore] ❌ No images in final context');
      console.log(
        '[VectorStore] Available image results:',
        imageResults.length,
      );
      if (imageResults.length > 0) {
        console.log(
          '[VectorStore] Image results details:',
          imageResults.map((doc) => ({
            score: doc.score,
            hasRelatedImages: !!doc.metadata.relatedImageUrls,
            content: doc.metadata.content?.substring(0, 100),
          })),
        );
      }
    }
  }
}
