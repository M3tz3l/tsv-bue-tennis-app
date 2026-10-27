//! Persistent password reset token storage with expiry management.

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqlitePool, Row};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResetToken {
    pub token: String,
    pub user_id: String,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct TokenStore {
    pool: SqlitePool,
}

impl TokenStore {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// Creates a new single-use reset token, replacing any previous token for
    /// the same user. Tokens are persisted so links survive process restarts.
    pub async fn create_reset_token(&self, user_id: String) -> Result<String, sqlx::Error> {
        let token_id = Uuid::new_v4().to_string();
        let now = Utc::now();
        let expires_at = now + Duration::hours(24);
        let mut tx = self.pool.begin().await?;

        sqlx::query("DELETE FROM reset_tokens WHERE user_id = ? OR expires_at <= ?")
            .bind(&user_id)
            .bind(now.to_rfc3339())
            .execute(&mut *tx)
            .await?;
        sqlx::query(
            "INSERT INTO reset_tokens (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        )
        .bind(&token_id)
        .bind(&user_id)
        .bind(now.to_rfc3339())
        .bind(expires_at.to_rfc3339())
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;

        Ok(token_id)
    }

    /// Atomically consumes a token. Expired tokens are deleted and treated as
    /// invalid.
    pub async fn consume_reset_token(
        &self,
        token: &str,
    ) -> Result<Option<ResetToken>, sqlx::Error> {
        let now = Utc::now();
        let row = sqlx::query(
            "DELETE FROM reset_tokens WHERE token = ? AND expires_at > ? \
             RETURNING token, user_id, created_at, expires_at",
        )
        .bind(token)
        .bind(now.to_rfc3339())
        .fetch_optional(&self.pool)
        .await?;

        let Some(row) = row else {
            return Ok(None);
        };

        let created_at = parse_timestamp(row.get::<String, _>("created_at"), now);
        let expires_at = parse_timestamp(row.get::<String, _>("expires_at"), now);
        Ok(Some(ResetToken {
            token: row.get("token"),
            user_id: row.get("user_id"),
            created_at,
            expires_at,
        }))
    }
}

fn parse_timestamp(value: String, fallback: DateTime<Utc>) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(&value)
        .map(|value| value.with_timezone(&Utc))
        .unwrap_or(fallback)
}

#[cfg(test)]
mod tests {
    use super::TokenStore;
    use crate::database::Database;

    async fn store() -> TokenStore {
        let database = Database::new("sqlite::memory:").await.unwrap();
        TokenStore::new(database.pool().clone())
    }

    #[tokio::test]
    async fn reset_token_is_single_use() {
        let store = store().await;
        let token = store.create_reset_token("user-1".into()).await.unwrap();

        let consumed = store.consume_reset_token(&token).await.unwrap().unwrap();
        assert_eq!(consumed.user_id, "user-1");
        assert!(store.consume_reset_token(&token).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn concurrent_consumption_only_succeeds_once() {
        let store = store().await;
        let token = store.create_reset_token("user-1".into()).await.unwrap();

        let first = store.consume_reset_token(&token);
        let second = store.consume_reset_token(&token);
        let (first, second) = tokio::join!(first, second);

        let successes = [first.unwrap().is_some(), second.unwrap().is_some()]
            .into_iter()
            .filter(|success| *success)
            .count();
        assert_eq!(successes, 1);
    }

    #[tokio::test]
    async fn new_token_replaces_previous_token() {
        let store = store().await;
        let first = store.create_reset_token("user-1".into()).await.unwrap();
        let second = store.create_reset_token("user-1".into()).await.unwrap();

        assert!(store.consume_reset_token(&first).await.unwrap().is_none());
        assert!(store.consume_reset_token(&second).await.unwrap().is_some());
    }

    #[tokio::test]
    async fn expired_token_is_rejected() {
        let store = store().await;
        sqlx::query(
            "INSERT INTO reset_tokens (token,user_id,created_at,expires_at) VALUES (?,?,?,?)",
        )
        .bind("expired")
        .bind("user-1")
        .bind("2000-01-01T00:00:00Z")
        .bind("2000-01-02T00:00:00Z")
        .execute(&store.pool)
        .await
        .unwrap();

        assert!(store
            .consume_reset_token("expired")
            .await
            .unwrap()
            .is_none());
    }
}
