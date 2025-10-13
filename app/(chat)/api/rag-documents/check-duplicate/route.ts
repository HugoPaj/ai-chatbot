import { auth } from '@/app/(auth)/auth';
import { ChatSDKError } from '@/lib/errors';

export const maxDuration = 10;

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError('unauthorized:api').toResponse();
    }

    const { contentHash } = await request.json();

    if (!contentHash) {
      return new ChatSDKError(
        'bad_request:api',
        'Missing contentHash',
      ).toResponse();
    }

    // Check if document already exists in vector database
    const { VectorStore } = await import('@/lib/ai/vectorStore');
    const vectorStore = new VectorStore();
    await vectorStore.initialize();

    const duplicateCheck = await vectorStore.checkDuplicateDocument(contentHash);

    return Response.json({
      exists: duplicateCheck.exists,
      filename: duplicateCheck.filename,
      contentHash: contentHash.substring(0, 16),
    });
  } catch (error) {
    console.error('Error checking duplicate:', error);
    return new ChatSDKError('bad_request:api').toResponse();
  }
}
