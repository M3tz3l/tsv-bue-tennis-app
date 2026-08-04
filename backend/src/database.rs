//! SQLite database layer for user authentication and password storage.

use bcrypt::{hash, verify, DEFAULT_COST};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePool},
    Row,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthUser {
    pub id: i32,
    pub email: String,
    pub password_hash: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateUserRequest {
    pub email: String,
    pub password: String,
}

#[derive(Clone)]
pub struct Database {
    pool: SqlitePool,
}

impl Database {
    pub async fn new(database_url: &str) -> Result<Self, sqlx::Error> {
        let options = database_url
            .parse::<SqliteConnectOptions>()?
            .foreign_keys(true);
        let pool = SqlitePool::connect_with(options).await?;

        // Create tables if they don't exist (SQLite syntax)
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS details (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&pool)
        .await?;

        Self::initialize_event_tables(&pool).await?;

        Ok(Database { pool })
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    pub async fn initialize_event_tables(pool: &SqlitePool) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                event_date TEXT NOT NULL,
                start_time TEXT,
                end_time TEXT,
                location TEXT,
                signup_deadline TEXT,
                capacity INTEGER,
                allow_salad INTEGER NOT NULL,
                allow_cake INTEGER NOT NULL,
                status TEXT NOT NULL,
                created_by TEXT NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(pool)
        .await?;
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS event_signups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
                member_id TEXT NOT NULL,
                people_count INTEGER NOT NULL,
                salad_count INTEGER NOT NULL DEFAULT 0,
                cake_count INTEGER NOT NULL DEFAULT 0,
                comment TEXT,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(event_id, member_id)
            )
            "#,
        )
        .execute(pool)
        .await?;

        let mut connections = Vec::new();
        for _ in 0..pool.options().get_max_connections() {
            let mut connection = pool.acquire().await?;
            let enabled: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
                .fetch_one(&mut *connection)
                .await?;
            if enabled != 1 {
                return Err(sqlx::Error::Protocol(
                    "event tables require SQLite foreign keys enabled".into(),
                ));
            }
            connections.push(connection);
        }
        Ok(())
    }

    /// Pings the database to verify connectivity.
    pub async fn health_check(&self) -> Result<(), sqlx::Error> {
        sqlx::query("SELECT 1").execute(&self.pool).await?;
        Ok(())
    }

    pub async fn get_user_by_email(&self, email: &str) -> Result<Option<AuthUser>, sqlx::Error> {
        let row = sqlx::query(
            "SELECT id, email, password, created_at FROM details WHERE LOWER(email) = LOWER(?)",
        )
        .bind(email)
        .fetch_optional(&self.pool)
        .await?;

        if let Some(row) = row {
            Ok(Some(AuthUser {
                id: row.get("id"),
                email: row.get("email"),
                password_hash: row.get("password"),
                created_at: row.get("created_at"),
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn create_user(&self, request: CreateUserRequest) -> Result<i32, sqlx::Error> {
        let password_hash = hash(&request.password, DEFAULT_COST)
            .map_err(|e| sqlx::Error::Configuration(Box::new(e)))?;

        let result = sqlx::query("INSERT INTO details (email, password) VALUES (?, ?)")
            .bind(request.email.to_lowercase())
            .bind(&password_hash)
            .execute(&self.pool)
            .await?;

        // For SQLite, use last_insert_rowid
        Ok(result.last_insert_rowid() as i32)
    }

    pub async fn verify_password(
        &self,
        email: &str,
        password: &str,
    ) -> Result<Option<AuthUser>, sqlx::Error> {
        if let Some(user) = self.get_user_by_email(email).await? {
            if verify(password, &user.password_hash)
                .map_err(|e| sqlx::Error::Configuration(Box::new(e)))?
            {
                Ok(Some(user))
            } else {
                Ok(None)
            }
        } else {
            Ok(None)
        }
    }

    pub async fn update_password(
        &self,
        user_id: i32,
        new_password: &str,
    ) -> Result<(), sqlx::Error> {
        let password_hash = hash(new_password, DEFAULT_COST)
            .map_err(|e| sqlx::Error::Configuration(Box::new(e)))?;

        sqlx::query("UPDATE details SET password = ? WHERE id = ?")
            .bind(&password_hash)
            .bind(user_id)
            .execute(&self.pool)
            .await?;

        Ok(())
    }
}
