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
    groupBySource = false, // Changed to false for granular, precise citations
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
      const chunks: CitationChunk[] = topResults.map((result) => {
        const relatedImageUrls = result.metadata.relatedImageUrls
          ? typeof result.metadata.relatedImageUrls === 'string'
            ? JSON.parse(result.metadata.relatedImageUrls)
            : result.metadata.relatedImageUrls
          : undefined;

        return {
          id: generateUUID(),
          content: result.metadata.content,
          source: result.metadata.source,
          filename: result.metadata.filename,
          page: result.metadata.page,
          section: result.metadata.section,
          score: result.score,
          coordinates: result.metadata.coordinates,
          relatedImageUrls,
          pdfUrl: result.metadata.pdfUrl,
        };
      });

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
      const relatedImageUrls = result.metadata.relatedImageUrls
        ? typeof result.metadata.relatedImageUrls === 'string'
          ? JSON.parse(result.metadata.relatedImageUrls)
          : result.metadata.relatedImageUrls
        : undefined;

      const chunk: CitationChunk = {
        id: generateUUID(),
        content: result.metadata.content,
        source: result.metadata.source,
        filename: result.metadata.filename,
        page: result.metadata.page,
        section: result.metadata.section,
        score: result.score,
        coordinates: result.metadata.coordinates,
        relatedImageUrls,
        pdfUrl: result.metadata.pdfUrl,
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

CRITICAL: You MUST use precise inline citations [X] immediately after EVERY statement derived from the documents. Each citation number corresponds to a SPECIFIC piece of information.

Available citations (use the EXACT number that matches the content you're referencing):

${citations
  .map(
    (citation) =>
      `[${citation.number}] ${citation.chunks[0].filename}${citation.chunks[0].page ? ` (p.${citation.chunks[0].page})` : ''}: "${citation.sourceText}"`,
  )
  .join('\n')}

Citation Rules (STRICTLY FOLLOW):
1. Match content to citations: If you use information from citation [3], cite [3] - NOT [1] or any other number
2. Cite immediately after the claim: "The Reynolds number is critical [7]" not "The Reynolds number is critical. [7]"
3. Each distinct fact needs its own citation: Don't reuse [1] for everything - find the matching citation number
4. If information appears in multiple citations, cite the most relevant one
5. NEVER cite [1] by default - only use [1] if the information actually comes from citation [1]

Example - CORRECT:
"The pressure drop is calculated using equation X [5]. The flow rate depends on viscosity [12]. Temperature affects both parameters [3][12]."

Example - WRONG:
"The pressure drop is calculated using equation X [1]. The flow rate depends on viscosity [1]. Temperature affects both parameters [1]." (Don't reuse same citation)`;

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
