use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Serialize, TS)]
#[ts(export)]
#[serde(tag = "type")]
pub enum LoginResponseVariant {
    #[serde(rename = "single")]
    SingleUser(super::LoginResponse),
    #[serde(rename = "multiple")]
    MultipleUsers(MemberSelectionResponse),
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct MemberSelectionResponse {
    pub success: bool,
    pub multiple: bool,
    pub users: Vec<super::UserResponse>,
    pub selection_token: String,
    pub message: String,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct SelectMemberRequest {
    pub member_id: String,
    pub selection_token: Option<String>,
}
