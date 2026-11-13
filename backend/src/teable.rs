//! Teable API client: member lookups, work hour CRUD, and paginated queries.

use crate::models::{Member, TeableResponse, WorkHour};
use anyhow::{Context, Result};
use reqwest::{Client, RequestBuilder};
use serde_json::Value;
use tracing::{debug, error, info, warn};

/// Structured error for Teable API failures. Carrying the upstream status lets
/// route handlers distinguish an expired token (401) or missing scope (403)
/// from a genuine bug instead of collapsing everything into a 500.
#[derive(Debug)]
pub enum TeableError {
    Unauthorized(String),
    Forbidden(String),
    RateLimited(Option<u64>),
    NotFound(String),
    Upstream { status: u16, body: String },
}

impl std::fmt::Display for TeableError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TeableError::Unauthorized(msg) => write!(f, "Teable API unauthorized (401): {msg}"),
            TeableError::Forbidden(msg) => write!(f, "Teable API forbidden (403): {msg}"),
            TeableError::RateLimited(Some(secs)) => {
                write!(f, "Teable API rate limited (429), retry after {secs}s")
            }
            TeableError::RateLimited(None) => write!(f, "Teable API rate limited (429)"),
            TeableError::NotFound(msg) => write!(f, "Teable API not found (404): {msg}"),
            TeableError::Upstream { status, body } => {
                write!(f, "Teable API error {status}: {body}")
            }
        }
    }
}

impl std::error::Error for TeableError {}

/// Maps a Teable failure to an HTTP status for route handlers. Auth, upstream
/// and rate-limit failures are transient dependency problems, so they surface
/// as 503 rather than a misleading 500. Everything else stays a 500.
pub fn status_for_error(err: &anyhow::Error) -> axum::http::StatusCode {
    use axum::http::StatusCode;
    if let Some(teable_err) = err.downcast_ref::<TeableError>() {
        return match teable_err {
            TeableError::Unauthorized(_)
            | TeableError::Forbidden(_)
            | TeableError::RateLimited(_)
            | TeableError::Upstream { .. } => StatusCode::SERVICE_UNAVAILABLE,
            TeableError::NotFound(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };
    }
    if err.downcast_ref::<reqwest::Error>().is_some() {
        return StatusCode::SERVICE_UNAVAILABLE;
    }
    StatusCode::INTERNAL_SERVER_ERROR
}

fn retry_after_secs(response: &reqwest::Response) -> Option<u64> {
    response
        .headers()
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.trim().parse::<u64>().ok())
}

const MEMBER_PROJECTION: &[&str] = &[
    "Vorname",
    "Nachname",
    "Email",
    "Familie",
    "Geburtsdatum",
    "Eintrittsdatum",
    "Rolle",
];

const ALL_MEMBERS_PROJECTION: &[&str] = &[
    "Vorname",
    "Nachname",
    "Email",
    "Familie",
    "Geburtsdatum",
    "Eintrittsdatum",
    "Austrittsdatum",
    "Rolle",
];

fn parse_date_berlin(s: &str) -> String {
    use chrono::DateTime;
    use chrono_tz::Europe::Berlin;
    DateTime::parse_from_rfc3339(s)
        .map(|dt| dt.with_timezone(&Berlin).date_naive().to_string())
        .unwrap_or_else(|_| s.get(0..10).unwrap_or("").to_string())
}

fn extract_role(fields: &Value) -> Option<String> {
    fields["Rolle"].as_str().map(|s| s.to_string())
}

fn parse_member_id(value: Value) -> Option<crate::models::LinkedRecord> {
    match serde_json::from_value(value) {
        Ok(linked) => Some(linked),
        Err(e) => {
            warn!("Teable: Failed to parse linked 'Mitglied_id' field: {}", e);
            None
        }
    }
}

