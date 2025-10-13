"""
Database Worker for Document Processing Jobs
Polls PostgreSQL database for queued jobs and processes them
"""

import os
import logging
import asyncio
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime
from typing import Optional, Dict, Any
import httpx
import tempfile

logger = logging.getLogger(__name__)

class DatabaseWorker:
    """Worker that polls database for document processing jobs"""

    def __init__(self, database_url: str):
        self.database_url = database_url
        self.running = False
        self.poll_interval = 5  # Poll every 5 seconds

    def get_connection(self):
        """Get a database connection"""
        return psycopg2.connect(self.database_url, cursor_factory=RealDictCursor)

    def get_next_job(self) -> Optional[Dict[str, Any]]:
        """Fetch the next queued job from the database"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()

            # Get oldest queued job and mark it as processing atomically
            cursor.execute("""
                UPDATE "DocumentProcessingJob"
                SET status = 'processing',
                    "startedAt" = NOW(),
                    "updatedAt" = NOW(),
                    progress = '0',
                    message = 'Starting document processing...'
                WHERE id = (
                    SELECT id FROM "DocumentProcessingJob"
                    WHERE status = 'queued'
                    ORDER BY "createdAt" ASC
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING *;
            """)

            job = cursor.fetchone()
            conn.commit()
            cursor.close()
            conn.close()

            return dict(job) if job else None

        except Exception as e:
            logger.error(f"Error fetching next job: {e}")
            return None

    def update_job_status(self, job_id: str, status: str, progress: int = 0,
                          message: str = None, error_message: str = None,
                          chunks_count: int = None, total_pages: int = None,
                          processing_time_ms: int = None):
        """Update job status in database"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()

            update_fields = [
                "status = %s",
                "progress = %s",
                '"updatedAt" = NOW()'
            ]
            params = [status, str(progress)]

            if message:
                update_fields.append("message = %s")
                params.append(message)

            if error_message:
                update_fields.append('"errorMessage" = %s')
                params.append(error_message)

            if chunks_count is not None:
                update_fields.append('"chunksCount" = %s')
                params.append(str(chunks_count))

            if total_pages is not None:
                update_fields.append('"totalPages" = %s')
                params.append(str(total_pages))

            if processing_time_ms is not None:
                update_fields.append('"processingTimeMs" = %s')
                params.append(str(processing_time_ms))

            if status == 'completed' or status == 'failed':
                update_fields.append('"completedAt" = NOW()')

            params.append(job_id)

            query = f"""
                UPDATE "DocumentProcessingJob"
                SET {', '.join(update_fields)}
                WHERE id = %s;
            """

            cursor.execute(query, params)
            conn.commit()
            cursor.close()
            conn.close()

            logger.info(f"Updated job {job_id}: {status} ({progress}%)")

        except Exception as e:
            logger.error(f"Error updating job status: {e}")

    async def process_job(self, job: Dict[str, Any]):
        """
        Process a single job entirely in Cloud Run:
        1. Download file from R2
        2. Process with Docling service (locally)
        3. Generate embeddings (locally)
        4. Store in Pinecone (locally)
        No Vercel callbacks - everything happens here!
        """
        job_id = job['id']
        r2_url = job['r2Url']
        filename = job['filename']
        file_type = job['fileType']
        content_hash = job['contentHash']

        temp_path = None
        start_time = datetime.now()

        try:
            logger.info(f"[DB Worker] 🚀 Starting job {job_id}: {filename}")
            logger.info(f"[DB Worker] 📋 Job details: type={file_type}, r2_url={r2_url[:50]}...")

            # Step 1: Download file from R2
            logger.info(f"[DB Worker] ⬇️  Step 1/4: Downloading file from R2...")
            self.update_job_status(job_id, 'processing', 10, 'Downloading file from R2...')

            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.get(r2_url)
                response.raise_for_status()
                file_content = response.content

            logger.info(f"[DB Worker] ✅ Downloaded {len(file_content)} bytes")

            # Save to temporary file
            file_extension = filename.split('.')[-1] if '.' in filename else 'pdf'
            with tempfile.NamedTemporaryFile(delete=False, suffix=f'.{file_extension}') as tmp:
                tmp.write(file_content)
                tmp.flush()
                temp_path = tmp.name

            logger.info(f"[DB Worker] ✅ Saved to temp file: {temp_path}")

            # Step 2: Process with Docling service (local call)
            logger.info(f"[DB Worker] 🔄 Step 2/4: Processing with Docling...")
            self.update_job_status(job_id, 'processing', 30, 'Processing document with Docling...')

            # Import the docling processing function from main.py
            from main import setup_docling_converter, extract_chunks_from_json

            converter = setup_docling_converter()
            result = converter.convert(temp_path)
            doc = result.document
            doc_dict = doc.export_to_dict()

            # Extract chunks with images uploaded to R2
            chunks = await extract_chunks_from_json(doc_dict, doc, filename)
            total_pages = len(doc_dict.get('pages', []))

            logger.info(f"[DB Worker] ✅ Docling extracted {len(chunks)} chunks from {total_pages} pages")

            # Step 3: Generate embeddings and store in Pinecone
            logger.info(f"[DB Worker] 🧠 Step 3/4: Generating embeddings and storing...")
            self.update_job_status(job_id, 'processing', 60, 'Generating embeddings and storing in vector database...')

            # Import and use the vector service
            from vector_service import VectorService

            vector_service = VectorService()
            await vector_service.initialize_index()

            # Convert chunks to the format expected by vector service
            chunks_for_storage = []
            for chunk in chunks:
                chunk_dict = {
                    'content': chunk.content,
                    'content_type': chunk.content_type,
                    'page': chunk.page,
                    'source': temp_path,
                    'filename': filename,
                    'content_hash': content_hash,
                    'type': 'pdf' if file_type == 'application/pdf' else 'image',
                    'pdf_url': r2_url,  # Add the permanent R2 URL for PDF linking
                }

                # Add optional fields
                if chunk.coordinates:
                    chunk_dict['coordinates'] = {
                        'x': chunk.coordinates.x,
                        'y': chunk.coordinates.y,
                        'width': chunk.coordinates.width,
                        'height': chunk.coordinates.height,
                    }
                if chunk.image_data:
                    chunk_dict['image_data'] = chunk.image_data
                if chunk.image_url:
                    chunk_dict['image_url'] = chunk.image_url

                chunks_for_storage.append(chunk_dict)

            # Store all chunks
            stored_count = await vector_service.store_chunks(chunks_for_storage)

            logger.info(f"[DB Worker] ✅ Stored {stored_count} chunks in Pinecone")

            # Calculate processing time
            processing_time_ms = int((datetime.now() - start_time).total_seconds() * 1000)

            # Check if any chunks were actually stored
            if stored_count == 0:
                logger.error(f"[DB Worker] ❌ No chunks were stored for job {job_id}")
                self.update_job_status(
                    job_id,
                    'failed',
                    100,
                    'Processing failed: No chunks could be stored in vector database',
                    error_message='All chunks were either duplicates or failed to embed',
                    chunks_count=0,
                    total_pages=total_pages,
                    processing_time_ms=processing_time_ms
                )
                logger.info(f"[DB Worker] ⚠️ Job {job_id} marked as failed - no chunks stored")
                return

            # Step 4: Mark as completed
            logger.info(f"[DB Worker] ✅ Step 4/4: Finalizing...")
            self.update_job_status(
                job_id,
                'completed',
                100,
                f'Successfully processed and stored {stored_count} chunks',
                chunks_count=stored_count,
                total_pages=total_pages,
                processing_time_ms=processing_time_ms
            )

            logger.info(f"[DB Worker] 🎉 Job {job_id} completed successfully in {processing_time_ms}ms")

        except Exception as e:
            logger.error(f"[DB Worker] ❌ Error processing job {job_id}: {e}")
            logger.error(f"[DB Worker] ❌ Error type: {type(e).__name__}")
            import traceback
            logger.error(f"[DB Worker] ❌ Stack trace:\n{traceback.format_exc()}")

            self.update_job_status(
                job_id,
                'failed',
                0,
                'Processing failed',
                error_message=str(e)
            )
        finally:
            # Clean up temp file
            if temp_path and os.path.exists(temp_path):
                try:
                    logger.info(f"[DB Worker] 🧹 Cleaning up temp file: {temp_path}")
                    os.unlink(temp_path)
                    logger.info(f"[DB Worker] ✅ Temp file cleaned up")
                except Exception as e:
                    logger.warning(f"[DB Worker] ⚠️  Failed to cleanup temp file: {e}")

    async def run(self):
        """Main worker loop - polls for jobs and processes them"""
        self.running = True
        logger.info("Database worker started, polling for jobs...")

        while self.running:
            try:
                # Check for next job
                job = self.get_next_job()

                if job:
                    logger.info(f"Found job: {job['id']}")
                    await self.process_job(job)
                else:
                    # No jobs, wait before polling again
                    await asyncio.sleep(self.poll_interval)

            except Exception as e:
                logger.error(f"Error in worker loop: {e}")
                await asyncio.sleep(self.poll_interval)

    def stop(self):
        """Stop the worker"""
        self.running = False
        logger.info("Database worker stopped")


# Global worker instance
worker: Optional[DatabaseWorker] = None

def start_worker():
    """Start the database worker if DATABASE_URL is configured"""
    global worker

    database_url = os.getenv('DATABASE_URL') or os.getenv('POSTGRES_URL')

    if not database_url:
        logger.warning("DATABASE_URL not configured - worker will not start")
        logger.warning("Jobs will not be processed automatically")
        return

    logger.info("Starting database worker...")
    worker = DatabaseWorker(database_url)
    asyncio.create_task(worker.run())

def stop_worker():
    """Stop the database worker"""
    global worker
    if worker:
        worker.stop()
