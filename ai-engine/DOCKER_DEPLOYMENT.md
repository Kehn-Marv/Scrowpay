# Docker Deployment Guide - ScrowPay AI Risk Engine

This guide explains how to build and deploy the AI Risk Engine using Docker.

## Prerequisites

- Docker installed (version 20.10 or higher)
- Docker Compose installed (version 1.29 or higher)
- At least 1GB of free disk space
- Port 5000 available on your host machine

## Quick Start

### Option 1: Using Docker Compose (Recommended)

```bash
# Build and start the container
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the container
docker-compose down
```

### Option 2: Using Docker CLI

```bash
# Build the image
docker build -t scrowpay-ai-engine:latest .

# Run the container
docker run -d \
  --name scrowpay-ai-engine \
  -p 5000:5000 \
  --restart unless-stopped \
  scrowpay-ai-engine:latest

# View logs
docker logs -f scrowpay-ai-engine

# Stop the container
docker stop scrowpay-ai-engine
docker rm scrowpay-ai-engine
```

## Container Behavior

### Startup Process

1. **Model Check**: Container checks if trained models exist in `/app/models/`
2. **Auto-Training**: If models don't exist, automatically runs `train_model.py`
3. **API Server**: Starts Flask API server on port 5000

### Expected Startup Time

- **With pre-trained models**: ~5-10 seconds
- **Without models (auto-training)**: ~30-60 seconds

### Health Check

The container includes a health check that runs every 30 seconds:
- Endpoint: `GET http://localhost:5000/health`
- Timeout: 5 seconds
- Retries: 3 attempts

## Pre-Training Models (Optional)

To speed up container startup, you can pre-train models before building:

```bash
# Generate synthetic data
python generate_synthetic_data.py

# Train model
python train_model.py

# Build Docker image (models will be copied into container)
docker build -t scrowpay-ai-engine:latest .
```

## Volume Mounting

### Persist Models Across Container Restarts

```bash
docker run -d \
  --name scrowpay-ai-engine \
  -p 5000:5000 \
  -v $(pwd)/models:/app/models \
  scrowpay-ai-engine:latest
```

This mounts the local `models/` directory into the container, so trained models persist even if the container is removed.

### Use Custom Synthetic Data

```bash
docker run -d \
  --name scrowpay-ai-engine \
  -p 5000:5000 \
  -v $(pwd)/synthetic_transactions.csv:/app/synthetic_transactions.csv \
  scrowpay-ai-engine:latest
```

## Environment Variables

You can customize the container behavior with environment variables:

```bash
docker run -d \
  --name scrowpay-ai-engine \
  -p 5000:5000 \
  -e FLASK_ENV=production \
  -e PYTHONUNBUFFERED=1 \
  scrowpay-ai-engine:latest
```

Available variables:
- `FLASK_ENV`: Set to `production` or `development` (default: production)
- `PYTHONUNBUFFERED`: Set to `1` for real-time log output

## Testing the Deployment

### 1. Health Check

```bash
curl http://localhost:5000/health
```

Expected response:
```json
{
  "status": "healthy",
  "model_loaded": true,
  "model_version": "1.0.0",
  "timestamp": "2024-01-15T14:30:00Z"
}
```

### 2. Score a Transaction

```bash
curl -X POST http://localhost:5000/api/v1/score \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test_user",
    "transaction_amount": 50000,
    "transaction_velocity": 3,
    "account_age_days": 45,
    "device_fingerprint": 5432,
    "time_of_day": 14,
    "counterparty_trust_score": 75
  }'
```

Expected response:
```json
{
  "risk_score": 23,
  "risk_flag": false,
  "verdict": "pass",
  "anomaly_indicators": [],
  "model_version": "1.0.0",
  "response_time_ms": 15,
  "timestamp": "2024-01-15T14:30:00Z"
}
```

## Troubleshooting

### Container Won't Start

**Check logs:**
```bash
docker logs scrowpay-ai-engine
```

