//! JWT authentication: token creation, verification, and selection tokens.

use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthClaims {
    pub sub: String, // User ID
    #[serde(default)]
    pub role: Option<String>,
    pub exp: usize, // Expiration time
    pub iat: usize, // Issued at
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SelectionTokenClaims {
    pub sub: String, // email
    pub exp: usize,
    pub typ: String, // always "selection"
}

pub fn create_token(
    secret: &str,
    user_id: &str,
    role: Option<&str>,
) -> Result<String, jsonwebtoken::errors::Error> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as usize;

    let claims = AuthClaims {
        sub: user_id.to_string(),
        role: role.map(|r| r.to_string()),
        exp: now + 24 * 60 * 60,
        iat: now,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_ref()),
    )
}

pub fn verify_token(secret: &str, token: &str) -> Result<AuthClaims, jsonwebtoken::errors::Error> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;
    decode::<AuthClaims>(
        token,
        &DecodingKey::from_secret(secret.as_ref()),
        &validation,
    )
    .map(|data| data.claims)
}

pub fn create_selection_token(
    secret: &str,
    email: &str,
) -> Result<String, jsonwebtoken::errors::Error> {
    let expiration = Utc::now() + Duration::minutes(5);
    let claims = SelectionTokenClaims {
        sub: email.to_string(),
        exp: expiration.timestamp() as usize,
        typ: "selection".to_string(),
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_ref()),
    )
}

pub fn verify_selection_token(
    secret: &str,
    token: &str,
) -> Result<String, jsonwebtoken::errors::Error> {
    let validation = Validation::new(Algorithm::HS256);
    let token_data: jsonwebtoken::TokenData<SelectionTokenClaims> = decode::<SelectionTokenClaims>(
        token,
        &DecodingKey::from_secret(secret.as_ref()),
        &validation,
    )?;
    if token_data.claims.typ != "selection" {
        return Err(jsonwebtoken::errors::Error::from(
            jsonwebtoken::errors::ErrorKind::InvalidToken,
        ));
    }
    Ok(token_data.claims.sub)
}
