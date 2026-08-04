use chrono::{Duration, Utc};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::Executor;
use tsv_tennis_backend::database::Database;
use tsv_tennis_backend::events::{
    CreateEventRequest, EventError, EventRepository, EventStatus, EventType, SignupRequest,
    UpdateEventRequest,
};

fn future_date(days: i64) -> String {
    (Utc::now().date_naive() + Duration::days(days)).to_string()
}

async fn repository() -> EventRepository {
    let options = "sqlite::memory:"
        .parse::<SqliteConnectOptions>()
        .unwrap()
        .foreign_keys(true);
    // In-memory SQLite is isolated per connection, so pin the pool to a single
    // connection to keep the database alive across the test.
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .unwrap();
    EventRepository::new(pool).await.unwrap()
}

fn event_request() -> CreateEventRequest {
    CreateEventRequest {
        event_type: EventType::Event,
        title: "Sommerfest".into(),
        description: Some("Gemeinsames Fest".into()),
        event_date: future_date(11),
        start_time: Some("18:00".into()),
        end_time: Some("21:00".into()),
        location: Some("Tennisplatz".into()),
        signup_deadline: None,
        capacity: Some(20),
        allow_salad: true,
        allow_cake: false,
        allow_signups: true,
        status: EventStatus::Published,
    }
}

#[tokio::test]
async fn database_initialization_creates_event_tables() {
    let database = Database::new("sqlite::memory:").await.unwrap();
    let pool = database.pool();

    for table in ["events", "event_signups"] {
        let exists: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?",
        )
        .bind(table)
        .fetch_one(pool)
        .await
        .unwrap();
        assert_eq!(exists, 1, "missing {table} table");
    }

    let foreign_keys: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
        .fetch_one(pool)
        .await
        .unwrap();
    assert_eq!(foreign_keys, 1);
}

#[tokio::test]
async fn event_repository_connect_initializes_event_tables() {
    let repository = EventRepository::connect("sqlite::memory:").await.unwrap();

    let event = repository
        .create_event("orga-1", event_request())
        .await
        .unwrap();
    assert_eq!(event.title, "Sommerfest");

    let foreign_keys: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
        .fetch_one(repository.pool())
        .await
        .unwrap();
    assert_eq!(foreign_keys, 1);
}

#[tokio::test]
async fn foreign_keys_are_enabled_on_every_event_pool_connection() {
    let database = Database::new("sqlite:file:event-fk-test?mode=memory&cache=shared")
        .await
        .unwrap();
    let pool = database.pool();

    let first = pool.acquire().await.unwrap();
    let second = pool.acquire().await.unwrap();
    for mut connection in [first, second] {
        let result = connection
            .execute(
                "INSERT INTO event_signups (event_id, member_id, people_count) VALUES (9999, 'orphan', 1)",
            )
            .await;
        assert!(result.is_err(), "orphan signup was accepted");
    }
}

#[tokio::test]
async fn signup_is_unique_per_event_and_member() {
    let repository = repository().await;
    let event = repository
        .create_event("orga-1", event_request())
        .await
        .unwrap();
    let signup = SignupRequest {
        people_count: 1,
        salad_count: 0,
        cake_count: 0,
        comment: None,
    };

    repository
        .create_signup(event.id, "member-1", signup.clone())
        .await
        .unwrap();
    let error = repository
        .create_signup(event.id, "member-1", signup)
        .await
        .unwrap_err();

    assert!(matches!(error, EventError::Conflict(_)));
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM event_signups")
        .fetch_one(repository.pool())
        .await
        .unwrap();
    assert_eq!(count, 1);
}

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
            SignupRequest {
                people_count: 1,
                salad_count: 0,
                cake_count: 0,
                comment: None,
            },
        )
        .await
        .unwrap_err();
    assert!(matches!(create_error, EventError::Conflict(_)));

    sqlx::query("INSERT INTO event_signups (event_id, member_id, people_count) VALUES (?, ?, ?)")
        .bind(event.id)
        .bind("member-1")
        .bind(1)
        .execute(repository.pool())
        .await
        .unwrap();

    let update_error = repository
        .update_signup(
            event.id,
            "member-1",
            SignupRequest {
                people_count: 2,
                salad_count: 0,
                cake_count: 0,
                comment: None,
            },
        )
        .await
        .unwrap_err();
    assert!(matches!(update_error, EventError::Conflict(_)));

    assert!(repository.delete_signup(event.id, "member-1").await.is_ok());
}

