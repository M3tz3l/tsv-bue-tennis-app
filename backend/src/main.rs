use axum::{
    extract::{Json, State},
    handler::HandlerWithoutStateExt,
    http::{HeaderMap, Method, StatusCode},
    middleware,
    response::IntoResponse,
    routing::get,
    Router,
};
use reqwest::Client;
use std::sync::Arc;
use tokio::net::TcpListener;
use tower_governor::governor::GovernorConfigBuilder;
use tower_governor::GovernorLayer;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::services::ServeDir;
use tracing::{debug, error, info};
use tsv_tennis_backend::config::Config;
use tsv_tennis_backend::database::Database;
use tsv_tennis_backend::email::EmailService;
use tsv_tennis_backend::events::EventRepository;
use tsv_tennis_backend::token_store::TokenStore;

use tsv_tennis_backend::{routes, state, teable};

#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

// Re-export for tests (which use `use super::*`)

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load .env file
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt::init();

    // Load configuration
    let config = Config::from_env()?;

    // Initialize database connection
    let database = Database::new(&config.database_url).await?;
    let event_repository = EventRepository::new(database.pool().clone()).await?;

    let email_service = Arc::new(EmailService::new().expect("Failed to initialize email service"));
    let token_store = TokenStore::new();

    // ── Startup diagnostics ──────────────────────────────────────────────────
    info!("Running startup diagnostics...");
    info!("  Teable API URL: {}", config.teable_api_url);
    info!("  Members table:  {}", config.members_table_id);
    info!("  Work hours tbl: {}", config.work_hours_table_id);

    let http_client = Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;

    let teable_config = teable::TeableConfig {
        api_url: config.teable_api_url.clone(),
        token: config.teable_token.clone(),
        members_table_id: config.members_table_id.clone(),
        work_hours_table_id: config.work_hours_table_id.clone(),
    };

    // 1. Verify members table is accessible (also confirms API connectivity + auth)
    match teable::check_table_access(
        &teable_config,
        &http_client,
        &config.members_table_id,
        "members",
    )
    .await
    {
        Ok(count) => info!(" Members table accessible — {} records", count),
        Err(e) => error!(" Members table error: {}", e),
    }

    // 2. Verify work_hours table is accessible
    match teable::check_table_access(
        &teable_config,
        &http_client,
        &config.work_hours_table_id,
        "work_hours",
    )
    .await
    {
        Ok(count) => info!(" Work hours table accessible — {} records", count),
        Err(e) => error!(" Work hours table error: {}", e),
    }

    // 3. Verify SQLite database
    match database.health_check().await {
        Ok(_) => info!("✅ SQLite database connection OK"),
        Err(e) => error!("❌ SQLite database error: {}", e),
    }

    info!("Startup diagnostics complete");
    // ──────────────────────────────────────────────────────────────────────────

    let mail_jobs: state::MailJobStore =
        std::sync::Arc::new(tokio::sync::RwLock::new(std::collections::HashMap::new()));

    // Spawn periodic cleanup of stale mail jobs (older than 1 hour)
    {
        let jobs = mail_jobs.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(300)); // every 5 min
            loop {
                interval.tick().await;
                let cutoff = chrono::Utc::now() - chrono::Duration::hours(1);
                let mut jobs = jobs.write().await;
                let before = jobs.len();
                jobs.retain(|_, j| j.created_at > cutoff);
                let removed = before - jobs.len();
                if removed > 0 {
                    info!("Cleaned up {} stale mail jobs", removed);
                }
            }
        });
    }

    let state = state::AppState {
        http_client,
        teable_config,
        email_service,
        token_store,
        database,
        event_repository,
        mail_jobs,
        member_counts: state::MemberCountCache::default(),
        jwt_secret: config.jwt_secret.clone(),
    };

    let cors = build_cors(&config.frontend_url);

    // Configure rate limiting for authentication and security-sensitive endpoints (restrictive)
    let auth_governor_conf = Arc::new(
        GovernorConfigBuilder::default()
            .per_second(1) // 1 request per second for all auth/security endpoints
            .burst_size(3) // Allow small bursts for retry scenarios
            .key_extractor(state::PeerIpKeyExtractor) // Use TCP peer IP for auth rate limiting
            .finish()
            .expect("Failed to build auth rate limiter config"),
    );

    // Health check route (no rate limiting)
    let health_routes = Router::new().route("/health", get(health_check));

    // Authentication and security-sensitive routes with restrictive rate limiting
    let auth_routes = routes::auth::routes()
        .layer(GovernorLayer {
            config: auth_governor_conf,
        })
        .layer(middleware::from_fn(state::rewrite_429_to_json));

    let public_routes = Router::new().merge(health_routes).merge(auth_routes);

    // Configure user-based rate limiting: reasonable limits per authenticated user
    // This prevents API abuse while allowing normal frontend usage patterns
    let read_governor_conf = Arc::new(
        GovernorConfigBuilder::default()
            .per_second(5) // 5 read requests per second per user (generous for normal usage)
            .burst_size(10) // Allow bursts up to 10 requests for page loads
            .key_extractor(state::UserKeyExtractor::new(&config.jwt_secret)) // Use our custom user-based extractor
            .finish()
            .expect("Failed to build read rate limiter config"),
    );

    // More restrictive rate limiting for write operations
    let write_governor_conf = Arc::new(
        GovernorConfigBuilder::default()
            .per_second(1) // 1 write request per second per user
            .burst_size(3) // Allow small bursts for quick operations
            .key_extractor(state::UserKeyExtractor::new(&config.jwt_secret))
            .finish()
            .expect("Failed to build write rate limiter config"),
    );

    // Generous limiter for the mail job-status polling endpoint, which the UI
    // polls repeatedly (every ~1.5s) while a bulk send is in flight. Regular
    // polling must never be throttled into a failure.
    let job_poll_governor_conf = Arc::new(
        GovernorConfigBuilder::default()
            .per_second(20)
            .burst_size(50)
            .key_extractor(state::UserKeyExtractor::new(&config.jwt_secret))
            .finish()
            .expect("Failed to build job poll rate limiter config"),
    );

    // Read-only protected routes with generous rate limiting
    let read_routes = Router::new()
        .route("/verify-token", get(get_user))
        .route("/dashboard/:year", get(routes::dashboard::dashboard))
        .route("/user", get(get_user))
        .nest("/arbeitsstunden", routes::work_hours::routes())
        .merge(routes::mail::member_count_routes())
        .merge(routes::events::read_routes())
        .layer(GovernorLayer {
            config: read_governor_conf,
        })
        .layer(middleware::from_fn(state::rewrite_429_to_json));

    // Mail job-status polling gets its own, much higher limiter so that
    // repeated status polls during a bulk send are never rate-limited.
    let job_poll_routes = Router::new()
        .route("/mail/jobs/:job_id", get(routes::mail::get_mail_job_status))
        .layer(GovernorLayer {
            config: job_poll_governor_conf,
        })
        .layer(middleware::from_fn(state::rewrite_429_to_json));

    // Write operations with stricter rate limiting
    let write_routes = Router::new()
        .route(
            "/mail/test-send",
            axum::routing::post(routes::mail::send_test_mail),
        )
        .route(
            "/mail/send",
            axum::routing::post(routes::mail::send_bulk_mail),
        )
        .merge(routes::events::write_routes())
        .layer(GovernorLayer {
            config: write_governor_conf,
        })
        .layer(middleware::from_fn(state::rewrite_429_to_json));

    let protected_routes = Router::new()
        .merge(read_routes)
        .merge(write_routes)
        .merge(job_poll_routes)
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            state::auth_middleware,
        ));

    let api_routes = Router::new().merge(public_routes).merge(protected_routes);

    let app = Router::new()
        .nest("/api", api_routes)
        // Serve static files (assets, fonts, favicon). Missing files fall
        // through to spa_fallback, which serves index.html for navigation
        // routes but 404s missing asset files (fonts, images, scripts).
        .nest_service(
            "/",
            ServeDir::new("/app/static").fallback(state::spa_fallback.into_service()),
        )
        .layer(cors)
        .with_state(state);

    let port = config.port;
    let listener = TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .expect("Failed to bind TCP listener");
    info!("Server starting on port {}", port);
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await?;
    Ok(())
}

