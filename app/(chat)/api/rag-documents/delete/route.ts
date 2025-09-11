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

    // Get blob URLs before deleting the vectors
    let blobUrls: string[] = [];
    try {
      blobUrls = await vectorStore.getBlobUrlsForFile(filename);
      console.log(
        `[DELETE API] Found ${blobUrls.length} blob URLs to delete for ${filename}`,
      );
    } catch (error) {
      console.warn(
        `[DELETE API] Could not retrieve blob URLs for ${filename}:`,
        error,
      );
    }

    // Delete vectors from Pinecone
    const success = await vectorStore.deleteDocumentsByFilename(filename);

    // Delete associated blobs from Vercel if vector deletion was successful
    if (success && blobUrls.length > 0) {
      try {
        const { del } = await import('@vercel/blob');
        console.log(`[DELETE API] Deleting ${blobUrls.length} blob(s)...`);

        const deletePromises = blobUrls.map(async (url) => {
          try {
            await del(url);
            console.log(`[DELETE API] Successfully deleted blob: ${url}`);
          } catch (error) {
            console.error(`[DELETE API] Failed to delete blob ${url}:`, error);
            // Don't fail the entire operation if one blob deletion fails
          }
        });

        await Promise.allSettled(deletePromises);
        console.log(
          `[DELETE API] Completed blob deletion process for ${filename}`,
        );
      } catch (error) {
        console.error(`[DELETE API] Error during blob deletion:`, error);
        // Don't fail the operation if blob deletion fails
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
