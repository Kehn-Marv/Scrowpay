# Dockerfile for ScrowPay AI Risk Engine
# Python 3.11-slim base image for lightweight deployment

FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies (if needed for scikit-learn)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY app.py .
COPY train_model.py .
COPY generate_synthetic_data.py .

# Create models directory (will be populated at runtime if needed)
RUN mkdir -p models

# Note: Pre-trained models and synthetic data are mounted via docker-compose volumes
# They don't need to be copied into the image

# Expose port 5000 for Flask app
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:5000/health', timeout=3)" || exit 1

# Run training script on startup if models don't exist, then start Flask app
CMD if [ ! -f "models/isolation_forest_model.pkl" ]; then \
        echo "Models not found. Training model..."; \
        python train_model.py; \
    fi && \
    echo "Starting Flask API server..." && \
    python app.py
