# TypeScript Type Generation Workflow

This project uses automatic type generation to keep frontend and backend types in sync.

## How it works

1. **Backend Types**: All API types are defined in `backend_rust/src/models.rs` with `#[derive(TS)]` annotations
2. **Type Generation**: Running `cargo test export_typescript_bindings` generates TypeScript files
3. **Frontend Sync**: The `sync-types.sh` script copies generated types to the frontend
4. **Git Workflow**: Generated `.ts` files are gitignored to prevent conflicts

## Development Workflow

### When you modify Rust types (Development):
```bash
# For local development, manually regenerate types
./sync-types.sh
```

### When deploying (Production):
```bash
# Types are automatically generated during Docker build
./deploy.sh
```

### When setting up the project:
```bash
# Install dependencies
cd backend_rust && cargo build
cd ../tsv-tennis-app && npm install

# Generate initial types for development
./sync-types.sh
```

## Generated Files (Gitignored)

- `backend_rust/bindings/*.ts` - Generated TypeScript definitions
- `tsv-tennis-app/src/types/*.ts` - Copied type definitions (except index.ts)

The `index.ts` file in the types directory is manually maintained to export all types.

## Benefits

✅ **Type Safety**: Frontend and backend always use identical type definitions
✅ **No Manual Sync**: Types are automatically generated from Rust structs  
✅ **Build-Time Errors**: TypeScript catches API contract violations early
✅ **Developer Experience**: Full IntelliSense and autocompletion for API types
