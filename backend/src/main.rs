use crate::config::Config;
use crate::utils::{
    calculate_total_hours, extract_user_id_from_headers, filter_work_hours_for_user_by_year,
    get_required_hours_for_member, log_work_entries, round_to_2_decimals,
};
use axum::{
    extract::{Json, Path, State},
    http::{HeaderMap, Method, Request, StatusCode, Uri},
    middleware::{self, Next},
    response::{Html, IntoResponse, Json as ResponseJson, Response},
    routing::{delete, get, post, put},
    Router,
};
use chrono::{Datelike, NaiveDate, Utc};
use reqwest::Client;
use std::sync::Arc;
use tokio::net::TcpListener;
use tower_governor::governor::GovernorConfigBuilder;
use tower_governor::{key_extractor::KeyExtractor, GovernorError, GovernorLayer};
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use tracing::{error, info};

mod auth;
mod config;
mod database;
mod email;
mod models;
mod teable;
mod token_store;
mod utils;

#[cfg(test)]
mod ts_bindings;

use database::Database;
use email::EmailService;
use models::*;
use token_store::TokenStore;

#[derive(Clone)]
struct AppState {
    http_client: Client,
    email_service: Arc<EmailService>,
    token_store: TokenStore,
    database: Database,
}

// Custom key extractor for user-based rate limiting
#[derive(Clone)]
pub struct UserKeyExtractor;

impl KeyExtractor for UserKeyExtractor {
    type Key = String;

    fn name(&self) -> &'static str {
        "user_id"
    }

    fn extract<T>(&self, req: &Request<T>) -> Result<Self::Key, GovernorError> {
        let headers = req.headers();

        // Extract the Authorization header
        let auth_header = headers
            .get("authorization")
            .and_then(|header| header.to_str().ok())
            .and_then(|header| header.strip_prefix("Bearer "));

        match auth_header {
            Some(token) => {
                // Verify and extract user ID from JWT token
                match auth::verify_token(token) {
                    Ok(claims) => {
                        // Use user_id from JWT claims as the rate limiting key
                        Ok(claims.sub)
                    }
                    Err(_) => {
                        // If token is invalid, fall back to IP-based rate limiting
                        // or you could choose to reject the request entirely
                        Err(GovernorError::UnableToExtractKey)
                    }
                }
            }
            None => {
                // No authorization header - this should be handled by auth middleware
                // but for rate limiting purposes, we'll reject it
                Err(GovernorError::UnableToExtractKey)
            }
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Load .env file
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt::init();

    // Load configuration
    let config = Config::from_env()?;

    // Initialize database connection
    let database = Database::new(&config.database_url).await?;

    let email_service = Arc::new(EmailService::new().expect("Failed to initialize email service"));
    let token_store = TokenStore::new();

    let state = AppState {
        http_client: Client::new(),
        email_service,
        token_store,
        database,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            axum::http::header::CONTENT_TYPE,
            axum::http::header::AUTHORIZATION,
            axum::http::header::ACCEPT,
        ]);

    let public_routes = Router::new()
        .route("/health", get(health_check))
        .route("/login", post(login))
        .route("/register", post(register))
        .route("/forgotPassword", post(forgot_password))
        .route("/resetPassword", post(reset_password));

    // Configure user-based rate limiting: reasonable limits per authenticated user
    // This prevents API abuse while allowing normal frontend usage patterns
    let governor_conf = Arc::new(
        GovernorConfigBuilder::default()
            .per_second(2) // 10 requests per second per user (generous for normal usage)
            .burst_size(5) // Allow bursts up to 20 requests for page loads
            .key_extractor(UserKeyExtractor) // Use our custom user-based extractor
            .finish()
            .unwrap(),
    );

    let protected_routes = Router::new()
        .route("/verify-token", get(get_user))
        .route("/dashboard/:year", get(dashboard))
        .route("/user", get(get_user))
        .route("/workHours", get(work_hours))
        .route("/workHours/:id", get(get_work_hour_by_id))
        .route("/workHours", post(create_work_hour))
        .route("/workHours/:id", put(update_work_hour))
        .route("/workHours/:id", delete(delete_work_hour))
        .route("/arbeitsstunden", get(work_hours)) // Frontend expects this endpoint
        .route("/arbeitsstunden/:id", get(get_work_hour_by_id)) // Get single entry for editing
        .route("/arbeitsstunden", post(create_work_hour)) // Frontend expects this endpoint
        .route("/arbeitsstunden/:id", put(update_work_hour)) // Frontend expects this endpoint
        .route("/arbeitsstunden/:id", delete(delete_work_hour)) // Frontend expects this endpoint
        .route_layer(middleware::from_fn(auth_middleware))
        .layer(GovernorLayer {
            config: governor_conf,
        })
        .layer(middleware::from_fn(rewrite_429_to_json));

    let api_routes = Router::new().merge(public_routes).merge(protected_routes);

    // Create a custom fallback for SPA routing
    async fn spa_fallback(uri: Uri) -> Response {
        let path = uri.path();

        // If it's an API request, return 404
        if path.starts_with("/api") {
            return (StatusCode::NOT_FOUND, "API endpoint not found").into_response();
        }

        // For all other routes, serve the index.html file for React Router
        match tokio::fs::read_to_string("/app/static/index.html").await {
            Ok(content) => Html(content).into_response(),
            Err(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Could not read index.html",
            )
                .into_response(),
        }
    }

    let app = Router::new()
        .nest("/api", api_routes)
        // Serve static files first
        .nest_service("/assets", ServeDir::new("/app/static/assets"))
        .route_service("/favicon.ico", ServeFile::new("/app/static/favicon.ico"))
        .route_service("/vite.svg", ServeFile::new("/app/static/vite.svg"))
        // Fallback to SPA handler for all other routes
        .fallback(spa_fallback)
        .layer(cors)
        .with_state(state);

    let listener = TcpListener::bind("0.0.0.0:5000").await.unwrap();
    info!("Server starting on port 5000");
    axum::serve(listener, app).await?;
    Ok(())
}

