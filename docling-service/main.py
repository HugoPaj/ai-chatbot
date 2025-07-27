#!/usr/bin/env python3
"""
Docling Microservice for Advanced Document Processing
Provides REST API endpoints for processing PDFs with advanced layout analysis
"""

import os
import tempfile
import base64
import io
import re
from pathlib import Path
from typing import List, Dict, Any, Optional
import logging
from PIL import Image

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

try:
    from docling.document_converter import DocumentConverter
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import PdfFormatOption
except ImportError:
    print("Warning: Docling not installed. Install with: pip install docling")
    DocumentConverter = None

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Docling Document Processing Service",
    description="Advanced document processing with layout analysis, table extraction, and figure detection",
    version="1.0.0"
)

# CORS middleware for Node.js integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],  # Add your Next.js ports
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    """Initialize Docling converter with optimized settings"""
    if DocumentConverter is None:
        raise HTTPException(status_code=500, detail="Docling not available")
    
    # Configure pipeline options for better processing
    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = False  # Disable OCR for faster processing
    pipeline_options.do_table_structure = True  # Enable table structure recognition
    
    # Create converter with PDF-specific options
    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(
                pipeline_options=pipeline_options
            )
        }
    )
    
    return converter

def extract_image_from_element(element, page_no: int) -> Optional[str]:
    """Extract image data from a docling element and return as base64"""
    try:
        # Try to get image data from the element
        image_data = None
        
        # Method 1: Check for direct image data
        if hasattr(element, 'image') and element.image:
            image_data = element.image
        elif hasattr(element, 'data') and element.data:
            image_data = element.data
        elif hasattr(element, 'content') and element.content:
            # Some elements might have image data in content
            if isinstance(element.content, bytes):
                image_data = element.content
        
        if image_data:
            # If we have raw image data, convert to base64
            if isinstance(image_data, bytes):
                return base64.b64encode(image_data).decode('utf-8')
            elif isinstance(image_data, str) and image_data.startswith('data:image'):
                # Already base64 encoded
                return image_data.split(',')[1] if ',' in image_data else image_data
        
        # Method 2: Try to access through docling's image extraction
        if hasattr(element, 'get_image') and callable(element.get_image):
            try:
                img = element.get_image()
                if img:
                    # Convert PIL Image to base64
                    buffer = io.BytesIO()
                    img.save(buffer, format='PNG')
                    img_bytes = buffer.getvalue()
                    return base64.b64encode(img_bytes).decode('utf-8')
            except Exception as e:
                logger.debug(f"Failed to extract image via get_image(): {e}")
        
        # Method 3: Check for image reference/path
        if hasattr(element, 'image_path') and element.image_path:
            # This would require access to the original document images
            logger.debug(f"Found image path reference: {element.image_path}")
        
        logger.debug(f"No extractable image data found for element on page {page_no}")
        return None
        
    except Exception as e:
        logger.warning(f"Error extracting image from element on page {page_no}: {e}")
        return None

