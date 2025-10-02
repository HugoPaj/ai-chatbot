#!/bin/bash

# Deploy Docling Service to Google Cloud Run using Artifact Registry
# This script builds and deploys the docling service to Cloud Run with GPU support

set -e  # Exit on any error

# Configuration
PROJECT_ID="ai-chatbot-docling"
SERVICE_NAME="docling-service-gpu"
REGION="europe-west1"
REPOSITORY="docling-repo"
IMAGE_NAME="docling-service"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Docling Service Deployment to Cloud Run ===${NC}"
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Service: $SERVICE_NAME"
echo ""

# Step 1: Set the project
echo -e "${YELLOW}Step 1: Setting GCP project...${NC}"
gcloud config set project $PROJECT_ID

# Step 2: Enable required APIs
echo -e "${YELLOW}Step 2: Enabling required APIs...${NC}"
gcloud services enable \
    artifactregistry.googleapis.com \
    run.googleapis.com \
    cloudbuild.googleapis.com

# Step 3: Create Artifact Registry repository (if it doesn't exist)
echo -e "${YELLOW}Step 3: Creating Artifact Registry repository...${NC}"
gcloud artifacts repositories create $REPOSITORY \
    --repository-format=docker \
    --location=$REGION \
    --description="Docker repository for Docling service" \
    2>/dev/null || echo "Repository already exists"

# Step 4: Configure Docker authentication
echo -e "${YELLOW}Step 4: Configuring Docker authentication...${NC}"
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# Step 5: Build the image using Cloud Build (recommended for Cloud Run)
echo -e "${YELLOW}Step 5: Building Docker image with Cloud Build...${NC}"
IMAGE_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:latest"

gcloud builds submit \
    --tag $IMAGE_URL \
    --timeout=30m \
    --machine-type=e2-highcpu-8 \
    .

# Step 6: Deploy to Cloud Run with GPU
echo -e "${YELLOW}Step 6: Deploying to Cloud Run with GPU support...${NC}"
gcloud run deploy $SERVICE_NAME \
    --image=$IMAGE_URL \
    --region=$REGION \
    --platform=managed \
    --port=8080 \
    --memory=16Gi \
    --cpu=8 \
    --timeout=3000s \
    --concurrency=80 \
    --max-instances=3 \
    --min-instances=0 \
    --allow-unauthenticated \
    --set-env-vars="CORS_ORIGINS=https://comillas.vercel.app,http://localhost:3000" \
    --gpu=1 \
    --gpu-type=nvidia-l4 \
    --cpu-throttling=false \
    --no-cpu-boost \
    --execution-environment=gen2

echo -e "${GREEN}=== Deployment Complete! ===${NC}"
echo ""
echo "Service URL:"
gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)'
echo ""
echo -e "${GREEN}To view logs:${NC}"
echo "gcloud run services logs read $SERVICE_NAME --region=$REGION --limit=50"
