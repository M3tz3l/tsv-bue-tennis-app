# Veranstaltungen und Arbeitsdienste Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an authenticated events/work-duty area where Orga members manage published or draft events and members create, edit, or cancel one signup per event.

**Architecture:** Keep member identity in Teable and store the event domain in SQLite. Add a focused Rust event repository/service and protected Axum routes, then expose typed client methods and a separate React events page connected to the existing dashboard navigation and TanStack Query cache.

**Tech Stack:** Rust 2021, Axum 0.7, SQLx SQLite, Chrono, Specta, React 19, TypeScript, React Router, TanStack Query, Tailwind CSS, Vitest, Testing Library.

## Global Constraints

- Only Orga members can create, edit, publish, and delete events.
- Members see only published future events and their own signup; Orga sees all signup details and aggregates.
- One signup per member and event; the people count includes the signing-up member and is at least 1.
- Event date and title are required; start and end times are independently optional.
- Salad and cake contribution fields are enabled per event and only enabled fields are accepted and shown.
- Signup deadline and capacity are optional; signup writes must enforce both transactionally.
- Signup does not create or confirm Arbeitsstunden.
- No email notifications or past-event archive in the MVP.
- Preserve unrelated working-tree changes, including the existing `opencode.json` and `.superpowers/` files.
- Run backend tests serially with `cargo test --workspace --all-targets -- --nocapture --test-threads=1`.
- Run frontend verification with `npm run lint && npx tsc --noEmit` and relevant Vitest tests.

## File Map

- Create `backend/src/events.rs`: SQLite schema, typed event/signup records, validation, queries, and transactional signup operations.
- Create `backend/src/routes/events.rs`: authenticated event and signup HTTP handlers plus Orga checks.
- Modify `backend/src/database.rs`: expose the SQLx pool or event repository construction and initialize event tables.
- Modify `backend/src/models.rs`: Specta request/response models and event enums.
- Modify `backend/src/routes/mod.rs`: register event routes.
- Modify `backend/src/main.rs`: mount event read/write routes with existing rate-limit layers.
- Modify `backend/src/lib.rs`: export event module.
- Modify `backend/src/bin/generate_types.rs`: include event models in generated bindings.
- Create `backend/tests/events.rs` or add focused unit tests beside the event repository, depending on existing test harness setup.
- Modify `tsv-tennis-app/src/types/index.ts`: re-export generated event types.
- Modify `tsv-tennis-app/src/services/backendService.ts`: add typed event and signup API methods.
- Create `tsv-tennis-app/src/hooks/useEvents.ts`: query keys, list/detail queries, and mutation invalidation.
- Create `tsv-tennis-app/src/pages/Events.tsx`: member card list and Orga management entry points.
- Create `tsv-tennis-app/src/components/EventSignupModal.tsx`: event detail and conditional signup form.
- Create `tsv-tennis-app/src/components/EventFormModal.tsx`: Orga event create/edit form.
- Create `tsv-tennis-app/src/components/EventSignupsModal.tsx`: Orga-only signup details and aggregates.
- Modify `tsv-tennis-app/src/pages/Dashboard.tsx`: render dashboard tabs and preserve the existing work-hours content.
- Modify `tsv-tennis-app/src/App.tsx`: add protected event route and preserve the existing `/dashboard` entry behavior.
- Create frontend tests adjacent to hooks/components/pages following existing Vitest conventions.
- Modify `.gitignore`: add `.superpowers/` so visual brainstorming artifacts remain local and untracked; do not remove existing user files.

---

### Task 1: Define Event Models and Database Schema

**Files:**
- Modify: `backend/src/models.rs`
- Modify: `backend/src/database.rs`
- Create: `backend/src/events.rs`
- Modify: `backend/src/lib.rs`
- Test: `backend/src/events.rs` tests or `backend/tests/events.rs`

**Interfaces:**
- Produces `EventType::{Event, WorkDuty}`, `EventStatus::{Draft, Published}`, `CreateEventRequest`, `UpdateEventRequest`, `SignupRequest`, `EventSummary`, `EventDetail`, `EventSignup`, and `SignupSummary` as `serde`/`specta` types.
- Produces `EventRepository::new(pool: SqlitePool)`, `list_published_future(member_id)`, `get_event(id, member_id)`, `create_event(actor_id, payload)`, `update_event(id, payload)`, `delete_event(id)`, `create_signup(event_id, member_id, payload)`, `update_signup(event_id, member_id, payload)`, `delete_signup(event_id, member_id)`, and `list_signups(event_id)`.

- [ ] **Step 1: Write failing schema and validation tests**

