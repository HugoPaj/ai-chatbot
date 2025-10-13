import { auth } from '@/app/(auth)/auth';
import { ChatSDKError } from '@/lib/errors';
import { db } from '@/lib/db';
import { documentProcessingJob } from '@/lib/db/schema';

// Quick endpoint - just creates job and returns immediately (no timeout issues!)
export const maxDuration = 30;

// Maximum file size: 20MB
const MAX_FILE_SIZE = 20 * 1024 * 1024;
// Supported file types
const SUPPORTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError('unauthorized:api').toResponse();
    }

    // Get JSON data (r2Key and metadata from client-side upload)
    const { r2Key, filename, fileSize, fileType, contentHash } = await request.json();

    if (!r2Key || !filename || !fileSize || !fileType || !contentHash) {
      return new ChatSDKError(
        'bad_request:api',
        'Missing required fields',
      ).toResponse();
    }

    // Validate file size
    const fileSizeNum = Number.parseInt(fileSize);
    if (fileSizeNum > MAX_FILE_SIZE) {
      return new ChatSDKError(
        'bad_request:api',
        'File exceeds maximum size of 20MB',
      ).toResponse();
    }

    // Validate file type
    if (!SUPPORTED_TYPES.includes(fileType)) {
      return new ChatSDKError(
        'bad_request:api',
        'Unsupported file type. Please upload PDF, JPEG, or PNG files',
      ).toResponse();
    }

    console.log(`[RAG] Processing uploaded file: ${filename}`);

    // Generate the public URL for the uploaded file
    const r2Config = {
      publicUrl: process.env.R2_PUBLIC_URL,
      accountId: process.env.R2_ACCOUNT_ID,
      bucketName: process.env.R2_BUCKET_NAME,
    };

    const encodedPathname = r2Key
      .split('/')
      .map((segment: string) => encodeURIComponent(segment))
      .join('/');

    const r2Url = r2Config.publicUrl
      ? `${r2Config.publicUrl}/${encodedPathname}`
      : `https://${r2Config.accountId}.r2.cloudflarestorage.com/${r2Config.bucketName}/${encodedPathname}`;

    console.log(`[RAG] File URL: ${r2Url}`);
    console.log(`[RAG] Content hash: ${contentHash.substring(0, 16)}...`);
    console.log(`[RAG] Creating processing job (duplicate check already done by client)...`);

    // Create job in database - Cloud Run worker will pick it up and process
    const [job] = await db
      .insert(documentProcessingJob)
      .values({
        // biome-ignore lint: Forbidden non-null assertion
        userId: session.user.id!,
        filename,
        fileSize,
        fileType,
        status: 'queued',
        progress: '0',
        message: 'Waiting for processing...',
        r2Url,
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
      filename,
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