#[tokio::test]
async fn events_allow_signups_by_default() {
    let repository = repository().await;
    let event = repository
        .create_event("orga-1", event_request())
        .await
        .unwrap();
    assert!(event.allow_signups);
    repository
        .create_signup(
            event.id,
            "member-1",
            SignupRequest {
                people_count: 1,
                salad_count: 0,
                cake_count: 0,
                comment: None,
            },
        )
        .await
        .unwrap();
}

#[tokio::test]
async fn event_and_signup_validation_rejects_invalid_values() {
    let repository = repository().await;

    let mut invalid_event = event_request();
    invalid_event.title = " ".into();
    assert!(matches!(
        repository.create_event("orga-1", invalid_event).await,
        Err(EventError::Validation(_))
    ));

    let mut invalid_event = event_request();
    invalid_event.event_date = "15.08.2026".into();
    assert!(matches!(
        repository.create_event("orga-1", invalid_event).await,
        Err(EventError::Validation(_))
    ));

    let event = repository
        .create_event("orga-1", event_request())
        .await
        .unwrap();
    let invalid_signup = SignupRequest {
        people_count: 0,
        salad_count: 0,
        cake_count: 1,
        comment: None,
    };
    assert!(matches!(
        repository
            .create_signup(event.id, "member-1", invalid_signup)
            .await,
        Err(EventError::Validation(_))
    ));

    let disabled_food = SignupRequest {
        people_count: 1,
        salad_count: 0,
        cake_count: 1,
        comment: None,
    };
    assert!(matches!(
        repository
            .create_signup(event.id, "member-2", disabled_food)
            .await,
        Err(EventError::Validation(_))
    ));
}

#[tokio::test]
async fn signup_counts_have_realistic_upper_bounds() {
    let repository = repository().await;
    let event = repository
        .create_event("orga-1", event_request())
        .await
        .unwrap();

    for (people_count, salad_count, cake_count) in [(101, 0, 0), (1, 101, 0), (1, 0, 101)] {
        let result = repository
            .create_signup(
                event.id,
                &format!("member-{people_count}-{salad_count}-{cake_count}"),
                SignupRequest {
                    people_count,
                    salad_count,
                    cake_count,
                    comment: None,
                },
            )
            .await;
        assert!(matches!(result, Err(EventError::Validation(_))));
    }
}

#[tokio::test]
async fn invalid_event_update_does_not_change_existing_event() {
    let repository = repository().await;
    let event = repository
        .create_event("orga-1", event_request())
        .await
        .unwrap();
    repository
        .create_signup(
            event.id,
            "member-1",
            SignupRequest {
                people_count: 2,
                salad_count: 0,
                cake_count: 0,
                comment: None,
            },
        )
        .await
        .unwrap();

    let result = repository
        .update_event(
            event.id,
            UpdateEventRequest {
                title: Some("Changed".into()),
                capacity: Some(1),
                ..Default::default()
            },
        )
        .await;

    assert!(matches!(result, Err(EventError::Conflict(_))));
    let unchanged = repository.get_event(event.id, "member-1").await.unwrap();
    assert_eq!(unchanged.event.title, "Sommerfest");
    assert_eq!(unchanged.event.capacity, Some(20));
}