Test that initialization creates `events` and `event_signups`, that `(event_id, member_id)` is unique, that titles/dates and people counts are validated, and that disabled food contributions are rejected.

- [ ] **Step 2: Run the focused backend tests to verify they fail**

Run: `cd backend && cargo test events -- --nocapture --test-threads=1`

Expected: FAIL because the event repository and models do not exist.

- [ ] **Step 3: Add the typed models and event tables**

Use SQLite `INTEGER PRIMARY KEY AUTOINCREMENT` IDs, ISO date/time strings, boolean integer storage, foreign keys from signups to events, and `UNIQUE(event_id, member_id)`. Add `CREATE TABLE IF NOT EXISTS` statements to database initialization and keep event repository SQL parameterized.

- [ ] **Step 4: Implement repository validation and CRUD primitives**

Normalize empty optional strings to `None`, require title and `YYYY-MM-DD` date, allow either time independently, reject an end time before a supplied start time, require positive capacity when supplied, and force disabled salad/cake counts to zero. Keep all member IDs supplied by the caller as authenticated Teable IDs.

- [ ] **Step 5: Run the focused tests to verify they pass**

Run: `cd backend && cargo test events -- --nocapture --test-threads=1`

Expected: PASS for schema, validation, and uniqueness coverage.

- [ ] **Step 6: Commit the database foundation**

```bash
git add backend/src/events.rs backend/src/models.rs backend/src/database.rs backend/src/lib.rs backend/tests/events.rs
git commit -m "feat: add event persistence models"
```

### Task 2: Implement Event and Signup HTTP Routes

**Files:**
- Create: `backend/src/routes/events.rs`
- Modify: `backend/src/routes/mod.rs`
- Modify: `backend/src/main.rs`
- Modify: `backend/src/bin/generate_types.rs`
- Test: `backend/src/routes/events.rs` tests or `backend/tests/events_routes.rs`

**Interfaces:**
- Consumes the repository methods and request/response models from Task 1.
- Produces protected handlers for `GET /events`, `POST /events`, `GET /events/:id`, `PUT /events/:id`, `DELETE /events/:id`, `POST|PUT|DELETE /events/:id/signup`, and `GET /events/:id/signups`.

- [ ] **Step 1: Write failing route tests**

Cover regular-member event listing, draft exclusion, Orga-only management, own-signup visibility, cross-member signup denial, deadline rejection, and capacity enforcement. Build requests with JWTs whose `sub` values are member IDs and roles match the existing auth claims.

- [ ] **Step 2: Run route tests to verify they fail**

Run: `cd backend && cargo test events_routes -- --nocapture --test-threads=1`

Expected: FAIL because routes are not mounted.

- [ ] **Step 3: Implement authenticated handlers**

Extract the authenticated member ID from headers using `extract_user_id_from_headers`. Add a normalized role check matching `orga`, return `403` for non-Orga management endpoints, and never accept a client-provided member ID for signup operations.

- [ ] **Step 4: Mount routes with existing rate limits**

Add event GET/detail/list routes to read routes and event mutations plus signup writes to write routes. Keep the existing authentication middleware and JSON 429 middleware. Register the module and include its models in generated Specta bindings.

- [ ] **Step 5: Run route tests and type generation**

Run: `cd backend && cargo test events -- --nocapture --test-threads=1`

Run: `cargo run --bin generate-types`

Expected: route tests pass and generated bindings contain event types.

- [ ] **Step 6: Commit the API layer**

```bash
git add backend/src/routes/events.rs backend/src/routes/mod.rs backend/src/main.rs backend/src/bin/generate_types.rs backend/bindings
git commit -m "feat: add event and signup API"
```

### Task 3: Add Typed Frontend API and Query Hooks

**Files:**
- Modify: `tsv-tennis-app/src/services/backendService.ts`
- Modify: `tsv-tennis-app/src/types/index.ts`
- Create: `tsv-tennis-app/src/hooks/useEvents.ts`
- Test: `tsv-tennis-app/src/services/backendService.test.ts`
- Test: `tsv-tennis-app/src/hooks/useEvents.test.tsx`

**Interfaces:**
- Produces `BackendService.getEvents()`, `getEvent(id)`, `createEvent(payload)`, `updateEvent(id, payload)`, `deleteEvent(id)`, `createEventSignup(id, payload)`, `updateEventSignup(id, payload)`, `deleteEventSignup(id)`, and `getEventSignups(id)`.
- Produces `EVENTS_QUERY_KEY` and `EVENT_DETAIL_QUERY_KEY` plus hooks for event list/detail and mutations that invalidate list/detail/signup queries.

- [ ] **Step 1: Write failing service and hook tests**

