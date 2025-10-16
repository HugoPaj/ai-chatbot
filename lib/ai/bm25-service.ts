// BM25 search service for keyword-based retrieval
// Complements semantic search with exact keyword matching

export interface BM25Document {
  id: string;
  content: string;
  metadata?: Record<string, any>;
}

export interface BM25Result {
  id: string;
  score: number;
  metadata?: Record<string, any>;
}

/**
 * Simple tokenizer that splits on word boundaries and lowercases
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
    .split(/\s+/)
    .filter((token) => token.length > 2); // Filter out very short tokens
}

/**
 * Calculate term frequency for a document
 */
function calculateTermFrequency(
  tokens: string[],
): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  return tf;
}

/**
 * BM25 Search Service
 * Implements the BM25 ranking function for keyword-based document retrieval
 */
export class BM25Service {
  private documents: BM25Document[];
  private documentTokens: string[][];
  private documentFrequencies: Map<string, number>; // How many docs contain each term
  private averageDocLength: number;
  private k1: number; // Term frequency saturation parameter (default 1.5)
  private b: number; // Length normalization parameter (default 0.75)

  constructor(k1 = 1.5, b = 0.75) {
    this.documents = [];
    this.documentTokens = [];
    this.documentFrequencies = new Map();
    this.averageDocLength = 0;
    this.k1 = k1;
    this.b = b;
  }

  /**
   * Index documents for BM25 search
   */
  indexDocuments(documents: BM25Document[]): void {
    console.log(`[BM25] Indexing ${documents.length} documents...`);

    this.documents = documents;
    this.documentTokens = [];
    this.documentFrequencies.clear();

    // Tokenize all documents
    let totalLength = 0;
    for (const doc of documents) {
      const tokens = tokenize(doc.content);
      this.documentTokens.push(tokens);
      totalLength += tokens.length;

      // Count document frequencies
      const uniqueTokens = new Set(tokens);
      for (const token of uniqueTokens) {
        this.documentFrequencies.set(
          token,
          (this.documentFrequencies.get(token) || 0) + 1,
        );
      }
    }

    this.averageDocLength =
      this.documents.length > 0 ? totalLength / this.documents.length : 0;

    console.log(
      `[BM25] Indexed ${documents.length} documents, avg length: ${this.averageDocLength.toFixed(2)} tokens`,
    );
  }

  /**
   * Calculate IDF (Inverse Document Frequency) for a term
   */
  private calculateIDF(term: string): number {
    const N = this.documents.length;
    const df = this.documentFrequencies.get(term) || 0;

    // BM25 IDF formula: log((N - df + 0.5) / (df + 0.5) + 1)
    return Math.log((N - df + 0.5) / (df + 0.5) + 1);
  }

  /**
   * Calculate BM25 score for a single document given query terms
   */
  private calculateScore(
    queryTokens: string[],
    docIndex: number,
  ): number {
    const docTokens = this.documentTokens[docIndex];
    const docLength = docTokens.length;
    const tf = calculateTermFrequency(docTokens);

    let score = 0;

    for (const term of queryTokens) {
      const termFreq = tf.get(term) || 0;
      if (termFreq === 0) continue;

      const idf = this.calculateIDF(term);

      // BM25 scoring formula
      const numerator = termFreq * (this.k1 + 1);
      const denominator =
        termFreq +
        this.k1 * (1 - this.b + this.b * (docLength / this.averageDocLength));

      score += idf * (numerator / denominator);
    }

    return score;
  }

  /**
   * Search documents using BM25 ranking
   */
  search(query: string, topK = 100): BM25Result[] {
    if (this.documents.length === 0) {
      console.warn('[BM25] No documents indexed');
      return [];
    }

    const queryTokens = tokenize(query);

    if (queryTokens.length === 0) {
      console.warn('[BM25] Empty query after tokenization');
      return [];
    }

    console.log(
      `[BM25] Searching for: "${query}" (${queryTokens.length} tokens)`,
    );

    // Calculate scores for all documents
    const results: BM25Result[] = [];

    for (let i = 0; i < this.documents.length; i++) {
      const score = this.calculateScore(queryTokens, i);

      if (score > 0) {
        results.push({
          id: this.documents[i].id,
          score,
          metadata: this.documents[i].metadata,
        });
      }
    }

    // Sort by score descending and return top K
    results.sort((a, b) => b.score - a.score);

    console.log(
      `[BM25] Found ${results.length} results, returning top ${Math.min(topK, results.length)}`,
    );

    return results.slice(0, topK);
  }

  /**
   * Get indexed document count
   */
  getDocumentCount(): number {
    return this.documents.length;
  }

  /**
   * Clear all indexed documents
   */
  clear(): void {
    this.documents = [];
    this.documentTokens = [];
    this.documentFrequencies.clear();
    this.averageDocLength = 0;
  }
}
