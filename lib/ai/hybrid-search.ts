// Hybrid search combining BM25 keyword search with semantic embedding search
import type { SearchResult } from '@/lib/types';
import type { BM25Result } from './bm25-service';

export interface HybridSearchResult {
  id: string;
  score: number;
  bm25Score?: number;
  semanticScore?: number;
  metadata: SearchResult['metadata'];
}

export type FusionMethod = 'rrf' | 'weighted';

/**
 * Reciprocal Rank Fusion (RRF)
 * Combines rankings from multiple sources using reciprocal ranks
 * More robust to score scale differences than simple averaging
 */
function reciprocalRankFusion(
  results: Array<{ id: string; rank: number }[]>,
  k = 60,
): Map<string, number> {
  const scores = new Map<string, number>();

  for (const resultSet of results) {
    for (const { id, rank } of resultSet) {
      const rrfScore = 1 / (k + rank);
      scores.set(id, (scores.get(id) || 0) + rrfScore);
    }
  }

  return scores;
}

/**
 * Weighted score fusion
 * Simple weighted average of normalized scores
 */
function weightedFusion(
  bm25Results: Map<string, number>,
  semanticResults: Map<string, number>,
  bm25Weight = 0.3,
  semanticWeight = 0.7,
): Map<string, number> {
  const allIds = new Set([...bm25Results.keys(), ...semanticResults.keys()]);
  const scores = new Map<string, number>();

  // Normalize scores to [0, 1] range
  const maxBM25 = Math.max(...Array.from(bm25Results.values()), 0.001);
  const maxSemantic = Math.max(
    ...Array.from(semanticResults.values()),
    0.001,
  );

  for (const id of allIds) {
    const bm25Score = (bm25Results.get(id) || 0) / maxBM25;
    const semanticScore = (semanticResults.get(id) || 0) / maxSemantic;

    const fusedScore =
      bm25Weight * bm25Score + semanticWeight * semanticScore;
    scores.set(id, fusedScore);
  }

  return scores;
}

/**
 * Hybrid Search Service
 * Combines BM25 keyword search with semantic embedding search
 */
export class HybridSearch {
  /**
   * Fuse BM25 and semantic search results
   * @param bm25Results - Results from BM25 keyword search
   * @param semanticResults - Results from embedding search
   * @param method - Fusion method ('rrf' or 'weighted')
   * @param bm25Weight - Weight for BM25 (only used with 'weighted' method)
   * @param semanticWeight - Weight for semantic (only used with 'weighted' method)
   */
  static fuseResults(
    bm25Results: BM25Result[],
    semanticResults: SearchResult[],
    method: FusionMethod = 'rrf',
    bm25Weight = 0.3,
    semanticWeight = 0.7,
  ): HybridSearchResult[] {
    console.log(
      `[HybridSearch] Fusing ${bm25Results.length} BM25 + ${semanticResults.length} semantic results using ${method}`,
    );

    // Create ID to metadata mapping from semantic results
    const metadataMap = new Map<string, SearchResult['metadata']>();
    semanticResults.forEach((r) => {
      const id = this.generateId(r.metadata);
      metadataMap.set(id, r.metadata);
    });

    // Add BM25 metadata
    bm25Results.forEach((r) => {
      if (r.metadata && !metadataMap.has(r.id)) {
        metadataMap.set(r.id, r.metadata as SearchResult['metadata']);
      }
    });

    let fusedScores: Map<string, number>;

    if (method === 'rrf') {
      // Convert to ranked lists
      const bm25Ranks = bm25Results.map((r, rank) => ({ id: r.id, rank }));
      const semanticRanks = semanticResults.map((r, rank) => ({
        id: this.generateId(r.metadata),
        rank,
      }));

      fusedScores = reciprocalRankFusion([bm25Ranks, semanticRanks]);
    } else {
      // Weighted fusion
      const bm25Scores = new Map(bm25Results.map((r) => [r.id, r.score]));
      const semanticScores = new Map(
        semanticResults.map((r) => [
          this.generateId(r.metadata),
          r.score,
        ]),
      );

      fusedScores = weightedFusion(
        bm25Scores,
        semanticScores,
        bm25Weight,
        semanticWeight,
      );
    }

    // Create hybrid results
    const hybridResults: HybridSearchResult[] = [];

    for (const [id, fusedScore] of fusedScores.entries()) {
      const metadata = metadataMap.get(id);
      if (!metadata) continue;

      const bm25Result = bm25Results.find((r) => r.id === id);
      const semanticResult = semanticResults.find(
        (r) => this.generateId(r.metadata) === id,
      );

      hybridResults.push({
        id,
        score: fusedScore,
        bm25Score: bm25Result?.score,
        semanticScore: semanticResult?.score,
        metadata,
      });
    }

    // Sort by fused score
    hybridResults.sort((a, b) => b.score - a.score);

    console.log(
      `[HybridSearch] Generated ${hybridResults.length} fused results`,
    );

    return hybridResults;
  }

  /**
   * Generate a stable ID from search result metadata
   */
  private static generateId(
    metadata: SearchResult['metadata'],
  ): string {
    // Create a stable ID from content hash + page + section
    return `${metadata.contentHash || metadata.filename}-${metadata.page || 0}-${metadata.section || ''}`;
  }

  /**
   * Convert hybrid results back to SearchResult format
   */
  static toSearchResults(
    hybridResults: HybridSearchResult[],
  ): SearchResult[] {
    return hybridResults.map((r) => ({
      score: r.score,
      metadata: r.metadata,
    }));
  }
}
