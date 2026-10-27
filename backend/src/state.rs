//! Application state, auth middleware, rate limiting, and SPA fallback.

use crate::auth;
use axum::{
    extract::{ConnectInfo, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::{Html, IntoResponse, Response},
};
use reqwest::Client;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Arc;
use tower_governor::key_extractor::KeyExtractor;
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
type MemberCounts = (usize, usize);
type MemberCountCacheEntry = Option<(std::time::Instant, MemberCounts)>;

#[derive(Clone, Default)]
pub struct MemberCountCache {
    inner: Arc<std::sync::Mutex<MemberCountCacheEntry>>,
    refresh_lock: Arc<tokio::sync::Mutex<()>>,
}

impl MemberCountCache {
    const TTL: std::time::Duration = std::time::Duration::from_secs(60);

    pub fn get(&self) -> Option<MemberCounts> {
        let guard = self.inner.lock().ok()?;
        let (fetched_at, counts) = (*guard)?;
        if fetched_at.elapsed() < Self::TTL {
            Some(counts)
        } else {
            None
        }
    }

    pub fn set(&self, counts: MemberCounts) {
        if let Ok(mut guard) = self.inner.lock() {
            *guard = Some((std::time::Instant::now(), counts));
        }
    }

    /// Serializes cache refreshes so concurrent requests only perform a
    /// single Teable fetch after the TTL has elapsed.
    pub async fn lock_refresh(&self) -> tokio::sync::MutexGuard<'_, ()> {
        self.refresh_lock.lock().await
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

/// Rate-limit key extractor that uses the real client IP behind a trusted
/// reverse proxy while ignoring spoofed forwarding headers from untrusted
/// peers.
///
/// The TCP peer address is authoritative. Forwarding headers are only
/// consulted when the peer is a loopback, private, or link-local address
/// (e.g. Traefik on the Docker network). This prevents direct clients from
/// choosing their own rate-limit bucket while still separating users behind
/// the proxy.
#[derive(Clone, Copy)]
pub struct TrustedProxyIpKeyExtractor;

impl KeyExtractor for TrustedProxyIpKeyExtractor {
    type Key = IpAddr;

    fn name(&self) -> &'static str {
        "trusted_proxy_ip"
    }

    fn extract<T>(&self, req: &axum::http::Request<T>) -> Result<Self::Key, GovernorError> {
        let peer = req
            .extensions()
            .get::<ConnectInfo<SocketAddr>>()
            .map(|connect_info| connect_info.0.ip());

        match peer {
            Some(peer) if is_trusted_proxy(peer) => {
                Ok(forwarded_client_ip(req.headers()).unwrap_or(peer))
            }
            Some(peer) => Ok(peer),
            // Test servers and unusual adapters may not install ConnectInfo.
            // Keep a deterministic local bucket instead of failing open.
            None => Ok(IpAddr::V4(Ipv4Addr::LOCALHOST)),
        }
    }
}

fn is_trusted_proxy(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => ip.is_loopback() || ip.is_private() || ip.is_link_local(),
        IpAddr::V6(ip) => {
            let segments = ip.segments();
            ip.is_loopback() || (segments[0] & 0xfe00) == 0xfc00 || (segments[0] & 0xffc0) == 0xfe80
        }
    }
}

/// Returns the right-most untrusted address from `X-Forwarded-For`, falling
/// back to `X-Real-IP`. Walking from the right means a client-supplied prefix
/// cannot override the address appended by the trusted proxy.
fn forwarded_client_ip(headers: &HeaderMap) -> Option<IpAddr> {
    let mut candidates: Vec<IpAddr> = headers
        .get_all("x-forwarded-for")
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(','))
        .filter_map(|value| value.trim().parse::<IpAddr>().ok())
        .collect();

    if candidates.is_empty() {
        if let Some(ip) = headers
            .get("x-real-ip")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.trim().parse::<IpAddr>().ok())
        {
            candidates.push(ip);
        }
    }

    let rightmost = candidates.last().copied();
    candidates
        .into_iter()
        .rev()
        .find(|ip| !is_trusted_proxy(*ip))
        .or(rightmost)
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
pub async fn spa_fallback(uri: axum::http::Uri, headers: axum::http::HeaderMap) -> Response {
    let path = uri.path();

    // If it's an API request, return 404
    if path.starts_with("/api") {
        return (StatusCode::NOT_FOUND, "API endpoint not found").into_response();
    }

    // Serve index.html only for HTML navigation requests (e.g. a browser
    // navigating to a client-side route). Missing asset requests — fonts,
    // images, scripts — that were not served by ServeDir return 404 rather
    // than HTML. Navigation intent is detected via the Accept header (and
    // Sec-Fetch-Dest when present) so dotted paths like /members/alice.smith
    // are still treated as navigation, not assets.
    if !wants_html(&headers) {
        return (StatusCode::NOT_FOUND, "Not found").into_response();
    }

    // Serve the index.html file for React Router. The static dir is
    // configurable for tests, defaulting to /app/static in the Docker image.
    let static_dir = std::env::var("STATIC_DIR").unwrap_or_else(|_| "/app/static".to_string());
    match tokio::fs::read_to_string(format!("{static_dir}/index.html")).await {
        Ok(content) => Html(content).into_response(),
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not read index.html",
        )
            .into_response(),
    }
}