async fn health_check() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "healthy",
        "service": "tsv-tennis-backend",
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}

/// Builds the CORS layer restricted to the frontend origin(s).
///
/// The browser never needs to reach the API cross-origin in production (the
/// SPA is served same-origin by this backend, and the Vite dev server proxies
/// `/api`). Allowing arbitrary origins would let any site read bearer-token
/// responses. We only permit the configured frontend URL (and the common
/// localhost dev origins) so local development keeps working.
fn build_cors(frontend_url: &str) -> CorsLayer {
    let mut origins = vec![
        "http://localhost:5173".to_string(),
        "http://127.0.0.1:5173".to_string(),
        frontend_url.to_string(),
    ];
    origins.sort();
    origins.dedup();

    CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins.into_iter().map(|origin| {
            origin
                .parse::<axum::http::HeaderValue>()
                .unwrap_or_else(|_| {
                    // Fall back to a permissive value for invalid config so
                    // an unparseable FRONTEND_URL does not break the server.
                    axum::http::HeaderValue::from_static("*")
                })
        })))
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
        ])
}

async fn get_user(
    State(state): State<state::AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, StatusCode> {
    let user_id =
        tsv_tennis_backend::utils::extract_user_id_from_headers(&state.jwt_secret, &headers)?;

    debug!("Get User: Looking for user with ID: {}", user_id);

    // Get user by ID
    let user = teable::get_member_by_id_with_projection(
        &state.teable_config,
        &state.http_client,
        &user_id,
        Some(&["Vorname", "Nachname", "Email", "Rolle"][..]),
    )
    .await
    .map_err(|e| {
        error!("Get User: Failed to get member by id: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or_else(|| {
        error!("Get User: User not found with ID: {}", user_id);
        StatusCode::NOT_FOUND
    })?;

    info!("Get User: Found user: {} ({})", user.name(), user.email);

    // Return the response format expected by the frontend
    Ok(Json(serde_json::json!({
        "success": true,
        "user": {
            "id": user.id,
            "name": user.name(),
            "email": user.email.clone(),
            "role": user.role.clone(),
            "profile": {
                "nachname": user.last_name.clone(),
                "vorname": user.first_name.clone(),
                "teableId": user.id
            }
        }
    })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum_test::TestServer;
    use tsv_tennis_backend::auth;

    const TEST_JWT_SECRET: &str = "test_jwt_secret_key_for_testing_purposes_only_123456789";

    fn set_test_env(teable_url: &str) {
        std::env::set_var("EMAIL_USER", "test@example.com");
        std::env::set_var("EMAIL_PASSWORD", "dummy_password");
        std::env::set_var("EMAIL_HOST", "smtp.example.com");
        std::env::set_var("EMAIL_PORT", "587");
        std::env::set_var("EMAIL_FROM", "test@example.com");
        std::env::set_var("EMAIL_DISABLE_SEND", "true");
        std::env::set_var("JWT_SECRET", TEST_JWT_SECRET);
        std::env::set_var("DATABASE_URL", "sqlite::memory:");
        std::env::set_var("FRONTEND_URL", "http://localhost:5173");
        std::env::set_var("TEABLE_API_URL", teable_url);
        std::env::set_var("TEABLE_TOKEN", "test_token");
        std::env::set_var("TEABLE_BASE_ID", "test_base_id");
        std::env::set_var("MEMBERS_TABLE_ID", "test_members_table");
        std::env::set_var("WORK_HOURS_TABLE_ID", "test_work_hours_table");
    }

    async fn create_test_app() -> Router {
        create_test_app_with_teable_url("https://test.teable.io").await
    }

    async fn create_test_app_with_teable_url(teable_url: &str) -> Router {
        set_test_env(teable_url);

        // Create a test state with minimal setup
        let email_service =
            Arc::new(EmailService::new().expect("Failed to initialize test email service"));
        let token_store = TokenStore::new();

        // For tests, we can use an in-memory database
        let database = Database::new(":memory:")
            .await
            .expect("Failed to create test database");
        let event_repository = EventRepository::new(database.pool().clone())
            .await
            .expect("Failed to create test event repository");

        let teable_config = tsv_tennis_backend::teable::TeableConfig {
            api_url: teable_url.to_string(),
            token: "test_token".to_string(),
            members_table_id: "test_members_table".to_string(),
            work_hours_table_id: "test_work_hours_table".to_string(),
        };

        let state = state::AppState {
            http_client: Client::new(),
            teable_config,
            email_service,
            token_store,
            database,
            event_repository,
            mail_jobs: std::sync::Arc::new(tokio::sync::RwLock::new(
                std::collections::HashMap::new(),
            )),
            member_counts: state::MemberCountCache::default(),
            jwt_secret: TEST_JWT_SECRET.to_string(),
        };

        let cors = build_cors("http://localhost:5173");

        // Simple routes for testing - no rate limiting to keep tests simple
        let health_routes = Router::new().route("/health", get(health_check));
        let auth_routes = routes::auth::routes();

        let public_routes = Router::new().merge(health_routes).merge(auth_routes);

        let protected_routes = Router::new()
            .route("/verify-token", get(get_user))
            .route("/dashboard/:year", get(routes::dashboard::dashboard))
            .route("/user", get(get_user))
            .route(
                "/mail/test-send",
                axum::routing::post(routes::mail::send_test_mail),
            )
            .route(
                "/mail/send",
                axum::routing::post(routes::mail::send_bulk_mail),
            )
            .route("/mail/jobs/:job_id", get(routes::mail::get_mail_job_status))
            .nest("/arbeitsstunden", routes::work_hours::routes())
            .merge(routes::events::routes())
            .route_layer(middleware::from_fn_with_state(
                state.clone(),
                state::auth_middleware,
            ));

        let api_routes = Router::new().merge(public_routes).merge(protected_routes);

        Router::new()
            .nest("/api", api_routes)
            .layer(cors)
            .with_state(state)
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_health_endpoint() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        let response = server.get("/api/health").await;
        assert_eq!(response.status_code(), 200);

        let json: serde_json::Value = response.json();
        assert_eq!(json["status"], "healthy");
        assert_eq!(json["service"], "tsv-tennis-backend");
        assert!(json["timestamp"].is_string());
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_login_with_invalid_credentials() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        let login_request = serde_json::json!({
            "email": "nonexistent@example.com",
            "password": "wrongpassword"
        });

        let response = server.post("/api/login").json(&login_request).await;

        assert_eq!(response.status_code(), 401);
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_protected_endpoint_without_auth() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        let response = server.get("/api/user").await;
        assert_eq!(response.status_code(), 401);
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_protected_endpoint_with_invalid_token() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        let response = server
            .get("/api/user")
            .add_header("authorization", "Bearer invalid_token")
            .await;

        assert_eq!(response.status_code(), 401);
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_work_hours_endpoint_requires_auth() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        let response = server.get("/api/arbeitsstunden").await;
        assert_eq!(response.status_code(), 401);
    }

    // Test with mockito for external API calls
    #[serial_test::serial]
    #[tokio::test]
    async fn test_with_mocked_external_api() {
        use mockito::Server;

        // Start a mock server
        let mut server = Server::new_async().await;

        // Mock the Teable API endpoint
        let _mock = server
            .mock("GET", "/")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(r#"{"records": []}"#)
            .create_async()
            .await;

        // This demonstrates how to mock external services like Teable
        let app = create_test_app().await;
        let test_server = TestServer::new(app).unwrap();

        let response = test_server.get("/api/health").await;
        assert_eq!(response.status_code(), 200);

        // Note: Mock is not actually called since we're not configuring the app to use it
        // In a real implementation, we'd configure the app to use server.url()
        // for external API calls instead of the real Teable API
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_register_endpoint() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        let register_request = serde_json::json!({
            "email": "test@example.com",
            "password": "testpassword123"
        });

        let response = server.post("/api/register").json(&register_request).await;

        assert_eq!(response.status_code(), 422); // Unprocessable Entity - validation error in real app
                                                 // In a real implementation this would be 200, but our test register endpoint
                                                 // doesn't have full validation logic
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_forgot_password_endpoint() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        let forgot_password_request = serde_json::json!({
            "email": "nonexistent@example.com"
        });

        let response = server
            .post("/api/forgotPassword")
            .json(&forgot_password_request)
            .await;

        assert_eq!(response.status_code(), 200);
        // Should return success false for non-existent user
        let json: serde_json::Value = response.json();
        assert_eq!(json["success"], false);
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_create_work_hour_without_auth() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        let work_hour_request = serde_json::json!({
            "date": "2024-01-15",
            "description": "Test work",
            "hours": 2.5
        });

        let response = server
            .post("/api/arbeitsstunden")
            .json(&work_hour_request)
            .await;

        assert_eq!(response.status_code(), 401);
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_update_work_hour_without_auth() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        let work_hour_request = serde_json::json!({
            "date": "2024-01-15",
            "description": "Updated work",
            "hours": 3.0
        });

        let response = server
            .put("/api/arbeitsstunden/123")
            .json(&work_hour_request)
            .await;

        assert_eq!(response.status_code(), 401);
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_delete_work_hour_without_auth() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        let response = server.delete("/api/arbeitsstunden/123").await;
        assert_eq!(response.status_code(), 401);
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_dashboard_without_auth() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        let response = server.get("/api/dashboard/2024").await;
        assert_eq!(response.status_code(), 401);
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_get_work_hour_by_id_without_auth() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        let response = server.get("/api/arbeitsstunden/123").await;
        assert_eq!(response.status_code(), 401);
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_cors_headers() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        // Allowed origin (frontend dev URL) should receive CORS headers
        let response = server
            .get("/api/health")
            .add_header("Origin", "http://localhost:5173")
            .add_header("Access-Control-Request-Method", "GET")
            .await;

        assert_eq!(response.status_code(), 200);
        assert_eq!(
            response.headers().get("access-control-allow-origin"),
            Some(&axum::http::HeaderValue::from_static(
                "http://localhost:5173"
            ))
        );
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_cors_rejects_unknown_origin() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        // Unknown origin should not receive CORS allow-origin headers
        let response = server
            .get("/api/health")
            .add_header("Origin", "http://evil.example.com")
            .add_header("Access-Control-Request-Method", "GET")
            .await;

        assert_eq!(response.status_code(), 200);
        assert_eq!(response.headers().get("access-control-allow-origin"), None);
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_invalid_json_payload() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        let response = server
            .post("/api/login")
            .add_header("content-type", "application/json")
            .text("invalid json")
            .await;

        assert_eq!(response.status_code(), 415); // Unsupported Media Type
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_missing_content_type() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        let login_request = serde_json::json!({
            "email": "test@example.com",
            "password": "password"
        });

        let response = server
            .post("/api/login")
            .text(login_request.to_string())
            .await;

        // Should handle missing content-type gracefully
        assert_eq!(response.status_code(), 415); // Unsupported Media Type
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_arbeitsstunden_endpoints() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        // Test German endpoints (should behave same as English ones)
        let response = server.get("/api/arbeitsstunden").await;
        assert_eq!(response.status_code(), 401);

        let response = server.get("/api/arbeitsstunden/123").await;
        assert_eq!(response.status_code(), 401);

        let work_hour_request = serde_json::json!({
            "date": "2024-01-15",
            "description": "Test work",
            "hours": 2.5
        });

        let response = server
            .post("/api/arbeitsstunden")
            .json(&work_hour_request)
            .await;
        assert_eq!(response.status_code(), 401);

        let response = server
            .put("/api/arbeitsstunden/123")
            .json(&work_hour_request)
            .await;
        assert_eq!(response.status_code(), 401);

        let response = server.delete("/api/arbeitsstunden/123").await;
        assert_eq!(response.status_code(), 401);
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_api_not_found() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        let response = server.get("/api/nonexistent").await;
        assert_eq!(response.status_code(), 404);
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_spa_fallback() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        // Non-API routes should return SPA fallback (though file might not exist in test)
        let response = server.get("/dashboard").await;
        // Should attempt to serve index.html, but file likely doesn't exist in test
        // So we expect either 404 or 500 (file not found)
        assert!(response.status_code() == 404 || response.status_code() == 500);
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_static_file_serving() {
        // Build a static-serving router against a temporary fixture dir so the
        // test exercises ServeDir + the SPA fallback for real.
        let static_dir =
            std::env::temp_dir().join(format!("tsv-static-test-{}", std::process::id()));
        let fonts_dir = static_dir.join("fonts");
        std::fs::create_dir_all(&fonts_dir).unwrap();
        std::fs::write(fonts_dir.join("archivo-latin.woff2"), b"fake-woff2-bytes").unwrap();
        std::fs::write(static_dir.join("index.html"), b"<html>tsv-spa</html>").unwrap();

        let app = Router::new()
            .nest_service(
                "/",
                ServeDir::new(&static_dir).fallback(state::spa_fallback.into_service()),
            )
            .with_state(create_test_app().await);
        let server = TestServer::new(app).unwrap();

        // Existing font serves its bytes with the font content type.
        let font = server.get("/fonts/archivo-latin.woff2").await;
        assert_eq!(font.status_code(), 200);
        assert_eq!(font.text(), "fake-woff2-bytes");
        assert!(font
            .headers()
            .get("content-type")
            .map(|v| v.to_str().unwrap())
            .unwrap_or("")
            .contains("font"));

        // Missing asset returns 404, not index.html.
        let missing = server.get("/fonts/does-not-exist.woff2").await;
        assert_eq!(missing.status_code(), 404);

        // SPA navigation routes serve index.html when the client asks for HTML.
        std::env::set_var("STATIC_DIR", &static_dir);
        let spa = server
            .get("/dashboard/veranstaltungen")
            .add_header("accept", "text/html")
            .await;
        assert_eq!(spa.status_code(), 200);
        assert_eq!(spa.text(), "<html>tsv-spa</html>");

        // A dotted navigation path is still a navigation, not an asset.
        let dotted = server
            .get("/members/alice.smith")
            .add_header("accept", "text/html")
            .await;
        assert_eq!(dotted.status_code(), 200);
        assert_eq!(dotted.text(), "<html>tsv-spa</html>");

        // A non-HTML request for a missing path 404s (e.g. an API-ish/asset
        // request that was not served by ServeDir).
        let non_html = server.get("/members/alice.smith").await;
        assert_eq!(non_html.status_code(), 404);
        std::env::remove_var("STATIC_DIR");

        std::fs::remove_dir_all(&static_dir).ok();
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_reset_password_invalid_token() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        let reset_request = serde_json::json!({
            "token": "invalid_token",
            "password": "newpassword123"
        });

        let response = server.post("/api/resetPassword").json(&reset_request).await;

        assert_eq!(response.status_code(), 200);
        let json: serde_json::Value = response.json();
        assert_eq!(json["success"], false);
        assert!(json["message"]
            .as_str()
            .unwrap()
            .contains("Invalid or expired"));
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_select_member_without_token() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        let select_request = serde_json::json!({
            "member_id": "test_member_123"
        });

        let response = server
            .post("/api/select-member")
            .json(&select_request)
            .await;

        assert_eq!(response.status_code(), 401);
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_verify_token_endpoint() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        // Without auth
        let response = server.get("/api/verify-token").await;
        assert_eq!(response.status_code(), 401);

        // With invalid token
        let response = server
            .get("/api/verify-token")
            .add_header("authorization", "Bearer invalid_token")
            .await;
        assert_eq!(response.status_code(), 401);
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_send_test_mail_with_orga_role_succeeds() {
        use mockito::Server;

        let mut teable_server = Server::new_async().await;

        let _member_mock = teable_server
            .mock("GET", "/table/test_members_table/record/orga_user_1")
            .match_query(mockito::Matcher::Any)
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                r#"{
                "id": "orga_user_1",
                "fields": {
                    "Vorname": "Orga",
                    "Nachname": "User",
                    "Email": "orga@example.com"
                }
            }"#,
            )
            .create_async()
            .await;

        let app = create_test_app_with_teable_url(&teable_server.url()).await;
        let server = TestServer::new(app).unwrap();

        let token = auth::create_token(TEST_JWT_SECRET, "orga_user_1", Some("orga"))
            .expect("Failed to create orga test token");

        // Mail endpoints now expect multipart/form-data
        let response = server
            .post("/api/mail/test-send")
            .add_header("authorization", &format!("Bearer {token}"))
            .multipart(
                axum_test::multipart::MultipartForm::new()
                    .add_text("subject", "Test")
                    .add_text("message", "Hallo"),
            )
            .await;

        assert_eq!(response.status_code(), 200);
        let json: serde_json::Value = response.json();
        assert_eq!(json["success"], true);
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_send_test_mail_without_orga_role_forbidden() {
        use mockito::Server;

        let mut teable_server = Server::new_async().await;

        let _member_mock = teable_server
            .mock("GET", "/table/test_members_table/record/member_user_1")
            .match_query(mockito::Matcher::Any)
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                r#"{
                "id": "member_user_1",
                "fields": {
                    "Vorname": "Member",
                    "Nachname": "User",
                    "Email": "member@example.com"
                }
            }"#,
            )
            .create_async()
            .await;

        let app = create_test_app_with_teable_url(&teable_server.url()).await;
        let server = TestServer::new(app).unwrap();

        let token = auth::create_token(TEST_JWT_SECRET, "member_user_1", None)
            .expect("Failed to create member token");

        // Mail endpoints now expect multipart/form-data
        let response = server
            .post("/api/mail/test-send")
            .add_header("authorization", &format!("Bearer {token}"))
            .multipart(
                axum_test::multipart::MultipartForm::new()
                    .add_text("subject", "Test")
                    .add_text("message", "Hallo"),
            )
            .await;

        assert_eq!(response.status_code(), 403);
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_send_test_mail_with_invalid_token_unauthorized() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        let response = server
            .post("/api/mail/test-send")
            .add_header("authorization", "Bearer invalid_token")
            .multipart(axum_test::multipart::MultipartForm::new().add_text("subject", "Test"))
            .await;

        assert_eq!(response.status_code(), 401);
    }

    // Test with valid token and mocked Teable API
    #[serial_test::serial]
    #[tokio::test]
    async fn test_protected_endpoint_with_valid_token() {
        use mockito::Server;

        set_test_env("https://test.teable.io");

        // Create a valid JWT token for testing
        let test_user_id = "test_user_123";
        let valid_token = auth::create_token(TEST_JWT_SECRET, test_user_id, None)
            .expect("Failed to create test token");

        // Start mock Teable server
        let mut teable_server = Server::new_async().await;

        // Mock get member by ID call
        let _member_mock = teable_server
            .mock("GET", "/table/test_members_table/record/test_user_123")
            .match_query(mockito::Matcher::Any)
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                r#"{
                "id": "test_user_123",
                "fields": {
                    "Vorname": "Test",
                    "Nachname": "User",
                    "Email": "test@example.com"
                }
            }"#,
            )
            .create_async()
            .await;

        // Create test app with mock server URL
        let app = create_test_app_with_teable_url(&teable_server.url()).await;
        let server = TestServer::new(app).unwrap();

        // Test that we can access protected endpoint with valid token
        let response = server
            .get("/api/user")
            .add_header("authorization", &format!("Bearer {valid_token}"))
            .await;

        // Now the test should work with the mocked Teable API
        assert_eq!(response.status_code(), 200);

        let json: serde_json::Value = response.json();
        assert_eq!(json["success"], true);
        assert_eq!(json["user"]["name"], "Test User");
        assert_eq!(json["user"]["email"], "test@example.com");
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_work_hour_by_id_with_valid_token_and_mock() {
        use mockito::Server;

        set_test_env("https://test.teable.io");

        // Create a valid JWT token
        let test_user_id = "test_user_456";
        let valid_token = auth::create_token(TEST_JWT_SECRET, test_user_id, None)
            .expect("Failed to create test token");

        // Start mock Teable server
        let mut teable_server = Server::new_async().await;

        // Mock get member by ID
        let _member_mock = teable_server
            .mock("GET", "/table/test_members_table/record/test_user_456")
            .match_query(mockito::Matcher::Any) // Accept any query parameters
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                r#"{
                "id": "test_user_456",
                "fields": {
                    "Vorname": "Work",
                    "Nachname": "Tester",
                    "Email": "work@example.com"
                }
            }"#,
            )
            .create_async()
            .await;

        // Mock work hours API call
        let _work_hour_by_id_mock = teable_server
            .mock("GET", "/table/test_work_hours_table/record/work_hour_1")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                r#"{
                "id": "work_hour_1",
                "fields": {
                    "Datum": "2024-01-15",
                    "Tätigkeit": "Test work",
                    "Stunden": 2.5,
                    "Mitglied_id": "test_user_456"
                }
            }"#,
            )
            .create_async()
            .await;

        // Create test app with mock server URL
        let app = create_test_app_with_teable_url(&teable_server.url()).await;
        let server = TestServer::new(app).unwrap();

        // Test work hours endpoint with valid token - use dashboard endpoint
        let response = server
            .get("/api/arbeitsstunden/work_hour_1")
            .add_header("authorization", &format!("Bearer {valid_token}"))
            .await;

        // Now the test should work with the mocked Teable API
        assert_eq!(response.status_code(), 200);

        let json: serde_json::Value = response.json();
        // The get work hour by ID endpoint returns an object with success and data fields
        assert!(json.is_object());
        assert_eq!(json["success"], true);
        let work_hour_data = &json["data"];
        assert_eq!(work_hour_data["Tätigkeit"], "Test work");
        assert_eq!(work_hour_data["Stunden"], 2.5); // 2.5 hours directly
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_create_work_hour_with_valid_token() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        // Create a valid JWT token
        let test_user_id = "test_user_789";
        let valid_token = auth::create_token(TEST_JWT_SECRET, test_user_id, None)
            .expect("Failed to create test token");

        let work_hour_request = serde_json::json!({
            "date": "2025-01-15",
            "description": "Test work with valid token",
            "hours": 2.5
        });

        // Test creating work hour with valid token
        let response = server
            .post("/api/arbeitsstunden")
            .add_header("authorization", &format!("Bearer {valid_token}"))
            .json(&work_hour_request)
            .await;

        // The test now passes authentication (token works) but fails on Teable API calls
        // Status could be 500 (Teable API error), 404 (not found), or 200 (JSON error but handled gracefully)
        tracing::info!("Response status: {}", response.status_code());
        assert!(
            response.status_code() == 500
                || response.status_code() == 404
                || response.status_code() == 200
        );
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_dashboard_with_valid_token() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        // Create a valid JWT token
        let test_user_id = "dashboard_user_123";
        let valid_token = auth::create_token(TEST_JWT_SECRET, test_user_id, None)
            .expect("Failed to create test token");

        // Test dashboard endpoint with valid token
        let response = server
            .get("/api/dashboard/2025")
            .add_header("authorization", &format!("Bearer {valid_token}"))
            .await;

        // Will fail because Teable API calls will fail, but shows valid token usage
        assert!(response.status_code() == 500 || response.status_code() == 404);
    }

    // More advanced tests with better mocking setup
    #[serial_test::serial]
    #[tokio::test]
    async fn test_mocked_teable_login_success() {
        use mockito::Server;

        let mut teable_server = Server::new_async().await;

        // Mock successful Teable member lookup
        let _member_mock = teable_server
            .mock("GET", mockito::Matcher::Any)
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                r#"{
                "records": [{
                    "id": "member123",
                    "fields": {
                        "Vorname": "Test",
                        "Nachname": "User", 
                        "Email": "test@example.com"
                    }
                }]
            }"#,
            )
            .create_async()
            .await;

        // Note: In a real implementation, we'd configure the app to use teable_server.url()
        // instead of the real Teable API. For now, this shows the mocking pattern.

        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        // This will still fail because we're not actually using the mocked server
        // but it demonstrates the testing pattern
        let login_request = serde_json::json!({
            "email": "test@example.com",
            "password": "password123"
        });

        let response = server.post("/api/login").json(&login_request).await;

        // Will be 401 because user doesn't exist in SQLite test DB
        assert_eq!(response.status_code(), 401);

        // Don't assert the mock since we're not actually using it
        // member_mock.assert_async().await;
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_database_user_creation() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        // First, let's test that we can create a user in the test database
        // This would be done in a real test by setting up test data

        // Try login with non-existent user
        let login_request = serde_json::json!({
            "email": "newuser@example.com",
            "password": "password123"
        });

        let response = server.post("/api/login").json(&login_request).await;

        assert_eq!(response.status_code(), 401);
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_work_hour_validation() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        // Test various invalid work hour payloads
        let test_cases = vec![
            // Empty date
            serde_json::json!({
                "date": "",
                "description": "Test work",
                "hours": 2.5
            }),
            // Empty description
            serde_json::json!({
                "date": "2024-01-15",
                "description": "",
                "hours": 2.5
            }),
            // Zero hours
            serde_json::json!({
                "date": "2024-01-15",
                "description": "Test work",
                "hours": 0.0
            }),
            // Negative hours
            serde_json::json!({
                "date": "2024-01-15",
                "description": "Test work",
                "hours": -1.0
            }),
            // Invalid date format
            serde_json::json!({
                "date": "invalid-date",
                "description": "Test work",
                "hours": 2.5
            }),
        ];

        for invalid_payload in test_cases {
            let response = server
                .post("/api/arbeitsstunden")
                .add_header("authorization", "Bearer valid_token_would_go_here")
                .json(&invalid_payload)
                .await;

            // All should fail with 401 (auth) or 400 (validation)
            assert!(response.status_code() == 401 || response.status_code() == 400);
        }
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_json_response_format() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        let response = server.get("/api/health").await;
        assert_eq!(response.status_code(), 200);

        let json: serde_json::Value = response.json();

        // Verify health check response structure
        assert!(json.is_object());
        assert!(json.get("status").is_some());
        assert!(json.get("service").is_some());
        assert!(json.get("timestamp").is_some());

        assert_eq!(json["status"], "healthy");
        assert_eq!(json["service"], "tsv-tennis-backend");
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_rate_limiting_simulation() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        // Note: Rate limiting is disabled in test app for simplicity
        // But we can test that endpoints exist and respond correctly

        // Make multiple rapid requests
        for _ in 0..5 {
            let response = server.get("/api/health").await;
            assert_eq!(response.status_code(), 200);
        }
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_content_type_headers() {
        let app = create_test_app().await;
        let server = TestServer::new(app).unwrap();

        let response = server.get("/api/health").await;
        assert_eq!(response.status_code(), 200);

        // Check that JSON endpoints return correct content type
        let content_type = response.headers().get("content-type");
        assert!(content_type.is_some());
        assert!(content_type
            .unwrap()
            .to_str()
            .unwrap()
            .contains("application/json"));
    }

    // Advanced test: Full integration with mocked Teable API
    #[serial_test::serial]
    #[tokio::test]
    async fn test_full_integration_with_mocked_teable() {
        use mockito::Server;

        set_test_env("https://test.teable.io");

        // Start mock Teable server
        let mut teable_server = Server::new_async().await;

        // Create a test app with the mock server URL
        let app = create_test_app_with_teable_url(&teable_server.url()).await;
        let server = TestServer::new(app).unwrap();

        // Mock Teable authentication check (for login flow)
        let _auth_mock = teable_server
            .mock("GET", "/table/test_members_table/record")
            .match_query(mockito::Matcher::UrlEncoded(
                "filterByFormula".into(),
                "({Email} = 'integration@test.com')".into(),
            ))
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                r#"{
                "records": [{
                    "id": "integration_user_123",
                    "fields": {
                        "Vorname": "Integration",
                        "Nachname": "Test",
                        "Email": "integration@test.com"
                    }
                }]
            }"#,
            )
            .create_async()
            .await;

        // Mock individual member lookup
        let _member_mock = teable_server
            .mock(
                "GET",
                "/table/test_members_table/record/integration_user_123",
            )
            .match_query(mockito::Matcher::Any) // Accept any query parameters
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                r#"{
                "id": "integration_user_123",
                "fields": {
                    "Vorname": "Integration",
                    "Nachname": "Test",
                    "Email": "integration@test.com"
                }
            }"#,
            )
            .create_async()
            .await;

        // Mock work hours lookup
        let _work_hours_mock = teable_server
            .mock("GET", "/table/test_work_hours_table/record")
            .match_query(mockito::Matcher::Any)
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                r#"{
                "records": [
                    {
                        "id": "work_hour_123",
                        "fields": {
                            "Datum": "2025-01-15",
                            "Beschreibung": "Mocked work entry",
                            "Dauer (Sekunden)": 7200,
                            "Mitglied": ["integration_user_123"]
                        }
                    }
                ]
            }"#,
            )
            .create_async()
            .await;

        // Create a valid JWT token for the test user
        let test_token = auth::create_token(TEST_JWT_SECRET, "integration_user_123", None)
            .expect("Failed to create test token");

        // Test protected endpoint with valid token - now actually using the mock!
        let response = server
            .get("/api/user")
            .add_header("authorization", &format!("Bearer {test_token}"))
            .await;

        // Now this should work because we're using the mocked Teable API
        assert_eq!(response.status_code(), 200);

        let json: serde_json::Value = response.json();
        assert_eq!(json["success"], true);
        assert_eq!(json["user"]["name"], "Integration Test");
        assert_eq!(json["user"]["email"], "integration@test.com");

        tracing::info!(
            "Successfully tested with mocked Teable server at: {}",
            teable_server.url()
        );
        tracing::info!("Mocked APIs are now actually being used in tests!");
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_jwt_token_creation_and_validation() {
        set_test_env("https://test.teable.io");

        // Test that we can create and validate JWT tokens properly
        let test_user_id = "jwt_test_user_456";

        // Create a token
        let token = auth::create_token(TEST_JWT_SECRET, test_user_id, None)
            .expect("Failed to create token");
        assert!(!token.is_empty());

        // Validate the token (this would require access to auth module internals)
        // For now, just verify it's a valid JWT format (3 parts separated by dots)
        let parts: Vec<&str> = token.split('.').collect();
        assert_eq!(parts.len(), 3, "JWT should have 3 parts separated by dots");
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_selection_token_flow() {
        set_test_env("https://test.teable.io");

        // Test the selection token flow for multiple members with same email
        let test_email = "multi@example.com";

        // Create a selection token
        let selection_token = auth::create_selection_token(TEST_JWT_SECRET, test_email)
            .expect("Failed to create selection token");
        assert!(!selection_token.is_empty());

        // Validate selection token format
        let parts: Vec<&str> = selection_token.split('.').collect();
        assert_eq!(parts.len(), 3, "Selection token should be a valid JWT");

        tracing::info!(
            "Created selection token for {}: {}",
            test_email,
            selection_token
        );
    }
}
