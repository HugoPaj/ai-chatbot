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

interface VoyageMultimodalEmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    total_tokens: number;
  };
}

export type EmbeddingInput = string | ImageData | Array<string | ImageData>;
export type ContentType = 'text' | 'image' | 'multimodal';

export interface ImageData {
  data: string; // base64 encoded image data
  mediaType: 'image/jpeg' | 'image/png';
}

export interface MultimodalEmbeddingResult {
  embedding: number[];
  contentType: ContentType;
  metadata?: {
    originalSize?: number;
    processedSize?: number;
    imageFormat?: string;
  };
}

export class EmbeddingService {
  private static readonly API_URL = 'https://api.voyageai.com/v1/embeddings';
  private static readonly MULTIMODAL_API_URL = 'https://api.voyageai.com/v1/multimodal_embeddings';
  private static readonly MODEL = 'voyage-large-2';
  private static readonly MULTIMODAL_MODEL = 'voyage-multimodal-3';

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

  static async generateMultimodalEmbeddings(
    inputs: EmbeddingInput[],
    inputType: 'document' | 'query' = 'document',
    retryCount = 0,
  ): Promise<MultimodalEmbeddingResult[]> {
    if (!process.env.VOYAGE_API_KEY) {
      throw new Error('VOYAGE_API_KEY is not configured');
    }

    const maxRetries = 3;
    const baseDelay = 100;

    try {
      console.log(
        `  Generating multimodal embeddings (attempt ${retryCount + 1}/${maxRetries + 1})...`,
      );

      // Convert inputs to the format expected by Voyage API
      const processedInputs = inputs.map((input) => {
        if (typeof input === 'string') {
          return input;
        } else if (this.isImageData(input)) {
          return {
            type: 'image',
            image: `data:${input.mediaType};base64,${input.data}`,
          };
        } else if (Array.isArray(input)) {
          return input.map((item) => {
            if (typeof item === 'string') {
              return item;
            } else if (this.isImageData(item)) {
              return {
                type: 'image',
                image: `data:${item.mediaType};base64,${item.data}`,
              };
            }
            return item;
          });
        }
        return input;
      });

      const response = await fetch(this.MULTIMODAL_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
        },
        body: JSON.stringify({
          model: this.MULTIMODAL_MODEL,
          input: processedInputs,
          input_type: inputType,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();

        if (response.status === 429 && retryCount < maxRetries) {
          const delay = baseDelay * Math.pow(2, retryCount);
          console.log(`  Rate limited. Retrying in ${delay / 1000} seconds...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.generateMultimodalEmbeddings(inputs, inputType, retryCount + 1);
        }

        throw new Error(`Voyage API error: ${response.status} - ${errorText}`);
      }

      const data: VoyageMultimodalEmbeddingResponse = await response.json();
      
      return data.data.map((item, index) => ({
        embedding: item.embedding,
        contentType: this.getContentType(inputs[index]),
        metadata: this.getMetadata(inputs[index]),
      }));
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('fetch failed') &&
        retryCount < maxRetries
      ) {
        const delay = baseDelay * Math.pow(2, retryCount);
        console.log(`  Network error. Retrying in ${delay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.generateMultimodalEmbeddings(inputs, inputType, retryCount + 1);
      }

      console.error('Error generating multimodal embeddings:', error);
      throw error;
    }
  }

  static async generateSingleMultimodalEmbedding(
    input: EmbeddingInput,
    inputType: 'document' | 'query' = 'document',
  ): Promise<MultimodalEmbeddingResult> {
    const embeddings = await this.generateMultimodalEmbeddings([input], inputType);
    return embeddings[0];
  }

  // Helper methods
  private static isImageData(input: any): input is ImageData {
    return input && typeof input === 'object' && 'data' in input && 'mediaType' in input;
  }

  private static getContentType(input: EmbeddingInput): ContentType {
    if (typeof input === 'string') {
      return 'text';
    } else if (this.isImageData(input)) {
      return 'image';
    } else if (Array.isArray(input)) {
      const hasText = input.some((item) => typeof item === 'string');
      const hasImage = input.some((item) => this.isImageData(item));
      return hasText && hasImage ? 'multimodal' : hasText ? 'text' : 'image';
    }
    return 'text';
  }

  private static getMetadata(input: EmbeddingInput) {
    if (this.isImageData(input)) {
      return {
        imageFormat: input.mediaType,
        originalSize: input.data.length,
      };
    }
    return undefined;
  }

  // Image processing utilities
  static async imageToBase64(
    imageBuffer: Buffer,
    mimeType: 'image/jpeg' | 'image/png',
  ): Promise<ImageData> {
    const base64Data = imageBuffer.toString('base64');
    return {
      data: base64Data,
      mediaType: mimeType,
    };
  }

  static async resizeImageForEmbedding(
    imageBuffer: Buffer,
    maxWidth = 1024,
    maxHeight = 1024,
  ): Promise<Buffer> {
    // For now, return the original buffer
    // In a full implementation, you'd use sharp or similar library
    return imageBuffer;
  }

  static async preprocessImageForEmbedding(
    imageBuffer: Buffer,
    options?: { maxWidth?: number; maxHeight?: number; quality?: number },
  ): Promise<ImageData> {
    const { ImagePreprocessingService } = await import('./imagePreprocessing');
    
    return await ImagePreprocessingService.prepareImageForEmbedding(imageBuffer, {
      maxWidth: options?.maxWidth || 1024,
      maxHeight: options?.maxHeight || 1024,
      quality: options?.quality || 85,
      format: 'jpeg',
    });
  }
}
