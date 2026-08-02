use axum::{http::StatusCode, middleware, Router};
use axum_test::TestServer;
use chrono::{Duration, Utc};
use mockito::Server;
use reqwest::Client;
use serde_json::json;
use serial_test::serial;
use std::sync::Arc;
use tsv_tennis_backend::{
    auth,
    database::Database,
    email::EmailService,
    events::EventRepository,
    models::{CreateEventRequest, EventStatus, EventType},
    routes,
    state::{self, AppState},
    teable::TeableConfig,
    token_store::TokenStore,
};

const SECRET: &str = "events-route-test-secret-123456789";

async fn app() -> (TestServer, EventRepository) {
    app_with_teable_url("http://localhost").await
}

async fn app_with_teable_url(teable_url: &str) -> (TestServer, EventRepository) {
    std::env::set_var("EMAIL_USER", "test@example.com");
    std::env::set_var("EMAIL_PASSWORD", "password");
    std::env::set_var("EMAIL_HOST", "localhost");
    std::env::set_var("EMAIL_PORT", "25");
    std::env::set_var("EMAIL_FROM", "test@example.com");
    std::env::set_var("EMAIL_DISABLE_SEND", "true");

    let database = Database::new("sqlite::memory:").await.unwrap();
    let repository = EventRepository::new(database.pool().clone()).await.unwrap();
    let state = AppState {
        http_client: Client::new(),
        teable_config: TeableConfig {
            api_url: teable_url.into(),
            token: "token".into(),
            members_table_id: "members".into(),
            work_hours_table_id: "hours".into(),
        },
        email_service: Arc::new(EmailService::new().unwrap()),
        token_store: TokenStore::new(),
        database,
        event_repository: repository.clone(),
        mail_jobs: Arc::new(tokio::sync::RwLock::new(Default::default())),
        jwt_secret: SECRET.into(),
    };
    let app = Router::new()
        .merge(routes::events::routes())
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            state::auth_middleware,
        ))
        .with_state(state);
    (TestServer::new(app).unwrap(), repository)
}

fn token(member_id: &str, role: Option<&str>) -> String {
    auth::create_token(SECRET, member_id, role).unwrap()
}

fn event_request(status: EventStatus) -> CreateEventRequest {
    CreateEventRequest {
        event_type: EventType::Event,
        title: "Club event".into(),
        description: None,
        event_date: (Utc::now().date_naive() + Duration::days(2)).to_string(),
        start_time: None,
        end_time: None,
        location: None,
        signup_deadline: None,
        capacity: Some(2),
        allow_salad: true,
        allow_cake: true,
        allow_signups: true,
        status,
    }
}

#[tokio::test]
#[serial]
async fn regular_members_only_see_published_events_and_own_signup() {
    let (server, repository) = app().await;
    let published = repository
        .create_event("orga-1", event_request(EventStatus::Published))
        .await
        .unwrap();
    repository
        .create_event("orga-1", event_request(EventStatus::Draft))
        .await
        .unwrap();
    repository
        .create_signup(
            published.id,
            "member-1",
            tsv_tennis_backend::models::SignupRequest {
                people_count: 1,
                salad_count: 0,
                cake_count: 0,
                comment: None,
            },
        )
        .await
        .unwrap();

    let response = server
        .get("/events")
        .authorization(format!("Bearer {}", token("member-1", None)))
        .await;
    response.assert_status_ok();
    response.assert_json(&json!([json!({"id": published.id, "type": "event", "title": "Club event", "description": null, "event_date": published.event_date, "start_time": null, "end_time": null, "location": null, "signup_deadline": null, "capacity": 2, "allow_salad": true, "allow_cake": true, "allow_signups": true, "status": "published", "signup_people_count": 1})]));

    let detail = server
        .get(&format!("/events/{}", published.id))
        .authorization(format!("Bearer {}", token("member-1", None)))
        .await;
    detail.assert_status_ok();
    assert_eq!(
        detail.json::<serde_json::Value>()["own_signup"]["member_id"],
        "member-1"
    );
}

#[tokio::test]
<<<<<<< HEAD
#[serial]
=======
>>>>>>> 51c04a2 (fix: address Orga event review findings)
async fn orga_list_includes_drafts_and_past_events() {
    let (server, repository) = app().await;
    let mut draft = event_request(EventStatus::Draft);
    draft.event_date = "2000-01-01".into();
    repository.create_event("orga-1", draft).await.unwrap();

    let response = server
        .get("/events")
        .authorization(format!("Bearer {}", token("orga-1", Some("orga"))))
        .await;
    response.assert_status_ok();
    let events = response.json::<Vec<serde_json::Value>>();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0]["status"], "draft");
}

