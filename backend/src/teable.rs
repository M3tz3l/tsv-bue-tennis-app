//! Teable API client: member lookups, work hour CRUD, and paginated queries.

use crate::models::{Member, TeableResponse, WorkHour};
use anyhow::{Context, Result};
use reqwest::Client;
use serde_json::Value;
use tracing::{debug, error, info, warn};

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

fn member_from_record(record: &Value) -> Member {
    let fields = &record["fields"];
    Member {
        id: record["id"].as_str().unwrap_or("").to_string(),
        first_name: fields["Vorname"].as_str().unwrap_or("").to_string(),
        last_name: fields["Nachname"].as_str().unwrap_or("").to_string(),
        email: fields["Email"].as_str().unwrap_or("").to_string(),
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
    let response = http_client
        .get(&url)
        .header("Authorization", format!("Bearer {}", config.token))
        .header("Accept", "application/json")
        .query(&[("filter", &filter.to_string())])
        .send()
        .await?;
    let response_text = handle_teable_response(response, "work_hours_for_date").await?;
    let teable_response: serde_json::Value = serde_json::from_str(&response_text)?;
    let records = teable_response["records"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    Ok(!records.is_empty())
}

/// Makes an authenticated GET request to Teable API
async fn make_teable_request(
    client: &Client,
    url: &str,
    token: &str,
    operation: &str,
) -> Result<reqwest::Response> {
    debug!("Making Teable {} request to: {}", operation, url);

    let response = client
        .get(url)
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/json")
        .send()
        .await?;

    Ok(response)
}

/// Handles Teable API response with consistent error handling
async fn handle_teable_response(response: reqwest::Response, operation: &str) -> Result<String> {
    let status = response.status();
    let response_text = response.text().await?;

    if !status.is_success() {
        error!(
            "Teable {} API error {}: {}",
            operation, status, response_text
        );
        return Err(anyhow::anyhow!(
            "Teable API error {}: {}",
            status,
            response_text
        ));
    }

    debug!(
        "Teable {} response received ({} chars)",
        operation,
        response_text.len()
    );
    Ok(response_text)
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
    info!(
        "Fetching member by ID: {} with projection: {:?}",
        id, projection
    );
    let response = req.send().await?;
    let response_text = handle_teable_response(response, "member_by_id").await?;
    // Parse Teable response (single record, not array)
    let record: Value = serde_json::from_str(&response_text)?;
    let fields = &record["fields"];
    if fields.is_null() {
        warn!("No member found with id: {}", id);
        return Ok(None);
    }
    let member = member_from_record(&record);
    info!(
        "Found member: {} {} ({}) - ID: {}, Birth Date: {}, Join Date: {:?}",
        member.first_name,
        member.last_name,
        member.email,
        member.id,
        member.birth_date,
        member.join_date
    );
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
    info!(
        "Fetching member by email: {} (normalized: {}) with filter and projection: {:?}",
        email, email_lowercase, projection
    );
    let response = req.send().await?;
    let response_text = handle_teable_response(response, "member_by_email").await?;
    // Parse Teable response
    let teable_response: Value = serde_json::from_str(&response_text)?;
    let records = teable_response["records"]
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("Invalid Teable response format"))?;

    if let Some(record) = records.first() {
        let member = member_from_record(record);
        info!(
            "Found member: {} {} ({}) - Birth Date: {}, Join Date: {:?}",
            member.first_name, member.last_name, member.email, member.birth_date, member.join_date
        );
        Ok(Some(member))
    } else {
        warn!("No member found with email: {} (case insensitive)", email);
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
    info!(
        "Fetching family members for family: {} with filter and projection: {:?}",
        family_id, projection
    );
    let response = req.send().await?;
    let response_text = handle_teable_response(response, "family_members").await?;
    // Parse Teable response
    let teable_response: Value = serde_json::from_str(&response_text)?;
    let records = teable_response["records"]
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("Invalid Teable response format"))?;
    let mut members = Vec::with_capacity(records.len());
    for record in records {
        let member = member_from_record(record);
        members.push(member);
    }
    info!(
        "Found {} family members for family: {}",
        members.len(),
        family_id
    );
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

    info!("Fetching work hour by ID: {}", work_hour_id);
    let response = make_teable_request(client, &url, &config.token, "work_hour_by_id").await?;
    let response_text = handle_teable_response(response, "work_hour_by_id").await?;

    // Parse Teable response (single record, not array)
    let record: Value = serde_json::from_str(&response_text)?;
    let fields = &record["fields"];

    if fields.is_null() {
        warn!("No work hour found with id: {}", work_hour_id);
        return Ok(None);
    }

    let work_hour = WorkHour {
        id: record["id"].as_str().unwrap_or("").to_string(),
        member_id: serde_json::from_value(fields["Mitglied_id"].clone()).unwrap_or(None),
        last_name: fields["Nachname"].as_str().map(|s| s.to_string()),
        first_name: fields["Vorname"].as_str().map(|s| s.to_string()),
        created_on: fields["Created on"].as_str().map(|s| s.to_string()),
        date: fields["Datum"].as_str().map(parse_date_berlin),
        description: fields["Tätigkeit"].as_str().map(|s| s.to_string()),
        duration_hours: fields["Stunden"].as_f64(), // Keep hours as-is from Teable
    };

    info!(
        "Found work hour: {} for member {:?}",
        work_hour.id, work_hour.member_id
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
            "exactDate": format!("{}-12-31T23:59:59.999Z", year),
            "timeZone": "Europe/Berlin"
        }
    }));

    let filter = serde_json::json!({
        "conjunction": "and",
        "filterSet": filter_set
    });
    debug!("Filtering work hours with filter: {}", filter);

    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", config.token))
        .header("Accept", "application/json")
        .query(&[("filter", &filter.to_string())])
        .send()
        .await?;
    let response_text = handle_teable_response(response, "work_hours").await?;

    // Log a preview of the response for debugging
    debug!(
        "Teable work hours raw response preview: {}",
        &response_text[..std::cmp::min(response_text.len(), 500)]
    );

    // Parse Teable response and convert to compatible format
    let teable_response: Value = serde_json::from_str(&response_text)?;
    let records = teable_response["records"]
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("Invalid Teable response format"))?;

    let mut work_hours = Vec::new();
    for record in records {
        let fields = &record["fields"];

        // Extract member info from the linked Mitglied_id field
        let member_id_value = fields["Mitglied_id"].clone();

        debug!(
            "[teable.rs] Parsed work hour: record_id={:?}, member_id_field={:?}, date={:?}",
            record["id"], member_id_value, fields["Datum"]
        );

        let work_hour = WorkHour {
            id: record["id"].as_str().unwrap_or("").to_string(),
            member_id: serde_json::from_value(member_id_value).unwrap_or(None), // Store the linked record field
            last_name: fields["Nachname"].as_str().map(|s| s.to_string()),
            first_name: fields["Vorname"].as_str().map(|s| s.to_string()),
            created_on: fields["Created on"].as_str().map(|s| s.to_string()),
            date: fields["Datum"].as_str().map(parse_date_berlin),
            description: fields["Tätigkeit"].as_str().map(|s| s.to_string()),
            duration_hours: fields["Stunden"].as_f64(), // Keep hours as-is from Teable
        };
        work_hours.push(work_hour);
    }

    info!(
        "Teable: Successfully fetched {} work hours",
        work_hours.len()
    );

    Ok(TeableResponse {
        count: Some(work_hours.len()),
        results: work_hours,
    })
}