/// Reads a required member field, warning when Teable omits it (for example
/// after a field rename or when a projection is missing it) instead of
/// silently returning an empty value.
fn required_member_field<'a>(fields: &'a Value, record_id: &str, name: &str) -> &'a str {
    match fields.get(name).and_then(Value::as_str) {
        Some(value) => value,
        None => {
            warn!(record_id = %record_id, field = %name, "Teable member record missing required field");
            ""
        }
    }
}

fn member_from_record(record: &Value) -> Member {
    let fields = &record["fields"];
    let id = record["id"].as_str().unwrap_or("");
    Member {
        id: id.to_string(),
        first_name: required_member_field(fields, id, "Vorname").to_string(),
        last_name: required_member_field(fields, id, "Nachname").to_string(),
        email: required_member_field(fields, id, "Email").to_string(),
        family_id: fields["Familie"]
            .as_str()
            .map(|s| s.to_string())
            .or_else(|| fields["Familie"].as_i64().map(|n| n.to_string())),
        birth_date: fields["Geburtsdatum"].as_str().unwrap_or("").to_string(),
        join_date: fields["Eintrittsdatum"].as_str().map(|s| s.to_string()),
        role: extract_role(fields),
    }
}

#[derive(Clone)]
pub struct TeableConfig {
    pub api_url: String,
    pub token: String,
    pub members_table_id: String,
    pub work_hours_table_id: String,
}

/// Verifies read access to a specific table by fetching 1 record.
/// Returns Ok(record_count_hint) or Err with details.
pub async fn check_table_access(
    config: &TeableConfig,
    client: &Client,
    table_id: &str,
    table_name: &str,
) -> anyhow::Result<u64> {
    let url = format!("{}/table/{}/record?take=1", config.api_url, table_id);

    let response = make_teable_request(client, &url, &config.token, &format!("check_{table_name}"))
        .await
        .context(format!("Request failed for table '{table_name}'"))?;

    let status = response.status();
    let text = response.text().await.context(format!(
        "Failed to read response body for table '{table_name}'"
    ))?;

    if !status.is_success() {
        anyhow::bail!("Table '{table_name}' ({table_id}): HTTP {status} — {text}");
    }

    // Extract total record count; propagate JSON parse errors,
    // but keep the 0 fallback for valid JSON that lacks a numeric total
    let total = serde_json::from_str::<Value>(&text)
        .context(format!(
            "Failed to parse response JSON for table '{table_name}'"
        ))?
        .get("total")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    Ok(total)
}

