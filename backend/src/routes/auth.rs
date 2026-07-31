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
    info!(
        "Login attempt for email: {} (normalized: {})",
        payload.email, normalized_email
    );

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
            info!("User found in database: {}", user.email);
            user
        }
        None => {
            info!(
                "User not found in database or password incorrect for: {}",
                normalized_email
            );
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
        error!("No members found in Teable for email: {}", normalized_email);
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
        error!("Member ID does not belong to the email in selection_token");
        return Err(axum::http::StatusCode::UNAUTHORIZED);
    }

    let token = auth::create_token(
        &state.jwt_secret,
        &teable_member.id.to_string(),
        teable_member.role.as_deref(),
    )
    .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;

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
    info!(
        "Forgot password request for email: {} (normalized: {})",
        payload.email, normalized_email
    );

    // Get user from Teable - optimized to fetch only the specific user
    let user = match teable::get_member_by_email(
        &state.teable_config,
        &state.http_client,
        &normalized_email,
    )
    .await
    {
        Ok(Some(user)) => {
            info!("Found user in Teable: {} (ID: {})", user.email, user.id);
            user
        }
        Ok(None) => {
            warn!("User not found in Teable: {}", normalized_email);
            return Ok(axum::Json(serde_json::json!({
                "success": false,
                "message": "Diese E-Mail-Adresse ist nicht in unserem System registriert. Bitte überprüfen Sie Ihre E-Mail-Adresse oder kontaktieren Sie den Support."
            })));
        }
        Err(e) => {
            error!("Failed to fetch user from Teable: {}", e);
            return Ok(axum::Json(serde_json::json!({
                "success": false,
                "message": "Zugriff auf die Benutzerdatenbank nicht möglich. Bitte versuchen Sie es später erneut."
            })));
        }
    };

    // Create reset token
    let reset_token = state.token_store.create_reset_token(user.id.clone()).await;
    info!("Created reset token for user {}: {}", user.id, reset_token);

    // Send password reset email
    match state
        .email_service
        .send_password_reset_email(&user.email, &reset_token, user.id.clone())
        .await
    {
        Ok(_) => {
            info!("Password reset email sent successfully to: {}", user.email);
            Ok(axum::Json(serde_json::json!({
                "success": true,
                "message": "Ein Link zum Zurücksetzen Ihres Passworts wurde an Ihre E-Mail gesendet."
            })))
        }
        Err(e) => {
            error!(
                "Failed to send password reset email to {}: {}",
                user.email, e
            );
            Ok(axum::Json(serde_json::json!({
                "success": false,
                "message": "Fehler beim Senden der Passwort-Reset-E-Mail. Bitte versuchen Sie es später erneut."
            })))
        }
    }
}

pub async fn reset_password(
    State(state): State<AppState>,
    Json(payload): Json<ResetPasswordRequest>,
) -> Result<impl IntoResponse, axum::http::StatusCode> {
    debug!("Password reset attempt for token: {}", payload.token);
    debug!("Reset password payload: {:?}", payload);

    // Atomically consume and validate the reset token (single lock + expiry check)
    let reset_token_info = state.token_store.consume_reset_token(&payload.token).await;

    let reset_token_info = match reset_token_info {
        Some(info) => {
            info!("Reset token consumed for user ID: {}", info.user_id);
            info
        }
        None => {
            warn!("Failed to consume reset token: {}", payload.token);
            return Ok(axum::Json(serde_json::json!({
                "success": false,
                "message": "Invalid or expired reset token"
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
            info!(
                "Found user for password reset: {} ({})",
                user.email, user.id
            );
            user
        }
        Ok(None) => {
            error!("User with Teable ID {} not found", reset_token_info.user_id);
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
            info!(
                "Found user in database, updating password for: {}",
                db_user.email
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
            info!("Password successfully updated for user: {}", db_user.email);
        }
        Ok(None) => {
            info!(
                "User not found in database, creating new user for: {}",
                teable_user.email
            );
            // User exists in Teable but not in SQLite - create them
            let create_request = crate::database::CreateUserRequest {
                email: teable_user.email.clone(),
                password: payload.password.clone(),
            };

            match state.database.create_user(create_request).await {
                Ok(user_id) => {
                    info!(
                        "Created new user in database with ID: {} for email: {}",
                        user_id, teable_user.email
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
