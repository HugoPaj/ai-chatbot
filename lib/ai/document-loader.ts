// Document loader with token counting for full document loading strategy
import type { SearchResult } from '@/lib/types';

/**
 * Approximate token counting
 * More accurate counting would require tiktoken, but this is a good approximation
 * Claude uses ~3.5 chars per token on average for English text
 */
function estimateTokenCount(text: string): number {
  // Average chars per token for English (Claude tokenizer)
  const CHARS_PER_TOKEN = 3.5;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export interface DocumentInfo {
  filename: string;
  contentHash: string;
  totalTokens: number;
  totalChunks: number;
  canLoadFully: boolean;
}

export interface FullDocumentContent {
  content: string;
  metadata: {
    filename: string;
    source: string;
    contentHash: string;
    totalTokens: number;
    totalChunks: number;
    pdfUrl?: string;
  };
}

/**
 * Document Loader Service
 * Handles document size detection and full document loading for broad queries
 */
export class DocumentLoader {
  private static readonly MAX_TOKENS_FOR_FULL_LOAD = 200_000; // 200K token threshold

  /**
   * Analyze document size from search results
   * @param results - All chunks from a specific document
   * @returns Document information including token count and load feasibility
   */
  static analyzeDocument(results: SearchResult[]): DocumentInfo {
    if (results.length === 0) {
      return {
        filename: '',
        contentHash: '',
        totalTokens: 0,
        totalChunks: 0,
        canLoadFully: false,
      };
    }

    // Group by filename to handle multiple documents
    const firstResult = results[0];
    const filename = firstResult.metadata.filename;
    const contentHash = firstResult.metadata.contentHash || '';

    // Calculate total tokens across all chunks
    let totalTokens = 0;
    for (const result of results) {
      const chunkTokens = estimateTokenCount(result.metadata.content || '');
      totalTokens += chunkTokens;
    }

    const canLoadFully = totalTokens <= this.MAX_TOKENS_FOR_FULL_LOAD;

    console.log(
      `[DocumentLoader] Analyzed "${filename}": ${totalTokens.toLocaleString()} tokens, ${results.length} chunks, can load fully: ${canLoadFully}`,
    );

    return {
      filename,
      contentHash,
      totalTokens,
      totalChunks: results.length,
      canLoadFully,
    };
  }

  /**
   * Load full document content from all chunks
   * Should only be called after verifying document is under token limit
   * @param results - All parent chunks from the document
   * @returns Full document content assembled from chunks
   */
  static loadFullDocument(
    results: SearchResult[],
  ): FullDocumentContent | null {
    if (results.length === 0) {
      return null;
    }

    // Verify we should load this document
    const docInfo = this.analyzeDocument(results);
    if (!docInfo.canLoadFully) {
      console.warn(
        `[DocumentLoader] Document "${docInfo.filename}" exceeds token limit (${docInfo.totalTokens.toLocaleString()} tokens)`,
      );
      return null;
    }

    // Sort chunks by page number for coherent reading
    const sortedResults = [...results].sort((a, b) => {
      const pageA = a.metadata.page || 0;
      const pageB = b.metadata.page || 0;
      return pageA - pageB;
    });

    // Assemble full content
    // For parent chunks, we want to maintain structure
    const contentParts: string[] = [];
    let currentPage = -1;

    for (const result of sortedResults) {
      const page = result.metadata.page || 0;

      // Add page marker when page changes
      if (page !== currentPage && page > 0) {
        currentPage = page;
        contentParts.push(`\n\n--- Page ${page} ---\n\n`);
      }

      contentParts.push(result.metadata.content || '');
    }

    const fullContent = contentParts.join('\n\n');
    const totalTokens = estimateTokenCount(fullContent);

    console.log(
      `[DocumentLoader] Loaded full document "${docInfo.filename}": ${totalTokens.toLocaleString()} tokens from ${sortedResults.length} chunks`,
    );

    return {
      content: fullContent,
      metadata: {
        filename: docInfo.filename,
        source: results[0].metadata.source,
        contentHash: docInfo.contentHash,
        totalTokens,
        totalChunks: results.length,
        pdfUrl: results[0].metadata.pdfUrl,
      },
    };
  }

  /**
   * Get all parent chunks for a specific document
   * This is used to load the full document for broad queries
   * @param allResults - All search results
   * @param filename - Target filename to load
   * @returns Parent chunks for the specified document
   */
  static getDocumentParentChunks(
    allResults: SearchResult[],
    filename: string,
  ): SearchResult[] {
    return allResults.filter(
      (r) =>
        r.metadata.filename === filename &&
        (r.metadata.chunkType === 'parent' ||
          !r.metadata.chunkType), // Include legacy chunks without chunkType
    );
  }

  /**
   * Check if a document can be loaded fully based on filename
   * Queries the vector store to get all chunks and analyzes size
   */
  static async canLoadDocumentFully(
    filename: string,
    getAllChunks: () => Promise<SearchResult[]>,
  ): Promise<boolean> {
    try {
      const allChunks = await getAllChunks();
      const docChunks = this.getDocumentParentChunks(allChunks, filename);
      const docInfo = this.analyzeDocument(docChunks);
      return docInfo.canLoadFully;
    } catch (error) {
      console.error(
        `[DocumentLoader] Error checking if document can be loaded:`,
        error,
      );
      return false;
    }
  }

  /**
   * Get token count for a text string
   */
  static countTokens(text: string): number {
    return estimateTokenCount(text);
  }

  /**
   * Get maximum tokens allowed for full document loading
   */
  static getMaxTokens(): number {
    return this.MAX_TOKENS_FOR_FULL_LOAD;
  }
}
