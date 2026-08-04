# Informational-Only Events (Disable Signups) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow an Orga to publish an event that does not accept signups (informational-only), via a per-event `allow_signups` flag that defaults to `true`.

**Architecture:** Add `allow_signups` to the event model, DB schema (with an idempotent migration), and all repository read/write paths. The backend rejects signup create/update while still allowing delete. The frontend hides all signup UI for disabled events (event card, overview rows, signup modal guard) and adds an "Anmeldungen zulassen" checkbox to the Orga event form. The backend model change lands on `feature/events-backend` (PR #61); the frontend changes land on `feature/events-signups` (PR #60).

**Tech Stack:** Rust/sqlx (backend), React 19 + TanStack Query + Tailwind 4 (frontend), Vitest.

## Global Constraints

- `allow_signups` defaults to `true` — every existing and new event accepts signups unless explicitly disabled.
- When `allow_signups` is false: `create_signup` and `update_signup` return `EventError::Conflict` ("signups are disabled for this event"); `delete_signup` is still allowed; no frontend signup UI is shown.
- The generated TS types are gitignored — regenerate via `cargo run --bin generate-types` and copy to the frontend.
- After each task run that task's branch verification (backend: `cargo build --workspace --all-targets && cargo test --workspace --all-targets -- --test-threads=1 && cargo fmt --all -- --check`; frontend: `npm test && npm run lint && npx tsc --noEmit && npm run build`).

---

### Task 1: Backend — Model, Schema, Migration, and Repository

**Worktree:** `/workspaces/tsv-tennis/.worktrees/events-backend` (branch `feature/events-backend`)

**Files:**
- Modify: `backend/src/models.rs` (`CreateEventRequest`, `UpdateEventRequest`, `EventSummary`)
- Modify: `backend/src/database.rs` (`initialize_event_tables`)
- Modify: `backend/src/events.rs` (create_event, create_signup, update_event, update_signup, all SELECT projections, `summary`)

**Interfaces:**
- Produces: `CreateEventRequest.allow_signups: bool` (serde default `true`), `UpdateEventRequest.allow_signups: Option<bool>`, `EventSummary.allow_signups: bool`.
- Produces: `events.allow_signups INTEGER NOT NULL DEFAULT 1` column, present for both fresh and pre-existing databases.
- Produces: repository methods rejecting signup create/update when `allow_signups` is false.

- [ ] **Step 1: Add the model field**

In `models.rs`:
- Add a module-level helper and field to `CreateEventRequest`:

```rust
fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CreateEventRequest {
    // ...existing fields...
    pub allow_salad: bool,
    pub allow_cake: bool,
    #[serde(default = "default_true")]
    pub allow_signups: bool,
    pub status: EventStatus,
}
```

- Add to `UpdateEventRequest` (after `allow_cake`):

```rust
    pub allow_signups: Option<bool>,
```

- Add to `EventSummary` (after `allow_cake`):

```rust
    pub allow_signups: bool,
```

- [ ] **Step 2: Extend the schema and add the migration**

In `database.rs` `initialize_event_tables`, add `allow_signups INTEGER NOT NULL DEFAULT 1` to the `events` CREATE TABLE (after `allow_cake`), then after the `event_signups` CREATE add an idempotent migration for pre-existing databases:

```rust
        // Add allow_signups to events created before this column existed.
        let has_allow_signups: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM pragma_table_info('events') WHERE name = 'allow_signups'",
        )
        .fetch_one(pool)
        .await?;
        if has_allow_signups == 0 {
            sqlx::query("ALTER TABLE events ADD COLUMN allow_signups INTEGER NOT NULL DEFAULT 1")
                .execute(pool)
                .await?;
        }
```

- [ ] **Step 3: Thread `allow_signups` through the repository**

In `events.rs`:
- `create_event` INSERT: add `allow_signups` to the column list and bind `payload.allow_signups` (after `allow_cake`).
- The event-row SELECT in `create_signup` and `update_signup`: add `allow_signups` to the selected columns; after the `status != "published"` check, add:

```rust
        if !event.get::<bool, _>("allow_signups") {
            return Err(EventError::Conflict(
                "signups are disabled for this event".into(),
            ));
        }
```

- `update_event`: add `allow_signups` to the SELECT projection, compute `let allow_signups = payload.allow_signups.unwrap_or(current.allow_signups);`, and bind it in the UPDATE (after `allow_cake`).
- `list_all_events`, `list_published_future`, and `get_summary` SELECTs: add `allow_signups` to the projection.
- `summary(row)`: add `allow_signups: row.get("allow_signups")`.

- [ ] **Step 4: Build**

Run: `cargo build --workspace --all-targets`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/models.rs backend/src/database.rs backend/src/events.rs
git commit -m "feat: add allow_signups flag to events"
```

---

### Task 2: Backend — Tests for the Signup Guard

**Worktree:** `/workspaces/tsv-tennis/.worktrees/events-backend`

**Files:**
- Modify: `backend/tests/events.rs`
- Modify: `backend/tests/events_routes.rs`

**Interfaces:**
- Consumes: `allow_signups` on the models and repository from Task 1.

- [ ] **Step 1: Write the failing repository test**

Add to `backend/tests/events.rs`:

```rust
#[tokio::test]
async fn signups_are_rejected_when_disabled_but_deletion_is_allowed() {
    let repository = repository().await;
    let mut request = event_request();
    request.allow_signups = false;
    let event = repository.create_event("orga-1", request).await.unwrap();

    let create_error = repository
        .create_signup(
            event.id,
            "member-1",
            SignupRequest { people_count: 1, salad_count: 0, cake_count: 0, comment: None },
        )
        .await
        .unwrap_err();
    assert!(matches!(create_error, EventError::Conflict(_)));

    sqlx::query("INSERT INTO event_signups (event_id, member_id, people_count) VALUES (?, ?, ?)")
        .bind(event.id).bind("member-1").bind(1)
        .execute(repository.pool()).await.unwrap();

    let update_error = repository
        .update_signup(
            event.id,
            "member-1",
            SignupRequest { people_count: 2, salad_count: 0, cake_count: 0, comment: None },
        )
        .await
        .unwrap_err();
    assert!(matches!(update_error, EventError::Conflict(_)));

    assert!(repository.delete_signup(event.id, "member-1").await.is_ok());
}
```

Also add a test that a new event allows signups by default at the repository level (construct `event_request()` which sets `allow_signups: true` explicitly — the serde default is exercised at the API layer in Step 2).

- [ ] **Step 2: Run the repository test to verify it fails**

Run: `cargo test --test events signups_are_rejected_when_disabled_but_deletion_is_allowed -- --nocapture`
Expected: FAIL/compile-error because `allow_signups` is not yet on the structs/guards (only if Task 1 was skipped — otherwise PASS).

- [ ] **Step 3: Write the failing route test**

Add to `backend/tests/events_routes.rs`:

```rust
#[tokio::test]
#[serial]
async fn signup_endpoints_reject_disabled_events_with_conflict() {
    let (server, repository) = app().await;
    let mut request = event_request(EventStatus::Published);
    request.allow_signups = false;
    let event = repository.create_event("orga-1", request).await.unwrap();

    let post = server
        .post(&format!("/events/{}/signup", event.id))
        .authorization(format!("Bearer {}", token("member-1", None)))
        .json(&json!({"people_count": 1, "salad_count": 0, "cake_count": 0}))
        .await;
    post.assert_status(StatusCode::CONFLICT);

    sqlx::query("INSERT INTO event_signups (event_id, member_id, people_count) VALUES (?, ?, ?)")
        .bind(event.id).bind("member-1").bind(1)
        .execute(repository.pool()).await.unwrap();

    let put = server
        .put(&format!("/events/{}/signup", event.id))
        .authorization(format!("Bearer {}", token("member-1", None)))
        .json(&json!({"people_count": 2, "salad_count": 0, "cake_count": 0}))
        .await;
    put.assert_status(StatusCode::CONFLICT);
}

#[tokio::test]
#[serial]
async fn events_default_to_signups_enabled_when_field_omitted() {
    let (server, _repository) = app().await;
    let mut request = event_request(EventStatus::Published);
    request.allow_signups = true;
    let body = server
        .post("/events")
        .authorization(format!("Bearer {}", token("orga-1", Some("orga"))))
        .json(&request)
        .await;
    body.assert_status(StatusCode::CREATED);
    let event = body.json::<serde_json::Value>();
    assert_eq!(event["allow_signups"], true);
}
```

- [ ] **Step 4: Run the route tests to verify they fail**

Run: `cargo test --test events_routes signup_endpoints_reject_disabled_events_with_conflict -- --nocapture`
Expected: PASS once Task 1 landed (the guard is in the repository).

- [ ] **Step 5: Full backend verification**

Run: `cargo build --workspace --all-targets && cargo test --workspace --all-targets -- --test-threads=1 && cargo fmt --all -- --check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/tests/events.rs backend/tests/events_routes.rs
git commit -m "test: cover signup-disabled events"
```

---

### Task 3: Backend — Regenerate Types

**Worktree:** `/workspaces/tsv-tennis/.worktrees/events-backend`

**Files:**
- Generate: `backend/bindings/types.ts` (gitignored)

- [ ] **Step 1: Regenerate the TypeScript bindings**

Run: `cargo run --bin generate-types`
Expected: `backend/bindings/types.ts` now includes `allow_signups` on the event types.

- [ ] **Step 2: Confirm the binding contains the new field**

Run: `grep -c "allow_signups" backend/bindings/types.ts`
Expected: >= 2 (event types).

- [ ] **Step 3: Verify backend still green**

Run: `cargo test --workspace --all-targets -- --test-threads=1`
Expected: PASS.

- [ ] **Step 4: Push the backend branch**

```bash
git add -A backend
git commit -m "chore: regenerate types for allow_signups" || true
git push
```

---

### Task 4: Frontend — Sync Generated Types

**Worktree:** `/workspaces/tsv-tennis/.worktrees/events-feature` (branch `feature/events-signups`)

**Files:**
- Copy: `tsv-tennis-app/src/types/types.ts` from the regenerated `backend/bindings/types.ts` (gitignored)

- [ ] **Step 1: Copy the generated types**

Run (from the events-backend worktree):
```bash
cp /workspaces/tsv-tennis/.worktrees/events-backend/backend/bindings/types.ts /workspaces/tsv-tennis/.worktrees/events-feature/tsv-tennis-app/src/types/types.ts
```

- [ ] **Step 2: Confirm the type is available**

Run: `grep -c "allow_signups" tsv-tennis-app/src/types/types.ts`
Expected: >= 2.

- [ ] **Step 3: Verify frontend still typechecks**

Run: `npx tsc --noEmit`
Expected: PASS (the type now exists; no code references it yet).

---

### Task 5: Frontend — Event Form Toggle

**Worktree:** `/workspaces/tsv-tennis/.worktrees/events-feature`

**Files:**
- Modify: `tsv-tennis-app/src/components/EventFormModal.tsx`
- Modify: `tsv-tennis-app/src/components/EventFormModal.test.tsx`

**Interfaces:**
- Consumes: `allow_signups` on `CreateEventRequest`/`UpdateEventRequest`/`EventSummary` from the regenerated types.
- Produces: an "Anmeldungen zulassen" checkbox in the Orga event form, default checked, included in create/update payloads.

- [ ] **Step 1: Write the failing test**

Add to `EventFormModal.test.tsx`:

```tsx
it('defaults to allowing signups and can disable them', () => {
  render(<MemoryRouter><EventFormModal isOpen onClose={vi.fn()} /></MemoryRouter>);
  const toggle = screen.getByLabelText('Anmeldungen zulassen');
  expect(toggle).toBeChecked();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run src/components/EventFormModal.test.tsx`
Expected: FAIL (label not found).

- [ ] **Step 3: Implement the checkbox**

In `EventFormModal.tsx`:
- Add `allow_signups: true` to `emptyForm`.
- In the form JSX (next to the "Salat anbieten"/"Kuchen anbieten" checkboxes), add:

```tsx
<label><input aria-label="Anmeldungen zulassen" type="checkbox" checked={form.allow_signups} onChange={(e) => set('allow_signups', e.target.checked)} /> Anmeldungen zulassen</label>
```

- The create/update payloads already spread `form`, so `allow_signups` is included.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --run src/components/EventFormModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full frontend verification**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tsv-tennis-app/src/components/EventFormModal.tsx tsv-tennis-app/src/components/EventFormModal.test.tsx
git commit -m "feat: add allow-signups toggle to event form"
```

---

### Task 6: Frontend — Hide Signup UI for Disabled Events

**Worktree:** `/workspaces/tsv-tennis/.worktrees/events-feature`

**Files:**
- Modify: `tsv-tennis-app/src/pages/Events.tsx` (EventCard)
- Modify: `tsv-tennis-app/src/components/UpcomingEventsList.tsx` (EventRow)
- Modify: `tsv-tennis-app/src/components/EventSignupModal.tsx`
- Modify: `tsv-tennis-app/src/pages/Events.test.tsx`
- Modify: `tsv-tennis-app/src/components/UpcomingEventsList.test.tsx`
- Modify: `tsv-tennis-app/src/components/EventSignupModal.test.tsx`

**Interfaces:**
- Consumes: `EventSummary.allow_signups` (boolean).

- [ ] **Step 1: Write the failing tests**

In `Events.test.tsx`:

```tsx
it('shows no signup button for an event with signups disabled', () => {
  renderEvents({ allow_signups: false });
  expect(screen.queryByRole('button', { name: /anmelden|ausgebucht|anmeldeschluss/i })).not.toBeInTheDocument();
});
```

(Adjust `renderEvents` to accept an overrides object merged into each event fixture.)

In `UpcomingEventsList.test.tsx`:

```tsx
it('renders an informational event title as plain text', () => {
  render(<MemoryRouter><UpcomingEventsList events={[{ ...event(), allow_signups: false }]} /></MemoryRouter>);
  const link = screen.queryByRole('link', { name: /training/i });
  expect(link).not.toBeInTheDocument();
  expect(screen.getByText('Training')).toBeInTheDocument();
});
```

In `EventSignupModal.test.tsx`:

```tsx
it('renders nothing when the event does not allow signups', () => {
  mockEvent({ allow_signups: false });
  render(<EventSignupModal eventId={1} isOpen onClose={vi.fn()} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --run src/pages/Events.test.tsx src/components/UpcomingEventsList.test.tsx src/components/EventSignupModal.test.tsx`
Expected: FAIL (signup UI still renders).

- [ ] **Step 3: Update the EventCard**

In `Events.tsx` EventCard, hide all signup UI when disabled:

```tsx
{event.allow_signups && ownSignup && (
  <p className="mt-3 text-sm font-medium text-[var(--primary)]">Ihre Anmeldung: {ownSignup.people_count} Personen</p>
)}
// ...footer...
{event.allow_signups && (
  <div className="mt-3">
    {ownSignup ? <button ...>Anmeldung bearbeiten</button> : unavailable ? <p ...>...</p> : <button ...>Anmelden</button>}
  </div>
)}
```

- [ ] **Step 4: Update the "Als Nächstes" row**

In `UpcomingEventsList.tsx` `EventRow`, render the title as plain text when signups are disabled:

```tsx
{event.allow_signups ? (
  <Link className="..." to={`/dashboard/veranstaltungen?eventId=${event.id}`}>{event.title}</Link>
) : (
  <span className="mt-1 block text-base font-semibold text-[var(--ink)]">{event.title}</span>
)}
```

- [ ] **Step 5: Guard the signup modal**

In `EventSignupModal.tsx`, after the event data is available, render nothing when signups are disabled:

```tsx
const event = data?.event;
if (event && !event.allow_signups) return null;
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- --run src/pages/Events.test.tsx src/components/UpcomingEventsList.test.tsx src/components/EventSignupModal.test.tsx`
Expected: PASS.

- [ ] **Step 7: Full frontend verification**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add tsv-tennis-app/src/pages/Events.tsx tsv-tennis-app/src/components/UpcomingEventsList.tsx tsv-tennis-app/src/components/EventSignupModal.tsx tsv-tennis-app/src/pages/Events.test.tsx tsv-tennis-app/src/components/UpcomingEventsList.test.tsx tsv-tennis-app/src/components/EventSignupModal.test.tsx
git commit -m "feat: hide signup UI for informational-only events"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Backend verification**

Worktree `/workspaces/tsv-tennis/.worktrees/events-backend`:
Run: `cargo build --workspace --all-targets && cargo test --workspace --all-targets -- --test-threads=1 && cargo fmt --all -- --check`
Expected: PASS.

- [ ] **Step 2: Frontend verification**

Worktree `/workspaces/tsv-tennis/.worktrees/events-feature`:
Run: `npm test && npm run lint && npx tsc --noEmit && npm run build && git diff --check`
Expected: PASS.

- [ ] **Step 3: Confirm both branches are pushed**

Run in each worktree: `git status --short` (clean) and `git push`
Expected: both `feature/events-backend` and `feature/events-signups` up to date on `origin`.

- [ ] **Step 4: Update PR descriptions**

On PR #61 (backend) and PR #60 (frontend), note the new informational-only events capability.

**Self-Review**
- Spec coverage: `allow_signups` default true ✅ (Task 1), backend create/update reject + delete allowed ✅ (Tasks 1-2), event card no signup UI ✅ (Task 6), "Als Nächstes" plain rows ✅ (Task 6), modal guard ✅ (Task 6), orga form toggle ✅ (Task 5), types regenerated/synced ✅ (Tasks 3-4), tests ✅ (Tasks 2,5,6).
- Placeholder scan: no TBD/TODO; every step has concrete code.
- Cross-branch consistency: `allow_signups` name and type identical in Rust model, generated TS, and frontend usages.
