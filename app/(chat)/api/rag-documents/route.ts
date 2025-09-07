import { auth } from '@/app/(auth)/auth';
import { VectorStore } from '@/lib/ai/vectorStore';
import { DocumentProcessor } from '@/lib/ai/documentProcessor';
import { put } from '@vercel/blob';
import { ChatSDKError } from '@/lib/errors';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { generateUUID } from '@/lib/utils';
import type { DocumentChunk } from '@/lib/types';
import crypto from 'node:crypto';

// Maximum file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;
// Supported file types
const SUPPORTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError('unauthorized:api').toResponse();
    }

    // Get form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return new ChatSDKError(
        'bad_request:api',
        'No file provided',
      ).toResponse();
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return new ChatSDKError(
        'bad_request:api',
        'File exceeds maximum size of 10MB',
      ).toResponse();
    }

    // Check file type
    if (!SUPPORTED_TYPES.includes(file.type)) {
      return new ChatSDKError(
        'bad_request:api',
        'Unsupported file type. Please upload PDF, JPEG, or PNG files',
      ).toResponse();
    }

    // Create a temporary file for processing
    const tempDir = os.tmpdir();
    const fileId = generateUUID();
    const fileName = file.name;
    const sanitizedFileName = fileName.replace(/[<>:"/\\|?*]/g, '_');
    const tempFilePath = path.join(tempDir, `${fileId}-${sanitizedFileName}`);

    // Only upload images to blob storage (PDFs don't need public URLs)
    let blob: { url: string } | null = null;
    if (file.type.startsWith('image/')) {
      console.log(`[RAG DEBUG] Uploading image to blob storage: ${fileName}`);
      const blobName = `${fileId}-${fileName}`;
      blob = await put(blobName, file, {
        access: 'public',
        contentType: file.type,
      });
      console.log(`[RAG DEBUG] Image uploaded to blob: ${blob.url}`);
    } else {
      console.log(`[RAG DEBUG] Skipping blob upload for PDF: ${fileName}`);
    }

    // Write the file to disk for processing
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(tempFilePath, buffer);

    // Calculate content hash for deduplication
    const contentHash = crypto
      .createHash('sha256')
      .update(buffer)
      .digest('hex');

    // Process the document based on its type
    let documentChunks: DocumentChunk[] = [];

    try {
      if (file.type === 'application/pdf') {
        documentChunks = await DocumentProcessor.processPDF(
          tempFilePath,
          contentHash,
        );
      } else if (file.type.startsWith('image/')) {
        console.log(`[RAG DEBUG] Processing uploaded image file: ${file.name}`);
        console.log(
          `[RAG DEBUG] File type: ${file.type}, size: ${file.size} bytes`,
        );

        if (!blob) {
          throw new Error('Image blob upload failed - no blob URL available');
        }

        console.log(`[RAG DEBUG] Using existing blob URL: ${blob.url}`);

        // Process the image but skip the blob upload since we already uploaded it
        const singleChunk = await DocumentProcessor.processImageWithUrl(
          tempFilePath,
          contentHash,
          blob.url, // Pass the existing blob URL
        );

        documentChunks = [singleChunk];

        console.log(`[RAG DEBUG] Final chunk metadata:`, {
          filename: singleChunk.metadata.filename,
          contentType: singleChunk.metadata.contentType,
          imageUrl: singleChunk.metadata.imageUrl,
          hasImageData: !!singleChunk.metadata.imageData,
        });
      }
    } catch (error) {
      console.error('Error processing document:', error);
      return new ChatSDKError(
        'bad_request:api',
        'Failed to process document',
      ).toResponse();
    } finally {
      // Clean up the temporary file
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          console.log(`Cleaned up temporary file: ${tempFilePath}`);
        }
      } catch (error) {
        console.error('Error deleting temporary file:', error);
        console.error('Temp file path was:', tempFilePath);
      }
    }

    if (documentChunks.length === 0) {
      return new ChatSDKError(
        'bad_request:api',
        'No content could be extracted from the document',
      ).toResponse();
    }

    console.log(
      `[RAG DEBUG] About to store ${documentChunks.length} document chunks`,
    );

    // Log image chunks specifically
    const imageChunks = documentChunks.filter(
      (chunk) => chunk.metadata.contentType === 'image',
    );
    if (imageChunks.length > 0) {
      console.log(
        `[RAG DEBUG] Found ${imageChunks.length} image chunks to store`,
      );
      imageChunks.forEach((chunk, index) => {
        console.log(`[RAG DEBUG] Image chunk ${index + 1}:`, {
          filename: chunk.metadata.filename,
          imageUrl: chunk.metadata.imageUrl,
          hasImageData: !!chunk.metadata.imageData,
          imageDataLength: chunk.metadata.imageData?.length || 0,
        });
      });
    }

    // Initialize vector store
    const vectorStore = new VectorStore();
    await vectorStore.initialize();

    // Store document chunks in vector database
    console.log(`[RAG DEBUG] Storing chunks in vector database...`);
    await vectorStore.storeDocuments(documentChunks);
    console.log(`[RAG DEBUG] Successfully stored chunks in vector database`);

    return Response.json({
      success: true,
      message: 'Document successfully uploaded and processed',
      url: blob?.url || null, // Only include URL for images
      filename: file.name,
      chunks: documentChunks.length,
      type: file.type,
    });
  } catch (error) {
    console.error('Error in document upload:', error);
    return new ChatSDKError('bad_request:api').toResponse();
  }
}

export async function GET() {
  // This endpoint could be used to retrieve a list of uploaded documents in the future
  return new ChatSDKError(
    'bad_request:api',
    'This endpoint is not yet implemented',
  ).toResponse();
}