Assert exact HTTP methods/paths/payloads and that successful signup or event mutations invalidate the event list and affected detail query.

- [ ] **Step 2: Run the focused frontend tests to verify they fail**

Run: `cd tsv-tennis-app && npm test -- --run src/services/backendService.test.ts src/hooks/useEvents.test.tsx`

Expected: FAIL because event methods and hooks are undefined.

- [ ] **Step 3: Add generated-type exports and service methods**

Use the generated Rust names rather than duplicating event interfaces. Match the existing `ApiResult`/`ApiError` handling and return German fallback messages for event API failures.

- [ ] **Step 4: Add query hooks and mutation invalidation**

Enable queries only when the authenticated user/token exists. Use stable keys containing the current user ID and event ID. After create/update/delete/signup mutations, invalidate the event list and relevant event detail/signup keys.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `cd tsv-tennis-app && npm test -- --run src/services/backendService.test.ts src/hooks/useEvents.test.tsx`

Run: `npx tsc --noEmit`

Expected: PASS with no type errors.

- [ ] **Step 6: Commit the frontend data layer**

```bash
git add tsv-tennis-app/src/services/backendService.ts tsv-tennis-app/src/types/index.ts tsv-tennis-app/src/hooks/useEvents.ts tsv-tennis-app/src/services/backendService.test.ts tsv-tennis-app/src/hooks/useEvents.test.tsx
git commit -m "feat: add frontend event data layer"
```

### Task 4: Build Member Event Cards and Signup Flow

**Files:**
- Create: `tsv-tennis-app/src/pages/Events.tsx`
- Create: `tsv-tennis-app/src/components/EventSignupModal.tsx`
- Test: `tsv-tennis-app/src/pages/Events.test.tsx`
- Test: `tsv-tennis-app/src/components/EventSignupModal.test.tsx`

**Interfaces:**
- Consumes event queries/mutations from Task 3 and `useAuth` role information.
- Produces a responsive card list with event type, date, optional times/location, capacity/deadline/status, and a detail/signup modal.

- [ ] **Step 1: Write failing component tests**

Test cards render only future published events, own signup status appears without other member details, salad/cake inputs appear only when enabled, people count defaults to 1, and submit/edit/cancel calls the correct mutation.

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `cd tsv-tennis-app && npm test -- --run src/pages/Events.test.tsx src/components/EventSignupModal.test.tsx`

Expected: FAIL because the page and modal do not exist.

- [ ] **Step 3: Implement the responsive card list**

Use the existing gradient, white card, green action, and toast visual language. Keep cards usable on narrow screens. Display unavailable/full/deadline states as non-actionable text while retaining event details.

- [ ] **Step 4: Implement conditional signup fields and mutation states**

Render salad and cake quantity inputs only from event flags. Validate people count at least 1 and contribution quantities non-negative before submit. Disable controls while pending, show API errors through toasts, and invalidate queries through the hooks.

- [ ] **Step 5: Run focused tests and lint**

Run: `cd tsv-tennis-app && npm test -- --run src/pages/Events.test.tsx src/components/EventSignupModal.test.tsx`

Run: `npm run lint`

Expected: PASS with no lint violations.

- [ ] **Step 6: Commit the member event UI**

```bash
git add tsv-tennis-app/src/pages/Events.tsx tsv-tennis-app/src/components/EventSignupModal.tsx tsv-tennis-app/src/pages/Events.test.tsx tsv-tennis-app/src/components/EventSignupModal.test.tsx
git commit -m "feat: add member event signup flow"
```

### Task 5: Add Orga Event Management UI

**Files:**
- Create: `tsv-tennis-app/src/components/EventFormModal.tsx`
- Create: `tsv-tennis-app/src/components/EventSignupsModal.tsx`
- Modify: `tsv-tennis-app/src/pages/Events.tsx`
- Test: `tsv-tennis-app/src/components/EventFormModal.test.tsx`
- Test: `tsv-tennis-app/src/components/EventSignupsModal.test.tsx`

**Interfaces:**
- Consumes event management mutations and `getEventSignups` from Task 3.
- Produces Orga-only controls for create/edit/delete/publish and all-signup detail/aggregate display.

- [ ] **Step 1: Write failing Orga UI tests**

Test regular members do not see management controls, Orga sees create/edit/delete actions, event form supports draft/published status and independent optional times, and signup management renders names/details/aggregates only for Orga.

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `cd tsv-tennis-app && npm test -- --run src/components/EventFormModal.test.tsx src/components/EventSignupsModal.test.tsx`

Expected: FAIL because the Orga components do not exist.

