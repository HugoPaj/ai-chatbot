import { VectorStore } from '@/lib/ai/vectorStore';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || 'thermodynamics diagram';
  const limit = parseInt(searchParams.get('limit') || '50');

  try {
    const vectorStore = new VectorStore();
    await vectorStore.initialize();

    // Search for documents
    const results = await vectorStore.searchSimilar(query, limit);
    
    // Filter and analyze results
    const allResults = results.map(doc => ({
      score: doc.score,
      contentType: doc.metadata.contentType,
      filename: doc.metadata.filename,
      page: doc.metadata.page,
      imageUrl: doc.metadata.imageUrl,
      content: doc.content?.substring(0, 100) + '...',
      hasImageData: !!doc.metadata.imageData,
      imageDataLength: doc.metadata.imageData?.length || 0
    }));

    const imageResults = results.filter(doc => doc.metadata.contentType === 'image');
    const textResults = results.filter(doc => doc.metadata.contentType === 'text');

    return Response.json({
      query,
      totalResults: results.length,
      imageCount: imageResults.length,
      textCount: textResults.length,
      imageResults: imageResults.map(doc => ({
        score: doc.score,
        filename: doc.metadata.filename,
        page: doc.metadata.page,
        imageUrl: doc.metadata.imageUrl,
        content: doc.content,
        hasImageData: !!doc.metadata.imageData,
        imageDataLength: doc.metadata.imageData?.length || 0
      })),
      allResults,
      scoringAnalysis: {
        highScoreImages: imageResults.filter(doc => doc.score > 0.7).length,
        mediumScoreImages: imageResults.filter(doc => doc.score > 0.5 && doc.score <= 0.7).length,
        lowScoreImages: imageResults.filter(doc => doc.score <= 0.5).length,
        averageImageScore: imageResults.length > 0 
          ? imageResults.reduce((sum, doc) => sum + doc.score, 0) / imageResults.length 
          : 0
      }
    });

  } catch (error: any) {
    return Response.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}