import { auth } from '@/app/(auth)/auth';
import { generatePresignedUploadUrl } from '@/lib/r2';
import { ChatSDKError } from '@/lib/errors';
import { generateUUID } from '@/lib/utils';

export const maxDuration = 10;

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError('unauthorized:api').toResponse();
    }

    const { filename, contentType } = await request.json();

    if (!filename || !contentType) {
      return new ChatSDKError(
        'bad_request:api',
        'Missing filename or contentType',
      ).toResponse();
    }

    // Validate file type
    const SUPPORTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!SUPPORTED_TYPES.includes(contentType)) {
      return new ChatSDKError(
        'bad_request:api',
        'Unsupported file type',
      ).toResponse();
    }

    const fileId = generateUUID();
    const sanitizedFileName = filename.replace(/[<>:"/\\|?*]/g, '_');
    const r2Key = `pending-docs/${fileId}-${sanitizedFileName}`;

    // Generate presigned URL (valid for 1 hour)
    const uploadUrl = await generatePresignedUploadUrl(r2Key, contentType, 3600);

    return Response.json({
      uploadUrl,
      r2Key,
      fileId,
    });
  } catch (error) {
    console.error('Error generating upload URL:', error);
    return new ChatSDKError('bad_request:api').toResponse();
  }
}
