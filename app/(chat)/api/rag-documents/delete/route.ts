import { VectorStore } from '@/lib/ai/vectorStore';
import { auth } from '@/app/(auth)/auth';

export async function DELETE(request: Request) {
  try {
    // Check authentication
    const session = await auth();
    if (!session || !session.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filename = searchParams.get('filename');

    if (!filename) {
      return Response.json(
        { error: 'filename parameter is required' },
        { status: 400 },
      );
    }

    // Initialize vector store
    const vectorStore = new VectorStore();
    await vectorStore.initialize();

    console.log(`[DELETE API] Deleting documents by filename: ${filename}`);

    // Get R2 URLs before deleting the vectors
    let r2Urls: string[] = [];
    try {
      r2Urls = await vectorStore.getBlobUrlsForFile(filename);
      console.log(
        `[DELETE API] Found ${r2Urls.length} R2 URLs to delete for ${filename}`,
      );
    } catch (error) {
      console.warn(
        `[DELETE API] Could not retrieve R2 URLs for ${filename}:`,
        error,
      );
    }

    // Delete vectors from Pinecone
    const success = await vectorStore.deleteDocumentsByFilename(filename);

    // Delete associated files from R2 if vector deletion was successful
    if (success && r2Urls.length > 0) {
      try {
        const { del } = await import('@/lib/r2');
        console.log(`[DELETE API] Deleting ${r2Urls.length} file(s) from R2...`);

        const deletePromises = r2Urls.map(async (url) => {
          try {
            // Extract pathname from URL for R2 deletion
            const urlObj = new URL(url);
            const pathname = urlObj.pathname.startsWith('/')
              ? urlObj.pathname.slice(1)
              : urlObj.pathname;

            await del(pathname);
            console.log(`[DELETE API] Successfully deleted R2 file: ${pathname}`);
          } catch (error) {
            console.error(`[DELETE API] Failed to delete R2 file ${url}:`, error);
            // Don't fail the entire operation if one file deletion fails
          }
        });

        await Promise.allSettled(deletePromises);
        console.log(
          `[DELETE API] Completed R2 deletion process for ${filename}`,
        );
      } catch (error) {
        console.error(`[DELETE API] Error during R2 deletion:`, error);
        // Don't fail the operation if R2 deletion fails
      }
    }

    if (success) {
      return Response.json({
        success: true,
        message: `Successfully deleted all vectors and associated images for file: ${filename}`,
        deletedItem: filename,
        type: 'filename',
      });
    } else {
      return Response.json(
        {
          error: `Failed to delete vectors for file: ${filename}`,
        },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error('Error in delete documents API:', error);
    return Response.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
