pub use crate::models::{
    CreateEventRequest, EventDetail, EventSignup, EventStatus, EventSummary, EventType,
    SignupRequest, SignupSummary, UpdateEventRequest,
};
use chrono::{DateTime, NaiveDate, Utc};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePool},
    Row,
};
use std::{fmt, result::Result as StdResult};

#[derive(Debug)]
pub enum EventError {
    Database(sqlx::Error),
    Validation(String),
    NotFound,
    Conflict(String),
}

impl fmt::Display for EventError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Database(error) => write!(f, "database error: {error}"),
            Self::Validation(message) | Self::Conflict(message) => f.write_str(message),
            Self::NotFound => f.write_str("event not found"),
        }
    }
}

impl std::error::Error for EventError {}
impl From<sqlx::Error> for EventError {
    fn from(error: sqlx::Error) -> Self {
        Self::Database(error)
    }
}

pub type EventResult<T> = StdResult<T, EventError>;

const MAX_PEOPLE_COUNT: i32 = 100;
const MAX_FOOD_COUNT: i32 = 100;
const MAX_EVENT_CAPACITY: i32 = 10_000;

#[derive(Clone)]
pub struct EventRepository {
    pool: SqlitePool,
}

impl EventRepository {
    pub async fn new(pool: SqlitePool) -> EventResult<Self> {
        crate::database::Database::initialize_event_tables(&pool).await?;
        Ok(Self { pool })
    }

