# 🚀 TSV Tennis App - VPS Deployment Guide

This guide explains how to deploy the TSV Tennis App to your VPS using Docker and Caddy.

## 📋 Prerequisites

- VPS with Docker and Docker Compose installed
- Caddy reverse proxy running
- Domain name configured (tsv-bue-tennis.de)

## 🔧 Setup Instructions

### 1. Clone and Configure

```bash
# Clone your repository
git clone <your-repo-url>
cd react

# Copy environment template
cp .env.template .env

# Edit environment variables
nano .env
```

### 2. Configure Environment Variables

Edit `.env` with your actual values:

```bash
TEABLE_API_TOKEN=your_actual_token
TEABLE_BASE_URL=https://teable.tsv-bue-tennis.de
JWT_SECRET=your_super_secure_random_string
DATABASE_URL=sqlite:///app/data/auth.db
RUST_LOG=info
```

### 3. Add to Caddy Configuration

Add the contents of `Caddyfile.tsv-tennis` to your main Caddyfile:

```bash
# Add to your existing Caddyfile
cat Caddyfile.tsv-tennis >> /path/to/your/Caddyfile

# Reload Caddy
sudo systemctl reload caddy
```

### 4. Create Docker Network (if not exists)

```bash
docker network create caddy_network
```

### 5. Deploy the Application

```bash
# Run the deployment script
./deploy.sh
```

## 🎯 What the Deployment Does

1. **Automatic Type Generation**: TypeScript types are generated from Rust models during Docker build
2. **Multi-stage Build**: 
   - Builds Rust backend (optimized release)
   - Generates TypeScript types from Rust models
   - Builds TypeScript frontend with fresh types (production build)
   - Creates minimal runtime image
3. **Security**: Runs as non-root user, includes health checks
4. **Integration**: Connects to your existing Caddy network

## 📊 Monitoring

### View Application Logs
```bash
docker-compose -f docker-compose.prod.yml logs -f
```

### Check Container Status
```bash
docker-compose -f docker-compose.prod.yml ps
```

### Health Check
```bash
curl -f http://localhost:5000/api/health
```

## �️ Database Persistence

The application uses SQLite for authentication data (users, passwords, reset tokens). The database is persisted using Docker volumes.

### Database Location
- **Container Path**: `/app/data/auth.db`
- **Volume**: `tsv_tennis_data`
- **Backup Location**: Use `docker volume inspect tsv_tennis_data` to find the host path

### Database Management

#### Backup Database
```bash
# Create backup
docker run --rm -v tsv_tennis_data:/data -v $(pwd):/backup alpine cp /data/auth.db /backup/auth_backup_$(date +%Y%m%d_%H%M%S).db
```

#### Restore Database
```bash
# Restore from backup
docker run --rm -v tsv_tennis_data:/data -v $(pwd):/backup alpine cp /backup/your_backup.db /data/auth.db
```

#### View Database Contents (Development)
```bash
# Access the running container
docker exec -it tsv-tennis-app sh

# Inside container, use sqlite3 (if available) or copy file out
```

## �🔄 Updates

To update the application:

```bash
# Pull latest changes
git pull

# Redeploy (types will be regenerated automatically)
./deploy.sh
```

## 🛡️ Security Features

- **Rate Limiting**: 5 req/s for auth, 20 req/s for API
- **Security Headers**: HSTS, XSS protection, content type sniffing protection
- **Non-root Execution**: Container runs as dedicated app user
- **Health Checks**: Automatic container restart on failure

## 🌐 URL Structure

- **Frontend**: https://tsv-bue-tennis.de
- **API**: https://tsv-bue-tennis.de/api/*
- **Health Check**: https://tsv-bue-tennis.de/api/health

## 🚨 Troubleshooting

### Container Won't Start
```bash
# Check logs for errors
docker-compose -f docker-compose.prod.yml logs

# Verify environment variables
docker-compose -f docker-compose.prod.yml config
```

### Health Check Failing
```bash
# Test health endpoint directly
docker exec tsv-tennis-app curl -f http://localhost:5000/api/health
```

### Caddy Issues
```bash
# Check Caddy logs
sudo journalctl -u caddy -f

# Validate Caddyfile
caddy validate --config /path/to/Caddyfile
```
