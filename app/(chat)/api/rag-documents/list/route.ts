import { VectorStore } from '@/lib/ai/vectorStore';
import { auth } from '@/app/(auth)/auth';

export async function GET(request: Request) {
  try {
    // Check authentication
    const session = await auth();
    if (!session || !session.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Initialize vector store
    const vectorStore = new VectorStore();
    await vectorStore.initialize();

    console.log('[LIST API] Retrieving list of stored files...');

    // Get list of stored files and index statistics
    const [storedFiles, indexStats] = await Promise.all([
      vectorStore.listStoredFiles(),
      vectorStore.getIndexStats(),
    ]);

    return Response.json({
      success: true,
      files: storedFiles,
      totalFiles: storedFiles.length,
      indexStats: {
        totalVectors: indexStats.totalVectorCount || 0,
        dimension: indexStats.dimension || 1536,
        namespaces: indexStats.namespaces || {},
      },
    });
  } catch (error) {
    console.error('Error in list documents API:', error);
    return Response.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