- [ ] **Step 3: Implement event creation/editing form**

Include title, type, date, optional start/end time, description, location, optional deadline/capacity, per-event salad/cake toggles, and draft/published status. Confirm deletion with the existing dialog pattern and invalidate queries after mutations.

- [ ] **Step 4: Implement signup details and aggregate view**

Show each signup's member name, people count, enabled contribution quantities, and comment. Show totals for people, salads, and cakes. Do not render this view for regular members even if a route or API response is manipulated.

- [ ] **Step 5: Run focused tests and lint**

Run: `cd tsv-tennis-app && npm test -- --run src/components/EventFormModal.test.tsx src/components/EventSignupsModal.test.tsx`

Run: `npm run lint`

Expected: PASS with no lint violations.

- [ ] **Step 6: Commit Orga management**

```bash
git add tsv-tennis-app/src/pages/Events.tsx tsv-tennis-app/src/components/EventFormModal.tsx tsv-tennis-app/src/components/EventSignupsModal.tsx tsv-tennis-app/src/components/EventFormModal.test.tsx tsv-tennis-app/src/components/EventSignupsModal.test.tsx
git commit -m "feat: add Orga event management"
```

### Task 6: Integrate Dashboard Navigation and Routes

**Files:**
- Modify: `tsv-tennis-app/src/App.tsx`
- Modify: `tsv-tennis-app/src/pages/Dashboard.tsx`
- Modify: `tsv-tennis-app/src/components/HomeRedirect.tsx` if redirect path needs normalization
- Test: `tsv-tennis-app/src/pages/Dashboard.test.tsx` or existing dashboard navigation tests

**Interfaces:**
- Consumes `Events` from Task 4/5 and preserves existing Dashboard behavior.
- Produces protected `/dashboard/arbeitsstunden` and `/dashboard/veranstaltungen` routes with clear tabs/buttons and direct-link support.

- [ ] **Step 1: Write failing navigation tests**

Assert the root/dashboard entry remains valid, the work-hours tab renders the existing content, the events tab renders `Events`, and unauthenticated users are redirected through `ProtectedRoute`.

- [ ] **Step 2: Run navigation tests to verify they fail**

Run: `cd tsv-tennis-app && npm test -- --run src/pages/Dashboard.test.tsx`

Expected: FAIL because the event route and tabs are not wired.

- [ ] **Step 3: Add protected routes and tab navigation**

Keep `/dashboard` as a safe redirect to `/dashboard/arbeitsstunden` or preserve the current dashboard route while adding nested links. Avoid duplicating the work-hours implementation; render the existing content from the work-hours route and event cards from the events route.

- [ ] **Step 4: Run navigation tests, full frontend tests, lint, and typecheck**

Run: `cd tsv-tennis-app && npm test`

Run: `npm run lint && npx tsc --noEmit`

Expected: PASS for existing and new tests.

- [ ] **Step 5: Commit dashboard integration**

```bash
git add tsv-tennis-app/src/App.tsx tsv-tennis-app/src/pages/Dashboard.tsx tsv-tennis-app/src/components/HomeRedirect.tsx tsv-tennis-app/src/pages/Dashboard.test.tsx
git commit -m "feat: integrate events into dashboard navigation"
```

### Task 7: Full Verification and Generated Artifacts

**Files:**
- Modify: generated `tsv-tennis-app/src/types/types.ts` only through the repository's type sync process
- Modify: `.gitignore` only if `.superpowers/` should be excluded and is not already ignored

- [ ] **Step 1: Regenerate and synchronize bindings**

Run: `./sync-types.sh`

Expected: frontend generated types match the final Rust models and no hand-edited generated file is required.

- [ ] **Step 2: Run formatting and backend build**

Run: `cargo fmt --all -- --check`

Run: `cd backend && cargo build --workspace --all-targets`

Expected: PASS.

- [ ] **Step 3: Run the complete serial backend test suite**

Run: `cd backend && cargo test --workspace --all-targets -- --nocapture --test-threads=1`

Expected: PASS with event persistence, permissions, deadline, capacity, and existing tests.

- [ ] **Step 4: Run the complete frontend verification suite**

Run: `cd tsv-tennis-app && npm test`

Run: `npm run lint && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Inspect the final diff and status**

Run: `git diff --check`

Run: `git status --short`

Confirm only intended feature files plus any generated binding changes are present; do not alter the pre-existing `opencode.json` or `.superpowers/` changes.

- [ ] **Step 6: Commit final generated/verification changes**

```bash
git add backend/bindings tsv-tennis-app/src/types/types.ts .gitignore
git commit -m "chore: sync event bindings"
```