/// Checks if a work hour record exists for a member at a specific date (exact date, Europe/Berlin timezone)
pub async fn work_hour_exists_for_member_at_date(
    config: &TeableConfig,
    http_client: &Client,
    member_id: &str,
    date: &str,
) -> Result<bool> {
    let filter = serde_json::json!({
        "conjunction": "and",
        "filterSet": [
            { "fieldId": "Mitglied_id", "operator": "is", "value": member_id },
            { "fieldId": "Datum", "operator": "is", "value": { "mode": "exactDate", "exactDate": format!("{}T00:00:00.000Z", date), "timeZone": "Europe/Berlin" } }
        ]
    });
    let url = format!(
        "{}/table/{}/record",
        config.api_url, config.work_hours_table_id
    );
    let request = http_client
        .get(&url)
        .header("Authorization", format!("Bearer {}", config.token))
        .header("Accept", "application/json")
        .query(&[("filter", &filter.to_string())])
        .query(&[("take", "1")]);
    let response = send_with_retry(request, "work_hours_for_date").await?;
    let response_text = handle_teable_response(response, "work_hours_for_date").await?;
    let teable_response: serde_json::Value = serde_json::from_str(&response_text)?;
    let records = teable_response["records"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    Ok(!records.is_empty())
}

/// Makes an authenticated GET request to the Teable API, with retry.
async fn make_teable_request(
    client: &Client,
    url: &str,
    token: &str,
    operation: &str,
) -> Result<reqwest::Response> {
    debug!("Making Teable {} request to: {}", operation, url);

    let request = client
        .get(url)
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/json");

    send_with_retry(request, operation).await
}

/// Sends an idempotent Teable request, retrying transient failures (429 and
/// gateway errors) with exponential backoff and honoring `Retry-After`.
///
/// Only GET requests go through here; writes must not be retried blindly.
async fn send_with_retry(request: RequestBuilder, operation: &str) -> Result<reqwest::Response> {
    const MAX_RETRIES: u32 = 3;
    // Longest `Retry-After` we are willing to wait for inside a request handler.
    // If the upstream asks for longer, return the response instead of retrying
    // sooner than requested (which only adds load while rate limited).
    const MAX_RETRY_DELAY: std::time::Duration = std::time::Duration::from_secs(10);
    let mut attempt: u32 = 0;

    loop {
        let request = request
            .try_clone()
            .ok_or_else(|| anyhow::anyhow!("Teable request could not be cloned for retry"))?;

        let response = request.send().await?;
        let status = response.status();

        let retryable = matches!(
            status,
            reqwest::StatusCode::TOO_MANY_REQUESTS
                | reqwest::StatusCode::BAD_GATEWAY
                | reqwest::StatusCode::SERVICE_UNAVAILABLE
                | reqwest::StatusCode::GATEWAY_TIMEOUT
        );

        if retryable && attempt < MAX_RETRIES {
            attempt += 1;
            let backoff = match retry_after_secs(&response) {
                Some(secs) => {
                    let delay = std::time::Duration::from_secs(secs);
                    if delay > MAX_RETRY_DELAY {
                        warn!(
                            "Teable {} returned {} with Retry-After {}s, exceeding the {}s retry budget; not retrying",
                            operation,
                            status,
                            secs,
                            MAX_RETRY_DELAY.as_secs()
                        );
                        return Ok(response);
                    }
                    delay
                }
                None => std::time::Duration::from_millis(250 * 2u64.pow(attempt)),
            };
            warn!(
                "Teable {} returned {}, retrying in {:?} (attempt {}/{})",
                operation, status, backoff, attempt, MAX_RETRIES
            );
            tokio::time::sleep(backoff).await;
            continue;
        }

        return Ok(response);
    }
}

/// Handles a Teable API response, mapping the upstream status to a
/// [`TeableError`] so callers can react appropriately.
async fn handle_teable_response(response: reqwest::Response, operation: &str) -> Result<String> {
    let status = response.status();
    let retry_after = retry_after_secs(&response);
    let response_text = response.text().await?;

    if !status.is_success() {
        error!(
            "Teable {} API error {}: {}",
            operation, status, response_text
        );
        let error = match status {
            reqwest::StatusCode::UNAUTHORIZED => TeableError::Unauthorized(response_text),
            reqwest::StatusCode::FORBIDDEN => TeableError::Forbidden(response_text),
            reqwest::StatusCode::TOO_MANY_REQUESTS => TeableError::RateLimited(retry_after),
            reqwest::StatusCode::NOT_FOUND => TeableError::NotFound(response_text),
            other => TeableError::Upstream {
                status: other.as_u16(),
                body: response_text,
            },
        };
        return Err(error.into());
    }

    debug!(
        "Teable {} response received ({} chars)",
        operation,
        response_text.len()
    );
    Ok(response_text)
}

/// Fetches every record matching `filter`, paginating with take/skip so large
/// result sets are not silently truncated by the server's default page size.
async fn fetch_all_records(
    client: &Client,
    url: &str,
    token: &str,
    filter: &Value,
    projection: Option<&[&str]>,
    operation: &str,
) -> Result<Vec<Value>> {
    // Teable recommends 100 and caps some cloud API keys there, so a larger
    // value can fail or be silently truncated.
    const PAGE_SIZE: usize = 100;

    let filter = filter.to_string();
    let mut all_records: Vec<Value> = Vec::new();

    loop {
        let skip = all_records.len().to_string();
        let take = PAGE_SIZE.to_string();
        let mut request = client
            .get(url)
            .header("Authorization", format!("Bearer {token}"))
            .header("Accept", "application/json")
            .query(&[("filter", &filter), ("take", &take), ("skip", &skip)]);

        if let Some(fields) = projection {
            for field in fields {
                request = request.query(&[("projection[]", *field)]);
            }
        }

        let response = send_with_retry(request, operation).await?;
        let response_text = handle_teable_response(response, operation).await?;
        let value: Value = serde_json::from_str(&response_text)?;
        let records = value["records"]
            .as_array()
            .ok_or_else(|| anyhow::anyhow!("Invalid Teable response format"))?
            .clone();

        let fetched = records.len();
        all_records.extend(records);

        // Prefer the server-reported total: if a key caps `take` below
        // PAGE_SIZE, a short page does not necessarily mean the last page.
        // Only treat a short page as final when no total is available, and stop
        // on an empty page so a bogus total cannot loop forever.
        let total = value.get("total").and_then(|total| total.as_u64());
        let reached_total = total.is_some_and(|total| all_records.len() as u64 >= total);
        let short_page_is_final = total.is_none() && fetched < PAGE_SIZE;
        if fetched == 0 || reached_total || short_page_is_final {
            break;
        }
    }

    Ok(all_records)
}

pub async fn get_member_by_id(
    config: &TeableConfig,
    client: &Client,
    id: &str,
) -> Result<Option<Member>> {
    get_member_by_id_with_projection(config, client, id, Some(MEMBER_PROJECTION)).await
}

pub async fn get_member_by_id_with_projection(
    config: &TeableConfig,
    client: &Client,
    id: &str,
    projection: Option<&[&str]>,
) -> Result<Option<Member>> {
    let url = format!(
        "{}/table/{}/record/{}",
        config.api_url, config.members_table_id, id
    );
    let req = if let Some(proj) = projection {
        let mut req = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", config.token))
            .header("Accept", "application/json");
        for field in proj {
            req = req.query(&[("projection[]", *field)]);
        }
        req
    } else {
        client
            .get(&url)
            .header("Authorization", format!("Bearer {}", config.token))
            .header("Accept", "application/json")
    };
    debug!(member_id = %id, "Fetching member by ID");
    let response = send_with_retry(req, "member_by_id").await?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        debug!(member_id = %id, "No member found (404)");
        return Ok(None);
    }
    let response_text = handle_teable_response(response, "member_by_id").await?;
    // Parse Teable response (single record, not array)
    let record: Value = serde_json::from_str(&response_text)?;
    let fields = &record["fields"];
    if fields.is_null() {
        debug!(member_id = %id, "No member found");
        return Ok(None);
    }
    let member = member_from_record(&record);
    debug!(member_id = %member.id, "Member found");
    Ok(Some(member))
}