def process_element(element_type: str, content: str, page_no: int, coordinates: Optional[Coordinates], max_chunk_size: int, element=None) -> List[ProcessedChunk]:
    """Process a single element and return chunks"""
    chunks = []
    
    # Determine content type based on element label
    content_type = 'text'
    table_structure = None
    image_data = None
    
    if element_type in ['table', 'Table']:
        content_type = 'table'
    elif element_type in ['figure', 'Figure', 'image', 'Image']:
        content_type = 'image'
        # Try to extract actual image data
        if element:
            image_data = extract_image_from_element(element, page_no)
            if image_data:
                content = f"Image extracted from page {page_no}"
                logger.info(f"Successfully extracted image data from page {page_no}")
            else:
                content = f"Figure/Image found on page {page_no}: {content}"
                logger.debug(f"Could not extract image data from page {page_no}, using text description")
        else:
            content = f"Figure/Image found on page {page_no}: {content}"
    
    # Chunk large text content
    if len(content) > max_chunk_size and content_type == 'text':
        # Split into smaller chunks
        words = content.split()
        current_chunk = []
        
        for word in words:
            current_chunk.append(word)
            if len(' '.join(current_chunk)) > max_chunk_size:
                # Save current chunk
                chunk_content = ' '.join(current_chunk[:-1])
                if chunk_content.strip():
                    chunks.append(ProcessedChunk(
                        content=chunk_content,
                        content_type=content_type,
                        page=page_no,
                        coordinates=coordinates,
                        table_structure=table_structure,
                        image_data=image_data
                    ))
                current_chunk = [word]
        
        # Add remaining chunk
        if current_chunk:
            chunk_content = ' '.join(current_chunk)
            if chunk_content.strip():
                chunks.append(ProcessedChunk(
                    content=chunk_content,
                    content_type=content_type,
                    page=page_no,
                    coordinates=coordinates,
                    table_structure=table_structure,
                    image_data=image_data
                ))
    else:
        # Add as single chunk
        if content.strip():
            chunks.append(ProcessedChunk(
                content=content,
                content_type=content_type,
                page=page_no,
                coordinates=coordinates,
                table_structure=table_structure,
                image_data=image_data
            ))
    
    return chunks

def extract_chunks_from_docling_doc(doc, max_chunk_size: int = 1000) -> List[ProcessedChunk]:
    """Extract structured chunks from a Docling document"""
    chunks = []
    
    try:
        # Use docling's export_to_markdown method for reliable text extraction
        logger.info("Trying to extract text using docling's export methods")
        
        # Method 1: Try markdown export
        if hasattr(doc, 'export_to_markdown'):
            try:
                markdown_content = doc.export_to_markdown()
                if markdown_content and markdown_content.strip():
                    # Split into reasonable chunks
                    lines = markdown_content.split('\n')
                    current_chunk = []
                    current_length = 0
                    
                    for line in lines:
                        line = line.strip()
                        if not line:
                            continue
                            
                        # Check if adding this line would exceed chunk size
                        if current_length + len(line) > max_chunk_size and current_chunk:
                            # Save current chunk
                            chunk_content = '\n'.join(current_chunk)
                            processed_chunks = process_element('text', chunk_content, 1, None, max_chunk_size, None)
                            chunks.extend(processed_chunks)
                            current_chunk = []
                            current_length = 0
                        
                        current_chunk.append(line)
                        current_length += len(line) + 1  # +1 for newline
                    
                    # Add remaining chunk
                    if current_chunk:
                        chunk_content = '\n'.join(current_chunk)
                        processed_chunks = process_element('text', chunk_content, 1, None, max_chunk_size, None)
                        chunks.extend(processed_chunks)
                    
                    logger.info(f"Extracted content using markdown export: {len(chunks)} chunks")
                    
            except Exception as e:
                logger.warning(f"Markdown export failed: {e}")
        
        # Method 2: Try iterating through text elements in the document
        if not chunks and hasattr(doc, 'texts') and doc.texts:
            logger.info("Extracting text from doc.texts")
            try:
                for text_element in doc.texts:
                    if hasattr(text_element, 'text') and text_element.text:
                        content = str(text_element.text).strip()
                        if content and len(content) > 3:
                            # Get page number if available
                            page_no = getattr(text_element, 'prov', [{}])[0].get('page', 1) if hasattr(text_element, 'prov') else 1
                            processed_chunks = process_element('text', content, page_no, None, max_chunk_size, text_element)
                            chunks.extend(processed_chunks)
                            
                logger.info(f"Extracted content from texts: {len(chunks)} chunks")
            except Exception as e:
                logger.warning(f"Text extraction from doc.texts failed: {e}")
                
        # Method 3: Try processing document body elements (keep as fallback)
        if not chunks and hasattr(doc, 'body') and doc.body:
            logger.info("Processing document body elements as fallback")
            for element in doc.body:
                try:
                    # Skip the problematic structural elements entirely
                    # Only process if this seems to be actual content
                    element_str = str(element)
                    if element_str.startswith('(') and any(x in element_str for x in ['self_ref', 'parent', 'children', 'content_layer', 'name', 'label']):
                        continue
                        
                    element_type = element.label if hasattr(element, 'label') else 'text'
                    
                    # Try to get meaningful content
                    content = ""
                    if hasattr(element, 'text') and element.text and str(element.text).strip():
                        content = str(element.text).strip()
                    
                    if content and len(content) > 3 and not content.startswith('('):
                        page_no = getattr(element, 'page', None) or 1
                        
                        # Get coordinates if available
                        coordinates = None
                        if hasattr(element, 'bbox') and element.bbox:
                            coordinates = Coordinates(
                                x=element.bbox.l,
                                y=element.bbox.t,
                                width=element.bbox.r - element.bbox.l,
                                height=element.bbox.b - element.bbox.t
                            )
                        
                        processed_chunks = process_element(element_type, content, page_no, coordinates, max_chunk_size, element)
                        chunks.extend(processed_chunks)
                    
                except Exception as e:
                    logger.warning(f"Failed to process element: {e}")
                    continue
                    
            logger.info(f"Extracted content from body elements: {len(chunks)} chunks")
        
        # Additional method: Try images extraction if available
        if hasattr(doc, 'pictures') and doc.pictures:
            logger.info("Processing document images")
            try:
                for picture in doc.pictures:
                    if hasattr(picture, 'image') or hasattr(picture, 'data'):
                        page_no = getattr(picture, 'prov', [{}])[0].get('page', 1) if hasattr(picture, 'prov') else 1
                        processed_chunks = process_element('image', 'Image found in document', page_no, None, max_chunk_size, picture)
                        chunks.extend(processed_chunks)
                logger.info(f"Extracted {len([c for c in chunks if c.content_type == 'image'])} images")
            except Exception as e:
                logger.warning(f"Image extraction failed: {e}")
                    
    except Exception as e:
        logger.error(f"Error processing document: {e}")
        raise
    
    return chunks

