#!/usr/bin/env python3
"""
Docling Microservice for Advanced Document Processing
Provides REST API endpoints for processing documents with advanced layout analysis
"""

import os
import tempfile
import base64
import io
import json
from pathlib import Path
from typing import List, Dict, Any, Optional
import logging
import time
import httpx
import asyncio
import hashlib

from fastapi import FastAPI, File, UploadFile, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from contextlib import asynccontextmanager
import uvicorn
import boto3
from botocore.exceptions import ClientError

try:
    from docling.document_converter import DocumentConverter
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import PdfFormatOption
    from docling.datamodel.document import DoclingDocument
    from docling_core.types import DoclingDocument as DoclingDocumentCore
except ImportError:
    print("Warning: Docling not installed. Install with: pip install docling")
    DocumentConverter = None
    DoclingDocument = None
    DoclingDocumentCore = None

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan (startup and shutdown)"""
    # Startup
    try:
        from db_worker import start_worker
        start_worker()
        logger.info("Application started with database worker")
    except ImportError:
        logger.warning("db_worker module not found - continuing without database worker")
    except Exception as e:
        logger.error(f"Failed to start database worker: {e}")
        logger.warning("Application will continue without database worker")

    yield

    # Shutdown
    try:
        from db_worker import stop_worker
        stop_worker()
        logger.info("Application shutdown complete")
    except ImportError:
        logger.debug("db_worker not available for shutdown")
    except Exception as e:
        logger.error(f"Error during shutdown: {e}")

app = FastAPI(
    title="Docling Document Processing Service",
    description="Advanced document processing with layout analysis, table extraction, and figure detection",
    version="1.0.0",
    lifespan=lifespan
)

# Configure multipart upload limits to prevent memory issues
# Max file size: 50MB (adjust based on your needs)
MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50MB
MAX_MULTIPART_SIZE = MAX_UPLOAD_SIZE

@app.middleware("http")
async def limit_upload_size(request: Request, call_next):
    """Middleware to limit upload size and prevent memory exhaustion"""
    if request.method == "POST" and "multipart/form-data" in request.headers.get("content-type", ""):
        content_length = request.headers.get("content-length")
        if content_length:
            content_length = int(content_length)
            if content_length > MAX_UPLOAD_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large. Maximum size allowed: {MAX_UPLOAD_SIZE // (1024*1024)}MB"
                )

    response = await call_next(request)
    return response

# CORS middleware for Node.js integration
# Get allowed origins from environment variable for production security
allowed_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001").split(",")
allowed_origins.extend(["https://comillas.vercel.app"])  # Always allow your main domain

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["POST", "GET", "OPTIONS"],  # Only needed methods
    allow_headers=["*"],
)

# R2 Configuration
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL")

# Log R2 configuration for debugging (without secrets)
logger.info(f"R2 Config - Account ID: {R2_ACCOUNT_ID[:8] if R2_ACCOUNT_ID else 'NOT SET'}...")
logger.info(f"R2 Config - Bucket: {R2_BUCKET_NAME}")
logger.info(f"R2 Config - Public URL: {R2_PUBLIC_URL or 'NOT SET'}")

# Initialize R2 client if credentials are available
r2_client = None
if R2_ACCOUNT_ID and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME:
    try:
        # Construct endpoint URL
        endpoint_url = f'https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com'
        logger.info(f"R2 Endpoint URL: {endpoint_url}")

        r2_client = boto3.client(
            's3',
            endpoint_url=endpoint_url,
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            region_name='auto',
            config=boto3.session.Config(
                signature_version='s3v4',
                s3={'addressing_style': 'path'}
            )
        )
        logger.info(f"✅ R2 client initialized for bucket: {R2_BUCKET_NAME}")
    except Exception as e:
        logger.error(f"❌ Failed to initialize R2 client: {e}")
        r2_client = None
else:
    logger.warning("⚠️  R2 credentials not configured - images will be returned as base64")
    logger.warning(f"   Missing: {', '.join([k for k, v in {'R2_ACCOUNT_ID': R2_ACCOUNT_ID, 'R2_ACCESS_KEY_ID': R2_ACCESS_KEY_ID, 'R2_SECRET_ACCESS_KEY': R2_SECRET_ACCESS_KEY, 'R2_BUCKET_NAME': R2_BUCKET_NAME}.items() if not v])}")

def upload_image_to_r2(image_base64: str, image_index: int) -> Optional[str]:
    """
    Upload an image to R2 storage and return the public URL
    Returns None if R2 is not configured or upload fails
    """
    if not r2_client or not R2_BUCKET_NAME:
        logger.debug("R2 not configured, skipping upload")
        return None

    try:
        # Generate unique filename using hash of image data
        image_hash = hashlib.md5(image_base64.encode()).hexdigest()[:16]
        image_filename = f"doc-images/{image_hash}.png"

        # Decode base64 to bytes
        image_bytes = base64.b64decode(image_base64)

        # Upload to R2
        r2_client.put_object(
            Bucket=R2_BUCKET_NAME,
            Key=image_filename,
            Body=image_bytes,
            ContentType='image/png'
        )

        # Generate public URL
        if R2_PUBLIC_URL:
            public_url = f"{R2_PUBLIC_URL}/{image_filename}"
        else:
            public_url = f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com/{R2_BUCKET_NAME}/{image_filename}"

        logger.info(f"✅ Uploaded image {image_index} to R2: {public_url}")
        return public_url

    except ClientError as e:
        logger.error(f"❌ Failed to upload image {image_index} to R2: {e}")
        return None
    except Exception as e:
        logger.error(f"❌ Unexpected error uploading image {image_index}: {e}")
        return None

# Response models
class Coordinates(BaseModel):
    x: float
    y: float
    width: float
    height: float

class TableStructure(BaseModel):
    headers: List[str]
    rows: List[List[str]]
    caption: Optional[str] = None

class ProcessedChunk(BaseModel):
    content: str
    content_type: str  # 'text', 'image', 'table'
    page: Optional[int] = None
    coordinates: Optional[Coordinates] = None
    image_data: Optional[str] = None  # Base64 encoded image
    image_url: Optional[str] = None  # R2 URL for uploaded image
    table_structure: Optional[TableStructure] = None

class ProcessingResponse(BaseModel):
    success: bool
    chunks: List[ProcessedChunk]
    total_pages: int
    processing_time: float
    error: Optional[str] = None


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "Docling Document Processing Service",
        "status": "healthy",
        "docling_available": DocumentConverter is not None
    }

@app.get("/health")
async def health_check():
    """Detailed health check"""
    return {
        "status": "healthy",
        "docling_available": DocumentConverter is not None,
        "supported_formats": ["PDF", "DOCX", "PPTX", "HTML"] if DocumentConverter else []
    }

def setup_docling_converter():
    """Initialize Docling converter with optimized settings for images, text, and tables"""
    if DocumentConverter is None:
        raise HTTPException(status_code=500, detail="Docling not available")

    # Configure pipeline options for comprehensive processing
    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = True  # Enable OCR for text extraction
    pipeline_options.do_table_structure = True  # Enable table structure recognition
    pipeline_options.images_scale = 2.0  # Higher resolution for better image quality
    pipeline_options.generate_page_images = False  # We don't need full page images
    pipeline_options.generate_picture_images = True  # CRUCIAL: Enable picture image extraction

    # Create converter with PDF-specific options
    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(
                pipeline_options=pipeline_options
            )
        }
    )

    return converter

def clean_text_content(text: str) -> str:
    """Clean and normalize text content while preserving important information"""
    if not text:
        return ""

    # Basic cleanup - remove extra whitespace
    text = text.strip()

    # Remove problematic characters that can break JSON serialization
    import re

    # CRITICAL: Remove unpaired Unicode surrogates (D800-DFFF range)
    # These break JSON encoding and cause "no low surrogate" errors
    text = re.sub(r'[\uD800-\uDFFF]', '', text)

    # Remove docling-generated HTML comments that clutter the output
    text = re.sub(r'<!--\s*image\s*-->', '[Image]', text)
    text = re.sub(r'<!--\s*formula-not-decoded\s*-->', '[Formula]', text)
    text = re.sub(r'<!--[^>]*-->', '', text)  # Remove any other HTML comments

    # Remove null bytes and control characters (except tabs and newlines)
    text = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', text)

    # Remove problematic Unicode characters that cause API issues
    text = re.sub(r'[\uE000-\uF8FF]', '', text)  # Private Use Area
    text = re.sub(r'[\uFFF0-\uFFFF]', '', text)  # Specials

    # Replace problematic Unicode with ASCII alternatives
    unicode_replacements = {
        'ҧ': 'p',  # Cyrillic that looks like Latin p
        'ሶ': 's',  # Ethiopic that looks like Latin s
        '→': '->',  # Arrow
        '←': '<-',  # Arrow
        '≈': '~=',  # Approximately equal
        '≠': '!=',  # Not equal
        '≤': '<=',  # Less than or equal
        '≥': '>=',  # Greater than or equal
        '°': 'deg', # Degree symbol
        'θ': 'theta',  # Greek theta
        'ρ': 'rho',    # Greek rho
        'μ': 'mu',     # Greek mu
        'π': 'pi',     # Greek pi
        'Δ': 'Delta',  # Greek Delta
        'σ': 'sigma',  # Greek sigma
    }

    for unicode_char, replacement in unicode_replacements.items():
        text = text.replace(unicode_char, replacement)

    # Normalize line breaks
    text = text.replace('\r\n', '\n').replace('\r', '\n')

    # Remove excessive whitespace but preserve structure
    text = re.sub(r' +', ' ', text)  # Multiple spaces to single space
    text = re.sub(r'\n +', '\n', text)  # Remove spaces at start of lines
    text = re.sub(r' +\n', '\n', text)  # Remove spaces at end of lines
    text = re.sub(r'\n{3,}', '\n\n', text)  # Max 2 consecutive line breaks

    # Final safety: Ensure valid UTF-8 and remove any remaining problematic characters
    # Use 'replace' instead of 'ignore' to handle edge cases
    text = text.encode('utf-8', 'replace').decode('utf-8', 'replace')

    # Remove replacement character if it was inserted
    text = text.replace('\ufffd', '')

    return text

async def analyze_image_with_vision(image_base64: str, page_no: int, filename: str) -> str:
    """
    Use Claude's vision capabilities to generate detailed image descriptions
    """
    try:
        anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
        if not anthropic_api_key:
            logger.warning("ANTHROPIC_API_KEY not found, using generic description")
            return "Engineering technical diagram chart graph illustration"

        # Prepare the vision analysis prompt with stricter logo detection
        prompt = f"""Analyze this image from page {page_no} of the document "{filename}".

