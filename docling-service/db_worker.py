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
        """Process a single job - downloads from R2, processes with docling, calls Vercel to store"""
        job_id = job['id']
        r2_url = job['r2Url']
        filename = job['filename']
        file_type = job['fileType']

        import tempfile
        temp_path = None

        try:
            logger.info(f"Processing job {job_id}: {filename}")

            # Update: Downloading file
            self.update_job_status(job_id, 'processing', 10, 'Downloading file from R2...')

            # Download file from R2
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.get(r2_url)
                response.raise_for_status()
                file_content = response.content

            logger.info(f"Downloaded {len(file_content)} bytes for job {job_id}")

            # Update: Processing document with Docling
            self.update_job_status(job_id, 'processing', 30, 'Processing document with Docling and AI vision...')

            # Call local /process-document endpoint
            # Use PORT env variable (defaults to 8080 in Cloud Run, 8001 locally)
            port = os.getenv('PORT', '8001')
            async with httpx.AsyncClient(timeout=600.0) as client:
                files = {'file': (filename, file_content, file_type)}
                response = await client.post(
                    f'http://localhost:{port}/process-document',
                    files=files
                )
                response.raise_for_status()
                result = response.json()

            if not result.get('success'):
                raise Exception(result.get('error', 'Unknown error processing document'))

            chunks = result.get('chunks', [])
            total_pages = result.get('total_pages', 0)

            logger.info(f"Docling processed job {job_id}: {len(chunks)} chunks")

            # Update: Storing in vector database
            self.update_job_status(job_id, 'processing', 90, 'Storing in vector database...')

            # Call Vercel API to store chunks in vector database
            vercel_url = os.getenv('VERCEL_API_URL', 'http://localhost:3000')
            api_key = os.getenv('DOCLING_API_KEY')

            headers = {}
            if api_key:
                headers['x-api-key'] = api_key

            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f'{vercel_url}/api/rag-documents/store-chunks',
                    json={
                        'job_id': job_id,
                        'chunks': chunks,
                        'filename': filename,
                        'content_hash': job['contentHash']
                    },
                    headers=headers
                )
                response.raise_for_status()

            # Mark as completed
            self.update_job_status(
                job_id,
                'completed',
                100,
                f'Successfully processed and stored {len(chunks)} chunks',
                chunks_count=len(chunks),
                total_pages=total_pages,
                processing_time_ms=int(result.get('processing_time', 0) * 1000)
            )

        except Exception as e:
            logger.error(f"Error processing job {job_id}: {e}")
            self.update_job_status(
                job_id,
                'failed',
                0,
                'Processing failed',
                error_message=str(e)
            )

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
