import { VectorStore } from '@/lib/ai/vectorStore';
import { formatDocumentContext } from '@/lib/ai/prompts';

export async function GET() {
  try {
    const vectorStore = new VectorStore();
    await vectorStore.initialize();

    // Test queries that should match thermodynamics images
    const testQueries = [
      'termodinamica',
      'thermodynamics',
      'diagram',
      'temperatura',
      'ciclo',
      'sistema cerrado',
      'imagen',
      'grafico',
      'formula',
      'ecuacion',
    ];

    const results = [];

    for (const query of testQueries) {
      console.log(`Testing query: "${query}"`);
      const searchResults = await vectorStore.searchSimilar(query, 20);

      const imageResults = searchResults.filter(
        (doc) => doc.metadata.contentType === 'image',
      );
      const textResults = searchResults.filter(
        (doc) => doc.metadata.contentType === 'text',
      );

      results.push({
        query,
        totalResults: searchResults.length,
        imageCount: imageResults.length,
        textCount: textResults.length,
        topImages: imageResults.slice(0, 3).map((doc) => ({
          score: doc.score,
          filename: doc.metadata.filename,
          page: doc.metadata.page,
          content: doc.metadata.content,
          relatedImageUrls: doc.metadata.relatedImageUrls,
          hasImageData: !!doc.metadata.imageData,
        })),
        topTexts: textResults.slice(0, 2).map((doc) => ({
          score: doc.score,
          filename: doc.metadata.filename,
          page: doc.metadata.page,
          content: `${doc.metadata.content?.substring(0, 150)}...`,
        })),
        formattedContext:
          imageResults.length > 0 ? formatDocumentContext(searchResults) : null,
      });
    }

    // Test with a specific thermodynamics query
    const thermoQuery = 'diagrama termodinámico ciclo';
    const thermoResults = await vectorStore.searchSimilar(thermoQuery, 30);
    const thermoImages = thermoResults.filter(
      (doc) => doc.metadata.contentType === 'image',
    );

    return Response.json({
      testResults: results,
      specificThermoTest: {
        query: thermoQuery,
        totalResults: thermoResults.length,
        imageCount: thermoImages.length,
        images: thermoImages.map((doc) => ({
          score: doc.score,
          filename: doc.metadata.filename,
          page: doc.metadata.page,
          content: doc.metadata.content,
          relatedImageUrls: doc.metadata.relatedImageUrls,
        })),
        formattedContext: formatDocumentContext(thermoResults),
      },
      summary: {
        totalQueriesTested: testQueries.length,
        queriesWithImages: results.filter((r) => r.imageCount > 0).length,
        averageImageScores: results
          .flatMap((r) => r.topImages)
          .map((img) => img.score),
      },
    });
  } catch (error: any) {
    return Response.json(
      {
        error: error.message,
        stack: error.stack,
      },
      { status: 500 },
    );
  }
}