/// Get a specific member by email - optimized to filter at API level
pub async fn get_member_by_email(
    config: &TeableConfig,
    client: &Client,
    email: &str,
) -> Result<Option<Member>> {
    get_member_by_email_with_projection(config, client, email, Some(MEMBER_PROJECTION)).await
}

pub async fn get_member_by_email_with_projection(
    config: &TeableConfig,
    client: &Client,
    email: &str,
    projection: Option<&[&str]>,
) -> Result<Option<Member>> {
    let email_lowercase = email.to_lowercase();

    let filter = serde_json::json!({
        "conjunction": "and",
        "filterSet": [{
            "fieldId": "Email",
            "operator": "is",
            "value": email_lowercase
        }]
    });
    let url = format!(
        "{}/table/{}/record",
        config.api_url, config.members_table_id
    );
    let mut req = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", config.token))
        .header("Accept", "application/json")
        .query(&[("filter", &filter.to_string())]);
    if let Some(proj) = projection {
        for field in proj {
            req = req.query(&[("projection[]", *field)]);
        }
    }
    debug!("Fetching member by email");
    let response = send_with_retry(req, "member_by_email").await?;
    let response_text = handle_teable_response(response, "member_by_email").await?;
    // Parse Teable response
    let teable_response: Value = serde_json::from_str(&response_text)?;
    let records = teable_response["records"]
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("Invalid Teable response format"))?;

    if let Some(record) = records.first() {
        let member = member_from_record(record);
        debug!(member_id = %member.id, "Member found by email");
        Ok(Some(member))
    } else {
        debug!("No member found for supplied email");
        Ok(None)
    }
}