// Middleware to rewrite 429 responses to JSON
async fn rewrite_429_to_json(req: axum::extract::Request, next: Next) -> Response {
    let response = next.run(req).await;
    if response.status() == StatusCode::TOO_MANY_REQUESTS {
        let body = serde_json::json!({
            "success": false,
            "error": "Rate limit exceeded. You are making too many requests. Please slow down and try again in a few moments.",
            "code": "RATE_LIMIT_EXCEEDED"
        });
        return (StatusCode::TOO_MANY_REQUESTS, axum::Json(body)).into_response();
    }
    response
}

async fn auth_middleware(
    headers: HeaderMap,
    request: axum::extract::Request,
    next: Next,
) -> Response {
    let path = request.uri().path();

    // Skip auth for login, register, forgot-password, reset-password
    if matches!(
        path,
        "/api/login" | "/api/register" | "/api/forgotPassword" | "/api/resetPassword"
    ) {
        return next.run(request).await;
    }

    let auth_header = headers
        .get("authorization")
        .and_then(|header| header.to_str().ok())
        .and_then(|header| header.strip_prefix("Bearer "));

    match auth_header {
        Some(token) => match auth::verify_token(token) {
            Ok(_) => next.run(request).await,
            Err(_) => StatusCode::UNAUTHORIZED.into_response(),
        },
        None => StatusCode::UNAUTHORIZED.into_response(),
    }
}

