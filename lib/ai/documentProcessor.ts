// src/lib/documentProcessor.ts
import { readFile } from 'node:fs/promises';
import type { DocumentChunk, Coordinates, TableStructure } from '../types';
import fs from 'node:fs';
import path from 'node:path';
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

    // Create a File object from buffer
    const file = new File(
      [fileBuffer],
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
    const documentChunks: DocumentChunk[] = doclingResult.chunks.map(
      (chunk, index) => {
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

        // Save image chunks to disk and generate a public URL
        let imageUrl: string | undefined;
        if (chunk.content_type === 'image' && chunk.image_data) {
          const imagesDir = path.join(process.cwd(), 'public', 'doc-images');
          if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
          }

          const imageHash = crypto
            .createHash('md5')
            .update(chunk.image_data)
            .digest('hex')
            .slice(0, 16);
          const imageFileName = `${imageHash}.png`;
          const imageFilePath = path.join(imagesDir, imageFileName);

          if (!fs.existsSync(imageFilePath)) {
            fs.writeFileSync(
              imageFilePath,
              Buffer.from(chunk.image_data, 'base64'),
            );
            console.log(`    🖼️  Saved extracted image to ${imageFilePath}`);
          }

          imageUrl = `/doc-images/${imageFileName}`;
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
      },
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
      const dataBuffer = await readFile(filePath);
      
      // Dynamic import to avoid test file execution issues at module load time
      const { default: pdfParseModule } = await import('pdf-parse');
      const data = await pdfParseModule(dataBuffer);

      console.log(
        `    📝 Extracted ${data.text.length} characters from ${data.numpages} pages`,
      );

      if (!data.text || data.text.trim().length === 0) {
        console.warn(`    ⚠️  No text content found in PDF`);
        return [];
      }

      const chunks = chunkText(data.text, 1000, 200);
      const filename = cleanFilename(filePath, 'unknown.pdf');

      return chunks.map(
        (chunk: string, index: number): DocumentChunk => ({
          content: chunk,
          metadata: {
            source: filePath,
            page: Math.floor(index / 2) + 1,
            type: 'pdf',
            filename,
            contentHash: contentHash || '',
            contentType: 'text',
          },
        }),
      );
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

      // Save image to disk and generate URL
      const imagesDir = path.join(process.cwd(), 'public', 'doc-images');
      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
      }
      const imageHash = crypto
        .createHash('md5')
        .update(imageBase64)
        .digest('hex')
        .slice(0, 16);
      const imageFileName = `${imageHash}.png`;
      const imageFilePath = path.join(imagesDir, imageFileName);
      if (!fs.existsSync(imageFilePath)) {
        fs.writeFileSync(imageFilePath, imageBuffer);
        console.log(`    🖼️  Saved uploaded image to ${imageFilePath}`);
      }
      const imageUrl = `/doc-images/${imageFileName}`;

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
};
