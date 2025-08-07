#!/bin/bash

# Script to regenerate TypeScript types from Rust models using Specta
echo "🔄 Regenerating TypeScript types from Rust models..."

# Navigate to Rust backend
cd ../backend || exit 1

# Generate TypeScript bindings using the dedicated binary
echo "📦 Running generate-types binary..."
cargo run --bin generate-types

# Copy generated types to frontend
echo "📁 Copying types to frontend..."
cp bindings/types.ts ../tsv-tennis-app/src/types/

echo "✅ Types synchronized successfully!"
echo "📝 Generated types:"
ls -la ../tsv-tennis-app/src/types/types.ts
echo ""
echo "ℹ️  Note: Generated types.ts is not committed - run this script after backend changes"