#[tokio::test]
async fn event_validation_rejects_malformed_times_and_non_positive_capacity() {
    let repository = repository().await;

    for (start_time, end_time, capacity) in [
        (Some("8:00"), Some("09:00"), Some(10)),
        (Some("08:00"), Some("9:00"), Some(10)),
        (Some("25:00"), None, Some(10)),
        (None, Some("12:60"), Some(10)),
        (Some("10:00"), Some("09:00"), Some(10)),
        (Some("10:00"), Some("11:00"), Some(0)),
        (Some("10:00"), Some("11:00"), Some(-1)),
    ] {
        let mut request = event_request();
        request.start_time = start_time.map(str::to_owned);
        request.end_time = end_time.map(str::to_owned);
        request.capacity = capacity;
        assert!(matches!(
            repository.create_event("orga-1", request).await,
            Err(EventError::Validation(_))
        ));
    }
}

#[tokio::test]
async fn signup_deadline_must_not_follow_event_date_on_create_or_update() {
    let repository = repository().await;
    let mut request = event_request();
    request.signup_deadline = Some(future_date(12));
    assert!(matches!(
        repository.create_event("orga-1", request).await,
        Err(EventError::Validation(_))
    ));

    let event = repository
        .create_event("orga-1", event_request())
        .await
        .unwrap();
    assert!(matches!(
        repository
            .update_event(
                event.id,
                UpdateEventRequest {
                    signup_deadline: Some(format!("{}T00:00:00Z", future_date(12))),
                    ..Default::default()
                },
            )
            .await,
        Err(EventError::Validation(_))
    ));
}

#[tokio::test]
async fn orga_event_listing_includes_drafts_and_past_events() {
    let repository = repository().await;
    let mut draft = event_request();
    draft.status = EventStatus::Draft;
    draft.event_date = "2000-01-01".into();
    repository.create_event("orga-1", draft).await.unwrap();

    let events = repository.list_all_events().await.unwrap();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].status, EventStatus::Draft);

    let published = repository.list_published_future("member-1").await.unwrap();
    assert!(published.is_empty());
}

#[tokio::test]
async fn event_update_can_clear_optional_fields_and_preserves_omitted_fields() {
    let repository = repository().await;
    let event = repository
        .create_event("orga-1", event_request())
        .await
        .unwrap();

    let updated = repository
        .update_event(
            event.id,
            UpdateEventRequest {
                clear_fields: vec!["description".into(), "location".into(), "capacity".into()],
                ..Default::default()
            },
        )
        .await
        .unwrap();

    assert_eq!(updated.description, None);
    assert_eq!(updated.location, None);
    assert_eq!(updated.capacity, None);
    assert_eq!(updated.start_time.as_deref(), Some("18:00"));
    assert_eq!(updated.end_time.as_deref(), Some("21:00"));
}

#[tokio::test]
async fn signup_crud_enforces_published_events_and_reports_missing_records() {
    let repository = repository().await;
    let mut draft_request = event_request();
    draft_request.status = EventStatus::Draft;
    let draft = repository
        .create_event("orga-1", draft_request)
        .await
        .unwrap();
    let signup = SignupRequest {
        people_count: 1,
        salad_count: 0,
        cake_count: 0,
        comment: None,
    };

    assert!(matches!(
        repository
            .create_signup(draft.id, "member-1", signup.clone())
            .await,
        Err(EventError::Validation(_))
    ));
    assert!(matches!(
        repository.update_signup(draft.id, "member-1", signup).await,
        Err(EventError::Validation(_))
    ));
    assert!(matches!(
        repository.delete_signup(draft.id, "member-1").await,
        Err(EventError::Validation(_))
    ));
    assert!(matches!(
        repository.delete_event(9999).await,
        Err(EventError::NotFound)
    ));
    assert!(matches!(
        repository.list_signups(9999).await,
        Err(EventError::NotFound)
    ));
}

