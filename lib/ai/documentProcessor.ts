// src/lib/documentProcessor.ts
import { readFile } from 'node:fs/promises';
import type { DocumentChunk, Coordinates, TableStructure } from '../types';
import fs from 'node:fs';
import crypto from 'node:crypto';

// Docling service configuration
const DOCLING_SERVICE_URL =
  process.env.DOCLING_SERVICE_URL || 'http://localhost:8001';

// Docling service types
interface DoclingChunk {
  content: string;
  content_type: 'text' | 'image' | 'table';
  page?: number;
  coordinates?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  image_data?: string;
  table_structure?: {
    headers: string[];
    rows: string[][];
    caption?: string;
  };
}

interface DoclingResponse {
  success: boolean;
  chunks: DoclingChunk[];
  total_pages: number;
  processing_time: number;
  error?: string;
}

// Helper function to clean filename from UUID prefix
const cleanFilename = (filePath: string, defaultName: string): string => {
  let filename = filePath.split(/[/\\]/).pop() || defaultName;
  // If the filename has a UUID prefix (format: uuid-filename), remove it
  if (filename.includes('-')) {
    const parts = filename.split('-');
    if (parts.length > 1) {
      // Remove the first part (UUID) and join the rest back together
      parts.shift();
      filename = parts.join('-');
    }
  }
  return filename;
};

// Helper function to chunk text
const chunkText = (
  text: string,
  chunkSize: number,
  overlap: number,
): string[] => {
  // Clean the text first
  const cleanText = text
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/\n+/g, ' ') // Replace newlines with spaces
    .trim();

  if (cleanText.length === 0) {
    return [];
  }

  const chunks: string[] = [];

  // Try to split by sentences first
  const sentences = cleanText.split(/(?<=[.!?])\s+/);
  let currentChunk = '';

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;

    // If adding this sentence would exceed chunk size and we have content
    if (
      currentChunk.length + trimmedSentence.length > chunkSize &&
      currentChunk.length > 0
    ) {
      chunks.push(currentChunk.trim());

      // Create overlap by keeping some words from the end
      const words = currentChunk.split(' ');
      const overlapWords = Math.floor(overlap / 10); // Approximate overlap in words
      currentChunk = `${words.slice(-overlapWords).join(' ')} ${trimmedSentence}`;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + trimmedSentence;
    }
  }

  // Add the last chunk if it has content
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  // Filter out very short chunks (less than 50 characters)
  return chunks.filter((chunk) => chunk.length >= 50);
};

// Helper function to check if Docling service is available
const isDoclingServiceAvailable = async (): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${DOCLING_SERVICE_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.log(
      `    ℹ️  Docling service not available at ${DOCLING_SERVICE_URL}`,
    );
    return false;
  }
};

