// src/lib/documentProcessor.ts
import * as pdfParse from 'pdf-parse';
import { readFile } from 'fs/promises';
import { DocumentChunk } from '../types';
import fs from 'fs';

export class DocumentProcessor {
  static async processPDF(filePath: string): Promise<DocumentChunk[]> {
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
      
      const chunks = this.chunkText(data.text, 1000, 200);
      const filename = filePath.split(/[/\\]/).pop() || 'unknown.pdf';
      
      return chunks.map((chunk, index): DocumentChunk => ({
        content: chunk,
        metadata: {
          source: filePath,
          page: Math.floor(index / 2) + 1, // Estimate page number
          type: 'pdf',
          filename
        }
      }));
    } catch (error) {
      console.error(`    ❌ Error processing PDF ${filePath}:`, error);
      throw new Error(`Failed to process PDF: ${filePath}`);
    }
  }

  static async processImage(filePath: string): Promise<DocumentChunk> {
    try {
      // For now, just store image metadata
      // In the future, you could add OCR with Tesseract.js
      const filename = filePath.split(/[/\\]/).pop() || 'unknown.jpg';
      
      return {
        content: `Engineering diagram/image: ${filename}. This image contains technical content that may include diagrams, charts, schematics, or other visual engineering information.`,
        metadata: {
          source: filePath,
          type: 'image',
          filename
        }
      };
    } catch (error) {
      console.error(`    ❌ Error processing image ${filePath}:`, error);
      throw new Error(`Failed to process image: ${filePath}`);
    }
  }

  private static chunkText(text: string, chunkSize: number, overlap: number): string[] {
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
      if (currentChunk.length + trimmedSentence.length > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        
        // Create overlap by keeping some words from the end
        const words = currentChunk.split(' ');
        const overlapWords = Math.floor(overlap / 10); // Approximate overlap in words
        currentChunk = words.slice(-overlapWords).join(' ') + ' ' + trimmedSentence;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + trimmedSentence;
      }
    }
    
    // Add the last chunk if it has content
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    // Filter out very short chunks (less than 50 characters)
    return chunks.filter(chunk => chunk.length >= 50);
  }
}