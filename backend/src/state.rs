use crate::auth;
use axum::{
    http::{Request, StatusCode},
    middleware::Next,
    response::{Html, IntoResponse, Response},
};
use reqwest::Client;
use std::sync::Arc;
use tower_governor::{key_extractor::KeyExtractor, GovernorError};

use crate::database::Database;
use crate::email::EmailService;
use crate::token_store::TokenStore;

#[derive(Clone)]
pub struct AppState {
    pub http_client: Client,
    pub email_service: Arc<EmailService>,
    pub token_store: TokenStore,
    pub database: Database,
}

// Custom key extractor for user-based rate limiting (for authenticated endpoints)
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

// IP-based key extractor for authentication endpoints (before login)
#[derive(Clone)]
pub struct IpKeyExtractor;

impl KeyExtractor for IpKeyExtractor {
    type Key = String;

    fn name(&self) -> &'static str {
        "client_ip"
    }

    fn extract<T>(&self, req: &Request<T>) -> Result<Self::Key, GovernorError> {
        // Try to get the real IP from various headers (for proxy scenarios)
        let headers = req.headers();

        // Check X-Forwarded-For header first (most common for reverse proxies)
        if let Some(forwarded_for) = headers.get("x-forwarded-for") {
            if let Ok(forwarded_str) = forwarded_for.to_str() {
                // X-Forwarded-For can contain multiple IPs, take the first one (original client)
                if let Some(first_ip) = forwarded_str.split(',').next() {
                    let ip = first_ip.trim();
                    if !ip.is_empty() {
                        return Ok(ip.to_string());
                    }
                }
            }
        }

        // Check X-Real-IP header (used by some reverse proxies)
        if let Some(real_ip) = headers.get("x-real-ip") {
            if let Ok(ip_str) = real_ip.to_str() {
                if !ip_str.trim().is_empty() {
                    return Ok(ip_str.trim().to_string());
                }
            }
        }

        // Check CF-Connecting-IP header (Cloudflare)
        if let Some(cf_ip) = headers.get("cf-connecting-ip") {
            if let Ok(ip_str) = cf_ip.to_str() {
                if !ip_str.trim().is_empty() {
                    return Ok(ip_str.trim().to_string());
                }
            }
        }

        // Fallback: use a combination of User-Agent and a timestamp to create a semi-unique key
        // This ensures rate limiting still works even if we can't get the real IP
        let user_agent = headers
            .get("user-agent")
            .and_then(|ua| ua.to_str().ok())
            .unwrap_or("unknown");

        // Create a hash of the user agent for anonymity
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        user_agent.hash(&mut hasher);
        let ua_hash = hasher.finish();

        Ok(format!("fallback_{ua_hash}"))
    }
}

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
    headers: axum::http::HeaderMap,
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
