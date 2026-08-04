use axum::{
    extract::{Json, Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Router,
};

use crate::{
    events::EventError,
    models::{CreateEventRequest, SignupRequest, UpdateEventRequest},
    state::AppState,
    teable,
    utils::{extract_auth_claims_from_headers, extract_user_id_from_headers},
};

pub fn routes() -> Router<AppState> {
    read_routes().merge(write_routes())
}

pub fn read_routes() -> Router<AppState> {
    Router::new()
        .route("/events", get(list_events))
        .route("/events/:id", get(get_event))
        .route("/events/:id/signups", get(list_signups))
}

pub fn write_routes() -> Router<AppState> {
    Router::new()
        .route("/events", post(create_event))
        .route(
            "/events/:id",
            axum::routing::put(update_event).delete(delete_event),
        )
        .route(
            "/events/:id/signup",
            post(create_signup).put(update_signup).delete(delete_signup),
        )
}

type EventRouteError = (StatusCode, Json<serde_json::Value>);

fn error_response(error: EventError) -> EventRouteError {
    match error {
        EventError::NotFound => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"success":false,"message":"event not found","data":null})),
        ),
        EventError::Validation(message) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"success":false,"message":message,"data":null})),
        ),
        EventError::Conflict(message) => (
            StatusCode::CONFLICT,
            Json(serde_json::json!({"success":false,"message":message,"data":null})),
        ),
        error @ EventError::Database(_) => {
            tracing::error!(%error, "event database error");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"success":false,"message":"database error","data":null})),
            )
        }
    }
}

fn auth_error(status: StatusCode) -> EventRouteError {
    let message = if status == StatusCode::FORBIDDEN {
        "orga access required"
    } else {
        "authentication required"
    };
    (
        status,
        Json(serde_json::json!({"success":false,"message":message,"data":null})),
    )
}

fn require_orga(secret: &str, headers: &HeaderMap) -> Result<String, EventRouteError> {
    let claims = extract_auth_claims_from_headers(secret, headers).map_err(auth_error)?;
    if !claims
        .role
        .as_deref()
        .is_some_and(|role| role.trim().eq_ignore_ascii_case("orga"))
    {
        return Err(auth_error(StatusCode::FORBIDDEN));
    }
    Ok(claims.sub)
}

pub async fn list_events(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, EventRouteError> {
    let claims =
        extract_auth_claims_from_headers(&state.jwt_secret, &headers).map_err(auth_error)?;
    Ok(Json(
        if claims
            .role
            .as_deref()
            .is_some_and(|role| role.trim().eq_ignore_ascii_case("orga"))
        {
            state.event_repository.list_all_events().await
        } else {
            state
                .event_repository
                .list_published_future(&claims.sub)
                .await
        }
        .map_err(error_response)?,
    ))
}

pub async fn get_event(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, EventRouteError> {
    let claims =
        extract_auth_claims_from_headers(&state.jwt_secret, &headers).map_err(auth_error)?;
    let member_id = claims.sub;
    let repository = &state.event_repository;
    let event = if claims
        .role
        .as_deref()
        .is_some_and(|role| role.trim().eq_ignore_ascii_case("orga"))
    {
        repository.get_event(id, &member_id).await
    } else {
        repository.get_published_event(id, &member_id).await
    };
    Ok(Json(event.map_err(error_response)?))
}

pub async fn create_event(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateEventRequest>,
) -> Result<impl IntoResponse, EventRouteError> {
    let actor_id = require_orga(&state.jwt_secret, &headers)?;
    Ok(Json(
        state
            .event_repository
            .create_event(&actor_id, payload)
            .await
            .map_err(error_response)?,
    ))
}

pub async fn update_event(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    headers: HeaderMap,
    Json(payload): Json<UpdateEventRequest>,
) -> Result<impl IntoResponse, EventRouteError> {
    require_orga(&state.jwt_secret, &headers)?;
    Ok(Json(
        state
            .event_repository
            .update_event(id, payload)
            .await
            .map_err(error_response)?,
    ))
}

pub async fn delete_event(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, EventRouteError> {
    require_orga(&state.jwt_secret, &headers)?;
    state
        .event_repository
        .delete_event(id)
        .await
        .map_err(error_response)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn create_signup(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    headers: HeaderMap,
    Json(payload): Json<SignupRequest>,
) -> Result<impl IntoResponse, EventRouteError> {
    let member_id =
        extract_user_id_from_headers(&state.jwt_secret, &headers).map_err(auth_error)?;
    Ok(Json(
        state
            .event_repository
            .create_signup(id, &member_id, payload)
            .await
            .map_err(error_response)?,
    ))
}

pub async fn update_signup(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    headers: HeaderMap,
    Json(payload): Json<SignupRequest>,
) -> Result<impl IntoResponse, EventRouteError> {
    let member_id =
        extract_user_id_from_headers(&state.jwt_secret, &headers).map_err(auth_error)?;
    Ok(Json(
        state
            .event_repository
            .update_signup(id, &member_id, payload)
            .await
            .map_err(error_response)?,
    ))
}

pub async fn delete_signup(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, EventRouteError> {
    let member_id =
        extract_user_id_from_headers(&state.jwt_secret, &headers).map_err(auth_error)?;
    state
        .event_repository
        .delete_signup(id, &member_id)
        .await
        .map_err(error_response)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_signups(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, EventRouteError> {
    require_orga(&state.jwt_secret, &headers)?;
    let mut summary = state
        .event_repository
        .list_signups(id)
        .await
        .map_err(error_response)?;
    let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(8));
    let mut tasks = tokio::task::JoinSet::new();
    for (index, signup) in summary.signups.iter().enumerate() {
        let semaphore = semaphore.clone();
        let config = state.teable_config.clone();
        let client = state.http_client.clone();
        let member_id = signup.member_id.clone();
        tasks.spawn(async move {
            let _permit = semaphore.acquire_owned().await.expect("lookup semaphore closed");
            let name = teable::get_member_by_id(&config, &client, &member_id)
                .await
                .unwrap_or_else(|error| {
                    tracing::warn!(member_id = %member_id, %error, "Could not resolve signup member name");
                    None
                })
                .map(|member| member.name());
            (index, name)
        });
    }
    // Bound the external member-lookup phase with an overall deadline so a slow
    // Teable instance cannot keep the handler open; unresolved members stay null.
    let collect_names = async {
        while let Some(result) = tasks.join_next().await {
            let (index, name) = result.map_err(|error| {
                tracing::warn!(%error, "signup member lookup task failed");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"success":false,"message":"member lookup failed","data":null})),
                )
            })?;
            summary.signups[index].member_name = name;
        }
        Ok::<_, EventRouteError>(())
    };
    let _ = tokio::time::timeout(std::time::Duration::from_secs(15), collect_names).await;
    Ok(Json(summary))
}