#[allow(dead_code)]
pub async fn create_work_hour(
    config: &TeableConfig,
    client: &Client,
    date: &str,
    description: &str,
    duration_hours: f64,
    member_id: String,
) -> Result<WorkHour> {
    let url = format!(
        "{}/table/{}/record",
        config.api_url, config.work_hours_table_id
    );

    // Get the member's information for the payload using get_member_by_id
    let member = get_member_by_id(config, client, &member_id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Member with ID {} not found", member_id))?;
    debug!("Datum: {}", date);
    debug!("Tätigkeit: {}", description);
    debug!("Stunden: {} hours", duration_hours);
    debug!("Mitglied_id: {} (linked record)", member_id);
    debug!("Nachname: {}", member.last_name);
    debug!("Vorname: {}", member.first_name);

    // Create the payload for Teable with proper member linkage
    let payload = serde_json::json!({
        "records": [{
            "fields": {
                "Mitglied_id": {"id": member_id}, // CRITICAL: Link to member record (object format)
                "Nachname": member.last_name,
                "Vorname": member.first_name,
                "Stunden": duration_hours, // Hours as-is for Teable
                "Datum": date,
                "Tätigkeit": description
            }
        }]
    });

    debug!(
        "Teable: Sending payload: {}",
        serde_json::to_string(&payload)?
    );

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.token))
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&payload)
        .send()
        .await?;

    let response_text = handle_teable_response(response, "create_work_hour").await?;
    info!("Teable: Work hour created successfully: {}", response_text);

    // Parse the response to return the created work hour
    let teable_response: Value = serde_json::from_str(&response_text)?;
    let record = &teable_response["records"][0];
    let fields = &record["fields"];

    Ok(WorkHour {
        id: record["id"].as_str().unwrap_or("").to_string(),
        member_id: serde_json::from_value(fields["Mitglied_id"].clone()).unwrap_or(None),
        last_name: fields["Nachname"].as_str().map(|s| s.to_string()),
        first_name: fields["Vorname"].as_str().map(|s| s.to_string()),
        created_on: None,
        date: fields["Datum"].as_str().map(parse_date_berlin),
        description: fields["Tätigkeit"].as_str().map(|s| s.to_string()),
        duration_hours: fields["Stunden"].as_f64(), // Keep hours as-is from Teable
    })
}

