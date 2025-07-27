# Docling Document Processing Service

A FastAPI microservice that provides advanced document processing capabilities using Docling for layout analysis, table extraction, and figure detection.

## Features

- **Advanced PDF Processing**: Layout analysis with coordinate extraction
- **Table Recognition**: Structured table data extraction
- **Figure Detection**: Automatic figure and image identification
- **Multimodal Output**: Text, images, and tables as separate entities
- **RESTful API**: Easy integration with Node.js applications

## Quick Start

### Using Docker (Recommended)

1. Build and start the service:
```bash
docker-compose up --build docling-service
```

2. The service will be available at `http://localhost:8001`

### Manual Setup

1. Install Python 3.11+
2. Install dependencies:
```bash
cd docling-service
pip install -r requirements.txt
```

3. Run the service:
```bash
python main.py
```

## API Endpoints

### Health Check
```
GET /health
```

### Process Document
```
POST /process-document
Content-Type: multipart/form-data

Body: file (PDF, DOCX, PPTX, HTML)
```

**Response:**
```json
{
  "success": true,
  "chunks": [
    {
      "content": "Document text content",
      "content_type": "text|image|table",
      "page": 1,
      "coordinates": {
        "x": 100.0,
        "y": 200.0,
        "width": 300.0,
        "height": 50.0
      },
      "table_structure": {
        "headers": ["Col1", "Col2"],
        "rows": [["Data1", "Data2"]],
        "caption": "Table caption"
      }
    }
  ],
  "total_pages": 10,
  "processing_time": 2.5
}
```

## Integration with Node.js

The Node.js DocumentProcessor automatically detects if this service is running and uses it for enhanced PDF processing. Fallback to basic processing if the service is unavailable.

## Configuration

- **PORT**: Service port (default: 8001)
- **CORS**: Configured for localhost:3000 and localhost:3001

## Monitoring

- Health check endpoint: `/health`
- Docker health checks included
- Comprehensive logging