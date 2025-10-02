import { auth } from '@/app/(auth)/auth';
import { put } from '@/lib/r2';
import { ChatSDKError } from '@/lib/errors';
import { generateUUID } from '@/lib/utils';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { documentProcessingJob } from '@/lib/db/schema';

// Quick endpoint - just creates job and returns immediately (no timeout issues!)
export const maxDuration = 30;

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

    const fileId = generateUUID();
    const fileName = file.name;
    const sanitizedFileName = fileName.replace(/[<>:"/\\|?*]/g, '_');

    // Upload file to R2 storage for later processing
    const r2Key = `pending-docs/${fileId}-${sanitizedFileName}`;
    console.log(`[RAG] Uploading file to R2: ${fileName}`);
    const r2Upload = await put(r2Key, file, {
      access: 'public',
      contentType: file.type,
    });
    console.log(`[RAG] File uploaded to R2: ${r2Upload.url}`);

    // Calculate content hash for deduplication
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentHash = crypto
      .createHash('sha256')
      .update(buffer)
      .digest('hex');

    console.log(`[RAG] Checking for duplicate document...`);
    console.log(`[RAG] Content hash: ${contentHash.substring(0, 16)}...`);

    // Check if document already exists in vector database
    const { VectorStore } = await import('@/lib/ai/vectorStore');
    const vectorStore = new VectorStore();
    await vectorStore.initialize();

    const duplicateCheck = await vectorStore.checkDuplicateDocument(contentHash);

    if (duplicateCheck.exists) {
      console.log(
        `[RAG] Duplicate document detected: ${duplicateCheck.filename}`,
      );
      return Response.json({
        success: false,
        error: 'duplicate',
        message: `This document already exists in the knowledge base as "${duplicateCheck.filename}". Uploading it again would replace the existing version.`,
        existingFilename: duplicateCheck.filename,
        contentHash: contentHash.substring(0, 16),
      });
    }

    console.log(`[RAG] No duplicate found, proceeding with upload...`);

    // Create job in database - Cloud Run worker will pick it up and process
    const [job] = await db
      .insert(documentProcessingJob)
      .values({
        // biome-ignore lint: Forbidden non-null assertion
        userId: session.user.id!,
        filename: sanitizedFileName,
        fileSize: file.size.toString(),
        fileType: file.type,
        status: 'queued',
        progress: '0',
        message: 'Waiting for processing...',
        r2Url: r2Upload.url,
        contentHash,
      })
      .returning();

    console.log(`[RAG] Created processing job: ${job.id}`);

    // Return immediately - no timeout!
    return Response.json({
      success: true,
      job_id: job.id,
      status: 'queued',
      message:
        'Document uploaded and queued for processing. Poll /api/rag-documents/status/{job_id} for updates.',
      filename: file.name,
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
