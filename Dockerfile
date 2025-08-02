# Multi-stage build for Rust backend
FROM rust as backend-builder

WORKDIR /app
COPY backend_rust/Cargo.toml backend_rust/Cargo.lock ./

# Create dummy main to cache dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src

# Copy actual source and build
COPY backend_rust/src ./src
RUN touch src/main.rs
RUN cargo build --release

# Generate TypeScript types
RUN cargo test export_typescript_bindings --quiet

# Frontend build stage
FROM node:20-alpine as frontend-builder

WORKDIR /app

# Copy package files first for better caching
COPY tsv-tennis-app/package*.json ./

# Install dependencies
RUN npm ci --silent

# Copy source
COPY tsv-tennis-app/ .

# Copy generated TypeScript types from Rust backend
COPY --from=backend-builder /app/bindings/*.ts ./src/types/

# Build frontend with fresh types
RUN npm run build

# Final runtime stage
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app user
RUN useradd -r -s /bin/false -u 1001 appuser

# Create data directory for SQLite database BEFORE copying files
RUN mkdir -p /app/data && touch /app/data/auth.db && chown -R appuser:appuser /app

# Copy the built backend binary
COPY --from=backend-builder /app/target/release/tsv-tennis-backend /usr/local/bin/
RUN chmod +x /usr/local/bin/tsv-tennis-backend

# Copy the built frontend to where backend will serve it from
COPY --from=frontend-builder /app/dist /app/static
RUN chown -R appuser:appuser /app/static /app/data

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:5000/api/health || exit 1

# Switch to non-root user
USER appuser

# Add debugging information
RUN echo "Debug: Checking if binary exists..." && ls -la /usr/local/bin/tsv-tennis-backend
RUN echo "Debug: Checking data directory..." && ls -la /app/data

# Start the backend server with verbose output
CMD ["sh", "-c", "echo 'Starting TSV Tennis Backend...' && /usr/local/bin/tsv-tennis-backend"]
