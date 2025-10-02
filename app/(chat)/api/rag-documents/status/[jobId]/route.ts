import { auth } from '@/app/(auth)/auth';
import { ChatSDKError } from '@/lib/errors';
import { db } from '@/lib/db';
import { documentProcessingJob } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export const maxDuration = 10;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError('unauthorized:api').toResponse();
    }

    const { jobId } = await params;

    // Fetch job from database
    const [job] = await db
      .select()
      .from(documentProcessingJob)
      .where(
        and(
          eq(documentProcessingJob.id, jobId),
          // biome-ignore lint: Forbidden non-null assertion
          eq(documentProcessingJob.userId, session.user.id!),
        ),
      )
      .limit(1);

    if (!job) {
      return new ChatSDKError('bad_request:api', 'Job not found').toResponse();
    }

    return Response.json({
      job_id: job.id,
      status: job.status,
      progress: parseInt(job.progress),
      message: job.message,
      error: job.errorMessage,
      filename: job.filename,
      // Include results when completed
      ...(job.status === 'completed' && {
        result: {
          chunks: parseInt(job.chunksCount || '0'),
          total_pages: parseInt(job.totalPages || '0'),
          processing_time: parseInt(job.processingTimeMs || '0'),
        },
      }),
      created_at: job.createdAt,
      updated_at: job.updatedAt,
    });
  } catch (error) {
    console.error('Error fetching job status:', error);
    return new ChatSDKError('bad_request:api').toResponse();
  }
}
