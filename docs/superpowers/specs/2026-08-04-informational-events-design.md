# Informational-Only Events (Disable Signups) Design

## Goal

Allow an Orga to publish an event that does not accept signups — an informational-only event ("we'll let people know something happens"). Members see the event details without any signup affordance.

## Scope

- A per-event `allow_signups` flag (default `true`), togglable by Orga.
- When disabled, members cannot create or update signups; event cards and the overview show no signup control.
- Members who signed up before signups were disabled can still cancel their own signup.

Out of scope: signup deadlines/modes, group-restricted signups, waitlists.

## Data Model

Add `allow_signups: bool` to the event:

- Backend model `EventSummary` (and `CreateEventRequest` with a default of `true`, `UpdateEventRequest` as `Option<bool>`).
- SQLite `events` table: `allow_signups INTEGER NOT NULL DEFAULT 1`.
- Migration for already-created DBs: idempotent `ALTER TABLE events ADD COLUMN allow_signups INTEGER NOT NULL DEFAULT 1` when the column is absent (checked via `PRAGMA table_info(events)`).
- The generated TypeScript types (via specta) pick up the new field.

## Backend Rules

- `create_signup` / `update_signup`: return `EventError::Conflict` ("signups are disabled for this event") when `allow_signups` is false.
- `delete_signup`: still allowed regardless of `allow_signups` (members can cancel an existing signup).
- `update_event`: may toggle `allow_signups` freely; any existing signups remain and new ones are blocked.
- `list_events` / `get_event` / `list_signups` responses include `allow_signups`.

## Frontend Behavior

- **Event card** (Veranstaltungen): when `event.allow_signups === false`, render no signup UI at all — no "Anmelden", no "Anmeldung bearbeiten", no "Ausgebucht"/"Anmeldeschluss", and no "Ihre Anmeldung" line. Orga actions (Bearbeiten, Anmeldungen anzeigen) unchanged.
- **"Als Nächstes" rows** (overview): events with `allow_signups === false` render as plain, non-clickable rows (no link to the signup modal).
- **Signup modal** (`EventSignupModal`): defensive guard — if the fetched event has `allow_signups === false`, render nothing.
- **Event form** (Orga, `EventFormModal`): add an "Anmeldungen zulassen" checkbox, default checked, included in create/update payloads.
- Regenerate the TS types after the backend model change.

## Testing

- Backend (repository): create/update signup rejected when disabled; delete still allowed; new events default to enabled; toggle on update works.
- Backend (routes): member signup POST/PUT returns 409 when disabled.
- Frontend: event card shows no signup button; "Als Nächstes" row is non-clickable; signup modal guards.

## Cross-PR Note

The backend model change lands on `feature/events-backend` (PR #61); the frontend changes land on `feature/events-signups` (PR #60). The TS types regenerate from the backend models, so the frontend depends on the backend change (types regenerated via `./sync-types.sh`).