// Enhanced document processing using Docling service
const processWithDocling = async (
  filePath: string,
  contentHash?: string,
): Promise<DocumentChunk[]> => {
  try {
    console.log(
      `    🚀 Processing with Docling service for images, text, and tables...`,
    );

    // Read file and create FormData
    const fileBuffer = await readFile(filePath);
    const formData = new FormData();

    // Determine file type based on extension
    const fileExtension = filePath.split('.').pop()?.toLowerCase() || 'pdf';
    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      html: 'text/html',
    };

    const mimeType = mimeTypes[fileExtension] || 'application/pdf';

    // Convert Buffer to Uint8Array for File constructor
    const fileData = new Uint8Array(fileBuffer);

    // Create a File object from buffer
    const file = new File(
      [fileData],
      filePath.split('/').pop() || `document.${fileExtension}`,
      {
        type: mimeType,
      },
    );
    formData.append('file', file);

    // Send to Docling service
    const response = await fetch(`${DOCLING_SERVICE_URL}/process-document`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(
        `Docling service error: ${response.status} ${response.statusText}`,
      );
    }

    const doclingResult: DoclingResponse = await response.json();

    if (!doclingResult.success) {
      throw new Error(`Docling processing failed: ${doclingResult.error}`);
    }

    console.log(
      `    ✅ Docling processed ${doclingResult.chunks.length} chunks in ${doclingResult.processing_time.toFixed(2)}s`,
    );

    // Log breakdown by content type
    const textChunks = doclingResult.chunks.filter(
      (c) => c.content_type === 'text',
    ).length;
    const imageChunks = doclingResult.chunks.filter(
      (c) => c.content_type === 'image',
    ).length;
    const tableChunks = doclingResult.chunks.filter(
      (c) => c.content_type === 'table',
    ).length;
    console.log(
      `    📊 Content breakdown: ${textChunks} text, ${imageChunks} images, ${tableChunks} tables`,
    );

    // Convert Docling chunks to DocumentChunk format
    const filename = cleanFilename(filePath, `unknown.${fileExtension}`);
    const documentChunks: DocumentChunk[] = await Promise.all(
      doclingResult.chunks.map(async (chunk, index) => {
        const coordinates: Coordinates | undefined = chunk.coordinates
          ? {
              x: chunk.coordinates.x,
              y: chunk.coordinates.y,
              width: chunk.coordinates.width,
              height: chunk.coordinates.height,
            }
          : undefined;

        const tableStructure: TableStructure | undefined = chunk.table_structure
          ? {
              headers: chunk.table_structure.headers,
              rows: chunk.table_structure.rows,
              caption: chunk.table_structure.caption,
            }
          : undefined;

        // Store image chunks in Cloudflare R2 (for serverless environments)
        let imageUrl: string | undefined;
        if (chunk.content_type === 'image' && chunk.image_data) {
          console.log(
            `    🖼️  [R2 DEBUG] Processing image chunk ${index + 1}`,
          );
          console.log(
            `    🖼️  [R2 DEBUG] Image data length: ${chunk.image_data.length} chars`,
          );
          console.log(
            `    🖼️  [R2 DEBUG] R2 config present: ${!!process.env.R2_ACCOUNT_ID}`,
          );

          try {
            // Try to import R2 utility
            console.log(
              `    🔧 [R2 DEBUG] Attempting to import R2 utility...`,
            );
            const { put } = await import('@/lib/r2');
            console.log(
              `    ✅ [R2 DEBUG] Successfully imported R2 utility`,
            );

            // Check if R2 config is available
            if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID) {
              console.warn(
                `    ⚠️  [R2 DEBUG] R2 configuration not found - using fallback`,
              );
              throw new Error('R2 configuration not available');
            }

            const imageHash = crypto
              .createHash('md5')
              .update(chunk.image_data)
              .digest('hex')
              .slice(0, 16);
            const imageFileName = `doc-images/${imageHash}.png`;

            console.log(
              `    🔧 [R2 DEBUG] Generated filename: ${imageFileName}`,
            );
            console.log(`    🔧 [R2 DEBUG] Image hash: ${imageHash}`);

            // Upload to Cloudflare R2
            const imageBuffer = Buffer.from(chunk.image_data, 'base64');
            console.log(
              `    🔧 [R2 DEBUG] Buffer size: ${imageBuffer.length} bytes`,
            );

            console.log(`    🚀 [R2 DEBUG] Starting R2 upload...`);
            try {
              const r2Response = await put(imageFileName, imageBuffer, {
                access: 'public',
                contentType: 'image/png', // PDF extracted images are always PNG
              });
              console.log(`    ✅ [R2 DEBUG] R2 upload successful!`);
              console.log(
                `    ✅ [R2 DEBUG] R2 response:`,
                JSON.stringify(r2Response, null, 2),
              );
              imageUrl = r2Response.url;
            } catch (uploadError: any) {
              console.error(`    ❌ [R2 DEBUG] Upload failed for chunk ${index + 1}:`, uploadError.message);
              throw uploadError; // Re-throw to see the detailed error
            }

            console.log(`    🖼️  [R2 DEBUG] Final image URL: ${imageUrl}`);

            // Test if the URL is accessible
            try {
              const testResponse = await fetch(imageUrl, { method: 'HEAD' });
              console.log(
                `    🌐 [R2 DEBUG] URL accessibility test: ${testResponse.status} ${testResponse.statusText}`,
              );
            } catch (testError) {
              console.warn(
                `    ⚠️  [R2 DEBUG] URL accessibility test failed:`,
                testError,
              );
            }
          } catch (error: any) {
            console.error(
              `    ❌ [R2 DEBUG] Failed to save image to Cloudflare R2:`,
              error,
            );
            console.error(`    ❌ [R2 DEBUG] Error details:`, error.message);
            if (error.stack) {
              console.error(`    ❌ [R2 DEBUG] Stack trace:`, error.stack);
            }

            // Fallback: store as data URL for immediate use
            imageUrl = `data:image/png;base64,${chunk.image_data}`;
            console.log(
              `    🔄 [R2 DEBUG] Using fallback data URL (length: ${imageUrl.length})`,
            );
          }

          console.log(
            `    ✅ [R2 DEBUG] Final imageUrl for chunk ${index + 1}: ${imageUrl ? `${imageUrl.substring(0, 100)}...` : 'undefined'}`,
          );
        }

        return {
          content: chunk.content,
          metadata: {
            source: filePath,
            page: chunk.page || 1,
            type: 'pdf',
            filename,
            contentHash: contentHash || '',
            contentType: chunk.content_type,
            coordinates,
            tableStructure,
            imageData: chunk.image_data,
            imageUrl,
          },
        };
      }),
    );

    return documentChunks;
  } catch (error) {
    console.error(`    ❌ Docling processing failed:`, error);
    throw error;
  }
};