/// Get family members by family ID - optimized to filter at API level
pub async fn get_family_members(
    config: &TeableConfig,
    client: &Client,
    family_id: &str,
) -> Result<TeableResponse<Member>> {
    get_family_members_with_projection(config, client, family_id, Some(MEMBER_PROJECTION)).await
}

pub async fn get_family_members_with_projection(
    config: &TeableConfig,
    client: &Client,
    family_id: &str,
    projection: Option<&[&str]>,
) -> Result<TeableResponse<Member>> {
    let filter = serde_json::json!({
        "conjunction": "and",
        "filterSet": [{
            "fieldId": "Familie",
            "operator": "is",
            "value": family_id
        }]
    });
    let url = format!(
        "{}/table/{}/record",
        config.api_url, config.members_table_id
    );
    debug!(family_id = %family_id, "Fetching family members");
    let records = fetch_all_records(
        client,
        &url,
        &config.token,
        &filter,
        projection,
        "family_members",
    )
    .await?;
    let mut members = Vec::with_capacity(records.len());
    for record in &records {
        members.push(member_from_record(record));
    }
    debug!(family_id = %family_id, count = members.len(), "Family members found");
    Ok(TeableResponse {
        count: Some(members.len()),
        results: members,
    })
}

pub async fn get_work_hour_by_id(
    config: &TeableConfig,
    client: &Client,
    work_hour_id: &str,
) -> Result<Option<WorkHour>> {
    let url = format!(
        "{}/table/{}/record/{}",
        config.api_url, config.work_hours_table_id, work_hour_id
    );

    debug!(work_hour_id = %work_hour_id, "Fetching work hour by ID");
    let response = make_teable_request(client, &url, &config.token, "work_hour_by_id").await?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        debug!(work_hour_id = %work_hour_id, "No work hour found (404)");
        return Ok(None);
    }
    let response_text = handle_teable_response(response, "work_hour_by_id").await?;

    // Parse Teable response (single record, not array)
    let record: Value = serde_json::from_str(&response_text)?;
    let fields = &record["fields"];

    if fields.is_null() {
        debug!(work_hour_id = %work_hour_id, "No work hour found");
        return Ok(None);
    }

    let work_hour = WorkHour {
        id: record["id"].as_str().unwrap_or("").to_string(),
        member_id: parse_member_id(fields["Mitglied_id"].clone()),
        last_name: fields["Nachname"].as_str().map(|s| s.to_string()),
        first_name: fields["Vorname"].as_str().map(|s| s.to_string()),
        created_on: fields["Created on"].as_str().map(|s| s.to_string()),
        date: fields["Datum"].as_str().map(parse_date_berlin),
        description: fields["Tätigkeit"].as_str().map(|s| s.to_string()),
        duration_hours: fields["Stunden"].as_f64(), // Keep hours as-is from Teable
    };

    debug!(
        work_hour_id = %work_hour.id,
        member_id = ?work_hour.member_id,
        "Work hour found"
    );
    Ok(Some(work_hour))
}

