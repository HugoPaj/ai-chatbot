// Query classification service using Claude Haiku for fast, efficient query type detection
import Anthropic from '@anthropic-ai/sdk';

export type QueryType = 'specific' | 'broad';

export interface QueryClassification {
  type: QueryType;
  confidence: number;
  reasoning?: string;
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const CLASSIFICATION_SYSTEM_PROMPT = `You are a query classification expert. Your job is to classify user queries into two categories:

1. SPECIFIC QUERIES: Questions seeking precise facts, definitions, citations, specific values, or exact information
   Examples:
   - "What is the definition of X?"
   - "What is the value of parameter Y in section 3?"
   - "Who are the authors of this paper?"
   - "What date was this published?"
   - "What is the formula for calculating Z?"

2. BROAD QUERIES: Questions requiring synthesis, analysis, summaries, comparisons, or understanding of concepts
   Examples:
   - "Summarize the main findings"
   - "What are the key themes in this document?"
   - "Compare approach A with approach B"
   - "Explain the methodology used"
   - "What are the implications of these results?"

Respond ONLY with valid JSON in this exact format:
{
  "type": "specific" | "broad",
  "confidence": <number between 0 and 1>,
  "reasoning": "<brief explanation>"
}`;

/**
 * Classifies a user query as either "specific" (needs precise retrieval)
 * or "broad" (needs comprehensive analysis)
 */
export async function classifyQuery(
  query: string,
): Promise<QueryClassification> {
  try {
    console.log('[QueryClassifier] Classifying query...');

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', // Fast and efficient for classification
      max_tokens: 200,
      temperature: 0, // Deterministic for classification
      system: CLASSIFICATION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Classify this query:\n\n"${query}"`,
        },
      ],
    });

    const responseText =
      message.content[0].type === 'text' ? message.content[0].text : '';

    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(
        '[QueryClassifier] Failed to parse JSON, defaulting to specific',
      );
      return {
        type: 'specific',
        confidence: 0.5,
        reasoning: 'Failed to parse classification response',
      };
    }

    const classification = JSON.parse(jsonMatch[0]) as QueryClassification;

    console.log(
      `[QueryClassifier] Classified as ${classification.type} (confidence: ${classification.confidence})`,
    );
    console.log(`[QueryClassifier] Reasoning: ${classification.reasoning}`);

    return classification;
  } catch (error) {
    console.error('[QueryClassifier] Error classifying query:', error);
    // Default to specific if classification fails (safer fallback)
    return {
      type: 'specific',
      confidence: 0.5,
      reasoning: 'Classification error, using default',
    };
  }
}

/**
 * Batch classify multiple queries (useful for testing/analytics)
 */
export async function classifyQueries(
  queries: string[],
): Promise<QueryClassification[]> {
  const results = await Promise.all(queries.map((q) => classifyQuery(q)));
  return results;
}
