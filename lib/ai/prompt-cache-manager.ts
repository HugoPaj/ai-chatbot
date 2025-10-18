// Prompt cache manager for Anthropic's prompt caching feature
// Reduces cost by ~90% for repeated large context queries
import type Anthropic from '@anthropic-ai/sdk';
import type { FullDocumentContent } from './document-loader';

export interface CachedPromptConfig {
  documentContent: string;
  systemPrompt: string;
  cacheBreakpoint?: 'ephemeral' | 'system' | 'assistant';
}

/**
 * Prompt Cache Manager
 * Implements Anthropic's prompt caching for large document contexts
 *
 * How it works:
 * - Documents are marked with cache_control to enable caching
 * - Cached content must be at least 1024 tokens (2048 recommended)
 * - Cache TTL is 5 minutes
 * - Reduces input token costs by 90% for cached content
 * - Write costs are 25% more, but read costs are 90% less
 */
export class PromptCacheManager {
  private static readonly MIN_CACHE_TOKENS = 1024;
  private static readonly RECOMMENDED_CACHE_TOKENS = 2048;

  /**
   * Create a cacheable system message with document context
   * The document content will be cached for 5 minutes
   */
  static createCachedSystemMessage(
    basePrompt: string,
    documentContent: FullDocumentContent,
  ): Anthropic.Messages.MessageCreateParamsNonStreaming['system'] {
    const docText = this.formatDocumentForCaching(documentContent);

    // Estimate tokens (rough approximation: 3.5 chars per token)
    const estimatedTokens = Math.ceil(docText.length / 3.5);

    if (estimatedTokens < this.MIN_CACHE_TOKENS) {
      console.warn(
        `[PromptCache] Document too small for caching (${estimatedTokens} tokens, min ${this.MIN_CACHE_TOKENS})`,
      );
      // Return without cache control if too small
      return [
        {
          type: 'text',
          text: `${basePrompt}\n\n# Document Content\n\n${docText}`,
        },
      ];
    }

    console.log(
      `[PromptCache] Creating cached system message (~${estimatedTokens.toLocaleString()} tokens)`,
    );

    // Structure the system prompt to maximize cache benefits
    // The cached portion should be stable across queries
    return [
      {
        type: 'text',
        text: basePrompt,
      },
      {
        type: 'text',
        text: `# Full Document Content\n\nThe following is the complete content of the document "${documentContent.metadata.filename}" for analysis:\n\n${docText}`,
        cache_control: { type: 'ephemeral' },
      },
    ];
  }

  /**
   * Create a cacheable system message with multiple documents
   * Each document content will be cached for 5 minutes
   */
  static createMultiDocumentCachedSystemMessage(
    basePrompt: string,
    documentContents: FullDocumentContent[],
  ): Anthropic.Messages.MessageCreateParamsNonStreaming['system'] {
    if (documentContents.length === 0) {
      return [{ type: 'text', text: basePrompt }];
    }

    // For single document, use the optimized single-document method
    if (documentContents.length === 1) {
      return this.createCachedSystemMessage(basePrompt, documentContents[0]);
    }

    const result: Anthropic.Messages.MessageCreateParamsNonStreaming['system'] = [
      {
        type: 'text',
        text: basePrompt,
      },
    ];

    let totalEstimatedTokens = 0;

    // Add each document as a separate cached block
    for (const doc of documentContents) {
      const docText = this.formatDocumentForCaching(doc);
      const estimatedTokens = Math.ceil(docText.length / 3.5);
      totalEstimatedTokens += estimatedTokens;

      if (estimatedTokens >= this.MIN_CACHE_TOKENS) {
        // Add as cached content
        result.push({
          type: 'text',
          text: `# Document: ${doc.metadata.filename}\n\nThe following is the complete content of "${doc.metadata.filename}" for analysis:\n\n${docText}`,
          cache_control: { type: 'ephemeral' },
        });
      } else {
        // Too small for caching, add as regular text
        result.push({
          type: 'text',
          text: `# Document: ${doc.metadata.filename}\n\n${docText}`,
        });
      }
    }

    console.log(
      `[PromptCache] Created multi-document cached message with ${documentContents.length} documents (~${totalEstimatedTokens.toLocaleString()} total tokens)`,
    );

    return result;
  }

  /**
   * Format document content for caching
   * Includes metadata and structured formatting
   */
  private static formatDocumentForCaching(
    doc: FullDocumentContent,
  ): string {
    const parts = [
      `## Document: ${doc.metadata.filename}`,
      `**Source:** ${doc.metadata.source}`,
      `**Total Chunks:** ${doc.metadata.totalChunks}`,
      `**Estimated Tokens:** ${doc.metadata.totalTokens.toLocaleString()}`,
    ];

    if (doc.metadata.pdfUrl) {
      parts.push(`**PDF URL:** ${doc.metadata.pdfUrl}`);
    }

    parts.push('', '---', '', doc.content);

    return parts.join('\n');
  }

  /**
   * Check if a document is large enough to benefit from caching
   */
  static shouldCache(documentTokens: number): boolean {
    return documentTokens >= this.RECOMMENDED_CACHE_TOKENS;
  }

  /**
   * Calculate expected cost savings from caching
   * @param documentTokens - Number of tokens in the document
   * @param queryCount - Expected number of queries against this document
   * @returns Cost multiplier (e.g., 0.2 = 80% savings)
   */
  static calculateCacheSavings(
    documentTokens: number,
    queryCount: number,
  ): {
    withoutCache: number;
    withCache: number;
    savings: number;
    savingsPercent: number;
  } {
    // Anthropic pricing (approximate):
    // - Regular input: 1x cost
    // - Cache write: 1.25x cost (first time)
    // - Cache read: 0.1x cost (90% discount)

    const withoutCache = documentTokens * queryCount * 1.0;

    // With cache: first query pays 1.25x, subsequent queries pay 0.1x
    const withCache =
      documentTokens * 1.25 + // First query (cache write)
      documentTokens * (queryCount - 1) * 0.1; // Subsequent queries (cache read)

    const savings = withoutCache - withCache;
    const savingsPercent = (savings / withoutCache) * 100;

    return {
      withoutCache,
      withCache,
      savings,
      savingsPercent,
    };
  }

  /**
   * Log cache efficiency information
   */
  static logCacheInfo(
    documentTokens: number,
    expectedQueries = 5,
  ): void {
    if (!this.shouldCache(documentTokens)) {
      console.log(
        `[PromptCache] Document too small for effective caching (${documentTokens} tokens)`,
      );
      return;
    }

    const costs = this.calculateCacheSavings(documentTokens, expectedQueries);

    console.log('[PromptCache] Cache Efficiency Analysis:');
    console.log(
      `  Document size: ${documentTokens.toLocaleString()} tokens`,
    );
    console.log(`  Expected queries: ${expectedQueries}`);
    console.log(
      `  Cost without cache: ${costs.withoutCache.toLocaleString()} token-cost units`,
    );
    console.log(
      `  Cost with cache: ${costs.withCache.toLocaleString()} token-cost units`,
    );
    console.log(
      `  Savings: ${costs.savingsPercent.toFixed(1)}% (${costs.savings.toLocaleString()} units)`,
    );
  }

  /**
   * Get minimum tokens required for caching
   */
  static getMinCacheTokens(): number {
    return this.MIN_CACHE_TOKENS;
  }

  /**
   * Get recommended minimum tokens for effective caching
   */
  static getRecommendedCacheTokens(): number {
    return this.RECOMMENDED_CACHE_TOKENS;
  }
}
