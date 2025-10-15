import { VectorStore } from './vectorStore';
import type { SearchResult } from '@/lib/types';
import {
  generateCitations,
  enhancePromptWithCitations,
} from './citation-generator';
import { formatDocumentContext } from './prompts';

export interface RagOptions {
  maxResults?: number;
  minScore?: number;
  maxCitations?: number;
}

export interface RagResult {
  documentContext: string;
  citations: any[];
  documentSources: string[];
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
   * Get document context for a user message using RAG
   */
  async getDocumentContext(message: Message): Promise<RagResult> {
    const userMessageText = this.extractTextFromMessage(message);
    let documentContext = '';
    let citations: any[] = [];
    let documentSources: string[] = [];

    try {
      console.log(
        '[VectorStore] Searching for documents similar to user query…',
      );

      const similarDocs = await this.searchDocuments(message, userMessageText);

      console.log(
        `[VectorStore] Retrieved ${similarDocs.length} candidate document(s)`,
      );

      if (similarDocs.length > 0) {
        this.logSearchResults(similarDocs);

        // Generate citations from search results
        citations = generateCitations(similarDocs, {
          maxCitations: this.options.maxCitations,
          minScore: this.options.minScore,
          groupBySource: false,
        });

        console.log(`[Citations] Generated ${citations.length} citations`);

        // Create context from retrieved documents
        documentContext = formatDocumentContext(similarDocs);

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
        console.log('[VectorStore] No relevant documents found for query.');
      }
    } catch (error) {
      console.error('Error retrieving similar documents:', error);
      // Return empty context if there's an error
    }

    return {
      documentContext,
      citations,
      documentSources,
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
