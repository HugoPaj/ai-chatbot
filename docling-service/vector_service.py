"""
Vector Storage Service for Document Embeddings
Handles embedding generation and storage in Pinecone
"""

import os
import logging
import hashlib
import json
from typing import List, Dict, Any, Optional
import cohere
from pinecone import Pinecone, ServerlessSpec
import base64

logger = logging.getLogger(__name__)

class VectorService:
    """Service for generating embeddings and storing in vector database"""

    def __init__(self):
        # Initialize Cohere
        cohere_api_key = os.getenv('COHERE_API_KEY') or os.getenv('CO_API_KEY')
        if not cohere_api_key:
            raise ValueError('COHERE_API_KEY or CO_API_KEY is required')

        self.cohere_client = cohere.Client(cohere_api_key)

        # Initialize Pinecone
        pinecone_api_key = os.getenv('PINECONE_API_KEY')
        if not pinecone_api_key:
            raise ValueError('PINECONE_API_KEY is required')

        self.pinecone_client = Pinecone(api_key=pinecone_api_key)
        self.index_name = 'v4'
        self.dimension = 1536  # Cohere embed-v4.0 dimension

        logger.info("✅ Vector service initialized")

    async def initialize_index(self):
        """Initialize Pinecone index if it doesn't exist"""
        try:
            # Check if index exists
            indexes = self.pinecone_client.list_indexes()
            index_names = [idx.name for idx in indexes.indexes] if indexes.indexes else []

            if self.index_name not in index_names:
                logger.info(f"Creating Pinecone index '{self.index_name}'...")
                self.pinecone_client.create_index(
                    name=self.index_name,
                    dimension=self.dimension,
                    metric='cosine',
                    spec=ServerlessSpec(
                        cloud='aws',
                        region='us-east-1'
                    )
                )
                logger.info(f"✅ Index '{self.index_name}' created")
                # Wait for index to be ready
                import time
                time.sleep(10)
            else:
                logger.info(f"✅ Index '{self.index_name}' already exists")

        except Exception as e:
            logger.error(f"❌ Error initializing index: {e}")
            raise

    def generate_text_embedding(self, text: str) -> List[float]:
        """Generate embedding for text content"""
        try:
            # Clean the text
            cleaned_text = text.strip()
            if not cleaned_text:
                raise ValueError("Empty text provided for embedding")

            # Generate embedding using Cohere embed-v4.0 (1536 dimensions)
            # Must match the model used in TypeScript: lib/ai/cohereEmbeddings.ts
            response = self.cohere_client.embed(
                texts=[cleaned_text],
                model='embed-v4.0',
                input_type='search_document',
                embedding_types=['float']
            )

            embedding = response.embeddings.float[0]
            logger.debug(f"Generated text embedding: {len(embedding)} dimensions")
            return embedding

        except Exception as e:
            logger.error(f"❌ Error generating text embedding: {e}")
            raise

    def generate_image_embedding(self, image_base64: str) -> List[float]:
        """Generate embedding for image content"""
        try:
            # Validate base64 image
            if not image_base64:
                raise ValueError("Empty image data provided")

            # Ensure proper data URL format for Cohere
            image_url = image_base64 if image_base64.startswith('data:') else f'data:image/png;base64,{image_base64}'

            # Generate embedding using Cohere embed-v4.0 (1536 dimensions)
            # Must match the model used in TypeScript: lib/ai/cohereEmbeddings.ts
            response = self.cohere_client.embed(
                images=[image_url],
                model='embed-v4.0',
                input_type='search_document',
                embedding_types=['float']
            )

            embedding = response.embeddings.float[0]
            logger.debug(f"Generated image embedding: {len(embedding)} dimensions")
            return embedding

        except Exception as e:
            logger.error(f"❌ Error generating image embedding: {e}")
            raise

    def generate_document_id(self, content: str, metadata: Dict[str, Any]) -> str:
        """Generate a consistent document ID based on content and metadata"""
        content_hash = metadata.get('contentHash', metadata.get('source', ''))
        chunk_hash = hashlib.md5(
            content[:256].encode('utf-8') if content else
            json.dumps(metadata.get('coordinates', {})).encode('utf-8')
        ).hexdigest()[:8]

        id_source = f"{content_hash}|{metadata.get('page', '')}|{metadata.get('section', '')}|{chunk_hash}"
        return hashlib.md5(id_source.encode('utf-8')).hexdigest()

    async def store_chunks(self, chunks: List[Dict[str, Any]]) -> int:
        """
        Store document chunks in Pinecone
        Returns the number of chunks stored
        """
        try:
            await self.initialize_index()
            index = self.pinecone_client.Index(self.index_name)

            stored_count = 0

            for i, chunk in enumerate(chunks):
                try:
                    logger.info(f"Processing chunk {i+1}/{len(chunks)}: {chunk.get('content_type', 'unknown')}")

                    # Generate embedding based on content type
                    if chunk['content_type'] == 'image' and chunk.get('image_data'):
                        # For images, use image embedding
                        embedding = self.generate_image_embedding(chunk['image_data'])
                    else:
                        # For text and tables, use text embedding
                        if not chunk.get('content') or not chunk['content'].strip():
                            logger.warning(f"Skipping chunk {i+1}: empty content")
                            continue
                        embedding = self.generate_text_embedding(chunk['content'])

                    # Generate document ID
                    metadata = {
                        'source': chunk.get('source', ''),
                        'page': chunk.get('page', 1),
                        'filename': chunk.get('filename', ''),
                        'contentHash': chunk.get('content_hash', ''),
                        'contentType': chunk['content_type'],
                        'section': chunk.get('section', ''),
                    }

                    doc_id = self.generate_document_id(chunk.get('content', ''), metadata)

                    # Check if document already exists
                    try:
                        fetch_result = index.fetch([doc_id])
                        if doc_id in fetch_result.vectors:
                            logger.info(f"Chunk {i+1} already exists, skipping")
                            continue
                    except Exception:
                        pass  # Document doesn't exist, continue with upsert

                    # Prepare metadata for Pinecone
                    pinecone_metadata = {
                        'content': chunk.get('content', '')[:40000],  # Pinecone metadata size limit
                        'source': metadata['source'],
                        'page': str(metadata['page']),
                        'type': chunk.get('type', 'pdf'),
                        'filename': metadata['filename'],
                        'contentHash': metadata['contentHash'],
                        'contentType': metadata['contentType'],
                    }

                    # Add optional fields
                    if chunk.get('coordinates'):
                        pinecone_metadata['coordinates'] = json.dumps(chunk['coordinates'])
                    if chunk.get('image_url'):
                        pinecone_metadata['relatedImageUrls'] = json.dumps([chunk['image_url']])
                    elif chunk.get('related_image_urls'):
                        pinecone_metadata['relatedImageUrls'] = json.dumps(chunk['related_image_urls'])

                    # Upsert to Pinecone
                    index.upsert(
                        vectors=[{
                            'id': doc_id,
                            'values': embedding,
                            'metadata': pinecone_metadata
                        }]
                    )

                    stored_count += 1
                    logger.info(f"✅ Stored chunk {i+1}/{len(chunks)}")

                    # Small delay to avoid rate limits
                    if i < len(chunks) - 1:
                        import time
                        time.sleep(0.15)

                except Exception as e:
                    logger.error(f"❌ Error storing chunk {i+1}: {e}")
                    continue

            logger.info(f"✅ Successfully stored {stored_count}/{len(chunks)} chunks")
            return stored_count

        except Exception as e:
            logger.error(f"❌ Error in store_chunks: {e}")
            raise
