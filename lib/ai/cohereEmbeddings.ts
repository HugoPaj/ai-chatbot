import { CohereClient } from 'cohere-ai';

interface CohereEmbeddingResponse {
  id: string;
  embeddings: {
    float?: number[][];
    int8?: number[][];
    binary?: number[][];
    ubinary?: number[][];
  };
  meta?: {
    api_version?: {
      version: string;
    };
    billed_units?: {
      input_tokens: number;
    };
  };
}

export type MultimodalInput =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image';
      image: string; // Base64 encoded image
    };

export class CohereEmbeddingService {
  private static cohere: CohereClient;

  private static initializeClient(): CohereClient {
    if (!this.cohere) {
      // Check for both possible environment variable names
      const apiKey = process.env.COHERE_API_KEY || process.env.CO_API_KEY;
      if (!apiKey) {
        throw new Error('COHERE_API_KEY or CO_API_KEY is not configured');
      }
      this.cohere = new CohereClient({
        token: apiKey,
      });
    }
    return this.cohere;
  }

  static async generateMultimodalEmbeddings(
    content: MultimodalInput | MultimodalInput[],
    inputType: 'search_document' | 'search_query' = 'search_document',
    retryCount = 0,
  ): Promise<number[][]> {
    const client = this.initializeClient();
    const maxRetries = 3;
    const baseDelay = 100; // 0.1 seconds

    try {
      console.log(
        `  Generating Cohere embeddings (attempt ${retryCount + 1}/${maxRetries + 1})...`,
      );

      // Prepare the request payload
      const inputArray = Array.isArray(content) ? content : [content];

      // Validate input structure
      for (const item of inputArray) {
        if (!item || typeof item !== 'object') {
          throw new Error(`Invalid input item: ${JSON.stringify(item)}`);
        }
        if (
          item.type === 'text' &&
          (!item.text || typeof item.text !== 'string')
        ) {
          throw new Error(
            `Invalid text input: text must be a non-empty string, got: ${typeof item.text}`,
          );
        }
        if (
          item.type === 'image' &&
          (!item.image || typeof item.image !== 'string')
        ) {
          throw new Error(
            `Invalid image input: image must be a non-empty string, got: ${typeof item.image}`,
          );
        }
      }

      // Note: Cohere's API doesn't support mixed text and image in the same request
      // We need to handle them separately
      const textItems = inputArray.filter((item) => item.type === 'text');
      const imageItems = inputArray.filter((item) => item.type === 'image');

      const embeddings: number[][] = [];

      // Process text items if any
      if (textItems.length > 0) {
        console.log(`    📝 Processing ${textItems.length} text input(s)...`);

        // For simple text inputs, use the 'texts' parameter (simpler API)
        const texts = textItems.map(
          (item) => (item as { type: 'text'; text: string }).text,
        );

        console.log(
          `    🔍 Texts to embed:`,
          texts.slice(0, 1).map((t) => `"${t.substring(0, 100)}..."`),
        );

        const textResponse = await client.embed({
          model: 'embed-v4.0',
          texts: texts,
          inputType,
          embeddingTypes: ['float'],
        });

        if (textResponse.embeddings) {
          // Handle both possible response formats
          if (Array.isArray(textResponse.embeddings)) {
            embeddings.push(...textResponse.embeddings);
          } else if ('float' in textResponse.embeddings) {
            embeddings.push(...(textResponse.embeddings as any).float);
          }
        }
      }

      // Process image items if any
      if (imageItems.length > 0) {
        console.log(`    🖼️ Processing ${imageItems.length} image input(s)...`);

        // Process images one by one since Cohere supports only one image per request
        for (const imageItem of imageItems) {
          const imageData = (imageItem as { type: 'image'; image: string })
            .image;

          // Ensure proper data URL format
          const imageUrl = imageData.startsWith('data:')
            ? imageData
            : `data:image/png;base64,${imageData}`;

          console.log(`    🔍 Image URL length: ${imageUrl.length} chars`);

          // For image-only inputs, use the 'images' parameter (simpler API)
          const imageResponse = await client.embed({
            model: 'embed-v4.0',
            images: [imageUrl],
            inputType:
              inputType === 'search_query' ? 'search_document' : inputType, // images default to search_document
            embeddingTypes: ['float'],
          });

          if (imageResponse.embeddings) {
            // Handle both possible response formats
            if (Array.isArray(imageResponse.embeddings)) {
              embeddings.push(...imageResponse.embeddings);
            } else if ('float' in imageResponse.embeddings) {
              embeddings.push(...(imageResponse.embeddings as any).float);
            }
          }
        }
      }

      console.log(
        `    ✅ Generated ${embeddings.length} embedding(s) from ${inputArray.length} input(s)`,
      );

      return embeddings;
    } catch (error: any) {
      if (error?.status === 429 && retryCount < maxRetries) {
        const delay = baseDelay * Math.pow(2, retryCount); // Exponential backoff
        console.log(`  Rate limited. Retrying in ${delay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.generateMultimodalEmbeddings(
          content,
          inputType,
          retryCount + 1,
        );
      }

      if (
        error instanceof Error &&
        error.message.includes('fetch failed') &&
        retryCount < maxRetries
      ) {
        const delay = baseDelay * Math.pow(2, retryCount); // Exponential backoff
        console.log(`  Network error. Retrying in ${delay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.generateMultimodalEmbeddings(
          content,
          inputType,
          retryCount + 1,
        );
      }

      console.error('Error generating Cohere embeddings:', error);
      throw error;
    }
  }

  static async generateSingleEmbedding(
    content: MultimodalInput,
    inputType: 'search_document' | 'search_query' = 'search_document',
  ): Promise<number[]> {
    const embeddings = await this.generateMultimodalEmbeddings(
      content,
      inputType,
    );
    return embeddings[0];
  }

  // Clean text to ensure it's safe for the Cohere API
  private static cleanTextForAPI(text: string): string {
    if (!text || typeof text !== 'string') {
      return '';
    }

    // Remove control characters and problematic Unicode
    let cleaned = text
      // Remove null bytes and control characters (except tabs and newlines)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned;
  }

  // Convenience method for text-only content
  static async generateTextEmbedding(
    text: string,
    inputType: 'search_document' | 'search_query' = 'search_document',
  ): Promise<number[]> {
    // Validate text input
    if (!text || typeof text !== 'string') {
      throw new Error(
        `Invalid text input: expected non-empty string, got ${typeof text}`,
      );
    }

    // Clean the text to ensure API compatibility
    const cleanedText = this.cleanTextForAPI(text);

    if (!cleanedText || cleanedText.length < 10) {
      throw new Error(
        `Text content too short or invalid after cleaning: "${cleanedText}"`,
      );
    }

    // Debug: Log text cleaning results if significant changes were made
    if (text.length !== cleanedText.length) {
      console.log(
        `    🧹 Text cleaned: ${text.length} -> ${cleanedText.length} chars`,
      );
    }

    // Cohere embed-v4.0 has a 128k context length, but let's be conservative
    const maxLength = 100000; // Conservative limit
    const finalText =
      cleanedText.length > maxLength
        ? cleanedText.substring(0, maxLength) + '...'
        : cleanedText;

    if (cleanedText.length > maxLength) {
      console.warn(
        `    ⚠️ Text truncated from ${cleanedText.length} to ${finalText.length} characters`,
      );
    }

    return this.generateSingleEmbedding(
      { type: 'text', text: finalText },
      inputType,
    );
  }

  // Convenience method for image content
  static async generateImageEmbedding(
    imageBase64: string,
    inputType: 'search_document' | 'search_query' = 'search_document',
  ): Promise<number[]> {
    // Validate and clean base64 image data
    const cleanImageData = this.validateAndCleanBase64Image(imageBase64);

    return this.generateSingleEmbedding(
      { type: 'image', image: cleanImageData },
      inputType,
    );
  }

  // Validate and clean base64 image data for Cohere API
  private static validateAndCleanBase64Image(imageBase64: string): string {
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      throw new Error('Image data must be a non-empty string');
    }

    // Remove any data URI prefix if present to get clean base64
    let cleanBase64 = imageBase64;
    if (imageBase64.startsWith('data:')) {
      const base64Index = imageBase64.indexOf('base64,');
      if (base64Index !== -1) {
        cleanBase64 = imageBase64.substring(base64Index + 7);
      }
    }

    // Remove any whitespace and newlines
    cleanBase64 = cleanBase64.replace(/\s/g, '');

    // Validate base64 format
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(cleanBase64)) {
      throw new Error('Invalid base64 format');
    }

    // Check if base64 string is not empty and has reasonable length
    if (cleanBase64.length === 0) {
      throw new Error('Empty base64 image data');
    }

    // Basic length check (base64 should be divisible by 4, with padding)
    if (cleanBase64.length % 4 !== 0) {
      throw new Error('Invalid base64 padding');
    }

    // Additional validation: try to decode base64 to check if it's valid
    try {
      const buffer = Buffer.from(cleanBase64, 'base64');
      const estimatedFileSize = buffer.length;

      // Check if it's likely a valid image (PNG should start with specific bytes)
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff]); // JPEG header

      const isValidImage =
        buffer.subarray(0, 4).equals(pngHeader) ||
        buffer.subarray(0, 3).equals(jpegHeader);

      console.log(
        `    🔍 Base64 validation: ${cleanBase64.length} chars → ${estimatedFileSize} bytes`,
      );
      console.log(`    🖼️ Image format valid: ${isValidImage ? 'YES' : 'NO'}`);

      if (!isValidImage) {
        console.warn(
          `    ⚠️ Warning: Base64 doesn't appear to be a valid PNG/JPEG image`,
        );
        console.warn(
          `    First 16 bytes: ${buffer.subarray(0, 16).toString('hex')}`,
        );
      }

      // Check for very small images that might be invalid
      if (estimatedFileSize < 100) {
        throw new Error(
          `Image too small: ${estimatedFileSize} bytes (likely corrupted)`,
        );
      }
    } catch (decodeError) {
      throw new Error(
        `Base64 decode failed: ${decodeError instanceof Error ? decodeError.message : 'Unknown error'}`,
      );
    }

    // Show first few characters for debugging
    console.log(`    📝 Base64 preview: ${cleanBase64.substring(0, 50)}...`);

    return cleanBase64;
  }
}