@app.post("/process-document", response_model=ProcessingResponse)
async def process_document(file: UploadFile = File(...)):
    """
    Process a document using Docling for advanced layout analysis
    Supports PDF, DOCX, PPTX, and HTML files
    """
    import time
    start_time = time.time()
    
    if DocumentConverter is None:
        raise HTTPException(
            status_code=500, 
            detail="Docling not available. Please install docling package."
        )
    
    # Validate file type
    allowed_types = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}. Supported: PDF, DOCX"
        )
    
    try:
        # Save uploaded file to temporary location
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{file.filename.split('.')[-1]}") as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            temp_path = tmp_file.name
        
        logger.info(f"Processing file: {file.filename} ({len(content)} bytes)")
        
        # Setup Docling converter
        converter = setup_docling_converter()
        
        # Process document
        result = converter.convert(temp_path)
        
        # Extract structured chunks
        chunks = extract_chunks_from_docling_doc(result.document)
        
        # Get total pages
        total_pages = len(result.document.pages) if hasattr(result.document, 'pages') else 1
        
        processing_time = time.time() - start_time
        
        logger.info(f"Successfully processed {file.filename}: {len(chunks)} chunks, {total_pages} pages in {processing_time:.2f}s")
        
        return ProcessingResponse(
            success=True,
            chunks=chunks,
            total_pages=total_pages,
            processing_time=processing_time
        )
        
    except Exception as e:
        logger.error(f"Error processing document: {e}")
        return ProcessingResponse(
            success=False,
            chunks=[],
            total_pages=0,
            processing_time=time.time() - start_time,
            error=str(e)
        )
    
    finally:
        # Clean up temporary file
        try:
            if 'temp_path' in locals():
                os.unlink(temp_path)
        except Exception as e:
            logger.warning(f"Failed to cleanup temp file: {e}")

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8001))
    uvicorn.run(
        "main:app", 
        host="0.0.0.0", 
        port=port, 
        reload=True,
        log_level="info"
    )