pub async fn get_work_hours_for_member_by_year(
    config: &TeableConfig,
    client: &Client,
    member_record_id: &str,
    year: i32,
) -> Result<TeableResponse<WorkHour>> {
    let url = format!(
        "{}/table/{}/record",
        config.api_url, config.work_hours_table_id
    );

    // Build filter set
    let mut filter_set = vec![];

    filter_set.push(serde_json::json!({
        "fieldId": "Mitglied_id",
        "operator": "is",
        "value": member_record_id
    }));

    // Use date range for the year: isOnOrAfter YYYY-01-01 and isOnOrBefore YYYY-12-31
    filter_set.push(serde_json::json!({
        "fieldId": "Datum",
        "operator": "isOnOrAfter",
        "value": {
            "mode": "exactDate",
            "exactDate": format!("{}-01-01T00:00:00.000Z", year),
            "timeZone": "Europe/Berlin"
        }
    }));
    filter_set.push(serde_json::json!({
        "fieldId": "Datum",
        "operator": "isOnOrBefore",
        "value": {
            "mode": "exactDate",
            "exactDate": format!("{}-12-31T00:00:00.000Z", year),
            "timeZone": "Europe/Berlin"
        }
    }));

    let filter = serde_json::json!({
        "conjunction": "and",
        "filterSet": filter_set
    });
    debug!("Filtering work hours with filter: {}", filter);

    let records =
        fetch_all_records(client, &url, &config.token, &filter, None, "work_hours").await?;

    let mut work_hours = Vec::with_capacity(records.len());
    for record in &records {
        let fields = &record["fields"];

        // Extract member info from the linked Mitglied_id field
        let member_id_value = fields["Mitglied_id"].clone();

        debug!(
            "[teable.rs] Parsed work hour: record_id={:?}, member_id_field={:?}, date={:?}",
            record["id"], member_id_value, fields["Datum"]
        );

        let work_hour = WorkHour {
            id: record["id"].as_str().unwrap_or("").to_string(),
            member_id: parse_member_id(member_id_value), // Store the linked record field
            last_name: fields["Nachname"].as_str().map(|s| s.to_string()),
            first_name: fields["Vorname"].as_str().map(|s| s.to_string()),
            created_on: fields["Created on"].as_str().map(|s| s.to_string()),
            date: fields["Datum"].as_str().map(parse_date_berlin),
            description: fields["Tätigkeit"].as_str().map(|s| s.to_string()),
            duration_hours: fields["Stunden"].as_f64(), // Keep hours as-is from Teable
        };
        work_hours.push(work_hour);
    }

    debug!(count = work_hours.len(), "Fetched work hours");

    Ok(TeableResponse {
        count: Some(work_hours.len()),
        results: work_hours,
    })
}

pub async fn create_work_hour(
    config: &TeableConfig,
    client: &Client,
    date: &str,
    description: &str,
    duration_hours: f64,
    member: &Member,
) -> Result<WorkHour> {
    let url = format!(
        "{}/table/{}/record",
        config.api_url, config.work_hours_table_id
    );

    debug!(member_id = %member.id, "Teable: creating work hour");

    // Create the payload for Teable with proper member linkage
    let payload = serde_json::json!({
        "records": [{
            "fields": {
                "Mitglied_id": {"id": &member.id}, // CRITICAL: Link to member record (object format)
                "Nachname": &member.last_name,
                "Vorname": &member.first_name,
                "Stunden": duration_hours, // Hours as-is for Teable
                "Datum": date,
                "Tätigkeit": description
            }
        }]
    });

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.token))
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&payload)
        .send()
        .await?;

    let response_text = handle_teable_response(response, "create_work_hour").await?;
    debug!("Teable: work hour created");

    // Parse the response to return the created work hour
    let teable_response: Value = serde_json::from_str(&response_text)?;
    let record = teable_response
        .get("records")
        .and_then(|value| value.as_array())
        .and_then(|records| records.first())
        .ok_or_else(|| anyhow::anyhow!("Teable create_work_hour response missing record"))?;
    let fields = &record["fields"];
    let id = record["id"]
        .as_str()
        .filter(|id| !id.is_empty())
        .ok_or_else(|| anyhow::anyhow!("Teable create_work_hour response missing record id"))?
        .to_string();

    Ok(WorkHour {
        id,
        member_id: parse_member_id(fields["Mitglied_id"].clone()),
        last_name: fields["Nachname"].as_str().map(|s| s.to_string()),
        first_name: fields["Vorname"].as_str().map(|s| s.to_string()),
        created_on: fields["Created on"].as_str().map(|s| s.to_string()),
        date: fields["Datum"].as_str().map(parse_date_berlin),
        description: fields["Tätigkeit"].as_str().map(|s| s.to_string()),
        duration_hours: fields["Stunden"].as_f64(), // Keep hours as-is from Teable
    })
}

