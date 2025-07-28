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

export type MultimodalInput =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image';
      image: string; // Base64 encoded image
    };

export class EmbeddingService {
  private static readonly API_URL =
    'https://api.voyageai.com/v1/multimodalembeddings';
  private static readonly MODEL = 'voyage-multimodal-3';

  static async generateMultimodalEmbeddings(
    content: MultimodalInput | MultimodalInput[],
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

      // Format input according to the Voyage multimodal embeddings API.
      // For purely-text inputs we can pass the raw string, while images must
      // be wrapped in an object describing the base-64 payload. The resulting
      // array should contain one element per input, **not** an extra level
      // of nesting (sending `[["text"]]` will cause the API to reject the
      // request as invalid JSON).

      /*
       * Build the payload exactly as required by Voyage:
       * {
       *   model: 'voyage-multimodal-3',
       *   inputs: [
       *     {
       *       content: [ { type: 'text', text: '...' } ]
       *     }
       *   ],
       *   input_type: 'document' | 'query' | null
       * }
       */

      const formattedInputs = inputArray.map((item) => {
        if (item.type === 'text') {
          return {
            content: [
              {
                type: 'text',
                text: item.text,
              },
            ],
          };
        }

        // Voyage API might expect data URI format
        const imageData = item.image.startsWith('data:') ? item.image : `data:image/png;base64,${item.image}`;
        
        return {
          content: [
            {
              type: 'image_base64',
              image_base64: imageData,
            },
          ],
        };
      });

      const requestPayload = {
        model: this.MODEL,
        inputs: formattedInputs,
        input_type: inputType,
      };

      console.log(
        `    🔍 Making embedding request with ${inputArray.length} input(s) of type(s): ${inputArray.map((i) => i.type).join(', ')}`,
      );

      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
        },
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();

        // Handle rate limit errors (429)
        if (response.status === 429 && retryCount < maxRetries) {
          const delay = baseDelay * Math.pow(2, retryCount); // Exponential backoff
          console.log(`  Rate limited. Retrying in ${delay / 1000} seconds...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.generateMultimodalEmbeddings(
            content,
            inputType,
            retryCount + 1,
          );
        }

        // Log the request payload for debugging
        console.error(`    ❌ Voyage API request failed:`);
        console.error(`    Status: ${response.status}`);
        console.error(`    Error: ${errorText}`);
        console.error(
          `    Request payload:`,
          JSON.stringify(requestPayload, null, 2),
        );

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
        return this.generateMultimodalEmbeddings(
          content,
          inputType,
          retryCount + 1,
        );
      }

      console.error('Error generating embeddings:', error);
      throw error;
    }
  }

  static async generateSingleEmbedding(
    content: MultimodalInput,
    inputType: 'document' | 'query' = 'document',
  ): Promise<number[]> {
    const embeddings = await this.generateMultimodalEmbeddings(
      content,
      inputType,
    );
    return embeddings[0];
  }

  // Clean text to ensure it's safe for the Voyage API
  private static cleanTextForAPI(text: string): string {
    if (!text || typeof text !== 'string') {
      return '';
    }

    // Remove control characters and problematic Unicode
    let cleaned = text
      // Remove null bytes and control characters (except tabs and newlines)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Remove private use Unicode characters that cause API issues
      .replace(/[\uE000-\uF8FF]/g, '') // Private Use Area
      .replace(/[\uF000-\uFFFF]/g, '') // More private use characters
      // Replace problematic Unicode characters with reasonable alternatives
      .replace(/[ҧ]/g, 'p') // Cyrillic characters that look like Latin
      .replace(/[ሶ]/g, 's') // Ethiopic characters
      // Remove any remaining non-printable characters
      .replace(
        /[^\x20-\x7E\u00A0-\u024F\u1E00-\u1EFF\u2000-\u206F\u2070-\u209F\u20A0-\u20CF\u2100-\u214F\u2190-\u21FF\u2200-\u22FF\u2300-\u23FF\u2460-\u24FF\u2500-\u257F\u2580-\u259F\u25A0-\u25FF\u2600-\u26FF\u2700-\u27BF\n\r\t]/g,
        ' ',
      )
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned;
  }

  // Convenience method for text-only content
  static async generateTextEmbedding(
    text: string,
    inputType: 'document' | 'query' = 'document',
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

    // Truncate very long texts to prevent API issues (Voyage API has limits)
    const maxLength = 32000; // Conservative limit for Voyage API
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
    inputType: 'document' | 'query' = 'document',
  ): Promise<number[]> {
    // Validate and clean base64 image data
    const cleanImageData = this.validateAndCleanBase64Image(imageBase64);
    
    return this.generateSingleEmbedding(
      { type: 'image', image: cleanImageData },
      inputType,
    );
  }

  // Validate and clean base64 image data for Voyage API
  private static validateAndCleanBase64Image(imageBase64: string): string {
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      throw new Error('Image data must be a non-empty string');
    }

    // Remove any data URI prefix if present
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
      const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47]); // PNG header
      const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF]); // JPEG header
      
      const isValidImage = buffer.subarray(0, 4).equals(pngHeader) || 
                          buffer.subarray(0, 3).equals(jpegHeader);
      
      console.log(`    🔍 Base64 validation: ${cleanBase64.length} chars → ${estimatedFileSize} bytes`);
      console.log(`    🖼️ Image format valid: ${isValidImage ? 'YES' : 'NO'}`);
      
      if (!isValidImage) {
        console.warn(`    ⚠️ Warning: Base64 doesn't appear to be a valid PNG/JPEG image`);
        console.warn(`    First 16 bytes: ${buffer.subarray(0, 16).toString('hex')}`);
      }
      
      // Check for very small images that might be invalid
      if (estimatedFileSize < 100) {
        throw new Error(`Image too small: ${estimatedFileSize} bytes (likely corrupted)`);
      }
      
    } catch (decodeError) {
      throw new Error(`Base64 decode failed: ${decodeError instanceof Error ? decodeError.message : 'Unknown error'}`);
    }

    // Show first few characters for debugging
    console.log(`    📝 Base64 preview: ${cleanBase64.substring(0, 50)}...`);
    
    return cleanBase64;
  }
}
