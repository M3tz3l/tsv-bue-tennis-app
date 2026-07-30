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

async fn verify_work_hour_ownership(
    state: &AppState,
    work_hour_id: &str,
    user_id: &str,
    verb: &str,
) -> Result<crate::models::WorkHour, axum::Json<serde_json::Value>> {
    let existing = teable::get_work_hour_by_id(&state.teable_config, &state.http_client, work_hour_id)
        .await
        .map_err(|e| {
            error!("{verb} Work Hour: Failed to get work hour by id: {}", e);
            axum::Json(serde_json::json!({
                "success": false,
                "message": format!("Work hour entry not found or you don't have permission to {} it", verb)
            }))
        })?;

    let wh = existing.ok_or_else(|| {
        axum::Json(serde_json::json!({
            "success": false,
            "message": format!("Work hour entry not found or you don't have permission to {} it", verb)
        }))
    })?;

    let owned = wh
        .get_member_id()
        .is_some_and(|member_id| member_id == user_id);

    if !owned {
        error!(
            "{verb} Work Hour: {} not owned by user {}",
            work_hour_id, user_id
        );
        return Err(axum::Json(serde_json::json!({
            "success": false,
            "message": format!("Work hour entry not found or you don't have permission to {} it", verb)
        })));
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

    let current_user = teable::get_member_by_id(&state.teable_config, &state.http_client, &user_id)
        .await
        .map_err(|e| {
            error!("Get Work Hour: Failed to get member by id: {}", e);
            axum::http::StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or_else(|| {
            error!("Get Work Hour: User not found with ID: {}", user_id);
            axum::http::StatusCode::NOT_FOUND
        })?;

    let wh = match verify_work_hour_ownership(&state, &work_hour_id, &user_id, "access").await {
        Ok(wh) => wh,
        Err(json) => return Ok(json),
    };

    match (&wh.date, &wh.description, &wh.duration_hours) {
        (Some(date), Some(description), Some(hours)) => {
            debug!(
                "Get Work Hour: Found work hour {} for user {}",
                work_hour_id,
                current_user.name()
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
            error!("Get Work Hour: Work hour {} has missing data", work_hour_id);
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
            error!("Create Work Hour: Auth error: {:?}", e);
            return Err(e);
        }
    };

    let payload = match payload {
        Ok(Json(data)) => {
            debug!("Create Work Hour: Successfully parsed JSON: {:?}", data);
            data
        }
        Err(rejection) => {
            error!("Create Work Hour: JSON parsing error: {:?}", rejection);
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
        error!("Create Work Hour: User not found with ID: {}", user_id);
        axum::http::StatusCode::NOT_FOUND
    })?;

    debug!("Create Work Hour: Found user: {}", current_user.name());

    debug!("Create Work Hour: Using {} hours directly", payload.hours);

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
        error!(
            "Create Work Hour: Duplicate entry for member {} on date {}",
            current_user.id, payload.date
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
                "Create Work Hour: Successfully created work hour with ID: {}",
                work_hour.id
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
            error!("Update Work Hour: Auth error: {:?}", e);
            return Err(e);
        }
    };

    let payload = match payload {
        Ok(Json(data)) => {
            debug!("Update Work Hour: Successfully parsed JSON: {:?}", data);
            data
        }
        Err(rejection) => {
            error!("Update Work Hour: JSON parsing error: {:?}", rejection);
            return Ok(axum::Json(serde_json::json!({
                "success": false,
                "error": "Invalid JSON format",
                "details": format!("{:?}", rejection)
            })));
        }
    };

    debug!(
        "Update Work Hour: User ID: {}, Work Hour ID: {}",
        user_id, work_hour_id
    );
    debug!("Update Work Hour: Payload: {:?}", payload);

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
        error!("Update Work Hour: User not found with ID: {}", user_id);
        axum::http::StatusCode::NOT_FOUND
    })?;

    debug!("Update Work Hour: Found user: {}", current_user.name());

    let _wh = match verify_work_hour_ownership(&state, &work_hour_id, &user_id, "edit").await {
        Ok(wh) => wh,
        Err(json) => return Ok(json),
    };

    debug!("Update Work Hour: Using {} hours directly", payload.hours);

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
                "Update Work Hour: Successfully updated work hour with ID: {}",
                updated_work_hour.id
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

    if let Err(json) = verify_work_hour_ownership(&state, &id, &user_id, "delete").await {
        return Ok(json);
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