#[tokio::test]
<<<<<<< HEAD
#[serial]
async fn signup_listing_preserves_rows_when_a_member_lookup_fails() {
    let mut teable = Server::new_async().await;
    let _success = teable
        .mock("GET", "/table/members/record/member-ok")
        .match_query(mockito::Matcher::Any)
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(r#"{"id":"member-ok","fields":{"Vorname":"Anna","Nachname":"Okay"}}"#)
        .create_async()
        .await;
    let _failure = teable
        .mock("GET", "/table/members/record/member-fails")
        .match_query(mockito::Matcher::Any)
        .with_status(500)
        .create_async()
        .await;

    let (server, repository) = app_with_teable_url(&teable.url()).await;
    let event = repository
        .create_event("orga-1", event_request(EventStatus::Published))
        .await
        .unwrap();
    for member_id in ["member-ok", "member-fails"] {
        repository
            .create_signup(
                event.id,
                member_id,
                tsv_tennis_backend::models::SignupRequest {
                    people_count: 1,
                    salad_count: 0,
                    cake_count: 0,
                    comment: None,
                },
            )
            .await
            .unwrap();
    }

    let response = server
        .get(&format!("/events/{}/signups", event.id))
        .authorization(format!("Bearer {}", token("orga-1", Some("orga"))))
        .await;
    response.assert_status_ok();
    let body = response.json::<serde_json::Value>();
    assert_eq!(body["signups"].as_array().unwrap().len(), 2);
    assert_eq!(body["total_people"], 2);
    assert_eq!(body["signups"][0]["member_name"], "Anna Okay");
    assert_eq!(body["signups"][1]["member_name"], serde_json::Value::Null);
}

#[tokio::test]
#[serial]
=======
>>>>>>> 51c04a2 (fix: address Orga event review findings)
async fn regular_members_cannot_fetch_draft_details_but_orga_can() {
    let (server, repository) = app().await;
    let draft = repository
        .create_event("orga-1", event_request(EventStatus::Draft))
        .await
        .unwrap();

    let hidden = server
        .get(&format!("/events/{}", draft.id))
        .authorization(format!("Bearer {}", token("member-1", None)))
        .await;
    hidden.assert_status_not_found();

    let visible = server
        .get(&format!("/events/{}", draft.id))
        .authorization(format!("Bearer {}", token("orga-1", Some(" ORGA "))))
        .await;
    visible.assert_status_ok();
}

#[tokio::test]
#[serial]
async fn normalized_orga_can_manage_events_but_members_cannot_view_signups() {
    let (server, repository) = app().await;
    let event = repository
        .create_event("orga-1", event_request(EventStatus::Published))
        .await
        .unwrap();
    let response = server
        .put(&format!("/events/{}", event.id))
        .authorization(format!("Bearer {}", token("orga-1", Some(" ORGA "))))
        .json(&json!({"title":"changed"}))
        .await;
    response.assert_status_ok();

    let forbidden = server
        .get(&format!("/events/{}/signups", event.id))
        .authorization(format!("Bearer {}", token("member-1", Some("member"))))
        .await;
    forbidden.assert_status_forbidden();
}

#[tokio::test]
#[serial]
async fn management_and_signup_routes_require_their_proper_authentication() {
    let (server, repository) = app().await;
    let event = repository
        .create_event("orga-1", event_request(EventStatus::Published))
        .await
        .unwrap();
    let member = format!("Bearer {}", token("member-1", Some("member")));
    let signup = json!({"people_count": 1, "salad_count": 0, "cake_count": 0});

    server
        .post("/events")
        .authorization(member.clone())
        .json(&event_request(EventStatus::Published))
        .await
        .assert_status_forbidden();
    server
        .put(&format!("/events/{}", event.id))
        .authorization(member.clone())
        .json(&json!({"title":"changed"}))
        .await
        .assert_status_forbidden();
    server
        .delete(&format!("/events/{}", event.id))
        .authorization(member.clone())
        .await
        .assert_status_forbidden();
    server
        .get(&format!("/events/{}/signups", event.id))
        .authorization(member.clone())
        .await
        .assert_status_forbidden();

    server
        .post(&format!("/events/{}/signup", event.id))
        .json(&signup)
        .await
        .assert_status_unauthorized();
    server
        .put(&format!("/events/{}/signup", event.id))
        .json(&signup)
        .await
        .assert_status_unauthorized();
    server
        .delete(&format!("/events/{}/signup", event.id))
        .await
        .assert_status_unauthorized();
}

#[tokio::test]
#[serial]
async fn signup_enforces_authenticated_ownership_deadline_and_capacity() {
    let (server, repository) = app().await;
    let mut limited = event_request(EventStatus::Published);
    limited.capacity = Some(1);
    let event = repository.create_event("orga-1", limited).await.unwrap();

    let first = server
        .post(&format!("/events/{}/signup", event.id))
        .authorization(format!("Bearer {}", token("member-1", None)))
        .json(&json!({"people_count": 1, "salad_count": 0, "cake_count": 0}))
        .await;
    first.assert_status_ok();

    let full = server
        .post(&format!("/events/{}/signup", event.id))
        .authorization(format!("Bearer {}", token("member-2", None)))
        .json(&json!({"people_count": 1, "salad_count": 0, "cake_count": 0}))
        .await;
    full.assert_status(StatusCode::CONFLICT);
    let full_body = full.json::<serde_json::Value>();
    assert_eq!(full_body["success"], false);
    assert_eq!(full_body["message"], "event capacity exceeded");
    assert_eq!(full_body["data"], serde_json::Value::Null);

    let missing = server
        .put(&format!("/events/{}/signup", event.id))
        .authorization(format!("Bearer {}", token("member-2", None)))
        .json(&json!({"people_count": 1, "salad_count": 0, "cake_count": 0}))
        .await;
    missing.assert_status_not_found();

    let mut expired_request = event_request(EventStatus::Published);
    expired_request.signup_deadline = Some("2000-01-01".into());
    let expired = repository
        .create_event("orga-1", expired_request)
        .await
        .unwrap();
    let deadline = server
        .post(&format!("/events/{}/signup", expired.id))
        .authorization(format!("Bearer {}", token("member-3", None)))
        .json(&json!({"people_count": 1, "salad_count": 0, "cake_count": 0}))
        .await;
    deadline.assert_status(StatusCode::CONFLICT);
}

#[tokio::test]
#[serial]
async fn signup_deletion_returns_deadline_message_and_preserves_signup() {
    let (server, repository) = app().await;
    let mut expired = event_request(EventStatus::Published);
    expired.signup_deadline = Some("2000-01-01".into());
    let event = repository.create_event("orga-1", expired).await.unwrap();
    sqlx::query("INSERT INTO event_signups (event_id, member_id, people_count) VALUES (?, ?, ?)")
        .bind(event.id)
        .bind("member-1")
        .bind(1)
        .execute(repository.pool())
        .await
        .unwrap();
    let response = server
        .delete(&format!("/events/{}/signup", event.id))
        .authorization(format!("Bearer {}", token("member-1", None)))
        .await;
    response.assert_status(StatusCode::CONFLICT);
    let body = response.json::<serde_json::Value>();
    assert_eq!(body["success"], false);
    assert_eq!(body["message"], "signup deadline has passed");
    assert_eq!(body["data"], serde_json::Value::Null);
}

#[tokio::test]
#[serial]
async fn signup_update_enforces_deadline_and_capacity() {
    let (server, repository) = app().await;
    let mut limited = event_request(EventStatus::Published);
    limited.capacity = Some(2);
    let event = repository.create_event("orga-1", limited).await.unwrap();
    repository
        .create_signup(
            event.id,
            "member-1",
            tsv_tennis_backend::models::SignupRequest {
                people_count: 1,
                salad_count: 0,
                cake_count: 0,
                comment: None,
            },
        )
        .await
        .unwrap();

    let too_large = server
        .put(&format!("/events/{}/signup", event.id))
        .authorization(format!("Bearer {}", token("member-1", None)))
        .json(&json!({"people_count": 3, "salad_count": 0, "cake_count": 0}))
        .await;
    too_large.assert_status(StatusCode::CONFLICT);

    let mut expired = event_request(EventStatus::Published);
    expired.signup_deadline = Some("2000-01-01".into());
    let expired = repository.create_event("orga-1", expired).await.unwrap();
    sqlx::query("INSERT INTO event_signups (event_id, member_id, people_count) VALUES (?, ?, ?)")
        .bind(expired.id)
        .bind("member-1")
        .bind(1)
        .execute(repository.pool())
        .await
        .unwrap();
    let deadline = server
        .put(&format!("/events/{}/signup", expired.id))
        .authorization(format!("Bearer {}", token("member-1", None)))
        .json(&json!({"people_count": 1, "salad_count": 0, "cake_count": 0}))
        .await;
    deadline.assert_status(StatusCode::CONFLICT);
}

#[tokio::test]
#[serial]
async fn malformed_deadlines_are_rejected_and_cannot_receive_signups() {
    let (server, repository) = app().await;
    let mut malformed = event_request(EventStatus::Published);
    malformed.signup_deadline = Some("not-a-deadline".into());
    let response = server
        .post("/events")
        .authorization(format!("Bearer {}", token("orga-1", Some("orga"))))
        .json(&malformed)
        .await;
    response.assert_status(StatusCode::BAD_REQUEST);

    let event = repository
        .create_event("orga-1", event_request(EventStatus::Published))
        .await
        .unwrap();
    sqlx::query("UPDATE events SET signup_deadline='not-a-deadline' WHERE id=?")
        .bind(event.id)
        .execute(repository.pool())
        .await
        .unwrap();
    let signup = server
        .post(&format!("/events/{}/signup", event.id))
        .authorization(format!("Bearer {}", token("member-1", None)))
        .json(&json!({"people_count": 1, "salad_count": 0, "cake_count": 0}))
        .await;
    signup.assert_status(StatusCode::CONFLICT);
}

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
        .bind(event.id)
        .bind("member-1")
        .bind(1)
        .execute(repository.pool())
        .await
        .unwrap();

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
    let request = event_request(EventStatus::Published);
    let mut body = serde_json::to_value(&request).unwrap();
    body.as_object_mut().unwrap().remove("allow_signups");
    let response = server
        .post("/events")
        .authorization(format!("Bearer {}", token("orga-1", Some("orga"))))
        .json(&body)
        .await;
    response.assert_status(StatusCode::OK);
    let event = response.json::<serde_json::Value>();
    assert_eq!(event["allow_signups"], true);
}