pub async fn update_work_hour(
    config: &TeableConfig,
    client: &Client,
    work_hour_id: &str,
    date: &str,
    description: &str,
    duration_hours: f64,
    member: &Member,
) -> Result<WorkHour> {
    let url = format!(
        "{}/table/{}/record/{}",
        config.api_url, config.work_hours_table_id, work_hour_id
    );

    debug!(work_hour_id = %work_hour_id, member_id = %member.id, "Teable: updating work hour");

    // Create the payload for Teable update - use the format from frontend service
    let payload = serde_json::json!({
        "record": {
            "fields": {
                "Mitglied_id": {"id": &member.id}, // CRITICAL: Maintain member record link (object format)
                "Nachname": &member.last_name,
                "Vorname": &member.first_name,
                "Stunden": duration_hours, // Hours as-is for Teable
                "Datum": date,
                "Tätigkeit": description
            }
        }
    });

    // Use PATCH method with record ID in URL path (correct Teable API format)
    let response = client
        .patch(&url)
        .header("Authorization", format!("Bearer {}", config.token))
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&payload)
        .send()
        .await?;

    let response_text = handle_teable_response(response, "update_work_hour").await?;
    debug!("Teable: work hour updated");

    // Parse the response - check if it's wrapped in record or direct
    let teable_response: Value = serde_json::from_str(&response_text)?;
    let (record_id, fields) = if let Some(record) = teable_response.get("record") {
        // Response wrapped in "record"
        (
            record["id"].as_str().unwrap_or("").to_string(),
            &record["fields"],
        )
    } else {
        // Direct response
        (
            teable_response["id"].as_str().unwrap_or("").to_string(),
            &teable_response["fields"],
        )
    };

    if record_id.is_empty() {
        anyhow::bail!("Teable update_work_hour response missing record id");
    }

    Ok(WorkHour {
        id: record_id,
        member_id: parse_member_id(fields["Mitglied_id"].clone()),
        last_name: fields["Nachname"].as_str().map(|s| s.to_string()),
        first_name: fields["Vorname"].as_str().map(|s| s.to_string()),
        created_on: fields["Created on"].as_str().map(|s| s.to_string()),
        date: fields["Datum"].as_str().map(parse_date_berlin),
        description: fields["Tätigkeit"].as_str().map(|s| s.to_string()),
        duration_hours: fields["Stunden"].as_f64(), // Keep hours as-is from Teable
    })
}

pub async fn delete_work_hour(
    config: &TeableConfig,
    client: &Client,
    work_hour_id: &str,
) -> Result<()> {
    let url = format!(
        "{}/table/{}/record",
        config.api_url, config.work_hours_table_id
    );

    let response = client
        .delete(&url)
        .header("Authorization", format!("Bearer {}", config.token))
        .header("Accept", "application/json")
        .query(&[("recordIds[]", work_hour_id)])
        .send()
        .await?;

    handle_teable_response(response, "delete_work_hour").await?;
    info!(work_hour_id = %work_hour_id, "Teable: work hour deleted");

    Ok(())
}

