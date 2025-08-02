# Add to Cargo.toml
[dependencies]
ts-rs = "7.1"
serde = { version = "1.0", features = ["derive"] }

# Example: Add to your Rust models
use ts_rs::TS;

#[derive(Serialize, Deserialize, TS)]
#[ts(export)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Serialize, Deserialize, TS)]
#[ts(export)]
pub struct LoginResponse {
    pub success: bool,
    pub token: String,
    pub user: UserResponse,
}

# Then run: cargo test to generate TypeScript files
