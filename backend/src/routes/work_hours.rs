//! Work hour CRUD routes with date validation and ownership checks.

use axum::{
    extract::{Json, Path, State},
    http::HeaderMap,
    response::IntoResponse,
    routing::{delete, get, post, put},
    Router,
};
use chrono::Datelike;
use tracing::{debug, error, info, warn};

use crate::models::CreateWorkHourRequest;
use crate::state::AppState;
use crate::teable;
use crate::utils::extract_user_id_from_headers;

/// Validate work hour date with one-month grace period.
/// Returns Ok(()) if valid, or a JSON error body to return to the caller.
fn validate_work_hour_date(date: &str, prefix: &str) -> Result<(), axum::Json<serde_json::Value>> {
    let date_result = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d");
    let work_date = match date_result {
        Ok(d) => d,
        Err(_) => {
            warn!("{}: Invalid date format: {}", prefix, date);
            return Err(axum::Json(serde_json::json!({
                "success": false,
                "message": "Ungültiges Datumsformat. Bitte verwenden Sie YYYY-MM-DD."
            })));
        }
    };

    let today = chrono::Utc::now().date_naive();
    let current_year = today.year();
    let current_month = today.month();
    let work_year = work_date.year();

    let min_allowed_year = if current_month == 1 {
        current_year - 1
    } else {
        current_year
    };

    if work_year >= min_allowed_year {
        return Ok(());
    }

    debug!(
        "{}: Year validation failed - work year: {}, min allowed: {}",
        prefix, work_year, min_allowed_year
    );

    if current_month == 1 {
        Err(axum::Json(serde_json::json!({
            "success": false,
            "message": format!("Arbeitsstunden können nur für {} oder {} (Nachfrist bis Ende Januar) eingetragen werden.", current_year, current_year - 1)
        })))
    } else {
        Err(axum::Json(serde_json::json!({
            "success": false,
            "message": format!("Arbeitsstunden können nur für das aktuelle Jahr {} eingetragen werden.", current_year)
        })))
    }
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", post(create_work_hour))
        .route("/:id", get(get_work_hour_by_id))
        .route("/:id", put(update_work_hour))
        .route("/:id", delete(delete_work_hour))
}

enum OwnershipError {
    /// Upstream Teable request failed (network/HTTP error).
    Upstream,
    /// Work hour entry was not found or is not owned by the user.
    Denied,
}

fn denied_response(verb: &str) -> axum::Json<serde_json::Value> {
    axum::Json(serde_json::json!({
        "success": false,
        "message": format!("Work hour entry not found or you don't have permission to {} it", verb)
    }))
}

async fn verify_work_hour_ownership(
    state: &AppState,
    work_hour_id: &str,
    user_id: &str,
    verb: &str,
) -> Result<crate::models::WorkHour, OwnershipError> {
    let existing =
        teable::get_work_hour_by_id(&state.teable_config, &state.http_client, work_hour_id)
            .await
            .map_err(|e| {
                error!("{verb} Work Hour: Failed to get work hour by id: {}", e);
                OwnershipError::Upstream
            })?;

    let wh = existing.ok_or_else(|| {
        warn!(work_hour_id = %work_hour_id, "{verb} Work Hour: not found");
        OwnershipError::Denied
    })?;

    let owned = wh
        .get_member_id()
        .is_some_and(|member_id| member_id == user_id);

    if !owned {
        warn!(
            work_hour_id = %work_hour_id,
            user_id = %user_id,
            "{verb} Work Hour: ownership check failed"
        );
        return Err(OwnershipError::Denied);
    }

    Ok(wh)
}

