#!/bin/bash

# Script to regenerate TypeScript types from Rust models
echo "🔄 Regenerating TypeScript types from Rust models..."


# Navigate to Rust backend (relative)
cd ../../backend || exit 1

# Generate TypeScript bindings
echo "📦 Running cargo test to generate types..."
cargo test export_typescript_bindings --quiet


# Copy generated types to frontend (relative)
echo "📁 Copying types to frontend..."
cp bindings/*.ts ../tsv-tennis-app/src/types/

echo "✅ Types synchronized successfully!"
echo "📝 Generated types:"
ls -la ../tsv-tennis-app/src/types/*.ts | grep -v index.ts
echo ""
echo "ℹ️  Note: Generated .ts files are gitignored and should be regenerated as needed"