**Common issues:**
- Port 5000 already in use: Change port mapping `-p 5001:5000`
- Insufficient memory: Ensure at least 512MB RAM available
- Models failed to train: Check synthetic data exists

### Health Check Failing

**Verify Flask is running:**
```bash
docker exec scrowpay-ai-engine ps aux | grep python
```

**Check if port is accessible:**
```bash
docker exec scrowpay-ai-engine curl http://localhost:5000/health
```

### Slow Response Times

**Check container resources:**
```bash
docker stats scrowpay-ai-engine
```

**Increase CPU/memory limits:**
```bash
docker run -d \
  --name scrowpay-ai-engine \
  -p 5000:5000 \
  --cpus="2" \
  --memory="1g" \
  scrowpay-ai-engine:latest
```

## Production Deployment

### Security Considerations

1. **Don't expose port 5000 directly to the internet**
   - Use a reverse proxy (nginx, Caddy)
   - Add authentication/API keys
   - Enable HTTPS/TLS

2. **Use secrets management**
   - Don't hardcode sensitive data
   - Use Docker secrets or environment variables

3. **Regular updates**
   - Rebuild image with latest dependencies
   - Monitor for security vulnerabilities

### Example Nginx Reverse Proxy

```nginx
server {
    listen 443 ssl;
    server_name ai-engine.scrowpay.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeout settings (AI scoring can take up to 3 seconds)
        proxy_connect_timeout 10s;
        proxy_send_timeout 10s;
        proxy_read_timeout 10s;
    }
}
```

### Scaling

For high-traffic scenarios, run multiple containers behind a load balancer:

```yaml
# docker-compose.yml for scaling
version: '3.8'

services:
  ai-engine:
    build: .
    deploy:
      replicas: 3
    ports:
      - "5000-5002:5000"
```

```bash
docker-compose up -d --scale ai-engine=3
```

## Monitoring

### View Real-Time Logs

```bash
# All logs
docker logs -f scrowpay-ai-engine

# Last 100 lines
docker logs --tail 100 scrowpay-ai-engine

# Logs since 1 hour ago
docker logs --since 1h scrowpay-ai-engine
```

### Container Stats

```bash
# Real-time stats
docker stats scrowpay-ai-engine

# One-time snapshot
docker stats --no-stream scrowpay-ai-engine
```

### Inspect Container

```bash
# Full container details
docker inspect scrowpay-ai-engine

# Just the IP address
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' scrowpay-ai-engine
```

## Cleanup

### Remove Container

```bash
docker stop scrowpay-ai-engine
docker rm scrowpay-ai-engine
```

### Remove Image

```bash
docker rmi scrowpay-ai-engine:latest
```

### Remove Everything (including volumes)

```bash
docker-compose down -v
```

## Integration with Frontend

Update your frontend configuration to point to the Docker container:

```javascript
// frontend/config.js
const CONFIG = {
  aiEngine: {
    url: 'http://localhost:5000'  // or your production URL
  }
};
```

## Performance Benchmarks

Expected performance on typical hardware:

| Metric | Value |
|--------|-------|
| Container startup (with models) | 5-10 seconds |
| Container startup (training) | 30-60 seconds |
| API response time | <100ms (avg) |
| API response time (p99) | <500ms |
| Memory usage | ~200-300MB |
| CPU usage (idle) | <5% |
| CPU usage (scoring) | 10-30% |

## Support

For issues or questions:
1. Check container logs: `docker logs scrowpay-ai-engine`
2. Verify health endpoint: `curl http://localhost:5000/health`
3. Review this documentation
4. Check the main README.md for API documentation

## Next Steps

After successful deployment:
1. ✅ Verify health check passes
2. ✅ Test scoring endpoint with sample data
3. ✅ Integrate with frontend dashboard
4. ✅ Set up monitoring and logging
5. ✅ Configure production reverse proxy
6. ✅ Implement API authentication (if needed)
