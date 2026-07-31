//! SQLite database layer for user authentication and password storage.

use bcrypt::{hash, verify, DEFAULT_COST};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqlitePool, Row};

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
        let pool = SqlitePool::connect(database_url).await?;

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

        Ok(Database { pool })
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
