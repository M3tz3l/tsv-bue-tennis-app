//! Application and email configuration loaded from environment variables.

use anyhow::Context;
use std::env;

/// Configuration structure for environment variables
pub struct Config {
    pub port: u16,
    pub database_url: String,
    pub jwt_secret: String,
    pub frontend_url: String,
    pub teable_api_url: String,
    pub teable_token: String,
    pub members_table_id: String,
    pub work_hours_table_id: String,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let port = env::var("PORT")
            .unwrap_or_else(|_| "5000".to_string())
            .parse::<u16>()
            .context("PORT must be a valid port number")?;

        let jwt_secret = env::var("JWT_SECRET").context("JWT_SECRET must be set")?;
        if jwt_secret.trim().is_empty() {
            anyhow::bail!("JWT_SECRET must not be empty");
        }

        Ok(Config {
            port,
            database_url: env::var("DATABASE_URL").context("DATABASE_URL must be set")?,
            jwt_secret,
            frontend_url: env::var("FRONTEND_URL")
                .unwrap_or_else(|_| "http://localhost:5173".to_string()),
            teable_api_url: env::var("TEABLE_API_URL").context("TEABLE_API_URL must be set")?,
            teable_token: env::var("TEABLE_TOKEN").context("TEABLE_TOKEN must be set")?,
            members_table_id: env::var("MEMBERS_TABLE_ID")
                .context("MEMBERS_TABLE_ID must be set")?,
            work_hours_table_id: env::var("WORK_HOURS_TABLE_ID")
                .context("WORK_HOURS_TABLE_ID must be set")?,
        })
    }
}

/// Email configuration structure
pub struct EmailConfig {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub from_email: String,
    pub use_implicit_tls: bool,
    pub accept_invalid_certs: bool,
}

impl EmailConfig {
    pub fn from_env() -> anyhow::Result<Self> {
        let port = env::var("EMAIL_PORT")
            .context("EMAIL_PORT must be set")?
            .parse::<u16>()
            .context("EMAIL_PORT must be a number")?;

        // Use implicit TLS for port 465, STARTTLS for other ports (like 587)
        let use_implicit_tls = port == 465;

        let accept_invalid_certs = env::var("EMAIL_ACCEPT_INVALID_CERTS")
            .ok()
            .map(|v| v.eq_ignore_ascii_case("true") || v == "1")
            .unwrap_or(false);

        Ok(EmailConfig {
            host: env::var("EMAIL_HOST").context("EMAIL_HOST must be set")?,
            port,
            user: env::var("EMAIL_USER").context("EMAIL_USER must be set")?,
            password: env::var("EMAIL_PASSWORD").context("EMAIL_PASSWORD must be set")?,
            from_email: env::var("EMAIL_FROM").context("EMAIL_FROM must be set")?,
            use_implicit_tls,
            accept_invalid_certs,
        })
    }
}