// Functions to process different document types
export const DocumentProcessor = {
  processPDF: async (
    filePath: string,
    contentHash?: string,
  ): Promise<DocumentChunk[]> => {
    try {
      console.log(`    📖 Processing document: ${filePath}`);

      // Check if file exists before attempting to read it
      if (!fs.existsSync(filePath)) {
        throw new Error(`Document file not found: ${filePath}`);
      }

      // Try enhanced processing with Docling service first
      const doclingAvailable = await isDoclingServiceAvailable();

      if (doclingAvailable) {
        try {
          return await processWithDocling(filePath, contentHash);
        } catch (doclingError) {
          console.warn(
            `    ⚠️  Docling processing failed, falling back to basic PDF processing`,
          );
          console.warn(`    Error: ${doclingError}`);
        }
      } else {
        console.log(
          `    ℹ️  Docling service not available, using basic PDF processing`,
        );
      }

      // Fallback to basic PDF processing (text only)
      console.log(
        `    📖 Using fallback PDF text extraction (no images/tables)`,
      );

      try {
        const dataBuffer = await readFile(filePath);

        // Use the isolated PDF processor to avoid hardcoded file issues
        const { parsePDF } = await import('./pdfProcessor');
        const data = await parsePDF(dataBuffer);

        if (!data) {
          throw new Error('PDF parsing returned null');
        }

        console.log(
          `    📝 Extracted ${data.text.length} characters from ${data.numpages} pages`,
        );

        if (!data.text || data.text.trim().length === 0) {
          console.warn(`    ⚠️  No text content found in PDF`);
          return [];
        }

        const chunks = chunkText(data.text, 1000, 200);
        const filename = cleanFilename(filePath, 'unknown.pdf');

        // Improved page number estimation
        // Estimate average characters per page based on total pages and text length
        const avgCharsPerPage = Math.max(
          1000,
          data.text.length / data.numpages,
        );

        return chunks.map((chunk: string, index: number): DocumentChunk => {
          // Calculate cumulative character position for this chunk
          const cumulativeChars = chunks
            .slice(0, index)
            .reduce((sum, c) => sum + c.length, 0);

          // Estimate page number based on character position
          const estimatedPage = Math.min(
            data.numpages,
            Math.max(
              1,
              Math.ceil((cumulativeChars + chunk.length / 2) / avgCharsPerPage),
            ),
          );

          return {
            content: chunk,
            metadata: {
              source: filePath,
              page: estimatedPage,
              type: 'pdf',
              filename,
              contentHash: contentHash || '',
              contentType: 'text',
            },
          };
        });
      } catch (pdfError) {
        console.error(`    ❌ PDF parsing failed:`, pdfError);
        throw new Error(
          `PDF processing failed: ${pdfError instanceof Error ? pdfError.message : String(pdfError)}`,
        );
      }
    } catch (error) {
      console.error(`    ❌ Error processing document ${filePath}:`, error);
      throw new Error(`Failed to process document: ${filePath}`);
    }
  },

  processImage: async (
    filePath: string,
    contentHash?: string,
  ): Promise<DocumentChunk> => {
    try {
      console.log(`    🖼️  Processing image file: ${filePath}`);

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`Image file not found: ${filePath}`);
      }

      // Read image file and convert to base64
      const imageBuffer = await readFile(filePath);
      const imageBase64 = imageBuffer.toString('base64');

      // Store image in Cloudflare R2 (for serverless environments)
      console.log(`    🖼️  [R2 DEBUG] Processing uploaded image file`);
      console.log(
        `    🖼️  [R2 DEBUG] Image base64 length: ${imageBase64.length} chars`,
      );
      console.log(
        `    🖼️  [R2 DEBUG] Image buffer size: ${imageBuffer.length} bytes`,
      );
      console.log(
        `    🖼️  [R2 DEBUG] R2 config present: ${!!process.env.R2_ACCOUNT_ID}`,
      );

      let imageUrl: string;
      try {
        console.log(
          `    🔧 [R2 DEBUG] Attempting to import R2 utility for uploaded image...`,
        );
        const { put } = await import('@/lib/r2');
        console.log(
          `    ✅ [R2 DEBUG] Successfully imported R2 utility for uploaded image`,
        );

        // Check if R2 config is available
        if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID) {
          console.warn(
            `    ⚠️  [R2 DEBUG] R2 configuration not available for uploaded image - using fallback`,
          );
          throw new Error('R2 configuration not available');
        }

        const imageHash = crypto
          .createHash('md5')
          .update(imageBase64)
          .digest('hex')
          .slice(0, 16);
        const imageFileName = `doc-images/${imageHash}.png`;

        console.log(
          `    🔧 [R2 DEBUG] Generated filename for uploaded image: ${imageFileName}`,
        );
        console.log(
          `    🔧 [R2 DEBUG] Image hash for uploaded image: ${imageHash}`,
        );

        // Upload to Cloudflare R2
        console.log(
          `    🚀 [R2 DEBUG] Starting R2 upload for uploaded image...`,
        );
        // Determine content type based on file extension
        const contentType =
          filePath.toLowerCase().endsWith('.jpg') ||
          filePath.toLowerCase().endsWith('.jpeg')
            ? 'image/jpeg'
            : 'image/png';

        const r2Response = await put(imageFileName, imageBuffer, {
          access: 'public',
          contentType,
        });
        console.log(
          `    ✅ [R2 DEBUG] R2 upload successful for uploaded image!`,
        );
        console.log(
          `    ✅ [R2 DEBUG] R2 response for uploaded image:`,
          JSON.stringify(r2Response, null, 2),
        );

        imageUrl = r2Response.url;
        console.log(
          `    🖼️  [R2 DEBUG] Final image URL for uploaded image: ${imageUrl}`,
        );

        // Test if the URL is accessible
        try {
          const testResponse = await fetch(imageUrl, { method: 'HEAD' });
          console.log(
            `    🌐 [R2 DEBUG] URL accessibility test for uploaded image: ${testResponse.status} ${testResponse.statusText}`,
          );
        } catch (testError) {
          console.warn(
            `    ⚠️  [R2 DEBUG] URL accessibility test failed for uploaded image:`,
            testError,
          );
        }
      } catch (error: any) {
        console.error(
          `    ❌ [R2 DEBUG] Failed to save uploaded image to Cloudflare R2:`,
          error,
        );
        console.error(
          `    ❌ [R2 DEBUG] Error details for uploaded image:`,
          error.message,
        );
        if (error.stack) {
          console.error(
            `    ❌ [R2 DEBUG] Stack trace for uploaded image:`,
            error.stack,
          );
        }

        // Fallback: use data URL
        imageUrl = `data:image/png;base64,${imageBase64}`;
        console.log(
          `    🔄 [R2 DEBUG] Using fallback data URL for uploaded image (length: ${imageUrl.length})`,
        );
      }

      const filename = cleanFilename(filePath, 'unknown.jpg');

      console.log(
        `    📸 Converted image to base64 (${imageBase64.length} chars)`,
      );

      return {
        content: `Image: ${filename}. This image contains visual content that can be searched and analyzed using multimodal AI.`,
        metadata: {
          source: filePath,
          type: 'image',
          filename,
          contentHash: contentHash || '',
          contentType: 'image',
          imageData: imageBase64, // Store base64 data for embedding generation
          originalImagePath: filePath,
          imageUrl,
        },
      };
    } catch (error) {
      console.error(`    ❌ Error processing image ${filePath}:`, error);
      throw new Error(`Failed to process image: ${filePath}`);
    }
  },

  processImageWithUrl: async (
    filePath: string,
    contentHash?: string,
    existingImageUrl?: string,
  ): Promise<DocumentChunk> => {
    try {
      console.log(
        `    🖼️  Processing image file with existing URL: ${filePath}`,
      );

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`Image file not found: ${filePath}`);
      }

      // Read image file and convert to base64 for embedding generation
      const imageBuffer = await readFile(filePath);
      const imageBase64 = imageBuffer.toString('base64');

      const filename = cleanFilename(filePath, 'unknown.jpg');

      console.log(
        `    📸 Converted image to base64 (${imageBase64.length} chars)`,
      );
      console.log(`    🔗 Using provided image URL: ${existingImageUrl}`);

      return {
        content: `Image: ${filename}. This image contains visual content that can be searched and analyzed using multimodal AI.`,
        metadata: {
          source: filePath,
          type: 'image',
          filename,
          contentHash: contentHash || '',
          contentType: 'image',
          imageData: imageBase64, // Store base64 data for embedding generation
          originalImagePath: filePath,
          imageUrl: existingImageUrl, // Use the provided URL
        },
      };
    } catch (error) {
      console.error(`    ❌ Error processing image ${filePath}:`, error);
      throw new Error(`Failed to process image: ${filePath}`);
    }
  },
};
