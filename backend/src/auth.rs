use crate::config::Config;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthClaims {
    pub sub: String, // User ID
    pub exp: usize,  // Expiration time
    pub iat: usize,  // Issued at
}

pub fn create_token(user_id: &str) -> Result<String, jsonwebtoken::errors::Error> {
    let config = Config::from_env().map_err(|_| {
        jsonwebtoken::errors::Error::from(jsonwebtoken::errors::ErrorKind::InvalidKeyFormat)
    })?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as usize;

    let claims = AuthClaims {
        sub: user_id.to_string(),
        exp: now + 24 * 60 * 60, // 24 hours
        iat: now,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(config.jwt_secret.as_ref()),
    )
}

pub fn verify_token(token: &str) -> Result<AuthClaims, jsonwebtoken::errors::Error> {
    let config = Config::from_env().map_err(|_| {
        jsonwebtoken::errors::Error::from(jsonwebtoken::errors::ErrorKind::InvalidKeyFormat)
    })?;
    decode::<AuthClaims>(
        token,
        &DecodingKey::from_secret(config.jwt_secret.as_ref()),
        &Validation::default(),
    )
    .map(|data| data.claims)
}
