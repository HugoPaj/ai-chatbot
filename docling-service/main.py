#!/usr/bin/env python3
"""
Docling Microservice for Advanced Document Processing
Provides REST API endpoints for processing documents with advanced layout analysis
"""

import os
import tempfile
import base64
import io
from pathlib import Path
from typing import List, Dict, Any, Optional
import logging
import time

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

try:
    from docling.document_converter import DocumentConverter
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import PdfFormatOption
    from docling.datamodel.document import DoclingDocument
except ImportError:
    print("Warning: Docling not installed. Install with: pip install docling")
    DocumentConverter = None
    DoclingDocument = None

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
    """Initialize Docling converter with optimized settings for images, text, and tables"""
    if DocumentConverter is None:
        raise HTTPException(status_code=500, detail="Docling not available")
    
    # Configure pipeline options for comprehensive processing
    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = True  # Enable OCR for text extraction
    pipeline_options.do_table_structure = True  # Enable table structure recognition
    pipeline_options.images_scale = 2.0  # Higher resolution for better image quality
    pipeline_options.generate_page_images = False  # We'll extract images from elements
    
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
    
    # Remove docling-generated HTML comments that clutter the output
    text = re.sub(r'<!--\s*image\s*-->', '[Image]', text)
    text = re.sub(r'<!--\s*formula-not-decoded\s*-->', '[Formula]', text)
    text = re.sub(r'<!--[^>]*-->', '', text)  # Remove any other HTML comments
    
    # Remove null bytes and control characters (except tabs and newlines)
    text = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', text)
    
    # Remove problematic Unicode characters that cause API issues
    text = re.sub(r'[\uE000-\uF8FF]', '', text)  # Private Use Area
    text = re.sub(r'[\uF000-\uFFFF]', '', text)  # More private use characters
    
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
    
    # Ensure the text is valid UTF-8 and safe for JSON
    text = text.encode('utf-8', 'ignore').decode('utf-8')
    
    return text

def extract_image_from_picture(picture) -> Optional[str]:
    """Extract image data from a docling picture element and return as base64"""
    try:
        # Check if picture has image attribute (PIL Image)
        if hasattr(picture, 'image') and picture.image:
            # Convert PIL Image to base64
            buffer = io.BytesIO()
            picture.image.save(buffer, format='PNG')
            img_bytes = buffer.getvalue()
            return base64.b64encode(img_bytes).decode('utf-8')
        
        logger.debug("No image data found in picture element")
        return None
        
    except Exception as e:
        logger.warning(f"Error extracting image from picture element: {e}")
        return None

def extract_table_from_element(element) -> Optional[dict]:
    """Extract table structure from a docling table element"""
    try:
        if not hasattr(element, 'data') or not element.data:
            return None
            
        # Get table data - docling provides this in a structured format
        table_data = element.data
        
        # Extract headers and rows
        headers = []
        rows = []
        
        if hasattr(table_data, 'table') and table_data.table:
            table = table_data.table
            if hasattr(table, 'data') and table.data:
                table_matrix = table.data
                if len(table_matrix) > 0:
                    # First row as headers
                    headers = [str(cell) for cell in table_matrix[0]]
                    # Rest as data rows
                    rows = [[str(cell) for cell in row] for row in table_matrix[1:]]
        
        if headers or rows:
            return {
                "headers": headers,
                "rows": rows,
                "caption": getattr(element, 'caption', None) if hasattr(element, 'caption') else None
            }
        
        return None
        
    except Exception as e:
        logger.warning(f"Error extracting table structure: {e}")
        return None

