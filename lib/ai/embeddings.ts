interface VoyageEmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    total_tokens: number;
  };
}

export class EmbeddingService {
  private static readonly API_URL = 'https://api.voyageai.com/v1/embeddings';
  private static readonly MODEL = 'voyage-large-2';

  static async generateEmbeddings(
    content: string | string[],
    inputType: 'document' | 'query' = 'document',
    retryCount = 0,
  ): Promise<number[][]> {
    if (!process.env.VOYAGE_API_KEY) {
      throw new Error('VOYAGE_API_KEY is not configured');
    }

    const maxRetries = 3;
    const baseDelay = 100; // 0.1 seconds

    try {
      console.log(
        `  Generating embeddings (attempt ${retryCount + 1}/${maxRetries + 1})...`,
      );

      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
        },
        body: JSON.stringify({
          model: this.MODEL,
          input: Array.isArray(content) ? content : [content],
          input_type: inputType,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();

        // Handle rate limit errors (429)
        if (response.status === 429 && retryCount < maxRetries) {
          const delay = baseDelay * Math.pow(2, retryCount); // Exponential backoff
          console.log(`  Rate limited. Retrying in ${delay / 1000} seconds...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.generateEmbeddings(content, inputType, retryCount + 1);
        }

        throw new Error(`Voyage API error: ${response.status} - ${errorText}`);
      }

      const data: VoyageEmbeddingResponse = await response.json();
      return data.data.map((item) => item.embedding);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('fetch failed') &&
        retryCount < maxRetries
      ) {
        const delay = baseDelay * Math.pow(2, retryCount); // Exponential backoff
        console.log(`  Network error. Retrying in ${delay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.generateEmbeddings(content, inputType, retryCount + 1);
      }

      console.error('Error generating embeddings:', error);
      throw error;
    }
  }

  static async generateSingleEmbedding(
    content: string,
    inputType: 'document' | 'query' = 'document',
  ): Promise<number[]> {
    const embeddings = await this.generateEmbeddings(content, inputType);
    return embeddings[0];
  }
}