/// True when the request is a browser HTML navigation (Accept includes
/// text/html, or Sec-Fetch-Dest is "document"), so the SPA fallback applies.
fn wants_html(headers: &axum::http::HeaderMap) -> bool {
    if headers
        .get("sec-fetch-dest")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v == "document" || v == "empty")
    {
        return true;
    }
    headers
        .get("accept")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.contains("text/html"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use std::net::Ipv4Addr;

    fn request(peer: Option<IpAddr>, xff: Option<&str>, real_ip: Option<&str>) -> Request<Body> {
        let mut request = Request::builder()
            .uri("/api/login")
            .body(Body::empty())
            .unwrap();
        if let Some(peer) = peer {
            request
                .extensions_mut()
                .insert(ConnectInfo(SocketAddr::new(peer, 12345)));
        }
        if let Some(xff) = xff {
            request
                .headers_mut()
                .insert("x-forwarded-for", xff.parse().unwrap());
        }
        if let Some(real_ip) = real_ip {
            request
                .headers_mut()
                .insert("x-real-ip", real_ip.parse().unwrap());
        }
        request
    }

    fn extract(request: &Request<Body>) -> IpAddr {
        TrustedProxyIpKeyExtractor.extract(request).unwrap()
    }

    #[test]
    fn trusts_forwarded_for_from_private_proxy() {
        let request = request(
            Some(IpAddr::V4(Ipv4Addr::new(10, 0, 0, 2))),
            Some("203.0.113.9"),
            None,
        );
        assert_eq!(extract(&request), IpAddr::V4(Ipv4Addr::new(203, 0, 113, 9)));
    }

    #[test]
    fn ignores_forwarded_for_from_untrusted_peer() {
        let request = request(
            Some(IpAddr::V4(Ipv4Addr::new(198, 51, 100, 7))),
            Some("203.0.113.9"),
            None,
        );
        assert_eq!(
            extract(&request),
            IpAddr::V4(Ipv4Addr::new(198, 51, 100, 7))
        );
    }

    #[test]
    fn skips_trusted_proxies_from_the_right() {
        let request = request(
            Some(IpAddr::V4(Ipv4Addr::new(10, 0, 0, 2))),
            Some("203.0.113.9, 10.0.0.3"),
            None,
        );
        assert_eq!(extract(&request), IpAddr::V4(Ipv4Addr::new(203, 0, 113, 9)));
    }

    #[test]
    fn uses_rightmost_forwarded_address() {
        let request = request(
            Some(IpAddr::V4(Ipv4Addr::new(10, 0, 0, 2))),
            Some("1.2.3.4, 203.0.113.9"),
            None,
        );
        assert_eq!(extract(&request), IpAddr::V4(Ipv4Addr::new(203, 0, 113, 9)));
    }

    #[test]
    fn falls_back_to_x_real_ip() {
        let request = request(
            Some(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1))),
            None,
            Some("203.0.113.10"),
        );
        assert_eq!(
            extract(&request),
            IpAddr::V4(Ipv4Addr::new(203, 0, 113, 10))
        );
    }

    #[test]
    fn falls_back_to_loopback_without_connect_info() {
        let request = request(None, Some("203.0.113.9"), None);
        assert_eq!(extract(&request), IpAddr::V4(Ipv4Addr::LOCALHOST));
    }

    #[test]
    fn forwarded_headers_are_ignored_without_connect_info() {
        let request = request(None, Some("203.0.113.9"), Some("203.0.113.10"));
        assert_eq!(extract(&request), IpAddr::V4(Ipv4Addr::LOCALHOST));
    }

    #[test]
    fn trusted_proxy_without_forwarding_header_uses_peer() {
        let request = request(Some(IpAddr::V4(Ipv4Addr::new(10, 0, 0, 2))), None, None);
        assert_eq!(extract(&request), IpAddr::V4(Ipv4Addr::new(10, 0, 0, 2)));
    }
}
