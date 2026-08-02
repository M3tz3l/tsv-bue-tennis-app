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
