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

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS reset_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME NOT NULL,
                FOREIGN KEY (user_id) REFERENCES details(id) ON DELETE CASCADE
            )
            "#,
        )
        .execute(&pool)
        .await?;

        Ok(Database { pool })
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

    #[allow(dead_code)]
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

    #[allow(dead_code)]
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

    #[allow(dead_code)]
    pub async fn create_reset_token(
        &self,
        user_id: i32,
        token: &str,
        expires_at: DateTime<Utc>,
    ) -> Result<(), sqlx::Error> {
        // Delete any existing tokens for this user
        sqlx::query("DELETE FROM reset_tokens WHERE user_id = ?")
            .bind(user_id)
            .execute(&self.pool)
            .await?;

        // Insert new token
        sqlx::query("INSERT INTO reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)")
            .bind(token)
            .bind(user_id)
            .bind(expires_at)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    #[allow(dead_code)]
    pub async fn get_reset_token(
        &self,
        token: &str,
    ) -> Result<Option<(i32, DateTime<Utc>)>, sqlx::Error> {
        let row = sqlx::query("SELECT user_id, expires_at FROM reset_tokens WHERE token = ?")
            .bind(token)
            .fetch_optional(&self.pool)
            .await?;

        if let Some(row) = row {
            Ok(Some((row.get("user_id"), row.get("expires_at"))))
        } else {
            Ok(None)
        }
    }

    #[allow(dead_code)]
    pub async fn consume_reset_token(&self, token: &str) -> Result<Option<i32>, sqlx::Error> {
        let mut tx = self.pool.begin().await?;

        let row = sqlx::query("SELECT user_id, expires_at FROM reset_tokens WHERE token = ?")
            .bind(token)
            .fetch_optional(&mut *tx)
            .await?;

        if let Some(row) = row {
            let user_id: i32 = row.get("user_id");
            let expires_at: DateTime<Utc> = row.get("expires_at");

            if expires_at > Utc::now() {
                // Token is valid, delete it
                sqlx::query("DELETE FROM reset_tokens WHERE token = ?")
                    .bind(token)
                    .execute(&mut *tx)
                    .await?;

                tx.commit().await?;
                Ok(Some(user_id))
            } else {
                // Token expired
                tx.rollback().await?;
                Ok(None)
            }
        } else {
            tx.rollback().await?;
            Ok(None)
        }
    }
}
