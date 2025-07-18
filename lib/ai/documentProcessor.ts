// src/lib/documentProcessor.ts
import * as pdfParse from 'pdf-parse';
import { readFile } from 'node:fs/promises';
import type { DocumentChunk } from '../types';
import fs from 'node:fs';
import { OCRService } from './ocr';
import { EmbeddingService, type ImageData, type MultimodalEmbeddingResult } from './embeddings';

export interface MultimodalDocumentChunk extends DocumentChunk {
  visualEmbedding?: number[];
  textEmbedding?: number[];
  ocrText?: string;
  contentType: 'text' | 'image' | 'multimodal';
  imageData?: ImageData;
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

// Functions to process different document types
export const DocumentProcessor = {
  processPDF: async (
    filePath: string,
    contentHash?: string,
  ): Promise<DocumentChunk[]> => {
    try {
      console.log(`    📖 Reading PDF file: ${filePath}`);
      // Check if file exists before attempting to read it
      if (!fs.existsSync(filePath)) {
        throw new Error(`PDF file not found: ${filePath}`);
      }

      const dataBuffer = await readFile(filePath);
      const data = await pdfParse.default(dataBuffer);

      console.log(`    📝 Extracted ${data.text.length} characters`);
      console.log(`    📄 Document has ${data.numpages} pages`);

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
            page: Math.floor(index / 2) + 1, // Estimate page number
            type: 'pdf',
            filename,
            contentHash: contentHash || '', // Include content hash for deduplication
          },
        }),
      );
    } catch (error) {
      console.error(`    ❌ Error processing PDF ${filePath}:`, error);
      throw new Error(`Failed to process PDF: ${filePath}`);
    }
  },

  processImage: async (
    filePath: string,
    contentHash?: string,
  ): Promise<DocumentChunk> => {
    try {
      // For now, just store image metadata
      // In the future, you could add OCR with Tesseract.js
      const filename = cleanFilename(filePath, 'unknown.jpg');

      return {
        content: `Engineering diagram/image: ${filename}. This image contains technical content that may include diagrams, charts, schematics, or other visual engineering information.`,
        metadata: {
          source: filePath,
          type: 'image',
          filename,
          contentHash: contentHash || '', // Include content hash for deduplication
        },
      };
    } catch (error) {
      console.error(`    ❌ Error processing image ${filePath}:`, error);
      throw new Error(`Failed to process image: ${filePath}`);
    }
  },

  processImageMultimodal: async (
    filePath: string,
    contentHash?: string,
  ): Promise<MultimodalDocumentChunk> => {
    try {
      console.log(`    🖼️  Processing image with multimodal approach: ${filePath}`);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`Image file not found: ${filePath}`);
      }

      const filename = cleanFilename(filePath, 'unknown.jpg');
      const imageBuffer = await readFile(filePath);
      
      // Determine mime type from file extension
      const ext = filePath.toLowerCase().split('.').pop() || '';
      const mimeType: 'image/jpeg' | 'image/png' = ext === 'png' ? 'image/png' : 'image/jpeg';
      
      // Preprocess and convert to base64 for embedding
      const imageData = await EmbeddingService.preprocessImageForEmbedding(imageBuffer, {
        maxWidth: 1024,
        maxHeight: 1024,
        quality: 85,
      });
      
      // Extract text using OCR
      console.log(`    📝 Extracting text from image using OCR...`);
      let ocrText = '';
      let textEmbedding: number[] | undefined;
      
      try {
        const ocrResult = await OCRService.extractText(imageBuffer);
        ocrText = ocrResult.text;
        console.log(`    📄 OCR extracted ${ocrText.length} characters (confidence: ${ocrResult.confidence.toFixed(1)}%)`);
        
        // Generate text embedding if OCR found text
        if (OCRService.isTextPresent(ocrResult, 60)) {
          textEmbedding = await EmbeddingService.generateSingleEmbedding(ocrText, 'document');
          console.log(`    🔤 Generated text embedding for OCR content`);
        }
      } catch (ocrError) {
        console.warn(`    ⚠️  OCR failed for ${filePath}:`, ocrError);
        // Continue processing without OCR text
      }
      
      // Generate visual embedding using multimodal model
      console.log(`    👁️  Generating visual embedding...`);
      const visualEmbeddingResult = await EmbeddingService.generateSingleMultimodalEmbedding(
        imageData,
        'document'
      );
      
      // Create content description
      const contentDescription = ocrText.length > 0 
        ? `Image: ${filename}. OCR Text: ${ocrText}` 
        : `Image: ${filename}. This image contains visual content that may include diagrams, charts, photographs, or other visual information.`;
      
      const contentType = ocrText.length > 0 ? 'multimodal' : 'image';
      
      console.log(`    ✅ Successfully processed image as ${contentType} content`);
      
      return {
        content: contentDescription,
        metadata: {
          source: filePath,
          type: 'image',
          filename,
          contentHash: contentHash || '',
        },
        visualEmbedding: visualEmbeddingResult.embedding,
        textEmbedding,
        ocrText: ocrText || undefined,
        contentType,
        imageData,
      };
    } catch (error) {
      console.error(`    ❌ Error processing image ${filePath}:`, error);
      throw new Error(`Failed to process image: ${filePath}`);
    }
  },
};
