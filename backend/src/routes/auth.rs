//! Authentication routes: login, register, password reset, member selection.

use axum::{
    extract::{Json, State},
    response::IntoResponse,
    routing::post,
    Router,
};
use tracing::{debug, error, info, warn};

use crate::auth;
use crate::member_selection::{LoginResponseVariant, MemberSelectionResponse, SelectMemberRequest};
use crate::models::{
    ForgotPasswordRequest, LoginRequest, LoginResponse, RegisterRequest, ResetPasswordRequest,
    UserResponse,
};
use crate::state::AppState;
use crate::teable;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/login", post(login))
        .route("/register", post(register))
        .route("/select-member", post(select_member))
        .route("/forgotPassword", post(forgot_password))
        .route("/resetPassword", post(reset_password))
}

pub async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> Result<impl IntoResponse, axum::http::StatusCode> {
    // Normalize email to lowercase for case-insensitive comparison
    let normalized_email = payload.email.to_lowercase();
    debug!("Login attempt");

    // Verify password using MySQL database
    let auth_user = state
        .database
        .verify_password(&normalized_email, &payload.password)
        .await
        .map_err(|e| {
            error!("Database error during login: {}", e);
            axum::http::StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let _auth_user = match auth_user {
        Some(user) => {
            debug!(database_user_id = user.id, "Local password verified");
            user
        }
        None => {
            warn!("Login failed: invalid credentials");
            return Err(axum::http::StatusCode::UNAUTHORIZED);
        }
    };

    // Get all members with this email
    let teable_members =
        teable::get_members_by_email(&state.teable_config, &state.http_client, &normalized_email)
            .await
            .map_err(|e| {
                error!("Teable error: {}", e);
                axum::http::StatusCode::INTERNAL_SERVER_ERROR
            })?;

    if teable_members.is_empty() {
        warn!("Login failed: no member profile found");
        return Err(axum::http::StatusCode::UNAUTHORIZED);
    }

    if teable_members.len() == 1 {
        // Only one member, proceed as before
        let teable_user = &teable_members[0];
        let token = auth::create_token(
            &state.jwt_secret,
            &teable_user.id.to_string(),
            teable_user.role.as_deref(),
        )
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
        info!(user_id = %teable_user.id, "Login succeeded");
        return Ok(Json(LoginResponseVariant::SingleUser(LoginResponse {
            success: true,
            token,
            user: UserResponse {
                id: teable_user.id.clone(),
                name: teable_user.name(),
                email: teable_user.email.clone(),
                role: teable_user.role.clone(),
            },
        })));
    }

    // Multiple members found, return list for selection (no token yet)
    // Issue a short-lived selection token for this email
    let selection_token = auth::create_selection_token(&state.jwt_secret, &normalized_email)
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;

    let users: Vec<UserResponse> = teable_members
        .iter()
        .map(|m| UserResponse {
            id: m.id.clone(),
            name: m.name(),
            email: m.email.clone(),
            role: m.role.clone(),
        })
        .collect();

    Ok(Json(LoginResponseVariant::MultipleUsers(
        MemberSelectionResponse {
            success: true,
            multiple: true,
            users,
            selection_token,
            message: "Multiple members found for this email. Please select your profile."
                .to_string(),
        },
    )))
}

// New endpoint: select member and create token
pub async fn select_member(
    State(state): State<AppState>,
    Json(payload): Json<SelectMemberRequest>,
) -> Result<impl IntoResponse, axum::http::StatusCode> {
    // Require selection_token in payload
    let selection_token = match &payload.selection_token {
        Some(token) => token,
        None => {
            warn!("Missing selection_token in select-member request");
            return Err(axum::http::StatusCode::UNAUTHORIZED);
        }
    };

    // Validate selection token and extract email
    let email = match auth::verify_selection_token(&state.jwt_secret, selection_token) {
        Ok(email) => email,
        Err(_) => {
            warn!("Invalid or expired selection_token");
            return Err(axum::http::StatusCode::UNAUTHORIZED);
        }
    };

    // Check that the member_id belongs to the email
    let teable_member =
        teable::get_member_by_id(&state.teable_config, &state.http_client, &payload.member_id)
            .await
            .map_err(|e| {
                error!("Teable error: {}", e);
                axum::http::StatusCode::INTERNAL_SERVER_ERROR
            })?
            .ok_or(axum::http::StatusCode::UNAUTHORIZED)?;

    if teable_member.email.to_lowercase() != email.to_lowercase() {
        warn!(
            member_id = %teable_member.id,
            "Member selection rejected: profile does not belong to token"
        );
        return Err(axum::http::StatusCode::UNAUTHORIZED);
    }

    let token = auth::create_token(
        &state.jwt_secret,
        &teable_member.id.to_string(),
        teable_member.role.as_deref(),
    )
    .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;

    info!(user_id = %teable_member.id, "Login succeeded via member selection");
    Ok(Json(LoginResponse {
        success: true,
        token,
        user: UserResponse {
            id: teable_member.id.clone(),
            name: teable_member.name(),
            email: teable_member.email.clone(),
            role: teable_member.role.clone(),
        },
    }))
}

pub async fn register(
    State(_state): State<AppState>,
    Json(_payload): Json<RegisterRequest>,
) -> Result<impl IntoResponse, axum::http::StatusCode> {
    Ok((
        axum::http::StatusCode::NOT_IMPLEMENTED,
        axum::Json(serde_json::json!({
            "success": false,
            "message": "Self-registration is not available. Account creation is managed externally."
        })),
    ))
}

pub async fn forgot_password(
    State(state): State<AppState>,
    Json(payload): Json<ForgotPasswordRequest>,
) -> Result<impl IntoResponse, axum::http::StatusCode> {
    // Normalize email to lowercase for case-insensitive comparison
    let normalized_email = payload.email.to_lowercase();
    debug!("Password reset requested");

    // Always return the same response so the endpoint cannot be used to
    // enumerate registered email addresses.
    let generic_message =
        "Ein Link zum Zurücksetzen Ihres Passworts wurde an Ihre E-Mail gesendet.";

    match teable::get_member_by_email(&state.teable_config, &state.http_client, &normalized_email)
        .await
    {
        Ok(Some(user)) => {
            debug!(user_id = %user.id, "Password reset: member found");
            match state.token_store.create_reset_token(user.id.clone()).await {
                Ok(reset_token) => {
                    info!(user_id = %user.id, "Created password reset token");
                    if let Err(error) = state
                        .email_service
                        .send_password_reset_email(&user.email, &reset_token)
                        .await
                    {
                        error!(user_id = %user.id, %error, "Failed to send password reset email");
                    }
                }
                Err(error) => {
                    error!(user_id = %user.id, %error, "Failed to persist password reset token");
                }
            }
        }
        Ok(None) => {
            warn!("Password reset requested for unknown email");
        }
        Err(error) => {
            error!(%error, "Failed to fetch user from Teable");
        }
    }

    Ok(axum::Json(serde_json::json!({
        "success": true,
        "message": generic_message
    })))
}

fn validate_password(password: &str) -> Result<(), &'static str> {
    if password.chars().count() < 8 {
        return Err("Das Passwort muss mindestens 8 Zeichen lang sein.");
    }
    if password.len() > 72 {
        return Err("Das Passwort ist zu lang.");
    }
    Ok(())
}

pub async fn reset_password(
    State(state): State<AppState>,
    Json(payload): Json<ResetPasswordRequest>,
) -> Result<impl IntoResponse, axum::http::StatusCode> {
    if let Err(message) = validate_password(&payload.password) {
        return Ok(axum::Json(serde_json::json!({
            "success": false,
            "message": message
        })));
    }

    // Atomically consume and validate the reset token (single lock + expiry check)
    let reset_token_info = match state.token_store.consume_reset_token(&payload.token).await {
        Ok(Some(info)) => {
            info!(user_id = %info.user_id, "Reset token consumed");
            info
        }
        Ok(None) => {
            warn!("Failed to consume password reset token");
            return Ok(axum::Json(serde_json::json!({
                "success": false,
                "message": "Invalid or expired reset token"
            })));
        }
        Err(error) => {
            error!(%error, "Failed to consume password reset token");
            return Ok(axum::Json(serde_json::json!({
                "success": false,
                "message": "Interner Serverfehler"
            })));
        }
    };

    // Find the user in the database by Teable ID to get their email
    let teable_user = match teable::get_member_by_id_with_projection(
        &state.teable_config,
        &state.http_client,
        &reset_token_info.user_id,
        Some(&["Vorname", "Nachname", "Email"][..]), // Only fields needed for password reset
    )
    .await
    {
        Ok(Some(user)) => {
            debug!(user_id = %user.id, "Password reset: member found");
            user
        }
        Ok(None) => {
            warn!(
                user_id = %reset_token_info.user_id,
                "Password reset: member no longer exists"
            );
            return Ok(axum::Json(serde_json::json!({
                "success": false,
                "message": "Benutzer nicht gefunden"
            })));
        }
        Err(e) => {
            error!("Failed to fetch member from Teable: {}", e);
            return Ok(axum::Json(serde_json::json!({
                "success": false,
                "message": "Interner Serverfehler"
            })));
        }
    };

    // Update the password in our SQLite database
    match state.database.get_user_by_email(&teable_user.email).await {
        Ok(Some(db_user)) => {
            debug!(
                database_user_id = db_user.id,
                "Password reset: local user found"
            );
            if let Err(e) = state
                .database
                .update_password(db_user.id, &payload.password)
                .await
            {
                error!("Failed to update password in database: {}", e);
                return Ok(axum::Json(serde_json::json!({
                    "success": false,
                    "message": "Passwort konnte nicht aktualisiert werden"
                })));
            }
            info!(user_id = %teable_user.id, "Password updated");
        }
        Ok(None) => {
            debug!(
                user_id = %teable_user.id,
                "Password reset: creating local user"
            );
            // User exists in Teable but not in SQLite - create them
            let create_request = crate::database::CreateUserRequest {
                email: teable_user.email.clone(),
                password: payload.password.clone(),
            };

            match state.database.create_user(create_request).await {
                Ok(user_id) => {
                    info!(
                        database_user_id = user_id,
                        user_id = %teable_user.id,
                        "Created local user for password reset"
                    );
                }
                Err(e) => {
                    error!("Failed to create user in database: {}", e);
                    return Ok(axum::Json(serde_json::json!({
                        "success": false,
                        "message": "Benutzerkonto konnte nicht erstellt werden"
                    })));
                }
            }
        }
        Err(e) => {
            error!("Database error during password reset: {}", e);
            return Ok(axum::Json(serde_json::json!({
                "success": false,
                "message": "Datenbankfehler"
            })));
        }
    }

    Ok(axum::Json(serde_json::json!({
        "success": true,
        "message": "Passwort erfolgreich zurückgesetzt. Sie können sich jetzt mit Ihrem neuen Passwort anmelden."
    })))
}

#[cfg(test)]
mod tests {
    use super::validate_password;

    #[test]
    fn accepts_password_with_minimum_length() {
        assert!(validate_password("12345678").is_ok());
    }

    #[test]
    fn rejects_short_password() {
        assert!(validate_password("short").is_err());
    }

    #[test]
    fn rejects_password_over_bcrypt_limit() {
        assert!(validate_password(&"a".repeat(73)).is_err());
    }
}
