FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies for docling
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    libfontconfig1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables for better container performance
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Copy requirements and main application files explicitly
COPY requirements-copy.txt .
COPY main.py .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements-copy.txt

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Run the application with optimized settings for production
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--timeout-keep-alive", "30", "--limit-concurrency", "10", "--limit-max-requests", "100"]
