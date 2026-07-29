# TSV Tennis Development Guide

## Project Overview
Monorepo: Rust/Axum backend (`backend/`) + React/Vite frontend (`tsv-tennis-app/`).

## Development Commands
```bash
# Backend (port 5000)
cd backend && cargo run

# Backend with auto-reload (requires cargo-watch)
cd backend && cargo watch -x run

# Frontend (port 5173, proxies /api to backend)
cd tsv-tennis-app && npm run dev
```
Frontend `predev` script reminds to run `npm run sync-types` if backend types changed.

## Type Generation
Types flow: Rust models (specta) → `backend/bindings/types.ts` → `tsv-tennis-app/src/types/types.ts`
```bash
# After changing Rust models:
./sync-types.sh
# Or manually:
cargo run --bin generate-types && cp backend/bindings/types.ts ../tsv-tennis-app/src/types/
```
Generated `.ts` files are gitignored.

## Testing
```bash
# Backend (serial execution required)
cd backend && cargo test --workspace --all-targets -- --nocapture --test-threads=1

# Frontend lint + typecheck
cd tsv-tennis-app && npm run lint && npx tsc --noEmit

# E2E (complex setup - see .github/workflows/e2e.yml)
# Requires: backend, frontend, Mailpit, seeded test data
```
Backend tests use `serial_test` crate and mockito for mocking external APIs.
E2E tests require backend compiled in release mode: `cargo build --release` before running `./e2e/run-tests.sh`.

## CI Order
1. `cargo fmt --all -- --check` (backend)
2. `cargo build --workspace --all-targets` (backend)
3. `cargo test` (backend, serial)
4. `cargo run --bin generate-types` (upload artifact)
5. Frontend: `npm ci` → `npm run lint` → `npx tsc --noEmit`

## Architecture Notes
- Backend: SQLite for passwords, Teable API for profiles/work hours
- Frontend dev server proxies `/api` to `localhost:5000`
- Docker build auto-generates types during `cargo build`
- Tests use `serial_test` crate → must run with `RUST_TEST_THREADS=1`

## Environment
- Backend: `.env` (copy from `.env.example`)
- Frontend: `.env.development` (or `.env`)
- Production: Docker with `compose.yaml`
