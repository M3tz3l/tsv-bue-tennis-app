//! Application state, auth middleware, rate limiting, and SPA fallback.

use crate::auth;
use axum::{
    extract::State,
    http::StatusCode,
    middleware::Next,
    response::{Html, IntoResponse, Response},
};
use reqwest::Client;
use std::sync::Arc;
use tower_governor::GovernorError;

use crate::database::Database;
use crate::email::EmailService;
use crate::events::EventRepository;
use crate::teable::TeableConfig;
use crate::token_store::TokenStore;

pub use crate::models::MailJobStore;

/// Cached member counts (all + orga) with a short TTL, so the mail composer
/// does not hit the Teable API on every open. Rate-limited 429 responses are
/// not cached; a fresh value is always fetched when the TTL has elapsed.
#[derive(Clone, Default)]
pub struct MemberCountCache {
    inner: Arc<std::sync::Mutex<Option<(std::time::Instant, (usize, usize))>>>,
}

impl MemberCountCache {
    const TTL: std::time::Duration = std::time::Duration::from_secs(60);

    pub fn get(&self) -> Option<(usize, usize)> {
        let guard = self.inner.lock().ok()?;
        let (fetched_at, counts) = (*guard)?;
        if fetched_at.elapsed() < Self::TTL {
            Some(counts)
        } else {
            None
        }
    }

    pub fn set(&self, counts: (usize, usize)) {
        if let Ok(mut guard) = self.inner.lock() {
            *guard = Some((std::time::Instant::now(), counts));
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    pub http_client: Client,
    pub teable_config: TeableConfig,
    pub email_service: Arc<EmailService>,
    pub token_store: TokenStore,
    pub database: Database,
    pub event_repository: EventRepository,
    pub mail_jobs: MailJobStore,
    pub member_counts: MemberCountCache,
    pub jwt_secret: String,
}

// Custom key extractor for user-based rate limiting (for authenticated endpoints)
#[derive(Clone)]
pub struct UserKeyExtractor {
    jwt_secret: String,
}

impl UserKeyExtractor {
    pub fn new(jwt_secret: &str) -> Self {
        Self {
            jwt_secret: jwt_secret.to_string(),
        }
    }
}

impl tower_governor::key_extractor::KeyExtractor for UserKeyExtractor {
    type Key = String;

    fn name(&self) -> &'static str {
        "user_id"
    }

    fn extract<T>(&self, req: &axum::http::Request<T>) -> Result<Self::Key, GovernorError> {
        let headers = req.headers();

        let auth_header = headers
            .get("authorization")
            .and_then(|header| header.to_str().ok())
            .and_then(|header| header.strip_prefix("Bearer "));

        match auth_header {
            Some(token) => match auth::verify_token(&self.jwt_secret, token) {
                Ok(claims) => Ok(claims.sub),
                Err(_) => Err(GovernorError::UnableToExtractKey),
            },
            None => Err(GovernorError::UnableToExtractKey),
        }
    }
}

/// PeerIpKeyExtractor from tower_governor uses the actual TCP peer IP,
/// which is safe behind a trusted reverse proxy. The old custom IpKeyExtractor
/// trusted spoofable forwarding headers (X-Forwarded-For, X-Real-IP, etc.).
pub use tower_governor::key_extractor::PeerIpKeyExtractor;

// Middleware to rewrite 429 responses to JSON
pub async fn rewrite_429_to_json(req: axum::extract::Request, next: Next) -> Response {
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

pub async fn auth_middleware(
    State(state): State<AppState>,
    request: axum::extract::Request,
    next: Next,
) -> Response {
    let auth_header = request
        .headers()
        .get("authorization")
        .and_then(|header| header.to_str().ok())
        .and_then(|header| header.strip_prefix("Bearer "));

    match auth_header {
        Some(token) => match auth::verify_token(&state.jwt_secret, token) {
            Ok(_) => next.run(request).await,
            Err(_) => StatusCode::UNAUTHORIZED.into_response(),
        },
        None => StatusCode::UNAUTHORIZED.into_response(),
    }
}

// SPA fallback for React Router
pub async fn spa_fallback(uri: axum::http::Uri) -> Response {
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