pub async fn get_work_hour_by_id(
    State(state): State<AppState>,
    Path(work_hour_id): Path<String>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, axum::http::StatusCode> {
    let user_id = extract_user_id_from_headers(&state.jwt_secret, &headers)?;

    debug!(
        "Get Work Hour: Looking for work hour ID {} for user {}",
        work_hour_id, user_id
    );

    let wh = match verify_work_hour_ownership(&state, &work_hour_id, &user_id, "access").await {
        Ok(wh) => wh,
        Err(OwnershipError::Upstream) => return Err(axum::http::StatusCode::INTERNAL_SERVER_ERROR),
        Err(OwnershipError::Denied) => return Ok(denied_response("access")),
    };

    let current_user = teable::get_member_by_id(&state.teable_config, &state.http_client, &user_id)
        .await
        .map_err(|e| {
            error!("Get Work Hour: Failed to get member by id: {}", e);
            axum::http::StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or_else(|| {
            warn!(user_id = %user_id, "Get Work Hour: user not found");
            axum::http::StatusCode::NOT_FOUND
        })?;

    match (&wh.date, &wh.description, &wh.duration_hours) {
        (Some(date), Some(description), Some(hours)) => {
            debug!(
                work_hour_id = %work_hour_id,
                user_id = %current_user.id,
                "Get Work Hour: found work hour"
            );
            Ok(axum::Json(serde_json::json!({
                "success": true,
                "data": {
                    "id": wh.id,
                    "Datum": date,
                    "Tätigkeit": description,
                    "Stunden": hours,
                    "Vorname": current_user.first_name,
                    "Nachname": current_user.last_name
                }
            })))
        }
        _ => {
            warn!(
                work_hour_id = %work_hour_id,
                "Get Work Hour: work hour has incomplete data"
            );
            Ok(axum::Json(serde_json::json!({
                "success": false,
                "message": "Work hour entry has incomplete data"
            })))
        }
    }
}

pub async fn create_work_hour(
    State(state): State<AppState>,
    headers: HeaderMap,
    payload: Result<Json<CreateWorkHourRequest>, axum::extract::rejection::JsonRejection>,
) -> Result<impl IntoResponse, axum::http::StatusCode> {
    let user_id = match extract_user_id_from_headers(&state.jwt_secret, &headers) {
        Ok(id) => id,
        Err(e) => {
            warn!("Create Work Hour: authentication failed");
            return Err(e);
        }
    };

    let payload = match payload {
        Ok(Json(data)) => {
            debug!("Create Work Hour: successfully parsed JSON");
            data
        }
        Err(rejection) => {
            debug!(?rejection, "Create Work Hour: invalid JSON payload");
            return Ok(axum::Json(serde_json::json!({
                "success": false,
                "error": "Invalid JSON format",
                "details": format!("{:?}", rejection)
            })));
        }
    };

    debug!("Create Work Hour: User ID: {}", user_id);
    debug!("Create Work Hour: Raw payload: {:?}", payload);

    // Validate required fields
    if payload.date.is_empty() {
        warn!("Create Work Hour: Missing date");
        return Err(axum::http::StatusCode::BAD_REQUEST);
    }
    if payload.description.is_empty() {
        warn!("Create Work Hour: Missing description");
        return Err(axum::http::StatusCode::BAD_REQUEST);
    }
    if payload.hours <= 0.0 {
        warn!("Create Work Hour: Invalid hours: {}", payload.hours);
        return Err(axum::http::StatusCode::BAD_REQUEST);
    }

    // Validate year with one-month grace period
    if let Err(json_err) = validate_work_hour_date(&payload.date, "Create Work Hour") {
        return Ok(json_err);
    }

    // Use get_member_by_id for efficiency
    let current_user = teable::get_member_by_id_with_projection(
        &state.teable_config,
        &state.http_client,
        &user_id,
        Some(&["Vorname", "Nachname", "Email"][..]), // Only fields needed for create_work_hour
    )
    .await
    .map_err(|e| {
        error!("Create Work Hour: Failed to get member by id: {}", e);
        axum::http::StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or_else(|| {
        warn!(user_id = %user_id, "Create Work Hour: user not found");
        axum::http::StatusCode::NOT_FOUND
    })?;

    debug!(user_id = %current_user.id, "Create Work Hour: member found");

    debug!(
        hours = payload.hours,
        "Create Work Hour: using submitted hours"
    );

    // Check for duplicate entry for this member and date using teable.rs helper
    let work_hour_exists = match teable::work_hour_exists_for_member_at_date(
        &state.teable_config,
        &state.http_client,
        &current_user.id,
        &payload.date,
    )
    .await
    {
        Ok(exists) => exists,
        Err(e) => {
            error!(
                "Create Work Hour: Error fetching work hours for date: {}",
                e
            );
            return Err(axum::http::StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    if work_hour_exists {
        warn!(
            user_id = %current_user.id,
            date = %payload.date,
            "Create Work Hour: duplicate entry"
        );
        return Ok(axum::Json(serde_json::json!({
            "success": false,
            "error": "Für dieses Datum existiert bereits ein Eintrag. Pro Person und Tag ist nur ein Eintrag erlaubt."
        })));
    }

    // Try to create the work hour in Teable
    match teable::create_work_hour(
        &state.teable_config,
        &state.http_client,
        &payload.date,
        &payload.description,
        payload.hours,
        current_user.id.clone(),
    )
    .await
    {
        Ok(work_hour) => {
            info!(
                work_hour_id = %work_hour.id,
                user_id = %current_user.id,
                "Create Work Hour: created"
            );
            Ok(axum::Json(serde_json::json!({
                "success": true,
                "message": "Work hour entry created successfully",
                "data": {
                    "id": work_hour.id,
                    "user": current_user.name(),
                    "date": payload.date,
                    "description": payload.description,
                    "hours": payload.hours,
                    "duration_hours": payload.hours
                }
            })))
        }
        Err(e) => {
            error!("Create Work Hour: Failed to create in Teable: {}", e);
            Ok(axum::Json(serde_json::json!({
                "success": false,
                "message": "Arbeitsstunde konnte nicht gespeichert werden.",
                "error": format!("Teable error: {}", e)
            })))
        }
    }
}

pub async fn update_work_hour(
    State(state): State<AppState>,
    Path(work_hour_id): Path<String>,
    headers: HeaderMap,
    payload: Result<Json<CreateWorkHourRequest>, axum::extract::rejection::JsonRejection>,
) -> Result<impl IntoResponse, axum::http::StatusCode> {
    let user_id = match extract_user_id_from_headers(&state.jwt_secret, &headers) {
        Ok(id) => id,
        Err(e) => {
            warn!("Update Work Hour: authentication failed");
            return Err(e);
        }
    };

    let payload = match payload {
        Ok(Json(data)) => {
            debug!("Update Work Hour: successfully parsed JSON");
            data
        }
        Err(rejection) => {
            debug!(?rejection, "Update Work Hour: invalid JSON payload");
            return Ok(axum::Json(serde_json::json!({
                "success": false,
                "error": "Invalid JSON format",
                "details": format!("{:?}", rejection)
            })));
        }
    };

    debug!(
        user_id = %user_id,
        work_hour_id = %work_hour_id,
        "Update Work Hour: processing request"
    );
    debug!(?payload, "Update Work Hour: payload");

    // Validate required fields
    if payload.date.is_empty() {
        warn!("Update Work Hour: Missing date");
        return Ok(axum::Json(serde_json::json!({
            "success": false,
            "error": "Date is required"
        })));
    }
    if payload.description.is_empty() {
        warn!("Update Work Hour: Missing description");
        return Ok(axum::Json(serde_json::json!({
            "success": false,
            "error": "Description is required"
        })));
    }
    if payload.hours <= 0.0 {
        warn!("Update Work Hour: Invalid hours: {}", payload.hours);
        return Ok(axum::Json(serde_json::json!({
            "success": false,
            "error": "Hours must be greater than 0"
        })));
    }

    // Validate year with one-month grace period
    if let Err(json_err) = validate_work_hour_date(&payload.date, "Update Work Hour") {
        return Ok(json_err);
    }

    let _wh = match verify_work_hour_ownership(&state, &work_hour_id, &user_id, "edit").await {
        Ok(wh) => wh,
        Err(OwnershipError::Upstream) => return Err(axum::http::StatusCode::INTERNAL_SERVER_ERROR),
        Err(OwnershipError::Denied) => return Ok(denied_response("edit")),
    };

    // Use get_member_by_id for efficiency
    let current_user = teable::get_member_by_id_with_projection(
        &state.teable_config,
        &state.http_client,
        &user_id,
        Some(&["Vorname", "Nachname", "Email"][..]), // Only fields needed for update_work_hour
    )
    .await
    .map_err(|e| {
        error!("Update Work Hour: Failed to get member by id: {}", e);
        axum::http::StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or_else(|| {
        warn!(user_id = %user_id, "Update Work Hour: user not found");
        axum::http::StatusCode::NOT_FOUND
    })?;

    debug!(user_id = %current_user.id, "Update Work Hour: member found");

    debug!(
        hours = payload.hours,
        "Update Work Hour: using submitted hours"
    );

    // Try to update the work hour in Teable
    match teable::update_work_hour(
        &state.teable_config,
        &state.http_client,
        &work_hour_id,
        &payload.date,
        &payload.description,
        payload.hours,
        current_user.id.clone(),
    )
    .await
    {
        Ok(updated_work_hour) => {
            info!(
                work_hour_id = %updated_work_hour.id,
                user_id = %current_user.id,
                "Update Work Hour: updated"
            );
            Ok(axum::Json(serde_json::json!({
                "success": true,
                "message": "Work hour entry updated successfully",
                "data": {
                    "id": updated_work_hour.id,
                    "user": current_user.name(),
                    "date": payload.date,
                    "description": payload.description,
                    "hours": payload.hours,
                    "duration_hours": payload.hours
                }
            })))
        }
        Err(e) => {
            error!("Update Work Hour: Failed to update in Teable: {}", e);
            Ok(axum::Json(serde_json::json!({
                "success": false,
                "error": format!("Failed to update work hour: {}", e)
            })))
        }
    }
}

pub async fn delete_work_hour(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, axum::http::StatusCode> {
    let user_id = extract_user_id_from_headers(&state.jwt_secret, &headers)?;

    if let Err(err) = verify_work_hour_ownership(&state, &id, &user_id, "delete").await {
        return match err {
            OwnershipError::Upstream => Err(axum::http::StatusCode::INTERNAL_SERVER_ERROR),
            OwnershipError::Denied => Ok(denied_response("delete")),
        };
    }

    match teable::delete_work_hour(&state.teable_config, &state.http_client, &id).await {
        Ok(_) => Ok(axum::Json(serde_json::json!({
            "success": true,
            "message": "Work hour deleted successfully"
        }))),
        Err(e) => {
            error!("Failed to delete work hour: {}", e);
            Ok(axum::Json(serde_json::json!({
                "success": false,
                "message": format!("Failed to delete work hour: {}", e)
            })))
        }
    }
}
