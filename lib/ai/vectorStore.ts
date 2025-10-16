import { Pinecone } from '@pinecone-database/pinecone';
import type { PineconeRecord, Index } from '@pinecone-database/pinecone';
import type { DocumentChunk, SearchResult, ContentType } from '../types';
import { CohereEmbeddingService } from './cohereEmbeddings';
import crypto from 'node:crypto';

export class VectorStore {
  private pinecone: Pinecone;
  private indexName;

  constructor(indexName = 'v4') {
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
   * Now includes chunkType for parent-child chunking
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
    const chunkType = doc.metadata.chunkType || 'legacy';
    const idSource = `${base}|${doc.metadata.page || ''}|${doc.metadata.section || ''}|${chunkType}|${chunkHash}`;
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

          // Parent-child chunking metadata
          if (doc.metadata.chunkType) {
            baseMetadata.chunkType = doc.metadata.chunkType;
          }
          if (doc.metadata.parentChunkId) {
            baseMetadata.parentChunkId = doc.metadata.parentChunkId;
          }
          if (doc.metadata.childChunkIds) {
            baseMetadata.childChunkIds = JSON.stringify(
              doc.metadata.childChunkIds,
            );
          }

          if (doc.metadata.coordinates) {
            baseMetadata.coordinates = JSON.stringify(doc.metadata.coordinates);
          }
          if (doc.metadata.relatedImageUrls) {
            baseMetadata.relatedImageUrls = JSON.stringify(
              doc.metadata.relatedImageUrls,
            );
          }
          if (doc.metadata.tableStructure) {
            baseMetadata.tableStructure = JSON.stringify(
              doc.metadata.tableStructure,
            );
          }
          if (doc.metadata.originalImagePath) {
            baseMetadata.originalImagePath = doc.metadata.originalImagePath;
          }
          if (doc.metadata.pdfUrl) {
            baseMetadata.pdfUrl = doc.metadata.pdfUrl;
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
    useReranking = true,
  ): Promise<SearchResult[]> {
    try {
      const queryEmbedding = await CohereEmbeddingService.generateTextEmbedding(
        query,
        'search_query',
      );
      const index = this.pinecone.index(this.indexName);

      // Over-retrieve if we're going to rerank
      const retrievalTopK = useReranking ? Math.max(topK * 10, 100) : topK;

      const searchResponse = await index.query({
        vector: queryEmbedding,
        topK: retrievalTopK,
        includeMetadata: true,
        includeValues: false,
        filter: contentTypeFilter
          ? { contentType: { $eq: contentTypeFilter } }
          : undefined,
      });

      const initialResults =
        searchResponse.matches?.map((match) => ({
          score: match.score || 0,
          metadata: match.metadata as unknown as SearchResult['metadata'],
        })) || [];

      // If reranking is disabled or we have no results, return as-is
      if (!useReranking || initialResults.length === 0) {
        return initialResults.slice(0, topK);
      }

      // Rerank the results
      const documents = initialResults.map(
        (result) => result.metadata.content || '',
      );
      const rerankedIndices = await CohereEmbeddingService.rerankDocuments(
        query,
        documents,
        topK,
      );

      // Map reranked results back to original format with new scores
      return rerankedIndices.map((reranked) => ({
        score: reranked.relevanceScore,
        metadata: initialResults[reranked.index].metadata,
      }));
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
    useReranking = false, // Image search typically doesn't benefit from text reranking
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

      const results =
        searchResponse.matches?.map((match) => ({
          score: match.score || 0,
          metadata: match.metadata as unknown as SearchResult['metadata'],
        })) || [];

      // Note: Reranking for image queries is typically not useful since
      // the reranker works with text, not visual similarity
      if (useReranking && results.length > 0) {
        console.warn(
          '⚠️ Reranking image search results is not recommended - skipping',
        );
      }

      return results;
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

      // Try the direct filter approach first
      try {
        console.log(`🔄 Attempting direct deletion with filter...`);
        await index.deleteMany({
          filter: { filename: { $eq: filename } },
        });
        console.log(
          `✅ Successfully deleted all vectors for file: ${filename} (direct method)`,
        );
        return true;
      } catch (filterError) {
        console.log(
          `⚠️ Direct filter deletion failed, trying query-then-delete approach...`,
        );
        console.log(`Filter error:`, (filterError as Error).message);
      }

      // Fallback: Query first, then delete by IDs
      // Use a more targeted approach with timeout
      const dummyEmbedding = new Array(1536).fill(0);
      const TIMEOUT_MS = 30000; // 30 second timeout
      const startTime = Date.now();

      console.log(`📋 Searching for vectors with filename: ${filename}`);

      // Try to use filter in query first
      let queryResponse: any;
      try {
        queryResponse = await Promise.race([
          index.query({
            vector: dummyEmbedding,
            topK: 10000,
            includeMetadata: true,
            includeValues: false,
            filter: { filename: { $eq: filename } },
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Query timeout')), TIMEOUT_MS),
          ),
        ]);
      } catch (queryError) {
        console.log(
          `⚠️ Filtered query failed or timed out, trying unfiltered approach...`,
        );

        // Last resort: query without filter and search client-side (with limits)
        try {
          queryResponse = await Promise.race([
            index.query({
              vector: dummyEmbedding,
              topK: 1000, // Reduced to avoid timeout
              includeMetadata: true,
              includeValues: false,
            }),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error('Unfiltered query timeout')),
                10000,
              ),
            ),
          ]);

          // Filter client-side
          if (queryResponse?.matches) {
            queryResponse.matches = queryResponse.matches.filter(
              (match: any) => match.metadata?.filename === filename,
            );
          }
        } catch (unfilteredError) {
          console.error(`❌ All query approaches failed:`, unfilteredError);
          return false;
        }
      }

      if (
        !queryResponse ||
        !queryResponse.matches ||
        queryResponse.matches.length === 0
      ) {
        console.log(`⚠️ No vectors found for file: ${filename}`);
        return true; // Consider it successful if there's nothing to delete
      }

      // Extract vector IDs
      const vectorIds = queryResponse.matches.map((match: any) => match.id);
      console.log(
        `📋 Found ${vectorIds.length} vectors to delete for file: ${filename}`,
      );

      // Delete vectors by ID in smaller batches
      const deleteBatchSize = 50; // Smaller batches to avoid issues
      for (let i = 0; i < vectorIds.length; i += deleteBatchSize) {
        const batch = vectorIds.slice(i, i + deleteBatchSize);
        console.log(
          `🗑️ Deleting batch ${Math.floor(i / deleteBatchSize) + 1}/${Math.ceil(vectorIds.length / deleteBatchSize)} (${batch.length} vectors)`,
        );

        try {
          await Promise.race([
            index.deleteMany(batch),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error('Delete batch timeout')),
                15000,
              ),
            ),
          ]);
        } catch (deleteError) {
          console.error(`❌ Failed to delete batch:`, deleteError);
          // Continue with next batch instead of failing entirely
        }

        // Small delay between delete batches
        if (i + deleteBatchSize < vectorIds.length) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      console.log(`✅ Completed deletion process for file: ${filename}`);
      return true;
    } catch (error) {
      console.error(`❌ Error deleting vectors for file ${filename}:`, error);
      return false;
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
   * Get all R2 URLs associated with a specific filename
   * @param filename The filename to search for
   * @returns Promise<string[]> Array of R2 URLs
   */
  async getBlobUrlsForFile(filename: string): Promise<string[]> {
    try {
      console.log(`📋 Retrieving R2 URLs for file: ${filename}`);
      const index = this.pinecone.index(this.indexName);

      // Create a dummy embedding to query (we just want metadata, not similarity)
      const dummyEmbedding = new Array(1536).fill(0);

      // Try filtered query first, fallback to unfiltered if it fails
      let queryResponse: any;
      try {
        queryResponse = await Promise.race([
          index.query({
            vector: dummyEmbedding,
            topK: 1000, // Get up to 1000 results to find all chunks
            includeMetadata: true,
            includeValues: false,
            filter: { filename: { $eq: filename } },
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Query timeout')), 15000),
          ),
        ]);
      } catch (error) {
        console.log(
          `⚠️ Filtered query failed, trying unfiltered approach for R2 URLs...`,
        );
        // Fallback: query without filter and filter client-side
        queryResponse = await Promise.race([
          index.query({
            vector: dummyEmbedding,
            topK: 1000,
            includeMetadata: true,
            includeValues: false,
          }),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('Unfiltered query timeout')),
              10000,
            ),
          ),
        ]);

        // Filter client-side
        if (queryResponse?.matches) {
          queryResponse.matches = queryResponse.matches.filter(
            (match: any) => match.metadata?.filename === filename,
          );
        }
      }

      // Extract unique R2 URLs from the results
      const r2UrlsSet = new Set<string>();

      if (queryResponse.matches) {
        for (const match of queryResponse.matches) {
          if (
            match.metadata?.relatedImageUrls &&
            typeof match.metadata.relatedImageUrls === 'string'
          ) {
            try {
              const urls = JSON.parse(
                match.metadata.relatedImageUrls,
              ) as string[];
              urls.forEach((url) => r2UrlsSet.add(url));
            } catch (error) {
              console.warn(`Failed to parse relatedImageUrls:`, error);
            }
          }
        }
      }

      const r2Urls = Array.from(r2UrlsSet);
      console.log(`📋 Found ${r2Urls.length} R2 URLs for file: ${filename}`);

      return r2Urls;
    } catch (error) {
      console.error(`Error getting R2 URLs for file ${filename}:`, error);
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

  /**
   * Check if a document with the given content hash already exists in the database
   * @param contentHash - The SHA-256 hash of the document content
   * @returns Promise<{ exists: boolean; filename?: string }> - Whether the document exists and its filename if found
   */
  async checkDuplicateDocument(
    contentHash: string,
  ): Promise<{ exists: boolean; filename?: string }> {
    try {
      console.log(`🔍 Checking for duplicate document with hash: ${contentHash.substring(0, 16)}...`);
      const index = this.pinecone.index(this.indexName);

      // Create a dummy embedding to query
      const dummyEmbedding = new Array(1536).fill(0);

      // Query with filter for the specific content hash
      const queryResponse = await index.query({
        vector: dummyEmbedding,
        topK: 1,
        includeMetadata: true,
        includeValues: false,
        filter: {
          contentHash: { $eq: contentHash },
        },
      });

      if (queryResponse.matches && queryResponse.matches.length > 0) {
        const filename = queryResponse.matches[0].metadata?.filename as string;
        console.log(`✅ Found existing document with hash ${contentHash.substring(0, 16)}...: ${filename}`);
        return { exists: true, filename };
      }

      console.log(`✅ No duplicate found for hash ${contentHash.substring(0, 16)}...`);
      return { exists: false };
    } catch (error) {
      console.error('Error checking for duplicate document:', error);
      throw error;
    }
  }

  /**
   * Retrieve parent chunks by their parent IDs
   * Used in specific query path to get full context after retrieving child chunks
   * @param parentIds - Array of parent chunk IDs to retrieve
   * @returns Promise<SearchResult[]> - Array of parent chunks
   */
  async getParentChunksByIds(parentIds: string[]): Promise<SearchResult[]> {
    try {
      if (parentIds.length === 0) {
        return [];
      }

      console.log(
        `[VectorStore] Retrieving ${parentIds.length} parent chunks...`,
      );
      const index = this.pinecone.index(this.indexName);

      // Create a dummy embedding for querying
      const dummyEmbedding = new Array(1536).fill(0);

      // Query for parent chunks
      // Note: Pinecone doesn't support $in filter, so we need to query multiple times
      // or use a different approach
      const allParents: SearchResult[] = [];

      // Batch queries to avoid overwhelming the API
      const batchSize = 10;
      for (let i = 0; i < parentIds.length; i += batchSize) {
        const batch = parentIds.slice(i, i + batchSize);

        // Query for each parent ID (not ideal, but Pinecone limitation)
        const batchResults = await Promise.all(
          batch.map(async (parentId) => {
            try {
              const queryResponse = await index.query({
                vector: dummyEmbedding,
                topK: 100,
                includeMetadata: true,
                includeValues: false,
                filter: {
                  chunkType: { $eq: 'parent' },
                },
              });

              // Filter client-side for the specific parent ID
              const match = queryResponse.matches?.find((m) => {
                const childIds =
                  typeof m.metadata?.childChunkIds === 'string'
                    ? JSON.parse(m.metadata.childChunkIds as string)
                    : m.metadata?.childChunkIds;
                // Check if this parent contains the child we're looking for
                return (
                  childIds &&
                  Array.isArray(childIds) &&
                  childIds.includes(parentId)
                );
              });

              if (match) {
                return {
                  score: 1.0, // Parent chunks are retrieved for context, not ranked
                  metadata: match.metadata as unknown as SearchResult['metadata'],
                };
              }
              return null;
            } catch (error) {
              console.error(
                `[VectorStore] Error retrieving parent ${parentId}:`,
                error,
              );
              return null;
            }
          }),
        );

        allParents.push(
          ...(batchResults.filter((r) => r !== null) as SearchResult[]),
        );
      }

      console.log(
        `[VectorStore] Retrieved ${allParents.length} parent chunks`,
      );
      return allParents;
    } catch (error) {
      console.error('[VectorStore] Error retrieving parent chunks:', error);
      return [];
    }
  }
}