/// Get all members by email (case-insensitive, returns Vec<Member>)
pub async fn get_members_by_email(
    config: &TeableConfig,
    client: &Client,
    email: &str,
) -> Result<Vec<Member>> {
    let filter = serde_json::json!({
        "conjunction": "and",
        "filterSet": [{
            "fieldId": "Email",
            "operator": "is",
            "value": email
        }]
    });
    let url = format!(
        "{}/table/{}/record",
        config.api_url, config.members_table_id
    );
    let records = fetch_all_records(
        client,
        &url,
        &config.token,
        &filter,
        Some(MEMBER_PROJECTION),
        "members_by_email",
    )
    .await?;
    let mut members = Vec::with_capacity(records.len());
    for record in &records {
        members.push(member_from_record(record));
    }
    Ok(members)
}

/// Fetches all active members from Teable with optional role filter.
/// Uses take/skip pagination (max take=1000 per Teable docs) to retrieve all records.
pub async fn get_all_active_members(
    config: &TeableConfig,
    client: &Client,
    role_filter: Option<&str>,
) -> Result<Vec<Member>> {
    let base_url = format!(
        "{}/table/{}/record",
        config.api_url, config.members_table_id
    );

    // Teable recommends 100 and caps some cloud API keys there.
    let page_size = 100;
    let mut all_records: Vec<Value> = Vec::new();

    loop {
        let skip = all_records.len();
        let mut req = client
            .get(&base_url)
            .header("Authorization", format!("Bearer {}", config.token))
            .header("Accept", "application/json")
            .query(&[
                ("take", &page_size.to_string()),
                ("skip", &skip.to_string()),
            ]);

        // Build filter set: only active members (no Austrittsdatum)
        let mut filter_set = vec![serde_json::json!({
            "fieldId": "Austrittsdatum",
            "operator": "isEmpty",
            "value": serde_json::Value::Null
        })];

        if let Some(role) = role_filter {
            filter_set.push(serde_json::json!({
                "fieldId": "Rolle",
                "operator": "contains",
                "value": role
            }));
        }

        let filter = serde_json::json!({
            "conjunction": "and",
            "filterSet": filter_set
        });
        req = req.query(&[("filter", &filter.to_string())]);

        for field in ALL_MEMBERS_PROJECTION.iter() {
            req = req.query(&[("projection[]", *field)]);
        }

        let response = send_with_retry(req, "all_active_members").await?;
        let response_text = handle_teable_response(response, "all_active_members").await?;
        let teable_response: Value = serde_json::from_str(&response_text)?;

        let records = teable_response["records"]
            .as_array()
            .cloned()
            .unwrap_or_default();

        let fetched = records.len();
        all_records.extend(records);

        debug!(
            "Pagination: skip={}, take={}, fetched={}, total_so_far={}",
            skip,
            page_size,
            fetched,
            all_records.len()
        );

        // Stop when the server total is reached, or on a short/empty page when
        // no total is reported. The empty-page stop prevents endless paging if
        // the server reports a total it never fulfills.
        let total = teable_response
            .get("total")
            .and_then(|total| total.as_u64());
        let reached_total = total.is_some_and(|total| all_records.len() as u64 >= total);
        let short_page_is_final = total.is_none() && fetched < page_size;
        if fetched == 0 || reached_total || short_page_is_final {
            break;
        }
    }

    let mut members = Vec::with_capacity(all_records.len());
    for record in &all_records {
        let fields = &record["fields"];
        if let Some(email) = fields["Email"].as_str() {
            if !email.trim().is_empty() {
                let member = member_from_record(record);
                members.push(member);
            }
        }
    }

    info!(
        active_members = members.len(),
        raw_records = all_records.len(),
        pages = all_records.len().div_ceil(page_size),
        "Fetched active members"
    );
    Ok(members)
}
