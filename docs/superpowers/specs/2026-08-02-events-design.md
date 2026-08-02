# Veranstaltungen und Arbeitsdienste

## Ziel

Das geschützte Dashboard erhält einen Bereich für zukünftige Veranstaltungen und Arbeitsdienste. Orga-Mitglieder können Termine in der Anwendung verwalten. Eingeloggte Mitglieder können sich pro Termin einmal anmelden und dabei die Anzahl der teilnehmenden Personen, optionale Essensbeiträge und einen Kommentar angeben.

Arbeitsdienst-Anmeldungen bleiben organisatorisch von den Arbeitsstunden getrennt. Eine Anmeldung erzeugt oder bestätigt keine Arbeitsstunden.

## Entscheidungen und Umfang

- Nur Orga-Mitglieder dürfen Veranstaltungen erstellen, bearbeiten, veröffentlichen und löschen.
- Veranstaltungen können als Entwurf gespeichert oder veröffentlicht werden.
- Mitglieder sehen nur veröffentlichte zukünftige Veranstaltungen.
- Die Veranstaltungsübersicht verwendet Karten statt einer Kalenderansicht.
- Mitglieder sehen nur ihre eigene Anmeldung; Orga-Mitglieder sehen alle Anmeldungen und aggregierte Summen.
- Eine Anmeldung pro Mitglied und Veranstaltung ist erlaubt.
- Die Personenanzahl umfasst die anmeldende Person und muss mindestens 1 sein.
- Eigene Anmeldungen können bis zum Anmeldeschluss bearbeitet oder gelöscht werden.
- Kapazität und Anmeldeschluss sind optional.
- Das Veranstaltungsdatum ist erforderlich. Start- und Endzeit sind unabhängig voneinander optional.
- Salat- und Kuchenbeiträge werden je Veranstaltung aktiviert. Nur aktivierte Felder erscheinen im Anmeldeformular und werden gespeichert.
- Es gibt im MVP keine E-Mail-Benachrichtigungen, keine Vergangenheitsansicht und keine automatische Arbeitsstundenverbuchung.

## Frontend

Das bestehende Dashboard erhält zwei direkt verlinkbare Bereiche:

- `/dashboard/arbeitsstunden`
- `/dashboard/veranstaltungen`

Die Navigation erscheint als zwei Tabs oder Buttons unter beziehungsweise im Dashboard-Header. Die bestehende Arbeitsstunden-Ansicht bleibt fachlich unverändert.

Die Veranstaltungsseite zeigt Karten für veröffentlichte Events mit:

- Eventtyp: Veranstaltung oder Arbeitsdienst
- Titel und Beschreibung
- Datum sowie vorhandene Start- und Endzeit
- Ort, sofern vorhanden
- Kapazität und aktuelle Belegung, sofern eine Kapazität gesetzt ist
- Anmeldeschluss, sofern gesetzt
- Status der eigenen Anmeldung
- Aktion zum Anzeigen der Details und Anmelden beziehungsweise Bearbeiten

Der Event-Dialog zeigt die Details und das Anmeldeformular. Das Formular enthält:

- Personenanzahl inklusive der anmeldenden Person
- Salatmenge, nur wenn für das Event aktiviert
- Kuchenmenge, nur wenn für das Event aktiviert
- Kommentar

Orga-Mitglieder erhalten zusätzlich eine Verwaltungsansicht zum Erstellen, Bearbeiten, Löschen und Veröffentlichen von Events sowie zum Anzeigen aller Anmeldungen und Summen.

## Datenmodell

Die neue Event-Domäne wird in SQLite gespeichert. Die bestehende Teable-Mitgliederquelle bleibt maßgeblich für Mitgliederdaten. `member_id` speichert die bestehende Teable-Mitglieds-ID.

### `events`

- `id` (integer primary key)
- `type` (event or work-duty)
- `title` (text, required)
- `description` (text, optional)
- `event_date` (text/date, required)
- `start_time` (text/time, optional)
- `end_time` (text/time, optional)
- `location` (text, optional)
- `signup_deadline` (text/datetime, optional)
- `capacity` (integer, optional)
- `allow_salad` (boolean, required)
- `allow_cake` (boolean, required)
- `status` (draft or published, required)
- `created_by` (text, required)
- `created_at` and `updated_at` (datetime)

### `event_signups`

- `id` (integer primary key)
- `event_id` (integer, required, references `events`)
- `member_id` (text, required)
- `people_count` (integer, required)
- `salad_count` (integer, required, default 0)
- `cake_count` (integer, required, default 0)
- `comment` (text, optional)
- `created_at` and `updated_at` (datetime)
- unique constraint on `(event_id, member_id)`

## Backend API

Protected routes:

- `GET /events`: list published future events for members; Orga may receive management-relevant events as explicitly defined by the handler.
- `POST /events`: create an event; Orga only.
- `GET /events/:id`: get event details and the current member's own signup; Orga may receive aggregate data.
- `PUT /events/:id`: update an event; Orga only.
- `DELETE /events/:id`: delete an event; Orga only.
- `POST /events/:id/signup`: create the authenticated member's signup.
- `PUT /events/:id/signup`: update the authenticated member's signup.
- `DELETE /events/:id/signup`: delete the authenticated member's signup.
- `GET /events/:id/signups`: list all signup details and aggregates; Orga only.

All handlers derive the member identity from the verified JWT rather than accepting an arbitrary member ID from the client.

## Validation and authorization

- Title and event date are required.
- Start and end times may be independently absent. If both are present, end time must not precede start time.
- Capacity, when present, must be a positive integer.
- Signup deadline, when present, must be before or at the event date/time according to the chosen normalized representation.
- People count must be at least 1.
- Salad and cake counts must be non-negative integers.
- A disabled contribution type must be stored as zero and rejected if submitted with a positive value.
- Draft events are not visible to regular members and cannot receive signups.
- New signups and signup updates are rejected after the deadline.
- New signups are rejected when the requested people count would exceed capacity. Updates must account for the member's existing people count.
- Members can only read, update, or delete their own signup.
- Orga authorization uses the existing normalized `orga` role check.
- Capacity checks and signup writes occur in a SQLite transaction to prevent concurrent signups from exceeding capacity.

## Error handling

The API returns the existing `{ success, message, data }` style. Validation failures use a client error status and a German user-facing message. Unauthorized access returns `401` or `403` according to whether authentication or role authorization failed. Event deletion and signup deletion should be idempotent where practical.

The frontend displays API messages through the existing toast mechanism and invalidates the relevant TanStack Query data after successful mutations.

## Testing

Backend tests cover:

- schema creation and event/signup persistence
- one-signup uniqueness per member and event
- deadline and capacity validation, including updates
- disabled salad/cake fields
- draft visibility
- member ownership restrictions
- Orga-only event management and signup listing
- transactional capacity behavior where practical

Frontend tests cover:

- tab navigation and protected event route
- rendering event cards and signup status
- conditional salad/cake fields
- signup creation, editing, and cancellation
- Orga-only management controls
- loading, validation, and API error states

The implementation must run the repository's backend serial test command and frontend lint/typecheck commands before completion.
