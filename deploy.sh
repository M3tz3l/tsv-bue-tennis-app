#!/bin/bash

# TSV TSV BÜ Tennis App Deployment Script
set -e

echo "🚀 Starting TSV TSV BÜ Tennis App deployment..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "📝 Please copy .env.template to .env and configure your environment variables"
    exit 1
fi

# Build and deploy with Docker Compose
echo "🐳 Building and deploying with Docker..."
echo "ℹ️  TypeScript types will be generated automatically during build"
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d

# Wait for health check
echo "⏳ Waiting for application to be healthy..."
sleep 10

# Check if container is running
if docker-compose -f docker-compose.prod.yml ps | grep -q "Up"; then
    echo "✅ TSV TSV BÜ Tennis App deployed successfully!"
    echo "📊 Container status:"
    docker-compose -f docker-compose.prod.yml ps
    echo ""
    echo "🔗 Your app should be available at: https://tsv-bue-tennis.de"
    echo "📋 To view logs: docker-compose -f docker-compose.prod.yml logs -f"
else
    echo "❌ Deployment failed!"
    echo "📋 Check logs with: docker-compose -f docker-compose.prod.yml logs"
    exit 1
fi