#[allow(dead_code)]
pub async fn update_work_hour(
    config: &TeableConfig,
    client: &Client,
    work_hour_id: &str,
    date: &str,
    description: &str,
    duration_hours: f64,
    member_id: String,
) -> Result<WorkHour> {
    let url = format!(
        "{}/table/{}/record/{}",
        config.api_url, config.work_hours_table_id, work_hour_id
    );

    let member = get_member_by_id(config, client, &member_id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Member with ID {} not found", member_id))?;

    info!(
        "Teable: Updating work hour {} with proper member linkage",
        work_hour_id
    );
    debug!("Datum: {}", date);
    debug!("Tätigkeit: {}", description);
    debug!("Stunden: {} hours", duration_hours);
    debug!("Mitglied_id: {} (linked record)", member_id);

    // Create the payload for Teable update - use the format from frontend service
    let payload = serde_json::json!({
        "record": {
            "fields": {
                "Mitglied_id": {"id": member_id}, // CRITICAL: Maintain member record link (object format)
                "Nachname": member.last_name,
                "Vorname": member.first_name,
                "Stunden": duration_hours, // Hours as-is for Teable
                "Datum": date,
                "Tätigkeit": description
            }
        }
    });

    debug!(
        "Teable: Sending update payload: {}",
        serde_json::to_string(&payload)?
    );

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
    info!("Teable: Work hour updated successfully: {}", response_text);

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

    Ok(WorkHour {
        id: record_id,
        member_id: serde_json::from_value(fields["Mitglied_id"].clone()).unwrap_or(None),
        last_name: fields["Nachname"].as_str().map(|s| s.to_string()),
        first_name: fields["Vorname"].as_str().map(|s| s.to_string()),
        created_on: None,
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
        "{}/table/{}/record/{}",
        config.api_url, config.work_hours_table_id, work_hour_id
    );

    let response = client
        .delete(&url)
        .header("Authorization", format!("Bearer {}", config.token))
        .send()
        .await?;

    handle_teable_response(response, "delete_work_hour").await?;
    info!("Teable: Work hour {} deleted successfully", work_hour_id);

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
    let mut req = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", config.token))
        .header("Accept", "application/json")
        .query(&[("filter", &filter.to_string())]);
    for field in MEMBER_PROJECTION.iter() {
        req = req.query(&[("projection[]", *field)]);
    }
    let response = req.send().await?;
    let response_text = handle_teable_response(response, "members_by_email").await?;
    let teable_response: Value = serde_json::from_str(&response_text)?;
    let records = teable_response["records"]
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("Invalid Teable response format"))?;
    let mut members = Vec::with_capacity(records.len());
    for record in records {
        let member = member_from_record(record);
        members.push(member);
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

    let page_size = 1000;
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
            "value": true
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

        let response = req.send().await?;
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

        // Stop when this page returned fewer records than requested (last page)
        if fetched < page_size {
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
        "Fetched {} active members out of {} raw records ({} pages)",
        members.len(),
        all_records.len(),
        all_records.len().div_ceil(page_size)
    );
    Ok(members)
}
