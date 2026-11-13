use axum::{
    extract::{Json, Path, Query, State},
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

#[derive(Default, serde::Deserialize)]
pub struct ListEventsQuery {
    scope: Option<String>,
}

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

fn has_orga_claim(claims: &crate::auth::AuthClaims) -> bool {
    claims
        .role
        .as_deref()
        .is_some_and(|role| role.trim().eq_ignore_ascii_case("orga"))
}

async fn member_has_live_orga_role(
    state: &AppState,
    member_id: &str,
) -> Result<bool, EventRouteError> {
    let member = teable::get_member_by_id_with_projection(
        &state.teable_config,
        &state.http_client,
        member_id,
        Some(&["Rolle"][..]),
    )
    .await
    .map_err(|error| {
        tracing::error!(member_id = %member_id, %error, "Failed to verify organizer role");
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({
                "success": false,
                "message": "unable to verify access",
                "data": null
            })),
        )
    })?;

    Ok(member.is_some_and(|member| member.has_role("orga")))
}

async fn require_orga(state: &AppState, headers: &HeaderMap) -> Result<String, EventRouteError> {
    let claims =
        extract_auth_claims_from_headers(&state.jwt_secret, headers).map_err(auth_error)?;
    if !has_orga_claim(&claims) {
        return Err(auth_error(StatusCode::FORBIDDEN));
    }
    if !member_has_live_orga_role(state, &claims.sub).await? {
        tracing::warn!(member_id = %claims.sub, "Event access denied: orga role was revoked");
        return Err(auth_error(StatusCode::FORBIDDEN));
    }
    Ok(claims.sub)
}

pub async fn list_events(
    State(state): State<AppState>,
    Query(query): Query<ListEventsQuery>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, EventRouteError> {
    let claims =
        extract_auth_claims_from_headers(&state.jwt_secret, &headers).map_err(auth_error)?;
    let is_orga = has_orga_claim(&claims) && member_has_live_orga_role(&state, &claims.sub).await?;

    // Past view: members see the last 30 days, organizers the last year.
    // Past drafts are not useful, so drafts are only included when upcoming.
    let past = query.scope.as_deref() == Some("past");
    let past_days: Option<i64> = if past {
        Some(if is_orga { 365 } else { 30 })
    } else {
        None
    };
    let include_drafts = is_orga && !past;

    let details = state
        .event_repository
        .list_visible_events_with_signup(&claims.sub, include_drafts, past_days)
        .await
        .map_err(error_response)?;
    Ok(Json(details))
}

pub async fn get_event(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, EventRouteError> {
    let claims =
        extract_auth_claims_from_headers(&state.jwt_secret, &headers).map_err(auth_error)?;
    let is_orga = has_orga_claim(&claims) && member_has_live_orga_role(&state, &claims.sub).await?;
    let member_id = claims.sub;
    let repository = &state.event_repository;
    let event = if is_orga {
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
    require_orga(&state, &headers).await?;
    Ok(Json(
        state
            .event_repository
            .create_event(payload)
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
    require_orga(&state, &headers).await?;
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
    require_orga(&state, &headers).await?;
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
    require_orga(&state, &headers).await?;
    let mut summary = state
        .event_repository
        .list_signups(id)
        .await
        .map_err(error_response)?;
    let mut member_ids: Vec<String> = summary
        .signups
        .iter()
        .map(|signup| signup.member_id.clone())
        .collect();
    member_ids.sort();
    member_ids.dedup();

    if !member_ids.is_empty() {
        // One paginated batch instead of one Teable request per signup. A
        // failure leaves the names empty so the rows (and IDs) are preserved.
        let lookup = tokio::time::timeout(
            std::time::Duration::from_secs(15),
            teable::get_member_names_by_ids(&state.teable_config, &state.http_client, &member_ids),
        )
        .await;
        match lookup {
            Ok(Ok(names)) => {
                for signup in &mut summary.signups {
                    signup.member_name = names.get(&signup.member_id).cloned();
                }
            }
            Ok(Err(error)) => {
                tracing::warn!(%error, "Could not resolve signup member names");
            }
            Err(_) => {
                tracing::warn!("Timed out resolving signup member names");
            }
        }
    }

    Ok(Json(summary))
}
