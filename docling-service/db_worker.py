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
        """Process a single job - downloads from R2, saves locally, triggers document processor via API"""
        job_id = job['id']
        r2_url = job['r2Url']
        filename = job['filename']
        file_type = job['fileType']

        import tempfile
        temp_path = None

        try:
            logger.info(f"[DB Worker] 🚀 Starting job {job_id}: {filename}")
            logger.info(f"[DB Worker] 📋 Job details: type={file_type}, r2_url={r2_url[:50]}...")

            # Update: Downloading file
            logger.info(f"[DB Worker] ⬇️  Updating status to 'processing' (10%)")
            self.update_job_status(job_id, 'processing', 10, 'Downloading file from R2...')

            # Download file from R2
            logger.info(f"[DB Worker] 🌐 Downloading file from R2: {r2_url}")
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.get(r2_url)
                response.raise_for_status()
                file_content = response.content

            logger.info(f"[DB Worker] ✅ Downloaded {len(file_content)} bytes for job {job_id}")

            # Save to temporary file
            file_extension = filename.split('.')[-1] if '.' in filename else 'pdf'
            logger.info(f"[DB Worker] 💾 Saving to temporary file with extension: {file_extension}")
            with tempfile.NamedTemporaryFile(delete=False, suffix=f'.{file_extension}') as tmp:
                tmp.write(file_content)
                tmp.flush()
                temp_path = tmp.name

            logger.info(f"[DB Worker] ✅ Saved file to temporary path: {temp_path}")

            # Update: Processing document with full pipeline
            logger.info(f"[DB Worker] 🔄 Updating status to 'processing' (30%)")
            self.update_job_status(job_id, 'processing', 30, 'Processing document with Docling, embedding, and storing...')
            logger.info(f"[DB Worker] ✅ Status updated to 30%")

            # Call Vercel API to process document using the full document processor flow
            # This will use Docling service internally, then embed and store in vector DB
            logger.info(f"[DB Worker] 🔧 Getting environment variables...")
            vercel_url = os.getenv('VERCEL_API_URL', 'http://localhost:3000')
            logger.info(f"[DB Worker] ✅ Got VERCEL_API_URL")
            api_key = os.getenv('DOCLING_API_KEY')
            logger.info(f"[DB Worker] ✅ Got DOCLING_API_KEY")

            logger.info(f"[DB Worker] 🔗 Vercel API URL: {vercel_url}")
            logger.info(f"[DB Worker] 🔑 API key configured: {bool(api_key)}")

            headers = {}
            if api_key:
                headers['x-api-key'] = api_key

            # Call a new endpoint that handles the full flow
            endpoint = f'{vercel_url}/api/rag-documents/process-and-embed'
            logger.info(f"[DB Worker] 📤 Calling process-and-embed endpoint: {endpoint}")

            logger.info(f"[DB Worker] 🔧 Creating HTTP client with 600s timeout...")
            async with httpx.AsyncClient(timeout=600.0) as client:
                logger.info(f"[DB Worker] ✅ HTTP client created")

                # Send file to process-and-embed endpoint
                logger.info(f"[DB Worker] 📦 Preparing multipart request...")
                logger.info(f"[DB Worker] 📂 Opening file: {temp_path}")
                with open(temp_path, 'rb') as f:
                    logger.info(f"[DB Worker] ✅ File opened successfully")
                    files = {'file': (filename, f, file_type)}
                    data = {
                        'job_id': job_id,
                        'content_hash': job['contentHash'],
                        'r2_url': r2_url
                    }
                    logger.info(f"[DB Worker] 📋 Request data prepared: job_id={job_id}, content_hash={job['contentHash'][:8]}...")
                    logger.info(f"[DB Worker] 🚀 About to send POST request to {endpoint}...")
                    logger.info(f"[DB Worker] 🔑 Headers: {list(headers.keys())}")

                    try:
                        response = await client.post(
                            endpoint,
                            files=files,
                            data=data,
                            headers=headers
                        )
                        logger.info(f"[DB Worker] 📥 POST request completed!")
                    except Exception as post_error:
                        logger.error(f"[DB Worker] ❌ POST request failed: {post_error}")
                        logger.error(f"[DB Worker] ❌ Error type: {type(post_error).__name__}")
                        raise

                    logger.info(f"[DB Worker] 📥 Received response: status={response.status_code}")

                    if response.status_code != 200:
                        logger.error(f"[DB Worker] ❌ API returned non-200 status: {response.status_code}")
                        logger.error(f"[DB Worker] ❌ Response body: {response.text[:500]}")

                    response.raise_for_status()
                    result = response.json()
                    logger.info(f"[DB Worker] ✅ Response parsed successfully: {result}")

            if not result.get('success'):
                error_msg = result.get('error', 'Unknown error processing document')
                logger.error(f"[DB Worker] ❌ Processing failed: {error_msg}")
                raise Exception(error_msg)

            chunks_count = result.get('chunks_stored', 0)
            total_pages = result.get('total_pages', 0)

            logger.info(f"[DB Worker] 🎉 Document processor completed job {job_id}")
            logger.info(f"[DB Worker] 📊 Stats: {chunks_count} chunks stored, {total_pages} pages")

            # Mark as completed
            logger.info(f"[DB Worker] ✅ Marking job as completed (100%)")
            self.update_job_status(
                job_id,
                'completed',
                100,
                f'Successfully processed and stored {chunks_count} chunks',
                chunks_count=chunks_count,
                total_pages=total_pages,
                processing_time_ms=result.get('processing_time_ms', 0)
            )

            logger.info(f"[DB Worker] 🏁 Job {job_id} completed successfully")

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