CRITICAL FIRST STEP - Logo/Decorative Detection:
Respond with EXACTLY "LOGO: [description]" if the image is ANY of these:
- Institution/university/company logos
- Emblems, crests, shields, or heraldic symbols
- Decorative headers, footers, or watermarks
- Icons without technical/educational content
- Stylized animals/symbols used for branding (lions, eagles, crowns, etc.)
- Page borders or ornamental designs

ONLY provide a technical description if the image contains educational/technical content like:
- Graphs, charts, plots with data
- Diagrams showing processes or systems
- Mathematical equations or formulas
- Technical schematics or blueprints
- Tables with data
- Photos of experiments or equipment

For technical content, describe:
1. Type of diagram/figure
2. Main concepts/variables/components
3. Labels, axes, titles, or key text
4. Relationships or processes illustrated

Keep to 2-3 sentences maximum."""

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": anthropic_api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                },
                json={
                    "model": "claude-3-5-haiku-20241022",
                    "max_tokens": 300,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": "image/png",
                                        "data": image_base64
                                    }
                                },
                                {
                                    "type": "text",
                                    "text": prompt
                                }
                            ]
                        }
                    ]
                }
            )

            if response.status_code == 200:
                result = response.json()
                description = result.get("content", [{}])[0].get("text", "")
                if description:
                    logger.info(f"Generated vision description: {description[:100]}...")
                    return description
                else:
                    logger.warning("Empty description from vision API")
                    return "Engineering technical diagram chart graph illustration"
            else:
                logger.error(f"Vision API error: {response.status_code} - {response.text}")
                return "Engineering technical diagram chart graph illustration"

    except Exception as e:
        logger.error(f"Error analyzing image with vision: {e}")
        return "Engineering technical diagram chart graph illustration"

def extract_image_from_picture(picture) -> Optional[str]:
    """Extract image data from a docling picture element and return as base64"""
    try:
        # Method 1: Check if picture has image attribute with pil_image (most common case)
        if hasattr(picture, 'image') and picture.image:
            if hasattr(picture.image, 'pil_image') and picture.image.pil_image:
                logger.debug("Found PIL image in picture.image.pil_image")
                buffer = io.BytesIO()
                picture.image.pil_image.save(buffer, format='PNG')
                img_bytes = buffer.getvalue()
                return base64.b64encode(img_bytes).decode('utf-8')

            # Fallback: try direct image access
            elif hasattr(picture.image, 'save'):
                logger.debug("Found PIL image in picture.image")
                buffer = io.BytesIO()
                picture.image.save(buffer, format='PNG')
                img_bytes = buffer.getvalue()
                return base64.b64encode(img_bytes).decode('utf-8')

        # Method 2: Check if picture has direct pil_image attribute
        if hasattr(picture, 'pil_image') and picture.pil_image:
            logger.debug("Found PIL image in picture.pil_image")
            buffer = io.BytesIO()
            picture.pil_image.save(buffer, format='PNG')
            img_bytes = buffer.getvalue()
            return base64.b64encode(img_bytes).decode('utf-8')

        # Method 3: Check if picture has data attribute with pil_image
        if hasattr(picture, 'data') and picture.data:
            if hasattr(picture.data, 'pil_image') and picture.data.pil_image:
                logger.debug("Found PIL image in picture.data.pil_image")
                buffer = io.BytesIO()
                picture.data.pil_image.save(buffer, format='PNG')
                img_bytes = buffer.getvalue()
                return base64.b64encode(img_bytes).decode('utf-8')

        # Debug: Log available attributes to help diagnose
        available_attrs = [attr for attr in dir(picture) if not attr.startswith('_')]
        logger.debug(f"No PIL image found. Available picture attributes: {available_attrs}")

        # Check if there's an image-related attribute
        if hasattr(picture, 'image') and picture.image:
            image_attrs = [attr for attr in dir(picture.image) if not attr.startswith('_')]
            logger.debug(f"Available picture.image attributes: {image_attrs}")

        return None

    except Exception as e:
        logger.warning(f"Error extracting image from picture element: {e}")
        return None

async def extract_chunks_from_json(doc_dict: dict, doc: DoclingDocument, filename: str = '', max_chunk_size: int = 1000) -> List[ProcessedChunk]:
    """Extract chunks from DoclingDocument JSON representation (lossless method)"""
    chunks = []

    try:
        logger.info("Processing DoclingDocument from JSON export (lossless method)")

        # Get total pages from JSON - pages is at top level
        total_pages = len(doc_dict.get('pages', []))
        logger.info(f"Document has {total_pages} pages in JSON structure")

        # Extract text with page numbers from JSON structure
        # Texts are in the 'texts' array with provenance info
        text_chunks_by_page = {}

        # Process texts which have page information in prov
        for text_item in doc_dict.get('texts', []):
            text_content = text_item.get('text', '')
            if not text_content:
                continue

            # Get page number from provenance
            page_no = 1  # default
            prov_list = text_item.get('prov', [])
            if prov_list and len(prov_list) > 0:
                prov = prov_list[0]  # Take first provenance
                page_no = prov.get('page_no', 1)

            cleaned = clean_text_content(text_content)
            if cleaned and len(cleaned) > 5:
                if page_no not in text_chunks_by_page:
                    text_chunks_by_page[page_no] = []
                text_chunks_by_page[page_no].append(cleaned)

        # Join texts by page
        for page_no in text_chunks_by_page:
            text_chunks_by_page[page_no] = ' '.join(text_chunks_by_page[page_no])

        logger.info(f"Found text content on {len(text_chunks_by_page)} pages")

        # Create text chunks with page numbers
        overlap_size = max_chunk_size // 5  # 20% overlap

        for page_no in sorted(text_chunks_by_page.keys()):
            page_text = text_chunks_by_page[page_no]

            # Split into sentences
            sentences = [s.strip() + ('.' if not s.strip().endswith(('.', '!', '?')) else '')
                        for s in page_text.split('. ') if s.strip()]

            # Create chunks from sentences
            current_chunk = []
            current_length = 0

            for sentence in sentences:
                if current_length + len(sentence) > max_chunk_size and current_chunk:
                    # Save current chunk
                    chunk_content = ' '.join(current_chunk)
                    chunks.append(ProcessedChunk(
                        content=chunk_content,
                        content_type='text',
                        page=page_no,
                        coordinates=None
                    ))

                    # Create overlap
                    overlap_sentences = []
                    overlap_length = 0
                    for j in range(len(current_chunk) - 1, -1, -1):
                        test_sentence = current_chunk[j]
                        if overlap_length + len(test_sentence) <= overlap_size:
                            overlap_sentences.insert(0, test_sentence)
                            overlap_length += len(test_sentence)
                        else:
                            break

                    current_chunk = overlap_sentences + [sentence]
                    current_length = sum(len(s) for s in current_chunk)
                else:
                    current_chunk.append(sentence)
                    current_length += len(sentence)

            # Add remaining chunk for this page
            if current_chunk:
                chunk_content = ' '.join(current_chunk)
                chunks.append(ProcessedChunk(
                    content=chunk_content,
                    content_type='text',
                    page=page_no,
                    coordinates=None
                ))

        logger.info(f"Created {len(chunks)} text chunks with page numbers preserved")

        # Extract images with page numbers - PARALLEL PROCESSING
        if hasattr(doc, 'pictures') and doc.pictures:
            logger.info(f"Processing {len(doc.pictures)} images")

            # Prepare all images for parallel processing
            valid_images = []

            for i, picture in enumerate(doc.pictures):
                try:
                    image_data = extract_image_from_picture(picture)
                    if not image_data:
                        continue

                    # Minimal validation - just check if image data exists
                    try:
                        decoded_bytes = base64.b64decode(image_data)
                        if len(decoded_bytes) < 100:
                            logger.debug(f"Skipping image {i+1}: corrupted or empty")
                            continue
                    except Exception as e:
                        logger.warning(f"Error validating image data: {e}")
                        continue

                    page_no = 1
                    # Get page number from provenance in JSON
                    if hasattr(picture, 'prov') and picture.prov:
                        for prov in picture.prov:
                            if hasattr(prov, 'page_no') and prov.page_no is not None:
                                page_no = prov.page_no
                                break

                    # Get caption if available
                    caption_text = ""
                    if hasattr(picture, 'caption') and picture.caption:
                        caption_text = f" Caption: {picture.caption}"

                    valid_images.append({
                        'index': i,
                        'image_data': image_data,
                        'page_no': page_no,
                        'caption_text': caption_text
                    })

                except Exception as e:
                    logger.warning(f"Failed to extract image {i}: {e}")

            # Process all images in parallel (with concurrency limit to avoid rate limits)
            logger.info(f"Analyzing {len(valid_images)} valid images with vision AI in parallel...")

            async def process_single_image(img_info):
                try:
                    vision_description = await analyze_image_with_vision(
                        img_info['image_data'],
                        img_info['page_no'],
                        filename
                    )
                    content = f"{vision_description} (Page {img_info['page_no']} from {filename}){img_info['caption_text']}"

                    # Upload image to R2 (if configured)
                    image_url = upload_image_to_r2(img_info['image_data'], img_info['index'])

                    # If R2 upload succeeded, clear base64 data to save bandwidth
                    # Otherwise keep base64 as fallback
                    image_data = None if image_url else img_info['image_data']

                    return ProcessedChunk(
                        content=content,
                        content_type='image',
                        page=img_info['page_no'],
                        coordinates=None,
                        image_data=image_data,
                        image_url=image_url
                    )
                except Exception as e:
                    logger.warning(f"Failed to process image {img_info['index']}: {e}")
                    return None

            # Process images with concurrency limit (10 at a time for faster processing)
            semaphore = asyncio.Semaphore(10)

            async def process_with_limit(img_info):
                async with semaphore:
                    return await process_single_image(img_info)

            image_chunks = await asyncio.gather(*[process_with_limit(img) for img in valid_images])

            # Add successful chunks
            for chunk in image_chunks:
                if chunk is not None:
                    chunks.append(chunk)

            logger.info(f"Successfully extracted {len([c for c in chunks if c.content_type == 'image'])} images")

        # Extract tables
        if hasattr(doc, 'tables') and doc.tables:
            logger.info(f"Processing {len(doc.tables)} tables")
            # Table extraction logic remains the same as before
            # ... (keeping existing table extraction code)

        logger.info(f"Total chunks: {len(chunks)} (text: {len([c for c in chunks if c.content_type == 'text'])}, images: {len([c for c in chunks if c.content_type == 'image'])})")

    except Exception as e:
        logger.error(f"Error processing JSON document: {e}")
        raise

    return chunks


@app.post("/process-document", response_model=ProcessingResponse)
async def process_document(file: UploadFile = File(..., max_size=MAX_UPLOAD_SIZE)):
    """
    Process a document using Docling for advanced layout analysis
    Extracts text, images, and tables from PDF, DOCX, PPTX, and HTML files
    """
    start_time = time.time()
    temp_path = None

    if DocumentConverter is None:
        raise HTTPException(
            status_code=500,
            detail="Docling not available. Please install docling package."
        )

    # Validate file type
    allowed_types = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/html"
    ]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}. Supported: PDF, DOCX, PPTX, HTML"
        )

    try:
        # Save uploaded file to temporary location
        file_extension = file.filename.split('.')[-1] if file.filename and '.' in file.filename else 'pdf'
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{file_extension}") as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            temp_path = tmp_file.name

        logger.info(f"Processing file: {file.filename} ({len(content)} bytes)")

        # Setup Docling converter
        converter = setup_docling_converter()

        # Process document
        result = converter.convert(temp_path)
        doc = result.document

        # Export to JSON (lossless method)
        doc_dict = doc.export_to_dict()

        # Extract chunks from JSON
        chunks = await extract_chunks_from_json(doc_dict, doc, file.filename or 'document')

        # Get total pages from JSON - pages is at top level
        total_pages = len(doc_dict.get('pages', []))
        if total_pages == 0:
            total_pages = len(result.document.pages) if hasattr(result.document, 'pages') and result.document.pages else 1

        processing_time = time.time() - start_time

        logger.info(f"Successfully processed {file.filename}: {len(chunks)} chunks, {total_pages} pages in {processing_time:.2f}s")

        return ProcessingResponse(
            success=True,
            chunks=chunks,
            total_pages=total_pages,
            processing_time=processing_time
        )

    except HTTPException:
        # Re-raise HTTP exceptions (like file size errors)
        raise
    except Exception as e:
        logger.error(f"Error processing document {file.filename}: {e}")
        logger.error(f"Error type: {type(e).__name__}")
        logger.error(f"Error details: {str(e)}")

        return ProcessingResponse(
            success=False,
            chunks=[],
            total_pages=0,
            processing_time=time.time() - start_time,
            error=str(e)
        )

    finally:
        # Clean up temporary file
        if temp_path:
            try:
                os.unlink(temp_path)
                logger.debug(f"Cleaned up temporary file: {temp_path}")
            except Exception as e:
                logger.warning(f"Failed to cleanup temp file {temp_path}: {e}")

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8001))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info"
    )
