use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResetToken {
    pub token: String,
    pub user_id: String, // Changed from u32 to String to match Teable record IDs
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct TokenStore {
    tokens: Arc<RwLock<HashMap<String, ResetToken>>>,
    user_tokens: Arc<RwLock<HashMap<String, String>>>, // user_id -> token_id mapping (changed to String keys)
}

impl TokenStore {
    pub fn new() -> Self {
        Self {
            tokens: Arc::new(RwLock::new(HashMap::new())),
            user_tokens: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn create_reset_token(&self, user_id: String) -> String {
        let token_id = Uuid::new_v4().to_string();
        let now = Utc::now();
        let expires_at = now + Duration::hours(24);

        let reset_token = ResetToken {
            token: token_id.clone(),
            user_id: user_id.clone(), // Clone before moving
            created_at: now,
            expires_at,
        };

        {
            let mut tokens = self.tokens.write().await;
            let mut user_tokens = self.user_tokens.write().await;

            // Remove any existing token for this user
            if let Some(old_token) = user_tokens.get(&user_id) {
                tokens.remove(old_token);
            }

            tokens.insert(token_id.clone(), reset_token);
            user_tokens.insert(user_id, token_id.clone());
        }

        token_id
    }

    pub async fn get_reset_token(&self, token: &str) -> Option<ResetToken> {
        let tokens = self.tokens.read().await;
        tokens.get(token).cloned()
    }

    pub async fn consume_reset_token(&self, token: &str) -> Option<ResetToken> {
        let mut tokens = self.tokens.write().await;
        let mut user_tokens = self.user_tokens.write().await;

        if let Some(reset_token) = tokens.remove(token) {
            user_tokens.remove(&reset_token.user_id);
            Some(reset_token)
        } else {
            None
        }
    }

    pub async fn is_token_valid(&self, token: &str) -> bool {
        if let Some(reset_token) = self.get_reset_token(token).await {
            reset_token.expires_at > Utc::now()
        } else {
            false
        }
    }

    // Clean up expired tokens periodically
    #[allow(dead_code)]
    pub async fn cleanup_expired_tokens(&self) {
        let now = Utc::now();
        let mut tokens = self.tokens.write().await;
        let mut user_tokens = self.user_tokens.write().await;

        let expired_tokens: Vec<String> = tokens
            .iter()
            .filter(|(_, token)| token.expires_at <= now)
            .map(|(id, token)| {
                user_tokens.remove(&token.user_id);
                id.clone()
            })
            .collect();

        for token_id in expired_tokens {
            tokens.remove(&token_id);
        }
    }
}
