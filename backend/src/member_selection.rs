use crate::models::{LoginResponse, UserResponse};
use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Serialize, Type)]
#[serde(tag = "type")]
pub enum LoginResponseVariant {
    #[serde(rename = "single")]
    SingleUser(LoginResponse),
    #[serde(rename = "multiple")]
    MultipleUsers(MemberSelectionResponse),
}

#[derive(Debug, Serialize, Type)]
pub struct MemberSelectionResponse {
    pub success: bool,
    pub multiple: bool,
    pub users: Vec<UserResponse>,
    pub selection_token: String,
    pub message: String,
}

#[derive(Debug, Deserialize, Type)]
pub struct SelectMemberRequest {
    pub member_id: String,
    pub selection_token: Option<String>,
}
