# Docling Document Processing Service

A FastAPI microservice that provides advanced document processing capabilities using Docling for layout analysis, table extraction, and figure detection.

## Features

- **Advanced PDF Processing**: Layout analysis with coordinate extraction
- **AI-Powered Image Analysis**: Uses Claude Vision to generate detailed, specific descriptions of diagrams, charts, and figures
- **Table Recognition**: Structured table data extraction
- **Figure Detection**: Automatic figure and image identification
- **Multimodal Output**: Text, images, and tables as separate entities
- **RESTful API**: Easy integration with Node.js applications

## Quick Start

### Local Development with Docker

1. Build and start the service:

```bash
docker-compose up --build docling-service
```

2. The service will be available at `http://localhost:8001`

### Manual Setup (Local Development)

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

### Deploy to Google Cloud Run (Production)

**Prerequisites:**

- Google Cloud SDK installed and authenticated
- Project ID: `ai-chatbot-docling`
- Billing enabled on your GCP project
- Required APIs will be enabled automatically by the script

**Deployment Steps:**

1. Navigate to the docling-service directory:

```bash
cd docling-service
```

2. Make the deployment script executable:

```bash
chmod +x deploy-to-gcr.sh
```

3. Run the deployment script:

```bash
./deploy-to-gcr.sh
```

The script will:

- Enable required Google Cloud APIs (Artifact Registry, Cloud Run, Cloud Build)
- Create an Artifact Registry repository
- Build the Docker image using Cloud Build (optimized for Cloud Run)
- Deploy to Cloud Run with GPU support (NVIDIA L4)
- Configure environment variables and resource limits

**Manual Deployment (Alternative):**

If you prefer to deploy manually:

```bash
# Set your project
gcloud config set project ai-chatbot-docling

# Build with Cloud Build
gcloud builds submit --tag europe-west1-docker.pkg.dev/ai-chatbot-docling/docling-repo/docling-service:latest

# Deploy to Cloud Run
gcloud run deploy docling-service-gpu \
  --image=europe-west1-docker.pkg.dev/ai-chatbot-docling/docling-repo/docling-service:latest \
  --region=europe-west1 \
  --port=8080 \
  --memory=16Gi \
  --cpu=8 \
  --timeout=3000s \
  --gpu=1 \
  --gpu-type=nvidia-l4 \
  --allow-unauthenticated \
  --set-env-vars="CORS_ORIGINS=https://comillas.vercel.app,ANTHROPIC_API_KEY=your-key-here"
```

**Important Notes:**

- The deployment uses Google Artifact Registry instead of Docker Hub for better Cloud Run compatibility
- GPU instances (NVIDIA L4) have limited availability - deployment may take longer
- First deployment will take 20-30 minutes as it builds all dependencies
- Subsequent deployments will be faster due to layer caching

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

### Environment Variables

- **PORT**: Service port (default: 8001)
- **ANTHROPIC_API_KEY**: Required for AI-powered image analysis. If not set, will use generic descriptions
- **CORS_ORIGINS**: Allowed CORS origins (default: localhost:3000,localhost:3001)

### Setting up Image Analysis

To enable detailed image descriptions, add your Anthropic API key to the docling service environment:

```bash
# In your .env file or docker-compose.yml
ANTHROPIC_API_KEY=your_api_key_here
```

Without this key, images will get generic descriptions like "Engineering technical diagram chart graph illustration"

## Monitoring

- Health check endpoint: `/health`
- Docker health checks included
- Comprehensive logging