#[tokio::test]
async fn signup_deletion_is_blocked_after_deadline() {
    let repository = repository().await;
    let event = repository
        .create_event("orga-1", event_request())
        .await
        .unwrap();
    repository
        .create_signup(
            event.id,
            "member-1",
            SignupRequest {
                people_count: 1,
                salad_count: 0,
                cake_count: 0,
                comment: None,
            },
        )
        .await
        .unwrap();
    sqlx::query("UPDATE events SET signup_deadline='2000-01-01' WHERE id=?")
        .bind(event.id)
        .execute(repository.pool())
        .await
        .unwrap();

    assert!(matches!(
        repository.delete_signup(event.id, "member-1").await,
        Err(EventError::Conflict(_))
    ));
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM event_signups WHERE event_id=?")
            .bind(event.id)
            .fetch_one(repository.pool())
            .await
            .unwrap(),
        1
    );
}

#[tokio::test]
async fn event_capacity_cannot_be_reduced_below_existing_signup_total() {
    let repository = repository().await;
    let event = repository
        .create_event("orga-1", event_request())
        .await
        .unwrap();
    repository
        .create_signup(
            event.id,
            "member-1",
            SignupRequest {
                people_count: 2,
                salad_count: 0,
                cake_count: 0,
                comment: None,
            },
        )
        .await
        .unwrap();

    let error = repository
        .update_event(
            event.id,
            UpdateEventRequest {
                capacity: Some(1),
                ..Default::default()
            },
        )
        .await
        .unwrap_err();
    assert!(matches!(error, EventError::Conflict(_)));
}

#[tokio::test]
async fn disabling_food_options_requires_existing_signup_counts_to_be_zero() {
    let repository = repository().await;
    let event = repository
        .create_event("orga-1", {
            let mut request = event_request();
            request.allow_salad = true;
            request.allow_cake = true;
            request
        })
        .await
        .unwrap();
    repository
        .create_signup(
            event.id,
            "member-1",
            SignupRequest {
                people_count: 1,
                salad_count: 1,
                cake_count: 1,
                comment: None,
            },
        )
        .await
        .unwrap();

    let error = repository
        .update_event(
            event.id,
            UpdateEventRequest {
                allow_salad: Some(false),
                ..Default::default()
            },
        )
        .await
        .unwrap_err();
    assert!(matches!(error, EventError::Conflict(_)));
}

#[tokio::test]
async fn published_event_with_signups_cannot_be_unpublished() {
    let repository = repository().await;
    let event = repository
        .create_event("orga-1", event_request())
        .await
        .unwrap();
    repository
        .create_signup(
            event.id,
            "member-1",
            SignupRequest {
                people_count: 1,
                salad_count: 0,
                cake_count: 0,
                comment: None,
            },
        )
        .await
        .unwrap();

    let error = repository
        .update_event(
            event.id,
            UpdateEventRequest {
                status: Some(EventStatus::Draft),
                ..Default::default()
            },
        )
        .await
        .unwrap_err();
    assert!(matches!(error, EventError::Conflict(_)));

    let empty = repository
        .create_event("orga-1", event_request())
        .await
        .unwrap();
    assert!(repository
        .update_event(
            empty.id,
            UpdateEventRequest {
                status: Some(EventStatus::Draft),
                ..Default::default()
            },
        )
        .await
        .is_ok());
}

#[tokio::test]
async fn food_count_query_error_rolls_back_update_transaction() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    let repository = EventRepository::new(pool.clone()).await.unwrap();
    let event = repository
        .create_event("orga-1", {
            let mut request = event_request();
            request.allow_cake = true;
            request
        })
        .await
        .unwrap();

    sqlx::query("DROP TABLE event_signups")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        "CREATE TABLE event_signups (event_id INTEGER NOT NULL, people_count INTEGER NOT NULL)",
    )
    .execute(&pool)
    .await
    .unwrap();

    let error = repository
        .update_event(
            event.id,
            UpdateEventRequest {
                allow_salad: Some(false),
                ..Default::default()
            },
        )
        .await
        .unwrap_err();
    assert!(matches!(error, EventError::Database(_)));

    sqlx::query("BEGIN IMMEDIATE")
        .execute(&pool)
        .await
        .expect("the failed transaction must have been rolled back");
    sqlx::query("ROLLBACK").execute(&pool).await.unwrap();
}
