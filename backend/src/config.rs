use std::env;

/// Configuration structure for environment variables
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub frontend_url: String,
    pub teable_api_url: String,
    pub teable_token: String,
    pub teable_base_id: String,
    pub members_table_id: String,
    pub work_hours_table_id: String,
}

impl Config {
    pub fn from_env() -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        Ok(Config {
            database_url: env::var("DATABASE_URL")
                .map_err(|_| "DATABASE_URL must be set")?,
            jwt_secret: env::var("JWT_SECRET")
                .unwrap_or_else(|_| "your-secret-key".to_string()),
            frontend_url: env::var("FRONTEND_URL")
                .unwrap_or_else(|_| "http://localhost:5173".to_string()),
            teable_api_url: env::var("TEABLE_API_URL")
                .map_err(|_| "TEABLE_API_URL must be set")?,
            teable_token: env::var("TEABLE_TOKEN")
                .map_err(|_| "TEABLE_TOKEN must be set")?,
            teable_base_id: env::var("TEABLE_BASE_ID")
                .map_err(|_| "TEABLE_BASE_ID must be set")?,
            members_table_id: env::var("MEMBERS_TABLE_ID")
                .map_err(|_| "MEMBERS_TABLE_ID must be set")?,
            work_hours_table_id: env::var("WORK_HOURS_TABLE_ID")
                .map_err(|_| "WORK_HOURS_TABLE_ID must be set")?,
        })
    }
}

/// Email configuration structure
pub struct EmailConfig {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
}

impl EmailConfig {
    pub fn from_env() -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        Ok(EmailConfig {
            host: env::var("EMAIL_HOST").unwrap_or_else(|_| "smtp.gmail.com".to_string()),
            port: env::var("EMAIL_PORT")
                .unwrap_or_else(|_| "587".to_string())
                .parse::<u16>()
                .unwrap_or(587),
            user: env::var("EMAIL_USER")?,
            password: env::var("EMAIL_PASSWORD")?,
        })
    }
}
