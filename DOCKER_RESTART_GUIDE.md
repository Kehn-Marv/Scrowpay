# Docker Complete Restart Guide

## Issue
Docker containers are still using old configuration/state even after updating the Squad API key.

## Solution: Complete Docker Shutdown and Rebuild

### Step 1: Stop All Running Containers
```bash
docker-compose down
```

### Step 2: Stop Docker Containers (Alternative)
```bash
# Stop all running containers
docker stop $(docker ps -aq)
```

### Step 3: Remove All Containers
```bash
# Remove all containers (including stopped ones)
docker rm $(docker ps -aq)
```

### Step 4: Remove Docker Images (Force Fresh Build)
```bash
# Remove the specific image
docker rmi scrowpay-ai-engine

# Or remove all images to force complete rebuild
docker rmi $(docker images -q)
```

### Step 5: Clean Docker System (Nuclear Option)
```bash
# Remove all unused containers, networks, images, and volumes
docker system prune -a --volumes

# When prompted, type 'y' to confirm
```

### Step 6: Verify Everything is Stopped
```bash
# Check running containers (should be empty)
docker ps

# Check all containers (should be empty)
docker ps -a

# Check images (should be empty or minimal)
docker images
```

### Step 7: Rebuild and Start Fresh
```bash
# Rebuild without cache
docker-compose build --no-cache

# Start the services
docker-compose up -d

# Or combine both
docker-compose up -d --build --force-recreate
```

### Step 8: Verify New Configuration is Loaded
```bash
# Check logs to verify new API key is being used
docker-compose logs ai-engine

# Check if containers are running
docker ps
```

---

## Quick Command Sequence (Copy & Paste)

```bash
# Complete shutdown and cleanup
docker-compose down
docker stop $(docker ps -aq)
docker rm $(docker ps -aq)
docker system prune -a --volumes

# Rebuild and start fresh
docker-compose up -d --build --force-recreate --no-cache

# Check logs
docker-compose logs -f ai-engine
```

---

## Windows-Specific Commands

If you're on Windows and the above doesn't work:

### PowerShell
```powershell
# Stop all containers
docker ps -aq | ForEach-Object { docker stop $_ }

# Remove all containers
docker ps -aq | ForEach-Object { docker rm $_ }

# Remove all images
docker images -q | ForEach-Object { docker rmi $_ }

# Clean system
docker system prune -a --volumes

# Rebuild
docker-compose up -d --build --force-recreate
```

### CMD
```cmd
# Stop Docker Desktop completely
# Right-click Docker Desktop icon in system tray → Quit Docker Desktop

# Wait 10 seconds

# Start Docker Desktop again
# Open Docker Desktop from Start Menu

# Then run:
docker-compose down
docker system prune -a --volumes
docker-compose up -d --build --force-recreate
```

---

## Troubleshooting

### Issue: "Cannot connect to Docker daemon"
**Solution:** Start Docker Desktop
- Windows: Open Docker Desktop from Start Menu
- Mac: Open Docker Desktop from Applications
- Linux: `sudo systemctl start docker`

### Issue: "Permission denied"
**Solution:** Run with elevated privileges
- Windows: Run PowerShell as Administrator
- Mac/Linux: Use `sudo` before commands

### Issue: Still seeing old configuration
**Solution:** Check environment variables
```bash
# Check if .env file has new Squad API key
cat .env | grep SQUAD

# Check if docker-compose.yml is using .env
cat docker-compose.yml | grep SQUAD
```

### Issue: "Port already in use"
**Solution:** Kill process using the port
```bash
# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Mac/Linux
lsof -ti:5000 | xargs kill -9
```

---

## Verify New Configuration

### Check Environment Variables in Container
```bash
# Enter the running container
docker exec -it <container_id> bash

# Check environment variables
env | grep SQUAD

# Exit container
exit
```

### Check API Key in Logs
```bash
# View logs (should show new API key being used)
docker-compose logs ai-engine | grep -i "squad\|api\|key"
```

### Test API Endpoint
```bash
# Test if AI engine is responding
curl http://localhost:5000/health

# Test virtual account creation (if endpoint exists)
curl -X POST http://localhost:5000/api/virtual-account \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

---

## Complete Fresh Start (Nuclear Option)

If nothing else works, do a complete reset:

```bash
# 1. Stop Docker Desktop completely
# Windows: Right-click Docker icon → Quit
# Mac: Docker icon → Quit Docker Desktop

# 2. Delete Docker data (CAUTION: Deletes everything!)
# Windows: Delete C:\ProgramData\Docker
# Mac: Delete ~/Library/Containers/com.docker.docker
# Linux: sudo rm -rf /var/lib/docker

# 3. Restart Docker Desktop

# 4. Navigate to your project
cd /path/to/scrowpay

# 5. Rebuild everything
docker-compose up -d --build --force-recreate --no-cache
```

---

## Best Practice: Clean Restart Script

Create a script for easy restarts:

### restart-docker.sh (Mac/Linux)
```bash
#!/bin/bash
echo "Stopping containers..."
docker-compose down

echo "Removing containers..."
docker rm $(docker ps -aq) 2>/dev/null

echo "Cleaning system..."
docker system prune -a --volumes -f

echo "Rebuilding..."
docker-compose up -d --build --force-recreate --no-cache

echo "Checking status..."
docker ps

echo "Viewing logs..."
docker-compose logs -f
```

### restart-docker.bat (Windows)
```batch
@echo off
echo Stopping containers...
docker-compose down

echo Removing containers...
for /f "tokens=*" %%i in ('docker ps -aq') do docker rm %%i

echo Cleaning system...
docker system prune -a --volumes -f

echo Rebuilding...
docker-compose up -d --build --force-recreate --no-cache

echo Checking status...
docker ps

echo Viewing logs...
docker-compose logs -f
```

Make executable:
```bash
chmod +x restart-docker.sh
./restart-docker.sh
```

---

## Summary

**Recommended approach:**
1. `docker-compose down` - Stop services
2. `docker system prune -a --volumes` - Clean everything
3. `docker-compose up -d --build --force-recreate --no-cache` - Rebuild fresh

**This ensures:**
- ✅ All old containers are stopped
- ✅ All old images are removed
- ✅ All cached layers are cleared
- ✅ New configuration is loaded
- ✅ Fresh build with new API key

**After restart, verify:**
- Check logs: `docker-compose logs ai-engine`
- Check containers: `docker ps`
- Test API: `curl http://localhost:5000/health`
