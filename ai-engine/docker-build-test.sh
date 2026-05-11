#!/bin/bash
# Quick Docker build and test script for ScrowPay AI Risk Engine

set -e  # Exit on error

echo "=========================================="
echo "ScrowPay AI Risk Engine - Docker Build & Test"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Build Docker image
echo "Step 1: Building Docker image..."
echo "----------------------------------------"
docker build -t scrowpay-ai-engine:latest .
echo ""
echo -e "${GREEN}✓ Docker image built successfully${NC}"
echo ""

# Step 2: Start container
echo "Step 2: Starting container..."
echo "----------------------------------------"
docker run -d \
  --name scrowpay-ai-engine-test \
  -p 5000:5000 \
  scrowpay-ai-engine:latest

echo -e "${GREEN}✓ Container started${NC}"
echo ""

# Step 3: Wait for container to be ready
echo "Step 3: Waiting for container to be ready..."
echo "----------------------------------------"
echo "This may take 30-60 seconds if models need to be trained..."
echo ""

MAX_WAIT=120  # Maximum wait time in seconds
WAIT_TIME=0
INTERVAL=5

while [ $WAIT_TIME -lt $MAX_WAIT ]; do
  if docker exec scrowpay-ai-engine-test curl -s http://localhost:5000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Container is ready!${NC}"
    echo ""
    break
  fi
  
  echo "Waiting... ($WAIT_TIME seconds elapsed)"
  sleep $INTERVAL
  WAIT_TIME=$((WAIT_TIME + INTERVAL))
done

if [ $WAIT_TIME -ge $MAX_WAIT ]; then
  echo -e "${RED}✗ Container failed to start within $MAX_WAIT seconds${NC}"
  echo ""
  echo "Container logs:"
  docker logs scrowpay-ai-engine-test
  docker stop scrowpay-ai-engine-test
  docker rm scrowpay-ai-engine-test
  exit 1
fi

# Step 4: Test health endpoint
echo "Step 4: Testing health endpoint..."
echo "----------------------------------------"
HEALTH_RESPONSE=$(curl -s http://localhost:5000/health)
echo "$HEALTH_RESPONSE" | python3 -m json.tool
echo ""

if echo "$HEALTH_RESPONSE" | grep -q '"status": "healthy"'; then
  echo -e "${GREEN}✓ Health check passed${NC}"
else
  echo -e "${RED}✗ Health check failed${NC}"
  docker logs scrowpay-ai-engine-test
  docker stop scrowpay-ai-engine-test
  docker rm scrowpay-ai-engine-test
  exit 1
fi
echo ""

# Step 5: Test scoring endpoint
echo "Step 5: Testing scoring endpoint..."
echo "----------------------------------------"
SCORE_RESPONSE=$(curl -s -X POST http://localhost:5000/api/v1/score \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test_user",
    "transaction_amount": 50000,
    "transaction_velocity": 3,
    "account_age_days": 45,
    "device_fingerprint": 5432,
    "time_of_day": 14,
    "counterparty_trust_score": 75
  }')

echo "$SCORE_RESPONSE" | python3 -m json.tool
echo ""

if echo "$SCORE_RESPONSE" | grep -q '"verdict"'; then
  echo -e "${GREEN}✓ Scoring endpoint working${NC}"
else
  echo -e "${RED}✗ Scoring endpoint failed${NC}"
  docker logs scrowpay-ai-engine-test
  docker stop scrowpay-ai-engine-test
  docker rm scrowpay-ai-engine-test
  exit 1
fi
echo ""

# Step 6: Show container stats
echo "Step 6: Container statistics..."
echo "----------------------------------------"
docker stats --no-stream scrowpay-ai-engine-test
echo ""

# Step 7: Cleanup prompt
echo "=========================================="
echo -e "${GREEN}✓ All tests passed!${NC}"
echo "=========================================="
echo ""
echo "Container is running and accessible at:"
echo "  Health: http://localhost:5000/health"
echo "  Score:  http://localhost:5000/api/v1/score"
echo ""
echo "To view logs:"
echo "  docker logs -f scrowpay-ai-engine-test"
echo ""
echo "To stop and remove the test container:"
echo "  docker stop scrowpay-ai-engine-test"
echo "  docker rm scrowpay-ai-engine-test"
echo ""
echo -e "${YELLOW}Note: This is a test container. For production deployment,"
echo -e "use docker-compose or refer to DOCKER_DEPLOYMENT.md${NC}"
echo ""
