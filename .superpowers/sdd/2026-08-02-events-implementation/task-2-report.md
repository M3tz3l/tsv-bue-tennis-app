# Task 2 Report

## Files

- `backend/src/routes/events.rs`: protected event and signup handlers, normalized Orga authorization, authenticated member ownership.
- `backend/src/routes/mod.rs`: registered the events route module.
- `backend/src/main.rs`: mounted event reads and writes under existing auth and rate-limit layers; added test-app registration.
- `backend/src/events.rs`: added transaction-backed signup deadline/capacity checks and safe transaction connection release.
- `backend/src/bin/generate_types.rs`: exported event models and configured Specta bigint IDs as TypeScript numbers.
- `backend/bindings/types.ts`: regenerated event bindings.
- `backend/tests/events_routes.rs`: route coverage for listing/drafts, own signup visibility, Orga authorization, ownership, deadline, and capacity.

## Commits

- `feat: add event and signup API` (created after this report).

## Tests and Outputs

- `cargo test events_routes -- --nocapture --test-threads=1`: passed, 3 tests.
- `cargo test events -- --nocapture --test-threads=1`: passed, 11 tests.
- `cargo test --workspace --all-targets -- --nocapture --test-threads=1`: passed, 50 tests.
- `cargo run --bin generate-types`: passed; generated event types in `backend/bindings/types.ts`.
- `cargo fmt --all -- --check`: passed.
- `git diff --check`: passed.

## Final UPDATE Error-Path Fix

- `update_signup` now explicitly attempts `ROLLBACK` when the `event_signups` UPDATE query fails, preserving and returning the original SQLx error.

### Exact Verification

- `cargo test events -- --nocapture --test-threads=1`: passed, 3 matching tests (1 repository, 2 route; 8 route tests were filtered by the `events` name).
- `cargo test --workspace --all-targets -- --nocapture --test-threads=1`: passed, 54 tests (39 main, 8 repository, 7 route).
- `cargo fmt --all -- --check`: passed.
- `git diff --check`: passed.

## Concerns

- Event IDs are Rust `i64` values exported as TypeScript `number`; this matches the existing JSON API but assumes IDs remain within JavaScript safe integer range.
- Deadline strings accept RFC3339 timestamps and date-only values; malformed deadline values are treated as not expired because Task 1 does not validate them.
- Signup create/update transactions use `BEGIN IMMEDIATE` to serialize capacity checks. The in-memory test database pool has a single effective connection, so connection release after commit is required and covered by route tests.

## Review Fix Report

### Changes

- Regular-member `GET /events/:id` now hides drafts with `404`; normalized Orga claims retain management detail access.
- Event create/update validates signup deadlines as RFC3339 or `YYYY-MM-DD`; signup create/update fail closed for malformed stored deadlines.
- Added route tests for draft detail exclusion, update deadline/capacity enforcement, malformed deadlines, and management/signup authentication.
- Every update-signup transaction early return now explicitly rolls back, including event lookup/query errors, missing ownership, contribution validation, and signup ID lookup failures.

### Exact Verification

- `cargo test --test events_routes -- --nocapture --test-threads=1`: passed, 7 tests.
- `cargo test --workspace --all-targets -- --nocapture --test-threads=1`: passed, 54 tests (39 main, 8 repository, 7 route).
- `cargo run --bin generate-types`: passed; generated event bindings.
- `cargo fmt --all -- --check`: passed.
- `git diff --check`: passed.

### Remaining Concern

- Event IDs remain exported as TypeScript `number`; retained from the original Task 2 concern because no project requirement mandates changing the existing `i64` API model.

## Transaction Error-Path Fix

- `create_signup` now explicitly attempts `ROLLBACK` before returning event-fetch errors and commit errors.
- `update_signup` now explicitly attempts `ROLLBACK` before returning commit errors; its fetch, update, and lookup error paths also preserve the original error after rollback attempts.

### Exact Verification

- `cargo test --test events_routes -- --nocapture --test-threads=1`: passed, 7 tests.
- `cargo test --workspace --all-targets -- --nocapture --test-threads=1`: passed, 54 tests (39 main, 8 repository, 7 route).
- `cargo fmt --all -- --check`: passed.
- `git diff --check`: passed.