    pub async fn connect(database_url: &str) -> EventResult<Self> {
        let options = database_url
            .parse::<SqliteConnectOptions>()
            .map_err(|error| sqlx::Error::Configuration(Box::new(error)))?
            .foreign_keys(true);
        let pool = SqlitePool::connect_with(options).await?;
        Self::new(pool).await
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    pub async fn create_event(
        &self,
        actor_id: &str,
        payload: CreateEventRequest,
    ) -> EventResult<EventSummary> {
        validate_event(
            &payload.title,
            &payload.event_date,
            payload.start_time.as_deref(),
            payload.end_time.as_deref(),
            payload.capacity,
        )?;
        validate_deadline(payload.signup_deadline.as_deref(), &payload.event_date)?;
        let result = sqlx::query("INSERT INTO events (type,title,description,event_date,start_time,end_time,location,signup_deadline,capacity,allow_salad,allow_cake,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
            .bind(event_type(&payload.event_type)).bind(payload.title.trim()).bind(clean(payload.description))
            .bind(payload.event_date).bind(clean(payload.start_time)).bind(clean(payload.end_time)).bind(clean(payload.location))
            .bind(clean(payload.signup_deadline)).bind(payload.capacity).bind(payload.allow_salad).bind(payload.allow_cake)
            .bind(status(&payload.status)).bind(actor_id).execute(&self.pool).await?;
        self.get_summary(result.last_insert_rowid()).await
    }

    pub async fn create_signup(
        &self,
        event_id: i64,
        member_id: &str,
        payload: SignupRequest,
    ) -> EventResult<EventSignup> {
        validate_signup(&payload, true, false)?;
        let mut connection = self.pool.acquire().await?;
        sqlx::query("BEGIN IMMEDIATE")
            .execute(&mut *connection)
            .await?;
        let event = match sqlx::query("SELECT status, allow_salad, allow_cake, signup_deadline, capacity, (SELECT COALESCE(SUM(people_count),0) FROM event_signups WHERE event_id=events.id) AS signup_people_count FROM events WHERE id = ?")
            .bind(event_id).fetch_optional(&mut *connection).await {
            Ok(Some(event)) => event,
            Ok(None) => { let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await; return Err(EventError::NotFound); }
            Err(error) => {
                let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
                return Err(error.into());
            }
        };
        if event.get::<String, _>("status") != "published" {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            return Err(EventError::Validation(
                "draft events cannot receive signups".into(),
            ));
        }
        if event
            .get::<Option<String>, _>("signup_deadline")
            .is_some_and(|deadline| deadline_invalid_or_passed(&deadline))
        {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            return Err(EventError::Conflict("signup deadline has passed".into()));
        }
        if event
            .get::<Option<i32>, _>("capacity")
            .is_some_and(|capacity| {
                event
                    .get::<i64, _>("signup_people_count")
                    .checked_add(i64::from(payload.people_count))
                    .is_none_or(|total| total > i64::from(capacity))
            })
        {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            return Err(EventError::Conflict("event capacity exceeded".into()));
        }
        if (!event.get::<bool, _>("allow_salad") && payload.salad_count > 0)
            || (!event.get::<bool, _>("allow_cake") && payload.cake_count > 0)
        {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            return Err(EventError::Validation(
                "disabled contributions must be zero".into(),
            ));
        }
        let result = sqlx::query("INSERT INTO event_signups (event_id,member_id,people_count,salad_count,cake_count,comment) VALUES (?,?,?,?,?,?)")
            .bind(event_id).bind(member_id).bind(payload.people_count).bind(payload.salad_count).bind(payload.cake_count).bind(clean(payload.comment)).execute(&mut *connection).await;
        match result {
            Ok(result) => {
                if let Err(error) = sqlx::query("COMMIT").execute(&mut *connection).await {
                    let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
                    return Err(error.into());
                }
                let signup_id = result.last_insert_rowid();
                drop(connection);
                self.get_signup(signup_id).await
            }
            Err(sqlx::Error::Database(error)) if error.is_unique_violation() => {
                let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
                Err(EventError::Conflict("member already signed up".into()))
            }
            Err(error) => {
                let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
                Err(error.into())
            }
        }
    }

    pub async fn list_published_future(&self, _member_id: &str) -> EventResult<Vec<EventSummary>> {
        self.list_events("WHERE status='published' AND event_date >= date('now')")
            .await
    }

    pub async fn list_all_events(&self) -> EventResult<Vec<EventSummary>> {
        self.list_events("").await
    }

    async fn list_events(&self, filter: &str) -> EventResult<Vec<EventSummary>> {
        let query = format!("SELECT id,type,title,description,event_date,start_time,end_time,location,signup_deadline,capacity,allow_salad,allow_cake,status,(SELECT COALESCE(SUM(people_count),0) FROM event_signups WHERE event_id=events.id) signup_people_count FROM events {filter} ORDER BY event_date,start_time");
        let rows = sqlx::query(&query).fetch_all(&self.pool).await?;
        Ok(rows.iter().map(summary).collect())
    }

    pub async fn get_event(&self, id: i64, member_id: &str) -> EventResult<EventDetail> {
        let event = self.get_summary(id).await?;
        let own_signup = sqlx::query("SELECT id,event_id,member_id,people_count,salad_count,cake_count,comment FROM event_signups WHERE event_id=? AND member_id=?")
            .bind(id).bind(member_id).fetch_optional(&self.pool).await?.map(|row| signup(&row));
        Ok(EventDetail { event, own_signup })
    }

    pub async fn get_published_event(&self, id: i64, member_id: &str) -> EventResult<EventDetail> {
        let detail = self.get_event(id, member_id).await?;
        if detail.event.status != EventStatus::Published {
            return Err(EventError::NotFound);
        }
        Ok(detail)
    }

    pub async fn update_event(
        &self,
        id: i64,
        payload: UpdateEventRequest,
    ) -> EventResult<EventSummary> {
        let mut connection = self.pool.acquire().await?;
        sqlx::query("BEGIN IMMEDIATE")
            .execute(&mut *connection)
            .await?;

        let current = match sqlx::query("SELECT id,type,title,description,event_date,start_time,end_time,location,signup_deadline,capacity,allow_salad,allow_cake,status,(SELECT COALESCE(SUM(people_count),0) FROM event_signups WHERE event_id=events.id) signup_people_count FROM events WHERE id=?")
            .bind(id)
            .fetch_optional(&mut *connection)
            .await
        {
            Ok(Some(row)) => summary(&row),
            Ok(None) => {
                let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
                return Err(EventError::NotFound);
            }
            Err(error) => {
                let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
                return Err(error.into());
            }
        };
        let title = payload.title.clone().unwrap_or(current.title.clone());
        let date = payload
            .event_date
            .clone()
            .unwrap_or(current.event_date.clone());
        let start = update_optional(
            &payload.clear_fields,
            "start_time",
            payload.start_time.clone(),
            current.start_time.clone(),
        );
        let end = update_optional(
            &payload.clear_fields,
            "end_time",
            payload.end_time.clone(),
            current.end_time.clone(),
        );
        let capacity = update_optional(
            &payload.clear_fields,
            "capacity",
            payload.capacity,
            current.capacity,
        );
        let allow_salad = payload.allow_salad.unwrap_or(current.allow_salad);
        let allow_cake = payload.allow_cake.unwrap_or(current.allow_cake);
        if let Err(error) =
            validate_event(&title, &date, start.as_deref(), end.as_deref(), capacity)
        {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            return Err(error);
        }
        let deadline = update_optional(
            &payload.clear_fields,
            "signup_deadline",
            payload.signup_deadline.clone(),
            current.signup_deadline.clone(),
        );
        if let Err(error) = validate_deadline(deadline.as_deref(), &date) {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            return Err(error);
        }
        if let Some(capacity) = capacity {
            let signup_people_count: i64 = match sqlx::query_scalar(
                "SELECT COALESCE(SUM(people_count), 0) FROM event_signups WHERE event_id=?",
            )
            .bind(id)
            .fetch_one(&mut *connection)
            .await
            {
                Ok(value) => value,
                Err(error) => {
                    let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
                    return Err(error.into());
                }
            };
            if i64::from(capacity) < signup_people_count {
                let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
                return Err(EventError::Conflict(
                    "capacity cannot be below the current signup total".into(),
                ));
            }
        }
        if !allow_salad || !allow_cake {
            let counts = sqlx::query("SELECT COALESCE(SUM(CASE WHEN ? = 0 THEN salad_count ELSE 0 END), 0) AS salad_count, COALESCE(SUM(CASE WHEN ? = 0 THEN cake_count ELSE 0 END), 0) AS cake_count FROM event_signups WHERE event_id=?")
                .bind(allow_salad)
                .bind(allow_cake)
                .bind(id)
                .fetch_one(&mut *connection)
                .await;
            let counts = match counts {
                Ok(counts) => counts,
                Err(error) => {
                    let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
                    return Err(error.into());
                }
            };
            if counts.get::<i64, _>("salad_count") > 0 || counts.get::<i64, _>("cake_count") > 0 {
                let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
                return Err(EventError::Conflict(
                    "cannot disable food option with existing contributions".into(),
                ));
            }
        }
        let result = sqlx::query("UPDATE events SET title=?,description=?,event_date=?,start_time=?,end_time=?,location=?,signup_deadline=?,capacity=?,allow_salad=?,allow_cake=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
            .bind(title.trim())
            .bind(clean(update_optional(&payload.clear_fields, "description", payload.description, current.description)))
            .bind(date)
            .bind(clean(start))
            .bind(clean(end))
            .bind(clean(update_optional(&payload.clear_fields, "location", payload.location, current.location)))
            .bind(clean(deadline))
            .bind(capacity)
            .bind(allow_salad)
            .bind(allow_cake)
            .bind(status(&payload.status.unwrap_or(current.status)))
            .bind(id)
            .execute(&mut *connection)
            .await;
        if let Err(error) = result {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            return Err(error.into());
        }
        if let Err(error) = sqlx::query("COMMIT").execute(&mut *connection).await {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            return Err(error.into());
        }
        drop(connection);
        self.get_summary(id).await
    }

    pub async fn delete_event(&self, id: i64) -> EventResult<()> {
        let result = sqlx::query("DELETE FROM events WHERE id=?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        if result.rows_affected() == 0 {
            return Err(EventError::NotFound);
        }
        Ok(())
    }

    pub async fn update_signup(
        &self,
        event_id: i64,
        member_id: &str,
        payload: SignupRequest,
    ) -> EventResult<EventSignup> {
        validate_signup(&payload, false, false)?;
        let mut connection = self.pool.acquire().await?;
        sqlx::query("BEGIN IMMEDIATE")
            .execute(&mut *connection)
            .await?;
        let event = match sqlx::query("SELECT status, allow_salad, allow_cake, signup_deadline, capacity, (SELECT COALESCE(SUM(people_count),0) FROM event_signups WHERE event_id=events.id) AS signup_people_count FROM events WHERE id=?")
            .bind(event_id)
            .fetch_optional(&mut *connection)
            .await
        {
            Ok(Some(event)) => event,
            Ok(None) => {
                let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
                return Err(EventError::NotFound);
            }
            Err(error) => {
                let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
                return Err(error.into());
            }
        };
        if event.get::<String, _>("status") != "published" {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            return Err(EventError::Validation(
                "draft events cannot receive signups".into(),
            ));
        }
        if event
            .get::<Option<String>, _>("signup_deadline")
            .is_some_and(|deadline| deadline_invalid_or_passed(&deadline))
        {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            return Err(EventError::Conflict("signup deadline has passed".into()));
        }
        let existing_people: i32 = match sqlx::query_scalar(
            "SELECT people_count FROM event_signups WHERE event_id=? AND member_id=?",
        )
        .bind(event_id)
        .bind(member_id)
        .fetch_optional(&mut *connection)
        .await
        {
            Ok(Some(people)) => people,
            Ok(None) => {
                let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
                return Err(EventError::NotFound);
            }
            Err(error) => {
                let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
                return Err(error.into());
            }
        };
        if existing_people < 0 {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            return Err(EventError::NotFound);
        }
        if event
            .get::<Option<i32>, _>("capacity")
            .is_some_and(|capacity| {
                event
                    .get::<i64, _>("signup_people_count")
                    .checked_sub(i64::from(existing_people))
                    .and_then(|total| total.checked_add(i64::from(payload.people_count)))
                    .is_none_or(|total| total > i64::from(capacity))
            })
        {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            return Err(EventError::Conflict("event capacity exceeded".into()));
        }
        if (!event.get::<bool, _>("allow_salad") && payload.salad_count > 0)
            || (!event.get::<bool, _>("allow_cake") && payload.cake_count > 0)
        {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            return Err(EventError::Validation(
                "disabled contributions must be zero".into(),
            ));
        }
        let result = match sqlx::query("UPDATE event_signups SET people_count=?,salad_count=?,cake_count=?,comment=?,updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND member_id=?")
            .bind(payload.people_count).bind(payload.salad_count).bind(payload.cake_count).bind(clean(payload.comment)).bind(event_id).bind(member_id).execute(&mut *connection).await {
            Ok(result) => result,
            Err(error) => {
                let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
                return Err(error.into());
            }
        };
        if result.rows_affected() == 0 {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            return Err(EventError::NotFound);
        }
        let id = match sqlx::query("SELECT id FROM event_signups WHERE event_id=? AND member_id=?")
            .bind(event_id)
            .bind(member_id)
            .fetch_optional(&mut *connection)
            .await
        {
            Ok(Some(row)) => row.get::<i64, _>("id"),
            Ok(None) => {
                let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
                return Err(EventError::NotFound);
            }
            Err(error) => {
                let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
                return Err(error.into());
            }
        };
        if let Err(error) = sqlx::query("COMMIT").execute(&mut *connection).await {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            return Err(error.into());
        }
        drop(connection);
        self.get_signup(id).await
    }

    pub async fn delete_signup(&self, event_id: i64, member_id: &str) -> EventResult<()> {
        let event =
            sqlx::query("SELECT status, signup_deadline, event_date FROM events WHERE id=?")
                .bind(event_id)
                .fetch_optional(&self.pool)
                .await?
                .ok_or(EventError::NotFound)?;
        if event.get::<String, _>("status") != "published" {
            return Err(EventError::Validation(
                "draft events cannot receive signups".into(),
            ));
        }
        if event
            .get::<Option<String>, _>("signup_deadline")
            .is_some_and(|deadline| deadline_invalid_or_passed(&deadline))
        {
            return Err(EventError::Conflict("signup deadline has passed".into()));
        }
        let result = sqlx::query("DELETE FROM event_signups WHERE event_id=? AND member_id=?")
            .bind(event_id)
            .bind(member_id)
            .execute(&self.pool)
            .await?;
        if result.rows_affected() == 0 {
            return Err(EventError::NotFound);
        }
        Ok(())
    }

    pub async fn list_signups(&self, event_id: i64) -> EventResult<SignupSummary> {
        let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM events WHERE id=?")
            .bind(event_id)
            .fetch_one(&self.pool)
            .await?;
        if exists == 0 {
            return Err(EventError::NotFound);
        }
        let rows = sqlx::query("SELECT id,event_id,member_id,people_count,salad_count,cake_count,comment FROM event_signups WHERE event_id=? ORDER BY id").bind(event_id).fetch_all(&self.pool).await?;
        let signups: Vec<_> = rows.iter().map(signup).collect();
        Ok(SignupSummary {
            total_people: signups.iter().map(|s| s.people_count).sum(),
            total_salad: signups.iter().map(|s| s.salad_count).sum(),
            total_cake: signups.iter().map(|s| s.cake_count).sum(),
            signups,
        })
    }

    async fn get_summary(&self, id: i64) -> EventResult<EventSummary> {
        let row = sqlx::query("SELECT id,type,title,description,event_date,start_time,end_time,location,signup_deadline,capacity,allow_salad,allow_cake,status,(SELECT COALESCE(SUM(people_count),0) FROM event_signups WHERE event_id=events.id) signup_people_count FROM events WHERE id=?").bind(id).fetch_optional(&self.pool).await?.ok_or(EventError::NotFound)?;
        Ok(summary(&row))
    }

    async fn get_signup(&self, id: i64) -> EventResult<EventSignup> {
        let row = sqlx::query("SELECT id,event_id,member_id,people_count,salad_count,cake_count,comment FROM event_signups WHERE id=?").bind(id).fetch_one(&self.pool).await?;
        Ok(signup(&row))
    }
}

fn validate_event(
    title: &str,
    date: &str,
    start: Option<&str>,
    end: Option<&str>,
    capacity: Option<i32>,
) -> EventResult<()> {
    if title.trim().is_empty() {
        return Err(EventError::Validation("title is required".into()));
    }
    if chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").is_err() {
        return Err(EventError::Validation(
            "event date must be YYYY-MM-DD".into(),
        ));
    }
    let parsed_start = start.and_then(parse_time);
    let parsed_end = end.and_then(parse_time);
    if start.is_some() && parsed_start.is_none() || end.is_some() && parsed_end.is_none() {
        return Err(EventError::Validation("times must be HH:MM".into()));
    }
    if let (Some(start), Some(end)) = (parsed_start, parsed_end) {
        if end < start {
            return Err(EventError::Validation(
                "end time must not precede start time".into(),
            ));
        }
    }
    if capacity.is_some_and(|value| !(1..=MAX_EVENT_CAPACITY).contains(&value)) {
        return Err(EventError::Validation("capacity must be positive".into()));
    }
    Ok(())
}

fn validate_signup(payload: &SignupRequest, _new: bool, _allow_disabled: bool) -> EventResult<()> {
    if !(1..=MAX_PEOPLE_COUNT).contains(&payload.people_count)
        || !(0..=MAX_FOOD_COUNT).contains(&payload.salad_count)
        || !(0..=MAX_FOOD_COUNT).contains(&payload.cake_count)
    {
        return Err(EventError::Validation("invalid signup counts".into()));
    }
    Ok(())
}
fn clean(value: Option<String>) -> Option<String> {
    value.and_then(|value| (!value.trim().is_empty()).then(|| value.trim().to_string()))
}
fn deadline_passed(value: &str) -> bool {
    DateTime::parse_from_rfc3339(value)
        .map(|deadline| deadline <= Utc::now())
        .or_else(|_| {
            NaiveDate::parse_from_str(value, "%Y-%m-%d")
                .map(|deadline| deadline < Utc::now().date_naive())
        })
        .unwrap_or(false)
}
fn deadline_invalid_or_passed(value: &str) -> bool {
    !deadline_is_valid(value) || deadline_passed(value)
}
fn deadline_is_valid(value: &str) -> bool {
    DateTime::parse_from_rfc3339(value).is_ok()
        || NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok()
}
fn validate_deadline(value: Option<&str>, event_date: &str) -> EventResult<()> {
    if value.is_some_and(|value| !deadline_is_valid(value)) {
        return Err(EventError::Validation(
            "signup deadline must be YYYY-MM-DD or RFC3339".into(),
        ));
    }
    let event_date = NaiveDate::parse_from_str(event_date, "%Y-%m-%d")
        .map_err(|_| EventError::Validation("event date must be YYYY-MM-DD".into()))?;
    if value
        .and_then(deadline_date)
        .is_some_and(|deadline_date| deadline_date > event_date)
    {
        return Err(EventError::Validation(
            "signup deadline must not follow event date".into(),
        ));
    }
    Ok(())
}
fn deadline_date(value: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .ok()
        .or_else(|| {
            DateTime::parse_from_rfc3339(value)
                .ok()
                .map(|date| date.date_naive())
        })
}
fn parse_time(value: &str) -> Option<chrono::NaiveTime> {
    if value.len() == 5
        && value.as_bytes()[2] == b':'
        && value.as_bytes()[..2].iter().all(u8::is_ascii_digit)
        && value.as_bytes()[3..].iter().all(u8::is_ascii_digit)
    {
        chrono::NaiveTime::parse_from_str(value, "%H:%M").ok()
    } else {
        None
    }
}
fn update_optional<T>(
    clear_fields: &[String],
    field: &str,
    update: Option<T>,
    current: Option<T>,
) -> Option<T> {
    if clear_fields.iter().any(|name| name == field) {
        None
    } else {
        update.or(current)
    }
}
fn event_type(value: &EventType) -> &str {
    match value {
        EventType::Event => "event",
        EventType::WorkDuty => "work-duty",
    }
}
fn status(value: &EventStatus) -> &str {
    match value {
        EventStatus::Draft => "draft",
        EventStatus::Published => "published",
    }
}
fn parse_type(value: &str) -> EventType {
    if value == "work-duty" {
        EventType::WorkDuty
    } else {
        EventType::Event
    }
}
fn parse_status(value: &str) -> EventStatus {
    if value == "published" {
        EventStatus::Published
    } else {
        EventStatus::Draft
    }
}
fn summary(row: &sqlx::sqlite::SqliteRow) -> EventSummary {
    EventSummary {
        id: row.get("id"),
        event_type: parse_type(row.get("type")),
        title: row.get("title"),
        description: row.get("description"),
        event_date: row.get("event_date"),
        start_time: row.get("start_time"),
        end_time: row.get("end_time"),
        location: row.get("location"),
        signup_deadline: row.get("signup_deadline"),
        capacity: row.get("capacity"),
        allow_salad: row.get("allow_salad"),
        allow_cake: row.get("allow_cake"),
        status: parse_status(row.get("status")),
        signup_people_count: row.get("signup_people_count"),
    }
}
fn signup(row: &sqlx::sqlite::SqliteRow) -> EventSignup {
    EventSignup {
        id: row.get("id"),
        event_id: row.get("event_id"),
        member_id: row.get("member_id"),
        member_name: None,
        people_count: row.get("people_count"),
        salad_count: row.get("salad_count"),
        cake_count: row.get("cake_count"),
        comment: row.get("comment"),
    }
}
