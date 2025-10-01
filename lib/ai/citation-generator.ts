import type { SearchResult, Citation, CitationChunk } from '@/lib/types';
import { generateUUID } from '@/lib/utils';

interface CitationGenerationOptions {
  maxCitations?: number;
  minScore?: number;
  groupBySource?: boolean;
  includeContext?: boolean;
}

/**
 * Generates citations from search results for use in AI responses
 */
export function generateCitations(
  searchResults: SearchResult[],
  options: CitationGenerationOptions = {},
): Citation[] {
  const {
    maxCitations = 30,
    minScore = 0.375,
    groupBySource = true,
    includeContext = true,
  } = options;

  // Filter results by minimum score
  const relevantResults = searchResults.filter(
    (result) => result.score >= minScore,
  );

  if (relevantResults.length === 0) {
    return [];
  }

  const citations: Citation[] = [];
  let citationNumber = 1;

  if (groupBySource) {
    // Group results by source filename for better organization
    const sourceGroups = relevantResults.reduce(
      (groups, result) => {
        const key = result.metadata.filename;
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(result);
        return groups;
      },
      {} as Record<string, SearchResult[]>,
    );

    // Create citations from grouped sources
    for (const [filename, results] of Object.entries(sourceGroups)) {
      if (citations.length >= maxCitations) break;

      // Sort results within the group by score (highest first)
      const sortedResults = results.sort((a, b) => b.score - a.score);

      // Take top results from this source
      const topResults = sortedResults.slice(0, 30); // Max 30 chunks per source AFFECTS SPEED

      // Create citation chunks
      const chunks: CitationChunk[] = topResults.map((result) => ({
        id: generateUUID(),
        content: result.metadata.content,
        source: result.metadata.source,
        filename: result.metadata.filename,
        page: result.metadata.page,
        section: result.metadata.section,
        score: result.score,
        coordinates: result.metadata.coordinates,
        imageUrl: result.metadata.imageUrl,
      }));

      // Use the highest-scoring chunk's content as the primary source text
      const primaryChunk = chunks[0];
      const primaryResult = topResults[0]; // Original search result
      let sourceText = primaryChunk.content;

      // For text content, extract a meaningful excerpt
      if (
        primaryResult.metadata.contentType === 'text' &&
        sourceText.length > 200
      ) {
        // Try to find a sentence or meaningful segment
        const sentences = sourceText.split(/[.!?]+/);
        if (sentences.length > 1) {
          // Take first complete sentence or two if they're short
          sourceText = sentences.slice(0, 2).join('. ').trim();
          if (sourceText.length < 100 && sentences.length > 2) {
            sourceText = sentences.slice(0, 3).join('. ').trim();
          }
        } else {
          // Fallback to first 200 characters
          sourceText = `${sourceText.slice(0, 200).trim()}...`;
        }
      }

      const citation: Citation = {
        id: generateUUID(),
        number: citationNumber++,
        chunks,
        sourceText,
      };

      citations.push(citation);
    }
  } else {
    // Create individual citations for each result
    const topResults = relevantResults
      .sort((a, b) => b.score - a.score)
      .slice(0, maxCitations);

    for (const result of topResults) {
      const chunk: CitationChunk = {
        id: generateUUID(),
        content: result.metadata.content,
        source: result.metadata.source,
        filename: result.metadata.filename,
        page: result.metadata.page,
        section: result.metadata.section,
        score: result.score,
        coordinates: result.metadata.coordinates,
        imageUrl: result.metadata.imageUrl,
      };

      let sourceText = result.metadata.content;
      if (sourceText.length > 200) {
        sourceText = `${sourceText.slice(0, 200).trim()}...`;
      }

      const citation: Citation = {
        id: generateUUID(),
        number: citationNumber++,
        chunks: [chunk],
        sourceText,
      };

      citations.push(citation);
    }
  }

  return citations;
}

/**
 * Updates system prompt to instruct the AI to use citations
 */
export function enhancePromptWithCitations(
  systemPrompt: string,
  citations: Citation[],
): string {
  if (citations.length === 0) {
    return systemPrompt;
  }

  const citationInstructions = `

IMPORTANT: When referencing information from the provided documents, you MUST include inline citations using the format [X] where X is the citation number. The available citations are:

${citations
  .map(
    (citation) =>
      `[${citation.number}] ${citation.chunks[0].filename}${citation.chunks[0].page ? ` (Page ${citation.chunks[0].page})` : ''}: "${citation.sourceText}"`,
  )
  .join('\n')}

Guidelines for citations:
- Use citations immediately after making a claim that references document content
- For example: "The system supports multiple databases [1]" or "The API returns JSON responses [2]"
- Multiple citations can be used: "This feature is documented in several sources [1][3]"
- Always cite specific facts, numbers, procedures, or claims from the documents
- Do not cite for general knowledge or your own reasoning`;

  return systemPrompt + citationInstructions;
}

/**
 * Processes AI response to ensure citation format is correct
 */
export function processCitationsInResponse(
  response: string,
  citations: Citation[],
): string {
  // This could be used to validate or clean up citation formatting
  // For now, just return as-is since the AI should handle formatting
  return response;
}
