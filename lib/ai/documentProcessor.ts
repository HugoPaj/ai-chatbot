// src/lib/documentProcessor.ts
import * as pdfParse from 'pdf-parse';
import { readFile } from 'node:fs/promises';
import type { DocumentChunk } from '../types';
import fs from 'node:fs';

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
  processPDF: async (filePath: string): Promise<DocumentChunk[]> => {
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
          },
        }),
      );
    } catch (error) {
      console.error(`    ❌ Error processing PDF ${filePath}:`, error);
      throw new Error(`Failed to process PDF: ${filePath}`);
    }
  },

  processImage: async (filePath: string): Promise<DocumentChunk> => {
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
        },
      };
    } catch (error) {
      console.error(`    ❌ Error processing image ${filePath}:`, error);
      throw new Error(`Failed to process image: ${filePath}`);
    }
  },
};