async fn health_check() -> impl IntoResponse {
    ResponseJson(serde_json::json!({
        "status": "healthy",
        "service": "tsv-tennis-backend",
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}

async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> Result<impl IntoResponse, StatusCode> {
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
            StatusCode::INTERNAL_SERVER_ERROR
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
            return Err(StatusCode::UNAUTHORIZED);
        }
    };

    // Get profile data from Teable - optimized to fetch only the specific user
    let teable_user = teable::get_member_by_email(&state.http_client, &normalized_email)
        .await
        .map_err(|e| {
            error!("Teable error: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?; // User should exist in Teable

    let token = auth::create_token(&teable_user.id.to_string())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(LoginResponse {
        success: true,
        token,
        user: UserResponse {
            id: teable_user.id.clone(), // Use Teable ID for frontend compatibility
            name: teable_user.name(),
            email: teable_user.email.clone(),
        },
    }))
}

async fn register(
    State(_state): State<AppState>,
    Json(_payload): Json<RegisterRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    // In a real implementation, you would create the user in Teable
    // For now, return a simple success response
    Ok(ResponseJson(serde_json::json!({
        "message": "Registrierung erfolgreich"
    })))
}

async fn forgot_password(
    State(state): State<AppState>,
    Json(payload): Json<ForgotPasswordRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    // Normalize email to lowercase for case-insensitive comparison
    let normalized_email = payload.email.to_lowercase();
    info!(
        "Forgot password request for email: {} (normalized: {})",
        payload.email, normalized_email
    );

    // Get user from Teable - optimized to fetch only the specific user
    let user = match teable::get_member_by_email(&state.http_client, &normalized_email).await {
        Ok(Some(user)) => {
            info!("Found user in Teable: {} (ID: {})", user.email, user.id);
            user
        }
        Ok(None) => {
            info!("User not found in Teable: {}", normalized_email);
            return Ok(ResponseJson(serde_json::json!({
                "success": false,
                "message": "Diese E-Mail-Adresse ist nicht in unserem System registriert. Bitte überprüfen Sie Ihre E-Mail-Adresse oder kontaktieren Sie den Support."
            })));
        }
        Err(e) => {
            error!("Failed to fetch user from Teable: {}", e);
            return Ok(ResponseJson(serde_json::json!({
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
            Ok(ResponseJson(serde_json::json!({
                "success": true,
                "message": "A password reset link has been sent to your email."
            })))
        }
        Err(e) => {
            error!(
                "Failed to send password reset email to {}: {}",
                user.email, e
            );
            return Ok(ResponseJson(serde_json::json!({
                "success": false,
                "message": "Failed to send password reset email. Please try again later."
            })));
        }
    }
}

async fn reset_password(
    State(state): State<AppState>,
    Json(payload): Json<ResetPasswordRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    info!("Password reset attempt for token: {}", payload.token);
    info!("Reset password payload: {:?}", payload);

    // Verify token is valid and not expired
    if !state.token_store.is_token_valid(&payload.token).await {
        info!("Invalid or expired reset token: {}", payload.token);
        return Ok(ResponseJson(serde_json::json!({
            "success": false,
            "message": "Invalid or expired reset token"
        })));
    }

    // Get the user ID associated with this token
    let reset_token_info = state.token_store.consume_reset_token(&payload.token).await;

    let reset_token_info = match reset_token_info {
        Some(info) => {
            info!("Reset token consumed for user ID: {}", info.user_id);
            info
        }
        None => {
            info!("Failed to consume reset token: {}", payload.token);
            return Ok(ResponseJson(serde_json::json!({
                "success": false,
                "message": "Invalid or expired reset token"
            })));
        }
    };

    // Find the user in the database by Teable ID to get their email
    let teable_user = match teable::get_member_by_id_with_projection(
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
            return Ok(ResponseJson(serde_json::json!({
                "success": false,
                "message": "Benutzer nicht gefunden"
            })));
        }
        Err(e) => {
            error!("Failed to fetch member from Teable: {}", e);
            return Ok(ResponseJson(serde_json::json!({
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
                return Ok(ResponseJson(serde_json::json!({
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
            let create_request = database::CreateUserRequest {
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
                    return Ok(ResponseJson(serde_json::json!({
                        "success": false,
                        "message": "Benutzerkonto konnte nicht erstellt werden"
                    })));
                }
            }
        }
        Err(e) => {
            error!("Database error during password reset: {}", e);
            return Ok(ResponseJson(serde_json::json!({
                "success": false,
                "message": "Datenbankfehler"
            })));
        }
    }

    Ok(ResponseJson(serde_json::json!({
        "success": true,
        "message": "Passwort erfolgreich zurückgesetzt. Sie können sich jetzt mit Ihrem neuen Passwort anmelden."
    })))
}

async fn dashboard(
    State(state): State<AppState>,
    Path(year): Path<String>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, StatusCode> {
    println!(
        "🔍 Dashboard: Starting dashboard request for year: {}",
        year
    );

    let user_id = extract_user_id_from_headers(&headers)?;

    println!("🔍 Dashboard: User ID from token: {}", user_id);

    // Get current user by ID
    let current_user = teable::get_member_by_id_with_projection(
        &state.http_client,
        &user_id,
        Some(&["Vorname", "Nachname", "Email", "Familie"][..]), // Only fields needed for dashboard
    )
    .await
    .map_err(|e| {
        println!("🚨 Dashboard: Failed to get member by id: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or_else(|| {
        println!("🚨 Dashboard: User not found with ID: {}", user_id);
        StatusCode::NOT_FOUND
    })?;

    let work_hours = teable::get_work_hours(&state.http_client)
        .await
        .map_err(|e| {
            println!("🚨 Dashboard: Failed to get work hours: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let year_int: i32 = year.parse().unwrap_or(2024);

    // Get user's work hours using year-aware utility function
    let user_work_hours = filter_work_hours_for_user_by_year(
        &work_hours.results,
        &current_user.id,
        year_int,
        "Personal entry",
    );

    println!(
        "🔍 Dashboard: Found {} work hours for user",
        user_work_hours.len()
    );

    let total_hours = calculate_total_hours(&user_work_hours);
    println!("🔍 Dashboard: Total hours: {}", total_hours);

    // Log the personal work hours entries for debugging
    log_work_entries(&user_work_hours, "Personal");

    // Create personal data with age-based required hours
    let personal_required_hours = get_required_hours_for_member(&current_user, year_int);
    let personal_data = PersonalData {
        name: current_user.name(),
        hours: round_to_2_decimals(total_hours),
        required: personal_required_hours,
        entries: user_work_hours,
    };

    // Check if user has a family and create family data
    let family_data = if let Some(family_name) = &current_user.family_id {
        if !family_name.is_empty() {
            println!(
                "🔍 Dashboard: Processing family data for family: {}",
                family_name
            );

            // Get family members using optimized query
            let family_members_response =
                teable::get_family_members(&state.http_client, family_name)
                    .await
                    .map_err(|e| {
                        println!("🚨 Dashboard: Failed to get family members: {}", e);
                        StatusCode::INTERNAL_SERVER_ERROR
                    })?;

            let family_members: Vec<&Member> = family_members_response.results.iter().collect();
            println!(
                "🔍 Dashboard: Found {} family members",
                family_members.len()
            );

            // Calculate work hours for all family members
            let mut member_contributions = Vec::new();
            let mut family_total_hours = 0.0;
            let mut family_required_total = 0.0;

            for member in &family_members {
                println!(
                    "[FAMILY DEBUG] Member: {} | id: {} | family_id: {:?}",
                    member.name(),
                    member.id,
                    member.family_id
                );
                let member_work_hours = filter_work_hours_for_user_by_year(
                    &work_hours.results,
                    &member.id,
                    year_int,
                    &format!("Family member {}", member.name()),
                );

                let member_hours = calculate_total_hours(&member_work_hours);
                let member_required = get_required_hours_for_member(member, year_int);

                family_total_hours += member_hours;
                family_required_total += member_required;

                // Normalize date format for each entry to YYYY-MM-DD
                let entries_normalized = member_work_hours
                    .into_iter()
                    .map(|mut entry| {
                        if let Some(idx) = entry.date.find('T') {
                            entry.date = entry.date[..idx].to_string();
                        }
                        entry
                    })
                    .collect();

                member_contributions.push(MemberContribution {
                    name: member.name(),
                    hours: round_to_2_decimals(member_hours),
                    required: member_required,
                    entries: entries_normalized,
                });
            }

            let family_total_rounded = round_to_2_decimals(family_total_hours);
            let family_remaining = (family_required_total - family_total_rounded).max(0.0);
            let family_percentage = if family_required_total > 0.0 {
                (family_total_rounded / family_required_total) * 100.0
            } else {
                100.0 // If no hours required, consider it 100% complete
            };

            println!("🔍 Dashboard: Family stats - Required: {}, Completed: {}, Remaining: {}, Percentage: {}%", 
                family_required_total, family_total_rounded, family_remaining, family_percentage);

            Some(FamilyData {
                name: family_name.clone(),
                members: family_members
                    .iter()
                    .map(|m| FamilyMember {
                        id: m.id.clone(),
                        name: m.name(),
                        email: m.email.clone(),
                    })
                    .collect(),
                required: family_required_total,
                completed: family_total_rounded,
                remaining: family_remaining,
                percentage: round_to_2_decimals(family_percentage),
                member_contributions,
            })
        } else {
            None
        }
    } else {
        None
    };

    let response = DashboardResponse {
        success: true,
        family: family_data,
        personal: Some(personal_data),
        year: year_int,
    };

    // Debug: Show the final response structure
    println!("🔍 Dashboard: Final response structure:");
    if let Some(ref personal) = response.personal {
        println!(
            "  Personal data - Name: {}, Hours: {}, Required: {}",
            personal.name, personal.hours, personal.required
        );
        println!("  Personal entries count: {}", personal.entries.len());
        for (i, entry) in personal.entries.iter().enumerate() {
            println!(
                "    Entry {}: Date={}, Description={}, Hours={}",
                i + 1,
                entry.date,
                entry.description,
                entry.duration_hours
            );
        }
    }

    if let Some(ref family) = response.family {
        println!(
            "  Family data - Name: {}, Required: {}, Completed: {}",
            family.name, family.required, family.completed
        );
    }

    println!(
        "✅ Dashboard: Sending response with {} personal hours and family data: {}",
        total_hours,
        if response.family.is_some() {
            "included"
        } else {
            "none"
        }
    );

    // Debug: Show the actual JSON that will be sent to frontend
    match serde_json::to_string_pretty(&response) {
        Ok(json) => println!("🔍 Dashboard: Final JSON response:\n{}", json),
        Err(e) => println!("🚨 Dashboard: Failed to serialize response: {}", e),
    }

    Ok(ResponseJson(response))
}

async fn get_user(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, StatusCode> {
    let user_id = extract_user_id_from_headers(&headers)?;

    println!("🔍 Get User: Looking for user with ID: {}", user_id);

    // Get user by ID
    let user = teable::get_member_by_id_with_projection(
        &state.http_client,
        &user_id,
        Some(&["Vorname", "Nachname", "Email"][..]), // Only fields needed for get_user
    )
    .await
    .map_err(|e| {
        println!("🚨 Get User: Failed to get member by id: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or_else(|| {
        println!("🚨 Get User: User not found with ID: {}", user_id);
        StatusCode::NOT_FOUND
    })?;

    println!("✅ Get User: Found user: {} ({})", user.name(), user.email);

    // Return the response format expected by the frontend
    Ok(ResponseJson(serde_json::json!({
        "success": true,
        "user": {
            "id": user.id,
            "name": user.name(),
            "email": user.email.clone(),
            "profile": {
                "nachname": user.last_name.clone(),
                "vorname": user.first_name.clone(),
                "teableId": user.id
            }
        }
    })))
}

async fn work_hours(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, StatusCode> {
    let user_id = extract_user_id_from_headers(&headers)?;

    // Get current user by ID
    let current_user = teable::get_member_by_id(&state.http_client, &user_id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    // Get work hours only for this specific user (optimized)
    let work_hours = teable::get_work_hours_for_member(&state.http_client, &current_user.id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let user_work_hours: Vec<WorkHourResponse> = work_hours
        .results
        .iter()
        .filter_map(|wh| {
            // Only include entries with valid data - no need to filter by user since API already did that
            match (&wh.date, &wh.description, wh.duration_seconds) {
                (Some(date), Some(description), Some(duration)) => Some(WorkHourResponse {
                    id: wh.id.clone(),
                    date: date.clone(),
                    description: description.clone(),
                    duration_seconds: duration,
                }),
                _ => None,
            }
        })
        .collect();

    Ok(ResponseJson(user_work_hours))
}

async fn get_work_hour_by_id(
    State(state): State<AppState>,
    Path(work_hour_id): Path<String>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, StatusCode> {
    let user_id = extract_user_id_from_headers(&headers)?;

    println!(
        "🔍 Get Work Hour: Looking for work hour ID {} for user {}",
        work_hour_id, user_id
    );

    // Get current user by ID
    let current_user = teable::get_member_by_id(&state.http_client, &user_id)
        .await
        .map_err(|e| {
            println!("🚨 Get Work Hour: Failed to get member by id: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or_else(|| {
            println!("🚨 Get Work Hour: User not found with ID: {}", user_id);
            StatusCode::NOT_FOUND
        })?;

    // Get the specific work hour directly by ID (most efficient)
    let work_hour = teable::get_work_hour_by_id(&state.http_client, &work_hour_id)
        .await
        .map_err(|e| {
            println!("🚨 Get Work Hour: Failed to get work hour by id: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    match work_hour {
        Some(wh) => {
            // Verify that this work hour belongs to the current user
            let belongs_to_user = if let Some(member_id) = wh.get_member_id() {
                member_id == current_user.id
            } else {
                false
            };

            if !belongs_to_user {
                println!(
                    "🚨 Get Work Hour: Work hour {} does not belong to user {}",
                    work_hour_id, user_id
                );
                return Ok(ResponseJson(serde_json::json!({
                    "success": false,
                    "message": "Work hour entry not found or you don't have permission to access it"
                })));
            }

            // Validate that all required fields are present
            match (&wh.date, &wh.description, &wh.duration_seconds) {
                (Some(date), Some(description), Some(duration_seconds)) => {
                    let hours = duration_seconds / 3600.0; // Convert seconds back to hours
                    println!(
                        "✅ Get Work Hour: Found work hour {} for user {}",
                        work_hour_id,
                        current_user.name()
                    );
                    Ok(ResponseJson(serde_json::json!({
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
                    println!(
                        "🚨 Get Work Hour: Work hour {} has missing data",
                        work_hour_id
                    );
                    Ok(ResponseJson(serde_json::json!({
                        "success": false,
                        "message": "Work hour entry has incomplete data"
                    })))
                }
            }
        }
        None => {
            println!("🚨 Get Work Hour: Work hour {} not found", work_hour_id);
            Ok(ResponseJson(serde_json::json!({
                "success": false,
                "message": "Work hour entry not found or you don't have permission to access it"
            })))
        }
    }
}

async fn create_work_hour(
    State(state): State<AppState>,
    headers: HeaderMap,
    payload: Result<Json<CreateWorkHourRequest>, axum::extract::rejection::JsonRejection>,
) -> Result<impl IntoResponse, StatusCode> {
    let user_id = match extract_user_id_from_headers(&headers) {
        Ok(id) => id,
        Err(e) => {
            println!("🚨 Create Work Hour: Auth error: {:?}", e);
            return Err(e);
        }
    };

    let payload = match payload {
        Ok(Json(data)) => {
            println!("🔍 Create Work Hour: Successfully parsed JSON: {:?}", data);
            data
        }
        Err(rejection) => {
            println!("🚨 Create Work Hour: JSON parsing error: {:?}", rejection);
            return Ok(ResponseJson(serde_json::json!({
                "success": false,
                "error": "Invalid JSON format",
                "details": format!("{:?}", rejection)
            })));
        }
    };

    println!("🔍 Create Work Hour: User ID: {}", user_id);
    println!("🔍 Create Work Hour: Raw payload: {:?}", payload);

    // Validate required fields
    if payload.date.is_empty() {
        println!("🚨 Create Work Hour: Missing date");
        return Err(StatusCode::BAD_REQUEST);
    }
    if payload.description.is_empty() {
        println!("🚨 Create Work Hour: Missing description");
        return Err(StatusCode::BAD_REQUEST);
    }
    if payload.hours <= 0.0 {
        println!("🚨 Create Work Hour: Invalid hours: {}", payload.hours);
        return Err(StatusCode::BAD_REQUEST);
    }

    // Validate year with one-month grace period
    let date_result = chrono::NaiveDate::parse_from_str(&payload.date, "%Y-%m-%d");
    if let Ok(work_date) = date_result {
        let today = chrono::Utc::now().date_naive();
        let current_year = today.year();
        let current_month = today.month(); // 1-based (1 = January, 2 = February, etc.)
        let work_year = work_date.year();

        // Calculate minimum allowed year based on grace period
        let min_allowed_year = if current_month == 1 {
            current_year - 1
        } else {
            current_year
        };

        if work_year < min_allowed_year {
            println!(
                "🚨 Create Work Hour: Year validation failed - work year: {}, min allowed: {}",
                work_year, min_allowed_year
            );
            if current_month == 1 {
                return Ok(ResponseJson(serde_json::json!({
                    "success": false,
                    "message": format!("Arbeitsstunden können nur für {} oder {} (Nachfrist bis Ende Januar) eingetragen werden.", current_year, current_year - 1)
                })));
            } else {
                return Ok(ResponseJson(serde_json::json!({
                    "success": false,
                    "message": format!("Arbeitsstunden können nur für das aktuelle Jahr {} eingetragen werden.", current_year)
                })));
            }
        }
    } else {
        println!("🚨 Create Work Hour: Invalid date format: {}", payload.date);
        return Ok(ResponseJson(serde_json::json!({
            "success": false,
            "message": "Ungültiges Datumsformat. Bitte verwenden Sie YYYY-MM-DD."
        })));
    }

    // Use get_member_by_id for efficiency
    let current_user = teable::get_member_by_id_with_projection(
        &state.http_client,
        &user_id,
        Some(&["Vorname", "Nachname", "Email"][..]), // Only fields needed for create_work_hour
    )
    .await
    .map_err(|e| {
        println!("🚨 Create Work Hour: Failed to get member by id: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or_else(|| {
        println!("🚨 Create Work Hour: User not found with ID: {}", user_id);
        StatusCode::NOT_FOUND
    })?;

    println!("🔍 Create Work Hour: Found user: {}", current_user.name());

    // Convert hours to seconds for storage (Teable expects seconds)
    let duration_seconds = payload.hours * 3600.0;

    println!(
        "🔍 Create Work Hour: Converting {} hours to {} seconds",
        payload.hours, duration_seconds
    );

    // Check for duplicate entry for this member and date
    let existing_hours = teable::get_work_hours_for_member(&state.http_client, &current_user.id)
        .await
        .map_err(|e| {
            println!(
                "🚨 Create Work Hour: Failed to fetch work hours for duplicate check: {}",
                e
            );
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let duplicate = existing_hours
        .results
        .iter()
        .any(|wh| wh.date.as_deref() == Some(&payload.date));

    if duplicate {
        println!(
            "🚨 Create Work Hour: Duplicate entry for member {} on date {}",
            current_user.id, payload.date
        );
        return Ok(ResponseJson(serde_json::json!({
            "success": false,
            "error": "Für dieses Datum existiert bereits ein Eintrag. Pro Person und Tag ist nur ein Eintrag erlaubt."
        })));
    }

    // Try to create the work hour in Teable
    match teable::create_work_hour(
        &state.http_client,
        &payload.date,
        &payload.description,
        duration_seconds,
        current_user.id.clone(),
    )
    .await
    {
        Ok(work_hour) => {
            println!(
                "✅ Create Work Hour: Successfully created work hour with ID: {}",
                work_hour.id
            );
            Ok(ResponseJson(serde_json::json!({
                "success": true,
                "message": "Work hour entry created successfully",
                "data": {
                    "id": work_hour.id,
                    "user": current_user.name(),
                    "date": payload.date,
                    "description": payload.description,
                    "hours": payload.hours,
                    "duration_seconds": duration_seconds
                }
            })))
        }
        Err(e) => {
            println!("🚨 Create Work Hour: Failed to create in Teable: {}", e);
            // Return success anyway for now, just log the error
            Ok(ResponseJson(serde_json::json!({
                "success": true,
                "message": "Work hour entry received successfully (Teable creation failed)",
                "data": {
                    "user": current_user.name(),
                    "date": payload.date,
                    "description": payload.description,
                    "hours": payload.hours,
                    "duration_seconds": duration_seconds
                },
                "error": format!("Teable error: {}", e)
            })))
        }
    }
}

async fn update_work_hour(
    State(state): State<AppState>,
    Path(work_hour_id): Path<String>,
    headers: HeaderMap,
    payload: Result<Json<CreateWorkHourRequest>, axum::extract::rejection::JsonRejection>,
) -> Result<impl IntoResponse, StatusCode> {
    let user_id = match extract_user_id_from_headers(&headers) {
        Ok(id) => id,
        Err(e) => {
            println!("🚨 Update Work Hour: Auth error: {:?}", e);
            return Err(e);
        }
    };

    let payload = match payload {
        Ok(Json(data)) => {
            println!("🔍 Update Work Hour: Successfully parsed JSON: {:?}", data);
            data
        }
        Err(rejection) => {
            println!("🚨 Update Work Hour: JSON parsing error: {:?}", rejection);
            return Ok(ResponseJson(serde_json::json!({
                "success": false,
                "error": "Invalid JSON format",
                "details": format!("{:?}", rejection)
            })));
        }
    };

    println!(
        "🔍 Update Work Hour: User ID: {}, Work Hour ID: {}",
        user_id, work_hour_id
    );
    println!("🔍 Update Work Hour: Payload: {:?}", payload);

    // Validate required fields
    if payload.date.is_empty() {
        println!("🚨 Update Work Hour: Missing date");
        return Ok(ResponseJson(serde_json::json!({
            "success": false,
            "error": "Date is required"
        })));
    }
    if payload.description.is_empty() {
        println!("🚨 Update Work Hour: Missing description");
        return Ok(ResponseJson(serde_json::json!({
            "success": false,
            "error": "Description is required"
        })));
    }
    if payload.hours <= 0.0 {
        println!("🚨 Update Work Hour: Invalid hours: {}", payload.hours);
        return Ok(ResponseJson(serde_json::json!({
            "success": false,
            "error": "Hours must be greater than 0"
        })));
    }

    // Validate year with one-month grace period
    let date_result = chrono::NaiveDate::parse_from_str(&payload.date, "%Y-%m-%d");
    if let Ok(work_date) = date_result {
        let today = chrono::Utc::now().date_naive();
        let current_year = today.year();
        let current_month = today.month(); // 1-based (1 = January, 2 = February, etc.)
        let work_year = work_date.year();

        // Calculate minimum allowed year based on grace period
        let min_allowed_year = if current_month == 1 {
            current_year - 1
        } else {
            current_year
        };

        if work_year < min_allowed_year {
            println!(
                "🚨 Update Work Hour: Year validation failed - work year: {}, min allowed: {}",
                work_year, min_allowed_year
            );
            if current_month == 1 {
                return Ok(ResponseJson(serde_json::json!({
                    "success": false,
                    "message": format!("Arbeitsstunden können nur für {} oder {} (Nachfrist bis Ende Januar) eingetragen werden.", current_year, current_year - 1)
                })));
            } else {
                return Ok(ResponseJson(serde_json::json!({
                    "success": false,
                    "message": format!("Arbeitsstunden können nur für das aktuelle Jahr {} eingetragen werden.", current_year)
                })));
            }
        }
    } else {
        println!("🚨 Update Work Hour: Invalid date format: {}", payload.date);
        return Ok(ResponseJson(serde_json::json!({
            "success": false,
            "message": "Ungültiges Datumsformat. Bitte verwenden Sie YYYY-MM-DD."
        })));
    }

    // Use get_member_by_id for efficiency
    let current_user = teable::get_member_by_id_with_projection(
        &state.http_client,
        &user_id,
        Some(&["Vorname", "Nachname", "Email"][..]), // Only fields needed for update_work_hour
    )
    .await
    .map_err(|e| {
        println!("🚨 Update Work Hour: Failed to get member by id: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or_else(|| {
        println!("🚨 Update Work Hour: User not found with ID: {}", user_id);
        StatusCode::NOT_FOUND
    })?;

    println!("🔍 Update Work Hour: Found user: {}", current_user.name());

    // Verify the work hour exists and belongs to the current user (most efficient - direct fetch by ID)
    let existing_work_hour = teable::get_work_hour_by_id(&state.http_client, &work_hour_id)
        .await
        .map_err(|e| {
            println!("🚨 Update Work Hour: Failed to get work hour by id: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    match existing_work_hour {
        Some(wh) => {
            // Verify that this work hour belongs to the current user
            let belongs_to_user = if let Some(member_id) = wh.get_member_id() {
                member_id == current_user.id
            } else {
                false
            };

            if !belongs_to_user {
                println!(
                    "🚨 Update Work Hour: Work hour {} does not belong to user {}",
                    work_hour_id, user_id
                );
                return Ok(ResponseJson(serde_json::json!({
                    "success": false,
                    "error": "Work hour entry not found or you don't have permission to edit it"
                })));
            }
        }
        None => {
            println!("🚨 Update Work Hour: Work hour {} not found", work_hour_id);
            return Ok(ResponseJson(serde_json::json!({
                "success": false,
                "error": "Work hour entry not found or you don't have permission to edit it"
            })));
        }
    }

    // Convert hours to seconds for storage (Teable expects seconds)
    let duration_seconds = payload.hours * 3600.0;

    println!(
        "🔍 Update Work Hour: Converting {} hours to {} seconds",
        payload.hours, duration_seconds
    );

    // Try to update the work hour in Teable
    match teable::update_work_hour(
        &state.http_client,
        &work_hour_id,
        &payload.date,
        &payload.description,
        duration_seconds,
        current_user.id.clone(),
    )
    .await
    {
        Ok(updated_work_hour) => {
            println!(
                "✅ Update Work Hour: Successfully updated work hour with ID: {}",
                updated_work_hour.id
            );
            Ok(ResponseJson(serde_json::json!({
                "success": true,
                "message": "Work hour entry updated successfully",
                "data": {
                    "id": updated_work_hour.id,
                    "user": current_user.name(),
                    "date": payload.date,
                    "description": payload.description,
                    "hours": payload.hours,
                    "duration_seconds": duration_seconds
                }
            })))
        }
        Err(e) => {
            println!("🚨 Update Work Hour: Failed to update in Teable: {}", e);
            Ok(ResponseJson(serde_json::json!({
                "success": false,
                "error": format!("Failed to update work hour: {}", e)
            })))
        }
    }
}

async fn delete_work_hour(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    let _user_id = extract_user_id_from_headers(&headers)?;

    match teable::delete_work_hour(&state.http_client, &id).await {
        Ok(_) => Ok(ResponseJson(serde_json::json!({
            "success": true,
            "message": "Work hour deleted successfully"
        }))),
        Err(e) => {
            error!("Failed to delete work hour: {}", e);
            Ok(ResponseJson(serde_json::json!({
                "success": false,
                "message": format!("Failed to delete work hour: {}", e)
            })))
        }
    }
}
