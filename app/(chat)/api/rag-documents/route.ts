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

    // Upload to blob storage - store internal ID separately from display name
    const fileId = generateUUID();
    const fileName = file.name;
    const blobName = `${fileId}-${fileName}`;
    const blob = await put(blobName, file, {
      access: 'public',
    });

    // Create a temporary file for processing
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, blobName);

    // Write the file to disk for processing
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(tempFilePath, buffer);

    // Process the document based on its type
    let documentChunks: DocumentChunk[] = [];

    try {
      if (file.type === 'application/pdf') {
        documentChunks = await DocumentProcessor.processPDF(tempFilePath);
      } else if (file.type.startsWith('image/')) {
        const singleChunk = await DocumentProcessor.processImage(tempFilePath);
        documentChunks = [singleChunk];
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
        fs.unlinkSync(tempFilePath);
      } catch (error) {
        console.error('Error deleting temporary file:', error);
      }
    }

    if (documentChunks.length === 0) {
      return new ChatSDKError(
        'bad_request:api',
        'No content could be extracted from the document',
      ).toResponse();
    }

    // Initialize vector store
    const vectorStore = new VectorStore();
    await vectorStore.initialize();

    // Store document chunks in vector database
    await vectorStore.storeDocuments(documentChunks);

    return Response.json({
      success: true,
      message: 'Document successfully uploaded and processed',
      url: blob.url,
      filename: file.name,
      chunks: documentChunks.length,
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
