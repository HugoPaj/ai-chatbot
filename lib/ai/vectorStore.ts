import { Pinecone, PineconeRecord, Index } from '@pinecone-database/pinecone';
import { DocumentChunk, SearchResult } from '../types';
import { EmbeddingService } from './embeddings';
import { MultimodalDocumentChunk } from './documentProcessor';
import crypto from 'crypto';

export interface MultimodalSearchResult extends SearchResult {
  contentType: 'text' | 'image' | 'multimodal';
  visualScore?: number;
  textScore?: number;
  ocrText?: string;
  imageUrl?: string;
}

export class VectorStore {
  private pinecone: Pinecone;
  private indexName: string;

  constructor(indexName: string = 'test3') {
    if (!process.env.PINECONE_API_KEY) {
      throw new Error('PINECONE_API_KEY is not configured');
    }

    this.pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });
    this.indexName = indexName;
  }

  /**
   * Get the appropriate dimension for the embedding type
   */
  private getEmbeddingDimension(
    embeddingType: 'text' | 'visual' | 'multimodal',
  ): number {
    switch (embeddingType) {
      case 'text':
        return 1536; // voyage-large-2
      case 'visual':
      case 'multimodal':
        return 1024; // voyage-multimodal-3 (assumed dimension)
      default:
        return 1536;
    }
  }

  /**
   * Generate namespace for different embedding types
   */
  private getNamespace(
    embeddingType: 'text' | 'visual' | 'multimodal',
  ): string {
    return `${embeddingType}-embeddings`;
  }

  /**
   * Initialize the vector store, creating the index if it doesn't exist
   * or verifying it has the correct configuration
   * For multimodal support, we'll use the maximum dimension and handle different types via namespaces
   */
  async initialize(): Promise<void> {
    try {
      const REQUIRED_DIMENSION = 1536; // Use text embedding dimension as primary

      // Check if index exists
      const indexes = await this.pinecone.listIndexes();
      const indexExists =
        indexes.indexes?.some(
          (index: { name: string }) => index.name === this.indexName,
        ) || false;

      if (indexExists) {
        console.log(
          `Index '${this.indexName}' exists. Checking configuration...`,
        );

        // Get index details to check dimension
        const indexDetails = await this.pinecone.describeIndex(this.indexName);
        const currentDimension = indexDetails.dimension;

        if (currentDimension === REQUIRED_DIMENSION) {
          console.log(
            `✅ Index '${this.indexName}' already exists with correct dimension (${REQUIRED_DIMENSION})`,
          );
          console.log('Using existing index');
          return;
        } else {
          console.log(
            `⚠️ Index exists but has incorrect dimension: ${currentDimension} (required: ${REQUIRED_DIMENSION})`,
          );
          console.log(`Deleting index to recreate with correct dimension...`);
          await this.pinecone.deleteIndex(this.indexName);
          console.log(`✅ Index '${this.indexName}' deleted successfully`);

          // Wait a bit for the deletion to complete
          console.log('Waiting for deletion to complete...');
          await new Promise((resolve) => setTimeout(resolve, 30000)); // Wait 10 seconds
        }
      } else {
        console.log(
          `Index '${this.indexName}' does not exist. Creating new index...`,
        );
      }

      // Create the index with appropriate settings for text embeddings
      console.log(`Creating index '${this.indexName}'...`);
      await this.pinecone.createIndex({
        name: this.indexName,
        dimension: REQUIRED_DIMENSION, // voyage-large-2 uses 1536-dimensional embeddings
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1', // Free tier supports us-east-1
          },
        },
      });

      console.log(`✅ Index '${this.indexName}' created successfully`);

      // Wait for the index to be ready
      console.log('Waiting for index to be ready...');
      await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds
      console.log('Index should be ready now');
    } catch (error) {
      console.error('Error initializing vector store:', error);
      throw error;
    }
  }

  /**
   * Generate a consistent document ID based on content and metadata
   * This ensures the same document gets the same ID across runs
   */
  private generateDocumentId(doc: DocumentChunk): string {
    // If contentHash is available, use it as the primary identifier
    if (doc.metadata.contentHash) {
      // Combine contentHash with page/section information for multi-page documents
      const idSource = `${doc.metadata.contentHash}|${doc.metadata.page || ''}|${doc.metadata.section || ''}`;
      return crypto.createHash('md5').update(idSource).digest('hex');
    }

    // Fallback to previous method for backward compatibility
    // Note: doc.metadata.filename already has UUID prefix removed by DocumentProcessor
    const idSource = `${doc.metadata.source}|${doc.metadata.filename}|${doc.metadata.page || ''}|${doc.metadata.section || ''}`;
    return crypto.createHash('md5').update(idSource).digest('hex');
  }

  /**
   * Check if a document already exists in the vector store
   */
  private async documentExists(docId: string, index: Index): Promise<boolean> {
    try {
      const fetchResponse = await index.fetch([docId]);
      return (
        fetchResponse.records && fetchResponse.records[docId] !== undefined
      );
    } catch (error) {
      console.error(`Error checking if document ${docId} exists:`, error);
      return false; // Assume it doesn't exist if there's an error
    }
  }

  /**
   * Store documents in the vector store, skipping documents that already exist
   * Only processes new or changed documents
   */
  async storeDocuments(documents: DocumentChunk[]): Promise<void> {
    const index = this.pinecone.index(this.indexName);
    const batchSize = 5; // Reduced batch size to avoid rate limits
    const delayBetweenDocs = 250; // 250ms delay between document processing

    console.log(`Preparing to process ${documents.length} documents...`);

    // First, identify which documents need processing by checking if they exist
    const documentsToProcess: Array<{ doc: DocumentChunk; id: string }> = [];

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const docId = this.generateDocumentId(doc);

      // Add a small delay between existence checks to avoid rate limits
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const exists = await this.documentExists(docId, index);

      if (!exists) {
        documentsToProcess.push({ doc, id: docId });
        console.log(
          `Document ${i + 1}/${documents.length}: ${doc.metadata.filename} - New document, will process`,
        );
      } else {
        console.log(
          `Document ${i + 1}/${documents.length}: ${doc.metadata.filename} - Already exists, skipping`,
        );
      }
    }

    console.log(
      `Found ${documentsToProcess.length} new documents to process out of ${documents.length} total`,
    );

    // Now process the new documents in batches
    for (let i = 0; i < documentsToProcess.length; i += batchSize) {
      const batch = documentsToProcess.slice(i, i + batchSize);
      console.log(
        `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(documentsToProcess.length / batchSize)}`,
      );

      // Process documents sequentially instead of in parallel to avoid rate limits
      const vectors: PineconeRecord[] = [];

      for (let j = 0; j < batch.length; j++) {
        const { doc, id } = batch[j];

        try {
          console.log(
            `  Processing document ${i + j + 1}/${documentsToProcess.length}: ${doc.metadata.filename}`,
          );

          // Add delay between document processing
          if (j > 0) {
            console.log(
              `  Waiting ${delayBetweenDocs / 1000} seconds before processing next document...`,
            );
            await new Promise((resolve) =>
              setTimeout(resolve, delayBetweenDocs),
            );
          }

          const embedding = await EmbeddingService.generateSingleEmbedding(
            doc.content,
          );

          vectors.push({
            id: id, // Use the consistent document ID
            values: embedding,
            metadata: {
              content: doc.content,
              source: doc.metadata.source,
              page: doc.metadata.page || '',
              type: doc.metadata.type,
              filename: doc.metadata.filename,
              section: doc.metadata.section || '',
              contentHash: doc.metadata.contentHash || '',
            },
          });

          console.log(
            `  ✅ Successfully generated embeddings for document ${i + j + 1}`,
          );
        } catch (error) {
          console.error(
            `  ❌ Error processing document ${doc.metadata.source}:`,
            error,
          );
          // Continue with other documents instead of failing the entire batch
          console.log(`  Continuing with next document...`);
        }
      }

      if (vectors.length > 0) {
        console.log(`Uploading ${vectors.length} vectors to Pinecone...`);
        await index.upsert(vectors);
        console.log(`✅ Successfully uploaded batch to Pinecone`);
      } else {
        console.log(`⚠️ No vectors to upload in this batch`);
      }

      // Add longer delay between batches
      if (i + batchSize < documentsToProcess.length) {
        const batchDelay = 1000; // 5 seconds between batches
        console.log(
          `Waiting ${batchDelay / 1000} seconds before processing next batch...`,
        );
        await new Promise((resolve) => setTimeout(resolve, batchDelay));
      }
    }

    if (documentsToProcess.length === 0) {
      console.log(
        'No new documents to process. All documents are already in the vector store.',
      );
    } else {
      console.log(
        `✅ Successfully processed ${documentsToProcess.length} new documents`,
      );
    }
  }

  /**
   * Store multimodal documents with both visual and text embeddings
   */
  async storeMultimodalDocuments(
    documents: MultimodalDocumentChunk[],
  ): Promise<void> {
    const index = this.pinecone.index(this.indexName);
    const batchSize = 3; // Smaller batch size for multimodal processing
    const delayBetweenDocs = 500; // Longer delay due to multiple embeddings

    console.log(
      `Preparing to process ${documents.length} multimodal documents...`,
    );

    // Process documents in batches
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      console.log(
        `Processing multimodal batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(documents.length / batchSize)}`,
      );

      for (let j = 0; j < batch.length; j++) {
        const doc = batch[j];
        const docId = this.generateDocumentId(doc);

        try {
          console.log(
            `  Processing multimodal document ${i + j + 1}/${documents.length}: ${doc.metadata.filename}`,
          );

          // Add delay between document processing
          if (j > 0) {
            console.log(
              `  Waiting ${delayBetweenDocs / 1000} seconds before processing next document...`,
            );
            await new Promise((resolve) =>
              setTimeout(resolve, delayBetweenDocs),
            );
          }

          const vectors: PineconeRecord[] = [];

          // Store visual embedding if available
          if (doc.visualEmbedding) {
            const visualVector: PineconeRecord = {
              id: `${docId}-visual`,
              values: doc.visualEmbedding,
              metadata: {
                content: doc.content,
                source: doc.metadata.source,
                page: doc.metadata.page || '',
                type: doc.metadata.type,
                filename: doc.metadata.filename,
                section: doc.metadata.section || '',
                contentHash: doc.metadata.contentHash || '',
                contentType: doc.contentType,
                embeddingType: 'visual',
                ocrText: doc.ocrText || '',
              },
            };
            vectors.push(visualVector);
            console.log(`    👁️  Added visual embedding vector`);
          }

          // Store text embedding if available
          if (doc.textEmbedding) {
            const textVector: PineconeRecord = {
              id: `${docId}-text`,
              values: doc.textEmbedding,
              metadata: {
                content: doc.ocrText || doc.content,
                source: doc.metadata.source,
                page: doc.metadata.page || '',
                type: doc.metadata.type,
                filename: doc.metadata.filename,
                section: doc.metadata.section || '',
                contentHash: doc.metadata.contentHash || '',
                contentType: doc.contentType,
                embeddingType: 'text',
                ocrText: doc.ocrText || '',
              },
            };
            vectors.push(textVector);
            console.log(`    🔤 Added text embedding vector`);
          }

          // Store the vectors
          if (vectors.length > 0) {
            await index.upsert(vectors);
            console.log(
              `    ✅ Successfully stored ${vectors.length} vectors for document`,
            );
          }
        } catch (error) {
          console.error(
            `  ❌ Error processing multimodal document ${doc.metadata.source}:`,
            error,
          );
          console.log(`  Continuing with next document...`);
        }
      }

      // Add delay between batches
      if (i + batchSize < documents.length) {
        const batchDelay = 2000; // 2 seconds between batches
        console.log(
          `Waiting ${batchDelay / 1000} seconds before processing next batch...`,
        );
        await new Promise((resolve) => setTimeout(resolve, batchDelay));
      }
    }

    console.log(
      `✅ Successfully processed ${documents.length} multimodal documents`,
    );
  }

  /**
   * Search for similar content across both visual and text embeddings
   */
  async searchMultimodal(
    query: string,
    topK: number = 20,
    searchType: 'visual' | 'text' | 'both' = 'both',
  ): Promise<MultimodalSearchResult[]> {
    try {
      const index = this.pinecone.index(this.indexName);
      const results: MultimodalSearchResult[] = [];

      if (searchType === 'text' || searchType === 'both') {
        // Search text embeddings
        const textQueryEmbedding =
          await EmbeddingService.generateSingleEmbedding(query, 'query');

        const textSearchResponse = await index.query({
          vector: textQueryEmbedding,
          topK,
          includeMetadata: true,
          includeValues: false,
          filter: {
            embeddingType: { $eq: 'text' },
          },
        });

        const textResults =
          textSearchResponse.matches?.map((match) => ({
            score: match.score || 0,
            metadata: match.metadata as SearchResult['metadata'],
            contentType:
              (match.metadata?.contentType as
                | 'text'
                | 'image'
                | 'multimodal') || 'text',
            textScore: match.score || 0,
            ocrText: match.metadata?.ocrText as string,
          })) || [];

        results.push(...textResults);
      }

      if (searchType === 'visual' || searchType === 'both') {
        // For visual search, we would need to convert the query to an image embedding
        // For now, we'll skip this or implement it when we have image query support
        console.log('Visual search not yet implemented for text queries');
      }

      // Sort by score and return top results
      return results
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, topK);
    } catch (error) {
      console.error('Error searching multimodal vectors:', error);
      throw error;
    }
  }

  /**
   * Search for visually similar images
   */
  async searchSimilarImages(
    imageEmbedding: number[],
    topK: number = 10,
  ): Promise<MultimodalSearchResult[]> {
    try {
      const index = this.pinecone.index(this.indexName);

      const visualSearchResponse = await index.query({
        vector: imageEmbedding,
        topK,
        includeMetadata: true,
        includeValues: false,
        filter: {
          embeddingType: { $eq: 'visual' },
        },
      });

      return (
        visualSearchResponse.matches?.map((match) => ({
          score: match.score || 0,
          metadata: match.metadata as SearchResult['metadata'],
          contentType:
            (match.metadata?.contentType as 'text' | 'image' | 'multimodal') ||
            'image',
          visualScore: match.score || 0,
          ocrText: match.metadata?.ocrText as string,
        })) || []
      );
    } catch (error) {
      console.error('Error searching for similar images:', error);
      throw error;
    }
  }

  async searchSimilar(
    query: string,
    topK: number = 20,
  ): Promise<SearchResult[]> {
    try {
      const queryEmbedding =
        await EmbeddingService.generateSingleEmbedding(query);
      const index = this.pinecone.index(this.indexName);

      const searchResponse = await index.query({
        vector: queryEmbedding,
        topK,
        includeMetadata: true,
        includeValues: false,
      });

      return (
        searchResponse.matches?.map((match) => ({
          score: match.score || 0,
          metadata: match.metadata as SearchResult['metadata'],
        })) || []
      );
    } catch (error) {
      console.error('Error searching vectors:', error);
      throw error;
    }
  }
}
