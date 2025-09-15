import { Pinecone } from '@pinecone-database/pinecone';
import type { PineconeRecord, Index } from '@pinecone-database/pinecone';
import type { DocumentChunk, SearchResult, ContentType } from '../types';
import { CohereEmbeddingService } from './cohereEmbeddings';
import crypto from 'node:crypto';

export class VectorStore {
  private pinecone: Pinecone;
  private indexName;

  constructor(indexName = 'v2') {
    if (!process.env.PINECONE_API_KEY) {
      throw new Error('PINECONE_API_KEY is not configured');
    }

    this.pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });
    this.indexName = indexName;
  }

  /**
   * Initialize the vector store, creating the index if it doesn't exist
   * or verifying it has the correct configuration
   */
  async initialize(): Promise<void> {
    try {
      const REQUIRED_DIMENSION = 1536; // cohere embed-v4.0 uses 1536-dimensional embeddings

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
        dimension: REQUIRED_DIMENSION, // cohere embed-v4.0 uses 1536-dimensional embeddings
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
    const base = doc.metadata.contentHash ?? doc.metadata.source;
    const chunkHash = crypto
      .createHash('md5')
      .update(
        doc.content?.slice(0, 256) || // text chunks
          JSON.stringify(
            doc.metadata.coordinates ?? // images / tables
              doc.metadata.section ??
              '',
          ),
      )
      .digest('hex')
      .slice(0, 8); // short & stable
    const idSource = `${base}|${doc.metadata.page || ''}|${doc.metadata.section || ''}|${chunkHash}`;
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
    const delayBetweenDocs = 150; // 150ms delay between document processing

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

          // Generate appropriate embedding based on content type
          let embedding: number[];

          if (doc.metadata.contentType === 'image' && doc.metadata.imageData) {
            embedding = await CohereEmbeddingService.generateImageEmbedding(
              doc.metadata.imageData,
              'search_document',
            );
            console.log(
              `    🖼️ Generated image embedding for ${doc.metadata.filename}`,
            );
          } else {
            // Validate text content before embedding
            if (!doc.content || doc.content.trim().length === 0) {
              console.warn(
                `    ⚠️ Empty content for document ${doc.metadata.filename}, skipping`,
              );
              continue;
            }

            // The CohereEmbeddingService will handle the text cleaning internally
            embedding = await CohereEmbeddingService.generateTextEmbedding(
              doc.content,
              'search_document',
            );
            console.log(
              `    📝 Generated text embedding for ${doc.metadata.filename} (${doc.content.length} chars)`,
            );
          }

          const baseMetadata: Record<string, unknown> = {
            content: doc.content,
            source: doc.metadata.source,
            page: doc.metadata.page ?? '',
            type: doc.metadata.type,
            filename: doc.metadata.filename,
            section: doc.metadata.section ?? '',
            contentHash: doc.metadata.contentHash ?? '',
            contentType: doc.metadata.contentType,
          };

          if (doc.metadata.coordinates) {
            // Pinecone metadata values must be primitive; store coordinates as JSON string
            baseMetadata.coordinates = JSON.stringify(doc.metadata.coordinates);
          }
          if (doc.metadata.imageUrl) {
            baseMetadata.imageUrl = doc.metadata.imageUrl;
          }
          if (doc.metadata.tableStructure) {
            baseMetadata.tableStructure = JSON.stringify(
              doc.metadata.tableStructure,
            );
          }
          if (doc.metadata.originalImagePath) {
            baseMetadata.originalImagePath = doc.metadata.originalImagePath;
          }

          vectors.push({
            id, // Use the consistent document ID
            values: embedding,
            metadata: baseMetadata as PineconeRecord['metadata'],
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

  async searchSimilar(
    query: string,
    topK = 100,
    contentTypeFilter?: ContentType,
  ): Promise<SearchResult[]> {
    try {
      const queryEmbedding = await CohereEmbeddingService.generateTextEmbedding(
        query,
        'search_query',
      );
      const index = this.pinecone.index(this.indexName);

      const searchResponse = await index.query({
        vector: queryEmbedding,
        topK,
        includeMetadata: true,
        includeValues: false,
        filter: contentTypeFilter
          ? { contentType: { $eq: contentTypeFilter } }
          : undefined,
      });

      return (
        searchResponse.matches?.map((match) => ({
          score: match.score || 0,
          metadata: match.metadata as unknown as SearchResult['metadata'],
        })) || []
      );
    } catch (error) {
      console.error('Error searching vectors:', error);
      throw error;
    }
  }

  // Search using an image
  async searchSimilarByImage(
    imageBase64: string,
    topK = 100,
    contentTypeFilter?: ContentType,
  ): Promise<SearchResult[]> {
    try {
      const queryEmbedding =
        await CohereEmbeddingService.generateImageEmbedding(
          imageBase64,
          'search_query',
        );
      const index = this.pinecone.index(this.indexName);

      const searchResponse = await index.query({
        vector: queryEmbedding,
        topK,
        includeMetadata: true,
        includeValues: false,
        filter: contentTypeFilter
          ? { contentType: { $eq: contentTypeFilter } }
          : undefined,
      });

      return (
        searchResponse.matches?.map((match) => ({
          score: match.score || 0,
          metadata: match.metadata as unknown as SearchResult['metadata'],
        })) || []
      );
    } catch (error) {
      console.error('Error searching vectors by image:', error);
      throw error;
    }
  }

  /**
   * Delete all vectors belonging to a specific file
   * @param filename The name of the file to delete (e.g., "document.pdf")
   * @returns Promise<boolean> True if deletion was successful
   */
  async deleteDocumentsByFilename(filename: string): Promise<boolean> {
    try {
      console.log(`🗑️ Deleting all vectors for file: ${filename}`);
      const index = this.pinecone.index(this.indexName);

      // Delete all vectors with matching filename in metadata
      await index.deleteMany({
        filter: { filename: { $eq: filename } },
      });

      console.log(`✅ Successfully deleted all vectors for file: ${filename}`);
      return true;
    } catch (error) {
      console.error(`❌ Error deleting vectors for file ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Get statistics about the stored documents
   * @returns Promise with index statistics including total vector count
   */
  async getIndexStats(): Promise<any> {
    try {
      const index = this.pinecone.index(this.indexName);
      const stats = await index.describeIndexStats();
      return stats;
    } catch (error) {
      console.error('Error getting index stats:', error);
      throw error;
    }
  }

  /**
   * Get all blob URLs associated with a specific filename
   * @param filename The filename to search for
   * @returns Promise<string[]> Array of blob URLs
   */
  async getBlobUrlsForFile(filename: string): Promise<string[]> {
    try {
      console.log(`📋 Retrieving blob URLs for file: ${filename}`);
      const index = this.pinecone.index(this.indexName);

      // Create a dummy embedding to query (we just want metadata, not similarity)
      const dummyEmbedding = new Array(1536).fill(0);

      // Query with high topK and filter by filename to get all chunks for this file
      const queryResponse = await index.query({
        vector: dummyEmbedding,
        topK: 1000, // Get up to 1000 results to find all chunks
        includeMetadata: true,
        includeValues: false,
        filter: { filename: { $eq: filename } },
      });

      // Extract unique blob URLs from the results
      const blobUrlsSet = new Set<string>();

      if (queryResponse.matches) {
        for (const match of queryResponse.matches) {
          if (
            match.metadata?.imageUrl &&
            typeof match.metadata.imageUrl === 'string'
          ) {
            blobUrlsSet.add(match.metadata.imageUrl);
          }
        }
      }

      const blobUrls = Array.from(blobUrlsSet);
      console.log(
        `📋 Found ${blobUrls.length} blob URLs for file: ${filename}`,
      );

      return blobUrls;
    } catch (error) {
      console.error(`Error getting blob URLs for file ${filename}:`, error);
      throw error;
    }
  }

  /**
   * List all unique filenames stored in the vector database
   * Note: This is a workaround since Pinecone doesn't have a direct way to list metadata values
   * We query with a dummy vector and high topK to get samples of stored documents
   * @returns Promise<string[]> Array of unique filenames
   */
  async listStoredFiles(): Promise<string[]> {
    try {
      console.log('📋 Retrieving list of stored files...');
      const index = this.pinecone.index(this.indexName);

      // Create a dummy embedding to query (we just want metadata, not similarity)
      const dummyEmbedding = new Array(1536).fill(0);

      // Query with high topK to get a sample of stored documents
      const queryResponse = await index.query({
        vector: dummyEmbedding,
        topK: 1000, // Get up to 1000 results to find unique filenames
        includeMetadata: true,
        includeValues: false,
      });

      // Extract unique filenames from the results
      const filenamesSet = new Set<string>();

      if (queryResponse.matches) {
        for (const match of queryResponse.matches) {
          if (match.metadata?.filename) {
            filenamesSet.add(match.metadata.filename as string);
          }
        }
      }

      const filenames = Array.from(filenamesSet).sort();
      console.log(`📋 Found ${filenames.length} unique files in the database`);

      return filenames;
    } catch (error) {
      console.error('Error listing stored files:', error);
      throw error;
    }
  }
}
