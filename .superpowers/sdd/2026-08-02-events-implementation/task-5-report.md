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
