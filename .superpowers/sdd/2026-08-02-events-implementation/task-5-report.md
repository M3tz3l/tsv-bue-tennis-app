# Task 5 Report

## Status

Implemented Orga event management UI without changing navigation.

## Changes

- Added `EventFormModal` with create/edit/delete flows, delete confirmation, draft/published status, independent optional start/end times, optional deadline/capacity, and salad/cake toggles.
- Added `EventSignupsModal` with Orga-only signup detail and aggregate totals.
- Extended `Events` with Orga-only create/edit/signup controls and management visibility.
- Added focused component and page tests, including regular-member access restrictions.

## Verification

- Focused tests: 12 passed in 3 files.
- `npm run lint`: passed with five pre-existing warnings in `AuthContext.tsx` and `useDashboard.test.tsx`.
- `npx tsc --noEmit`: passed.
- `git diff --check`: passed.

## Concerns

- The current backend `list_events` route calls `list_published_future` for all roles. If it is not changed in another task, Orga users will not receive drafts or past events through the list endpoint, despite the UI supporting them when returned. Backend changes were intentionally out of scope for Task 5.
- Signup records expose `member_id`, not a member display name. The signup modal therefore renders the available member identifier.

## Review Fix Evidence

- Orga listing: `/events` now branches on authenticated role; Orga uses `EventRepository::list_all_events`, while regular members retain `list_published_future`. Added repository and route tests proving drafts and past events are visible only through the Orga behavior.
- Signup names: `EventSignup.member_name` is part of the generated contract. The Orga-protected signup route resolves each member through Teable and returns `member_name`; regular member detail/signup responses do not perform this lookup and retain no name details.
- Query gating: `useEventSignups` accepts an `enabled` flag and `EventSignupsModal` passes the Orga role result, preserving hook order while preventing regular-user network queries.
- Client validation: form submission rejects end-before-start, deadline-after-event-date, and non-positive/non-integer capacity before mutation. Backend validation remains authoritative.
- Mutation safety: tests cover create/update errors, pending controls, outer-dialog dismissal prevention, signup quantities, and query invalidation. Existing member and Orga event/detail prop coverage remains green.
- Verification: `cargo fmt --all -- --check`; full backend workspace tests passed (39 unit/integration, 9 repository, 8 route tests). Frontend focused tests passed (20 tests in 4 files); `npx tsc --noEmit` passed. `npm run lint` passed with five pre-existing warnings in `AuthContext.tsx` and `useDashboard.test.tsx`.

## Final Review Fix Evidence

- Fixed `backend/src/routes/events.rs` so each Teable member-name lookup is best-effort. Lookup errors are logged and converted to `member_name: None`; the signup row and repository-provided aggregates are preserved, and the route no longer returns 502 for an individual lookup failure.
- Added `signup_listing_preserves_rows_when_a_member_lookup_fails` with one successful and one failing Teable lookup. It proves HTTP 200, both signup rows, `total_people: 2`, the resolved successful name, and `member_name: null` for the failed lookup.
- Verification: focused backend `events` and `events_routes` tests passed (18 total); full `cargo test --workspace --all-targets -- --nocapture --test-threads=1` passed (39 unit/integration, 9 repository, 9 route tests); frontend focused tests passed (20 tests in 4 files); `npx tsc --noEmit` passed.
