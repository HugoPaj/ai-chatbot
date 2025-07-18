import sharp from 'sharp';
import { ImageData } from './embeddings';

export interface ImagePreprocessingOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
  normalize?: boolean;
  removeMetadata?: boolean;
}

export interface ProcessedImageResult {
  buffer: Buffer;
  format: 'jpeg' | 'png' | 'webp';
  width: number;
  height: number;
  size: number;
  originalSize: number;
  compressionRatio: number;
}

export class ImagePreprocessingService {
  private static readonly DEFAULT_OPTIONS: ImagePreprocessingOptions = {
    maxWidth: 1024,
    maxHeight: 1024,
    quality: 85,
    format: 'jpeg',
    normalize: true,
    removeMetadata: true,
  };

  /**
   * Preprocess an image for embedding generation
   */
  static async preprocessImage(
    imageBuffer: Buffer,
    options: ImagePreprocessingOptions = {},
  ): Promise<ProcessedImageResult> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const originalSize = imageBuffer.length;

    try {
      console.log(`    🔧 Preprocessing image (${originalSize} bytes)`);

      let pipeline = sharp(imageBuffer);

      // Get original image metadata
      const metadata = await pipeline.metadata();
      const originalWidth = metadata.width || 0;
      const originalHeight = metadata.height || 0;

      console.log(`    📐 Original dimensions: ${originalWidth}x${originalHeight}`);

      // Remove metadata if requested
      if (opts.removeMetadata) {
        pipeline = pipeline.removeMetadata();
      }

      // Resize image if it exceeds maximum dimensions
      if (
        opts.maxWidth && 
        opts.maxHeight && 
        (originalWidth > opts.maxWidth || originalHeight > opts.maxHeight)
      ) {
        pipeline = pipeline.resize(opts.maxWidth, opts.maxHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        });
        console.log(`    📏 Resizing to max ${opts.maxWidth}x${opts.maxHeight}`);
      }

      // Normalize image if requested
      if (opts.normalize) {
        pipeline = pipeline.normalize();
      }

      // Convert to specified format with quality settings
      switch (opts.format) {
        case 'jpeg':
          pipeline = pipeline.jpeg({
            quality: opts.quality,
            progressive: true,
          });
          break;
        case 'png':
          pipeline = pipeline.png({
            compressionLevel: 9,
          });
          break;
        case 'webp':
          pipeline = pipeline.webp({
            quality: opts.quality,
          });
          break;
      }

      // Execute the pipeline
      const processedBuffer = await pipeline.toBuffer();
      const processedMetadata = await sharp(processedBuffer).metadata();

      const result: ProcessedImageResult = {
        buffer: processedBuffer,
        format: opts.format!,
        width: processedMetadata.width || 0,
        height: processedMetadata.height || 0,
        size: processedBuffer.length,
        originalSize,
        compressionRatio: originalSize / processedBuffer.length,
      };

      console.log(`    ✅ Processed image: ${result.width}x${result.height}, ${result.size} bytes (${result.compressionRatio.toFixed(2)}x compression)`);

      return result;
    } catch (error) {
      console.error('Error preprocessing image:', error);
      throw new Error(`Failed to preprocess image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Prepare image for embedding by preprocessing and converting to base64
   */
  static async prepareImageForEmbedding(
    imageBuffer: Buffer,
    options: ImagePreprocessingOptions = {},
  ): Promise<ImageData> {
    const preprocessed = await this.preprocessImage(imageBuffer, options);
    
    const base64Data = preprocessed.buffer.toString('base64');
    const mediaType = preprocessed.format === 'png' ? 'image/png' : 'image/jpeg';

    return {
      data: base64Data,
      mediaType,
    };
  }

  /**
   * Create multiple sizes of an image for different use cases
   */
  static async createImageVariants(
    imageBuffer: Buffer,
    variants: Array<{ name: string; options: ImagePreprocessingOptions }> = [
      { name: 'thumbnail', options: { maxWidth: 150, maxHeight: 150, quality: 75 } },
      { name: 'medium', options: { maxWidth: 512, maxHeight: 512, quality: 80 } },
      { name: 'large', options: { maxWidth: 1024, maxHeight: 1024, quality: 85 } },
    ],
  ): Promise<Record<string, ProcessedImageResult>> {
    const results: Record<string, ProcessedImageResult> = {};

    for (const variant of variants) {
      try {
        results[variant.name] = await this.preprocessImage(imageBuffer, variant.options);
      } catch (error) {
        console.error(`Error creating ${variant.name} variant:`, error);
        // Continue with other variants
      }
    }

    return results;
  }

  /**
   * Validate image format and size before processing
   */
  static async validateImage(imageBuffer: Buffer): Promise<{
    valid: boolean;
    format?: string;
    width?: number;
    height?: number;
    size: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    const size = imageBuffer.length;

    try {
      const metadata = await sharp(imageBuffer).metadata();
      const { format, width, height } = metadata;

      // Check file size (max 10MB)
      if (size > 10 * 1024 * 1024) {
        errors.push('Image size exceeds 10MB limit');
      }

      // Check image format
      if (!format || !['jpeg', 'jpg', 'png', 'webp'].includes(format)) {
        errors.push('Unsupported image format. Only JPEG, PNG, and WebP are supported');
      }

      // Check dimensions (max 4096x4096)
      if (width && height) {
        if (width > 4096 || height > 4096) {
          errors.push('Image dimensions exceed 4096x4096 limit');
        }
        if (width < 32 || height < 32) {
          errors.push('Image dimensions too small (minimum 32x32)');
        }
      }

      return {
        valid: errors.length === 0,
        format,
        width,
        height,
        size,
        errors,
      };
    } catch (error) {
      errors.push(`Invalid image file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        valid: false,
        size,
        errors,
      };
    }
  }

  /**
   * Extract dominant colors from an image
   */
  static async extractDominantColors(
    imageBuffer: Buffer,
    colorCount: number = 5,
  ): Promise<Array<{ r: number; g: number; b: number; hex: string; percentage: number }>> {
    try {
      const { dominant } = await sharp(imageBuffer)
        .resize(100, 100, { fit: 'inside' })
        .removeMetadata()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // This is a simplified implementation
      // In a full implementation, you'd use a color quantization algorithm
      const colors = [
        { r: dominant.r || 0, g: dominant.g || 0, b: dominant.b || 0, hex: '#000000', percentage: 100 }
      ];

      return colors;
    } catch (error) {
      console.error('Error extracting dominant colors:', error);
      return [];
    }
  }
}