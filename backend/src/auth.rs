use crate::config::Config;
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthClaims {
    pub sub: String, // User ID
    pub exp: usize,  // Expiration time
    pub iat: usize,  // Issued at
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SelectionTokenClaims {
    pub sub: String, // email
    pub exp: usize,
    pub typ: String, // always "selection"
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

pub fn create_selection_token(email: &str) -> Result<String, jsonwebtoken::errors::Error> {
    let config = Config::from_env().map_err(|_| {
        jsonwebtoken::errors::Error::from(jsonwebtoken::errors::ErrorKind::InvalidKeyFormat)
    })?;
    let expiration = Utc::now() + Duration::minutes(5);
    let claims = SelectionTokenClaims {
        sub: email.to_string(),
        exp: expiration.timestamp() as usize,
        typ: "selection".to_string(),
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(config.jwt_secret.as_ref()),
    )
}

pub fn verify_selection_token(token: &str) -> Result<String, jsonwebtoken::errors::Error> {
    let config = Config::from_env().map_err(|_| {
        jsonwebtoken::errors::Error::from(jsonwebtoken::errors::ErrorKind::InvalidKeyFormat)
    })?;
    let token_data: jsonwebtoken::TokenData<SelectionTokenClaims> = decode::<SelectionTokenClaims>(
        token,
        &DecodingKey::from_secret(config.jwt_secret.as_ref()),
        &Validation::default(),
    )?;
    if token_data.claims.typ != "selection" {
        return Err(jsonwebtoken::errors::Error::from(
            jsonwebtoken::errors::ErrorKind::InvalidToken,
        ));
    }
    Ok(token_data.claims.sub)
}