def extract_chunks_from_docling_doc(doc: DoclingDocument, max_chunk_size: int = 1000) -> List[ProcessedChunk]:
    """Extract structured chunks from a Docling document using recommended methods"""
    chunks = []
    
    try:
        logger.info("Processing DoclingDocument for text, images, and tables")
        
        # 1. Extract text content using docling's export_to_markdown method
        try:
            markdown_content = doc.export_to_markdown()
            if markdown_content and markdown_content.strip():
                # Clean and chunk the text
                cleaned_content = clean_text_content(markdown_content)
                if cleaned_content and len(cleaned_content) > 20:
                    # Split text into chunks
                    paragraphs = cleaned_content.split('\n\n')
                    current_chunk = []
                    current_length = 0
                    
                    for paragraph in paragraphs:
                        paragraph = paragraph.strip()
                        if not paragraph:
                            continue
                            
                        # Check if adding this paragraph exceeds chunk size
                        if current_length + len(paragraph) > max_chunk_size and current_chunk:
                            # Save current chunk
                            chunk_content = '\n\n'.join(current_chunk)
                            chunks.append(ProcessedChunk(
                                content=chunk_content,
                                content_type='text',
                                page=1,  # We'll get better page info from elements later
                                coordinates=None
                            ))
                            current_chunk = [paragraph]
                            current_length = len(paragraph)
                        else:
                            current_chunk.append(paragraph)
                            current_length += len(paragraph) + 2  # +2 for \n\n
                    
                    # Add remaining chunk
                    if current_chunk:
                        chunk_content = '\n\n'.join(current_chunk)
                        chunks.append(ProcessedChunk(
                            content=chunk_content,
                            content_type='text',
                            page=1,
                            coordinates=None
                        ))
                    
                    logger.info(f"Extracted {len(chunks)} text chunks from markdown export")
        
        except Exception as e:
            logger.warning(f"Markdown export failed: {e}")
        
        # 2. Extract images from pictures collection
        if hasattr(doc, 'pictures') and doc.pictures:
            logger.info(f"Processing {len(doc.pictures)} images")
            for i, picture in enumerate(doc.pictures):
                try:
                    image_data = extract_image_from_picture(picture)
                    page_no = 1  # Default page
                    
                    # Try to get page number from provenance
                    if hasattr(picture, 'prov') and picture.prov:
                        for prov in picture.prov:
                            if hasattr(prov, 'page') and prov.page is not None:
                                page_no = prov.page + 1  # docling uses 0-based indexing
                                break
                    
                    # Get coordinates if available
                    coordinates = None
                    if hasattr(picture, 'prov') and picture.prov:
                        for prov in picture.prov:
                            if hasattr(prov, 'bbox') and prov.bbox:
                                coordinates = Coordinates(
                                    x=prov.bbox.l,
                                    y=prov.bbox.t,
                                    width=prov.bbox.r - prov.bbox.l,
                                    height=prov.bbox.b - prov.bbox.t
                                )
                                break
                    
                    content = f"Image {i+1} extracted from page {page_no}"
                    if hasattr(picture, 'caption') and picture.caption:
                        content = f"{content}. Caption: {picture.caption}"
                    
                    chunks.append(ProcessedChunk(
                        content=content,
                        content_type='image',
                        page=page_no,
                        coordinates=coordinates,
                        image_data=image_data
                    ))
                    
                except Exception as e:
                    logger.warning(f"Failed to process image {i}: {e}")
            
            logger.info(f"Successfully extracted {len([c for c in chunks if c.content_type == 'image'])} images")
        
        # 3. Extract tables from document body
        if hasattr(doc, 'body') and doc.body:
            table_count = 0
            for element in doc.body:
                try:
                    if hasattr(element, 'label') and element.label == 'table':
                        table_structure = extract_table_from_element(element)
                        if table_structure:
                            table_count += 1
                            
                            # Get page number
                            page_no = 1
                            if hasattr(element, 'prov') and element.prov:
                                for prov in element.prov:
                                    if hasattr(prov, 'page') and prov.page is not None:
                                        page_no = prov.page + 1
                                        break
                            
                            # Get coordinates
                            coordinates = None
                            if hasattr(element, 'prov') and element.prov:
                                for prov in element.prov:
                                    if hasattr(prov, 'bbox') and prov.bbox:
                                        coordinates = Coordinates(
                                            x=prov.bbox.l,
                                            y=prov.bbox.t,
                                            width=prov.bbox.r - prov.bbox.l,
                                            height=prov.bbox.b - prov.bbox.t
                                        )
                                        break
                            
                            # Create table content description
                            content = f"Table {table_count} from page {page_no}"
                            if table_structure.get('caption'):
                                content = f"{content}. Caption: {table_structure['caption']}"
                            
                            # Add headers summary
                            if table_structure.get('headers'):
                                content = f"{content}. Headers: {', '.join(table_structure['headers'])}"
                            
                            chunks.append(ProcessedChunk(
                                content=content,
                                content_type='table',
                                page=page_no,
                                coordinates=coordinates,
                                table_structure=TableStructure(
                                    headers=table_structure.get('headers', []),
                                    rows=table_structure.get('rows', []),
                                    caption=table_structure.get('caption')
                                )
                            ))
                            
                except Exception as e:
                    logger.warning(f"Failed to process table element: {e}")
            
            if table_count > 0:
                logger.info(f"Successfully extracted {table_count} tables")
        
        logger.info(f"Total chunks extracted: {len(chunks)} (text: {len([c for c in chunks if c.content_type == 'text'])}, images: {len([c for c in chunks if c.content_type == 'image'])}, tables: {len([c for c in chunks if c.content_type == 'table'])})")
        
    except Exception as e:
        logger.error(f"Error processing DoclingDocument: {e}")
        raise
    
    return chunks

@app.post("/process-document", response_model=ProcessingResponse)
async def process_document(file: UploadFile = File(...)):
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
        
        # Extract structured chunks using simplified method
        chunks = extract_chunks_from_docling_doc(result.document)
        
        # Get total pages
        total_pages = len(result.document.pages) if hasattr(result.document, 'pages') and result.document.pages else 1
        
        processing_time = time.time() - start_time
        
        logger.info(f"Successfully processed {file.filename}: {len(chunks)} chunks, {total_pages} pages in {processing_time:.2f}s")
        
        return ProcessingResponse(
            success=True,
            chunks=chunks,
            total_pages=total_pages,
            processing_time=processing_time
        )
        
    except Exception as e:
        logger.error(f"Error processing document {file.filename}: {e}")
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