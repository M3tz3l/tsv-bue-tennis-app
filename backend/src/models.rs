use serde::{Deserialize, Serialize};
use ts_rs::TS;

// Request/Response models
#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct LoginResponse {
    pub success: bool,
    pub token: String,
    pub user: UserResponse,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
#[allow(dead_code)]
pub struct RegisterRequest {
    pub name: String,
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct ForgotPasswordRequest {
    pub email: String,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
#[allow(dead_code)]
pub struct ResetPasswordRequest {
    pub token: String,
    pub password: String,
    pub id: Option<String>, // Changed from u32 to String to match Teable record IDs
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct UserResponse {
    pub id: String, // Changed from u32 to String to match Teable record IDs
    pub name: String,
    pub email: String,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct CreateWorkHourRequest {
    #[serde(rename = "Datum")]
    pub date: String,
    #[serde(rename = "Tätigkeit")]
    pub description: String,
    #[serde(rename = "Stunden", deserialize_with = "string_or_f64")]
    pub hours: f64, // Frontend sends hours as string, need to convert
}

// Custom deserializer to handle string or f64 for hours
fn string_or_f64<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de::{self, Visitor};
    use std::fmt;

    struct StringOrF64Visitor;

    impl<'de> Visitor<'de> for StringOrF64Visitor {
        type Value = f64;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a string or number representing hours")
        }

        fn visit_str<E>(self, value: &str) -> Result<f64, E>
        where
            E: de::Error,
        {
            value.parse().map_err(de::Error::custom)
        }

        fn visit_f64<E>(self, value: f64) -> Result<f64, E>
        where
            E: de::Error,
        {
            Ok(value)
        }

        fn visit_u64<E>(self, value: u64) -> Result<f64, E>
        where
            E: de::Error,
        {
            Ok(value as f64)
        }

        fn visit_i64<E>(self, value: i64) -> Result<f64, E>
        where
            E: de::Error,
        {
            Ok(value as f64)
        }
    }

    deserializer.deserialize_any(StringOrF64Visitor)
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
#[allow(dead_code)]
pub struct UpdateWorkHourRequest {
    pub date: String,
    pub description: String,
    pub duration_seconds: f64,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct WorkHourResponse {
    pub id: String,
    pub date: String,
    pub description: String,
    pub duration_seconds: f64,
}

// Teable API models
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeableResponse<T> {
    pub results: Vec<T>,
    pub count: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct Member {
    pub id: String, // Changed from u32 to String to match Teable record IDs
    #[serde(rename = "Vorname")]
    pub first_name: String,
    #[serde(rename = "Nachname")]
    pub last_name: String,
    #[serde(rename = "Email")]
    pub email: String,
    #[serde(rename = "Familie")]
    pub family_id: Option<String>,
    #[serde(rename = "Geburtsdatum")]
    pub birth_date: Option<String>,
}

impl Member {
    pub fn name(&self) -> String {
        format!("{} {}", self.first_name, self.last_name)
    }
}

#[derive(Debug, Deserialize)]
pub struct WorkHour {
    pub id: String,
    #[serde(rename = "order")]
    #[allow(dead_code)]
    pub order: String,
    // Linked record field that references member records
    #[serde(rename = "Mitglied_id")]
    pub member_id: Option<serde_json::Value>, // Can be object with id or just string
    // UUID field for backward compatibility and direct UUID access
    #[serde(rename = "Mitglied_UUID")]
    pub member_uuid: Option<String>,
    #[serde(rename = "Nachname")]
    #[allow(dead_code)]
    pub last_name: Option<String>,
    #[serde(rename = "Vorname")]
    #[allow(dead_code)]
    pub first_name: Option<String>,
    #[serde(rename = "Created on")]
    #[allow(dead_code)]
    pub created_on: Option<String>,
    #[serde(rename = "Datum")]
    pub date: Option<String>,
    #[serde(rename = "Tätigkeit")]
    pub description: Option<String>,
    #[serde(rename = "Stunden")] // This field stores seconds as a floating point number
    pub duration_seconds: Option<f64>,
}

impl WorkHour {
    /// Extract the member ID from the linked record field
    pub fn get_member_id(&self) -> Option<String> {
        match &self.member_id {
            Some(value) => {
                if let Some(obj) = value.as_object() {
                    // Linked record format: {"id": "member_id"}
                    obj.get("id")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                } else if let Some(id_str) = value.as_str() {
                    // Direct string format
                    Some(id_str.to_string())
                } else {
                    None
                }
            }
            None => None,
        }
    }
}

// Dashboard models
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct DashboardResponse {
    pub success: bool,
    pub family: Option<FamilyData>,
    pub personal: Option<PersonalData>,
    pub year: i32,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct FamilyData {
    pub name: String,
    pub members: Vec<FamilyMember>,
    pub required: f64,
    pub completed: f64,
    pub remaining: f64,
    pub percentage: f64,
    #[serde(rename = "memberContributions")]
    pub member_contributions: Vec<MemberContribution>,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct PersonalData {
    pub name: String,
    pub hours: f64,
    pub required: f64,
    pub entries: Vec<WorkHourEntry>,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct FamilyMember {
    pub id: String, // Changed from u32 to String to match Teable record IDs
    pub name: String,
    pub email: String,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct MemberContribution {
    pub name: String,
    pub hours: f64,
    pub required: f64,
    pub entries: Vec<WorkHourEntry>,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct WorkHourEntry {
    pub id: String,
    #[serde(rename = "Datum")]
    pub date: String,
    #[serde(rename = "Tätigkeit")]
    pub description: String,
    #[serde(rename = "Stunden")]
    pub duration_hours: f64, // Now represents hours with German field name
}
