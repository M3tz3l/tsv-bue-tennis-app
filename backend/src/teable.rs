use crate::config::Config;
use crate::models::{Member, TeableResponse, WorkHour};
use anyhow::Result;
use reqwest::Client;
use serde_json::Value;
use tracing::{error, info};

fn get_teable_config(
) -> Result<(String, String, String, String, String), Box<dyn std::error::Error + Send + Sync>> {
    let config = Config::from_env()?;
    Ok((
        config.teable_api_url,
        config.teable_token,
        config.teable_base_id,
        config.members_table_id,
        config.work_hours_table_id,
    ))
}

/// Makes an authenticated GET request to Teable API
async fn make_teable_request(
    client: &Client,
    url: &str,
    token: &str,
    operation: &str,
) -> Result<reqwest::Response> {
    info!("Making Teable {} request to: {}", operation, url);

    let response = client
        .get(url)
        .header("Authorization", format!("Bearer {}", token))
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

    info!(
        "Teable {} response received ({} chars)",
        operation,
        response_text.len()
    );
    Ok(response_text)
}

pub async fn get_member_by_id(client: &Client, id: &str) -> Result<Option<Member>> {
    get_member_by_id_with_projection(
        client,
        id,
        Some(
            &[
                "Vorname",
                "Nachname",
                "Email",
                "Familie",
                "UUID",
                "Geburtsdatum",
            ][..],
        ),
    )
    .await
}

pub async fn get_member_by_id_with_projection(
    client: &Client,
    id: &str,
    projection: Option<&[&str]>,
) -> Result<Option<Member>> {
    let (api_url, token, _base_id, members_table_id, _) =
        get_teable_config().map_err(|e| anyhow::anyhow!("Config error: {}", e))?;
    let url = format!("{}/table/{}/record/{}", api_url, members_table_id, id);
    let req = if let Some(proj) = projection {
        // Pass as repeated projection[] params
        let mut req = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Accept", "application/json");
        for field in proj {
            req = req.query(&[("projection[]", *field)]);
        }
        req
    } else {
        client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Accept", "application/json")
    };
    info!(
        "🔍 Fetching member by ID: {} with projection: {:?}",
        id, projection
    );
    let response = req.send().await?;
    let response_text = handle_teable_response(response, "member_by_id").await?;
    // Parse Teable response (single record, not array)
    let record: Value = serde_json::from_str(&response_text)?;
    let fields = &record["fields"];
    if fields.is_null() {
        info!("No member found with id: {}", id);
        return Ok(None);
    }
    let member = Member {
        id: record["id"].as_str().unwrap_or("").to_string(),
        first_name: fields["Vorname"].as_str().unwrap_or("").to_string(),
        last_name: fields["Nachname"].as_str().unwrap_or("").to_string(),
        email: fields["Email"].as_str().unwrap_or("").to_string(),
        family_id: fields["Familie"]
            .as_str()
            .map(|s| s.to_string())
            .or_else(|| fields["Familie"].as_i64().map(|n| n.to_string())),
        uuid: fields["UUID"].as_str().unwrap_or("").to_string(),
        birth_date: fields["Geburtsdatum"].as_str().map(|s| s.to_string()),
    };
    info!(
        "✅ Found member: {} {} ({})",
        member.first_name, member.last_name, member.email
    );
    Ok(Some(member))
}

/// Get a specific member by email - optimized to filter at API level
pub async fn get_member_by_email(client: &Client, email: &str) -> Result<Option<Member>> {
    get_member_by_email_with_projection(
        client,
        email,
        Some(
            &[
                "Vorname",
                "Nachname",
                "Email",
                "Familie",
                "UUID",
                "Geburtsdatum",
            ][..],
        ),
    )
    .await
}

pub async fn get_member_by_email_with_projection(
    client: &Client,
    email: &str,
    projection: Option<&[&str]>,
) -> Result<Option<Member>> {
    let (api_url, token, _base_id, members_table_id, _) =
        get_teable_config().map_err(|e| anyhow::anyhow!("Config error: {}", e))?;
    
    // Normalize email to lowercase for case-insensitive comparison
    let email_lowercase = email.to_lowercase();
    
    // Use Teable API filtering to only fetch the specific user
    let filter = serde_json::json!({
        "conjunction": "and",
        "filterSet": [{
            "fieldId": "Email",
            "operator": "is",
            "value": email_lowercase
        }]
    });
    let url = format!("{}/table/{}/record", api_url, members_table_id);
    let mut req = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Accept", "application/json")
        .query(&[("filter", &filter.to_string())]);
    if let Some(proj) = projection {
        for field in proj {
            req = req.query(&[("projection[]", *field)]);
        }
    }
    info!(
        "🔍 Fetching member by email: {} (normalized: {}) with filter and projection: {:?}",
        email, email_lowercase, projection
    );
    let response = req.send().await?;
    let response_text = handle_teable_response(response, "member_by_email").await?;
    // Parse Teable response
    let teable_response: Value = serde_json::from_str(&response_text)?;
    let records = teable_response["records"]
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("Invalid Teable response format"))?;
    
    // If direct filter didn't work, do case-insensitive client-side filtering
    let matching_record = records.iter().find(|record| {
        let fields = &record["fields"];
        if let Some(record_email) = fields["Email"].as_str() {
            record_email.to_lowercase() == email_lowercase
        } else {
            false
        }
    });
    
    if let Some(record) = matching_record {
        let fields = &record["fields"];
        let member = Member {
            id: record["id"].as_str().unwrap_or("").to_string(),
            first_name: fields["Vorname"].as_str().unwrap_or("").to_string(),
            last_name: fields["Nachname"].as_str().unwrap_or("").to_string(),
            email: fields["Email"].as_str().unwrap_or("").to_string(),
            family_id: fields["Familie"]
                .as_str()
                .map(|s| s.to_string())
                .or_else(|| fields["Familie"].as_i64().map(|n| n.to_string())),
            uuid: fields["UUID"].as_str().unwrap_or("").to_string(),
            birth_date: fields["Geburtsdatum"].as_str().map(|s| s.to_string()),
        };
        info!(
            "✅ Found member: {} {} ({}) - case insensitive match",
            member.first_name, member.last_name, member.email
        );
        Ok(Some(member))
    } else {
        info!("No member found with email: {} (case insensitive)", email);
        Ok(None)
    }
}

/// Get family members by family ID - optimized to filter at API level
pub async fn get_family_members(
    client: &Client,
    family_id: &str,
) -> Result<TeableResponse<Member>> {
    get_family_members_with_projection(
        client,
        family_id,
        Some(
            &[
                "Vorname",
                "Nachname",
                "Email",
                "Familie",
                "UUID",
                "Geburtsdatum",
            ][..],
        ),
    )
    .await
}

pub async fn get_family_members_with_projection(
    client: &Client,
    family_id: &str,
    projection: Option<&[&str]>,
) -> Result<TeableResponse<Member>> {
    let (api_url, token, _base_id, members_table_id, _) =
        get_teable_config().map_err(|e| anyhow::anyhow!("Config error: {}", e))?;
    // Use Teable API filtering to only fetch family members
    let filter = serde_json::json!({
        "conjunction": "and",
        "filterSet": [{
            "fieldId": "Familie",
            "operator": "is",
            "value": family_id
        }]
    });
    let url = format!("{}/table/{}/record", api_url, members_table_id);
    let mut req = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Accept", "application/json")
        .query(&[("filter", &filter.to_string())]);
    if let Some(proj) = projection {
        for field in proj {
            req = req.query(&[("projection[]", *field)]);
        }
    }
    info!(
        "🔍 Fetching family members for family: {} with filter and projection: {:?}",
        family_id, projection
    );
    let response = req.send().await?;
    let response_text = handle_teable_response(response, "family_members").await?;
    // Parse Teable response
    let teable_response: Value = serde_json::from_str(&response_text)?;
    let records = teable_response["records"]
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("Invalid Teable response format"))?;
    let mut members = Vec::new();
    for record in records {
        let fields = &record["fields"];
        let member = Member {
            id: record["id"].as_str().unwrap_or("").to_string(),
            first_name: fields["Vorname"].as_str().unwrap_or("").to_string(),
            last_name: fields["Nachname"].as_str().unwrap_or("").to_string(),
            email: fields["Email"].as_str().unwrap_or("").to_string(),
            family_id: fields["Familie"]
                .as_str()
                .map(|s| s.to_string())
                .or_else(|| fields["Familie"].as_i64().map(|n| n.to_string())),
            uuid: fields["UUID"].as_str().unwrap_or("").to_string(),
            birth_date: fields["Geburtsdatum"].as_str().map(|s| s.to_string()),
        };
        members.push(member);
    }
    info!(
        "✅ Found {} family members for family: {}",
        members.len(),
        family_id
    );
    Ok(TeableResponse {
        count: Some(members.len()),
        results: members,
    })
}

pub async fn get_work_hours(client: &Client) -> Result<TeableResponse<WorkHour>> {
    get_work_hours_filtered(client, None).await
}

pub async fn get_work_hours_for_member(
    client: &Client,
    member_record_id: &str,
) -> Result<TeableResponse<WorkHour>> {
    get_work_hours_filtered(client, Some(member_record_id)).await
}

pub async fn get_work_hour_by_id(client: &Client, work_hour_id: &str) -> Result<Option<WorkHour>> {
    let (api_url, token, _base_id, _, work_hours_table_id) =
        get_teable_config().map_err(|e| anyhow::anyhow!("Config error: {}", e))?;

    let url = format!(
        "{}/table/{}/record/{}",
        api_url, work_hours_table_id, work_hour_id
    );

    info!("🔍 Fetching work hour by ID: {}", work_hour_id);
    let response = make_teable_request(client, &url, &token, "work_hour_by_id").await?;
    let response_text = handle_teable_response(response, "work_hour_by_id").await?;

    // Parse Teable response (single record, not array)
    let record: Value = serde_json::from_str(&response_text)?;
    let fields = &record["fields"];

    if fields.is_null() {
        info!("No work hour found with id: {}", work_hour_id);
        return Ok(None);
    }

    let work_hour = WorkHour {
        id: record["id"].as_str().unwrap_or("").to_string(),
        order: "".to_string(),
        member_id: Some(fields["Mitglied_id"].clone()),
        member_uuid: None, // This field doesn't exist in Teable schema
        last_name: fields["Nachname"].as_str().map(|s| s.to_string()),
        first_name: fields["Vorname"].as_str().map(|s| s.to_string()),
        created_on: fields["Created on"].as_str().map(|s| s.to_string()),
        date: fields["Datum"].as_str().map(|s| {
            use chrono::DateTime;
            use chrono_tz::Europe::Berlin;
            DateTime::parse_from_rfc3339(s)
                .map(|dt| dt.with_timezone(&Berlin).date_naive().to_string())
                .unwrap_or_else(|_| s.get(0..10).unwrap_or("").to_string())
        }),
        description: fields["Tätigkeit"].as_str().map(|s| s.to_string()),
        duration_seconds: fields["Stunden"].as_f64().map(|h| h * 3600.0), // Convert hours to seconds
    };

    info!(
        "✅ Found work hour: {} for member {:?}",
        work_hour.id, work_hour.member_id
    );
    Ok(Some(work_hour))
}

async fn get_work_hours_filtered(
    client: &Client,
    member_record_id: Option<&str>,
) -> Result<TeableResponse<WorkHour>> {
    let (api_url, token, _base_id, _, work_hours_table_id) =
        get_teable_config().map_err(|e| anyhow::anyhow!("Config error: {}", e))?;

    let mut url = format!("{}/table/{}/record", api_url, work_hours_table_id);

    // Add filter if member_record_id is provided
    if let Some(member_id) = member_record_id {
        let filter = serde_json::json!({
            "conjunction": "and",
            "filterSet": [{
                "fieldId": "Mitglied_id", // The field that links to member records
                "operator": "is",
                "value": member_id
            }]
        });
        url = format!(
            "{}?filter={}",
            url,
            urlencoding::encode(&filter.to_string())
        );
        println!("🔍 Filtering work hours for member: {}", member_id);
    }

    let response = make_teable_request(client, &url, &token, "work_hours").await?;
    let response_text = handle_teable_response(response, "work_hours").await?;

    // Log a preview of the response for debugging
    println!(
        "🔍 Teable work hours raw response preview: {}",
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

        println!(
            "[teable.rs] Parsed work hour: record_id={:?}, member_id_field={:?}, date={:?}",
            record["id"], member_id_value, fields["Datum"]
        );

        let work_hour = WorkHour {
            id: record["id"].as_str().unwrap_or("").to_string(),
            order: "".to_string(),
            member_id: Some(member_id_value), // Store the linked record field
            member_uuid: None,                // This field doesn't exist in Teable schema
            last_name: fields["Nachname"].as_str().map(|s| s.to_string()),
            first_name: fields["Vorname"].as_str().map(|s| s.to_string()),
            created_on: fields["Created on"].as_str().map(|s| s.to_string()),
            date: fields["Datum"].as_str().map(|s| {
                use chrono::DateTime;
                use chrono_tz::Europe::Berlin;
                DateTime::parse_from_rfc3339(s)
                    .map(|dt| dt.with_timezone(&Berlin).date_naive().to_string())
                    .unwrap_or_else(|_| s.get(0..10).unwrap_or("").to_string())
            }),
            description: fields["Tätigkeit"].as_str().map(|s| s.to_string()),
            duration_seconds: fields["Stunden"].as_f64().map(|h| h * 3600.0), // Convert hours to seconds
        };
        work_hours.push(work_hour);
    }

    println!(
        "✅ Teable: Successfully fetched {} work hours",
        work_hours.len()
    );

    Ok(TeableResponse {
        count: Some(work_hours.len()),
        results: work_hours,
    })
}

#[allow(dead_code)]
pub async fn create_work_hour(
    client: &Client,
    date: &str,
    description: &str,
    duration_seconds: f64,
    member_id: String, // This is the Teable member record ID
) -> Result<WorkHour> {
    let (api_url, token, _base_id, _, work_hours_table_id) =
        get_teable_config().map_err(|e| anyhow::anyhow!("Config error: {}", e))?;

    let url = format!("{}/table/{}/record", api_url, work_hours_table_id);

    // Get the member's information for the payload using get_member_by_id
    let member = get_member_by_id(client, &member_id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Member with ID {} not found", member_id))?;

    println!("🔍 Teable: Creating work hour with proper member linkage");
    println!("  Datum: {}", date);
    println!("  Tätigkeit: {}", description);
    println!(
        "  Stunden: {} hours (converted from seconds)",
        duration_seconds / 3600.0
    );
    println!("  Mitglied_id: {} (linked record)", member_id);
    println!("  Mitglied_UUID: {}", member.uuid);
    println!("  Nachname: {}", member.last_name);
    println!("  Vorname: {}", member.first_name);

    // Create the payload for Teable with proper member linkage
    let payload = serde_json::json!({
        "records": [{
            "fields": {
                "Mitglied_id": {"id": member_id}, // CRITICAL: Link to member record (object format)
                "Nachname": member.last_name,
                "Vorname": member.first_name,
                "Stunden": duration_seconds / 3600.0, // Convert seconds back to hours for Teable
                "Datum": date,
                "Tätigkeit": description
            }
        }]
    });

    println!(
        "🔍 Teable: Sending payload: {}",
        serde_json::to_string_pretty(&payload)?
    );

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&payload)
        .send()
        .await?;

    let response_text = handle_teable_response(response, "create_work_hour").await?;
    println!(
        "✅ Teable: Work hour created successfully: {}",
        response_text
    );

    // Parse the response to return the created work hour
    let teable_response: Value = serde_json::from_str(&response_text)?;
    let record = &teable_response["records"][0];
    let fields = &record["fields"];

    Ok(WorkHour {
        id: record["id"].as_str().unwrap_or("").to_string(),
        order: "".to_string(),
        member_id: Some(fields["Mitglied_id"].clone()),
        member_uuid: None, // This field doesn't exist in Teable, will be populated from member_id
        last_name: fields["Nachname"].as_str().map(|s| s.to_string()),
        first_name: fields["Vorname"].as_str().map(|s| s.to_string()),
        created_on: None,
        date: fields["Datum"].as_str().map(|s| {
            use chrono::DateTime;
            use chrono_tz::Europe::Berlin;
            DateTime::parse_from_rfc3339(s)
                .map(|dt| dt.with_timezone(&Berlin).date_naive().to_string())
                .unwrap_or_else(|_| s.get(0..10).unwrap_or("").to_string())
        }),
        description: fields["Tätigkeit"].as_str().map(|s| s.to_string()),
        duration_seconds: fields["Stunden"].as_f64().map(|h| h * 3600.0), // Convert back to seconds
    })
}

#[allow(dead_code)]
pub async fn update_work_hour(
    client: &Client,
    work_hour_id: &str,
    date: &str,
    description: &str,
    duration_seconds: f64,
    member_id: String, // This is the Teable member record ID
) -> Result<WorkHour> {
    let (api_url, token, _base_id, _, work_hours_table_id) =
        get_teable_config().map_err(|e| anyhow::anyhow!("Config error: {}", e))?;

    // Use the correct Teable API format: PATCH /api/table/{tableId}/record/{recordId}
    let url = format!(
        "{}/table/{}/record/{}",
        api_url, work_hours_table_id, work_hour_id
    );

    // Get the member's information for complete payload using get_member_by_id
    let member = get_member_by_id(client, &member_id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Member with ID {} not found", member_id))?;

    println!(
        "🔍 Teable: Updating work hour {} with proper member linkage",
        work_hour_id
    );
    println!("  Datum: {}", date);
    println!("  Tätigkeit: {}", description);
    println!(
        "  Stunden: {} hours (converted from seconds)",
        duration_seconds / 3600.0
    );
    println!("  Mitglied_id: {} (linked record)", member_id);

    // Create the payload for Teable update - use the format from frontend service
    let payload = serde_json::json!({
        "record": {
            "fields": {
                "Mitglied_id": {"id": member_id}, // CRITICAL: Maintain member record link (object format)
                "Nachname": member.last_name,
                "Vorname": member.first_name,
                "Stunden": duration_seconds / 3600.0, // Convert seconds back to hours for Teable
                "Datum": date,
                "Tätigkeit": description
            }
        }
    });

    println!(
        "🔍 Teable: Sending update payload: {}",
        serde_json::to_string_pretty(&payload)?
    );

    // Use PATCH method with record ID in URL path (correct Teable API format)
    let response = client
        .patch(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&payload)
        .send()
        .await?;

    let response_text = handle_teable_response(response, "update_work_hour").await?;
    println!(
        "✅ Teable: Work hour updated successfully: {}",
        response_text
    );

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
        order: "".to_string(),
        member_id: Some(fields["Mitglied_id"].clone()),
        member_uuid: None, // This field doesn't exist in Teable, will be populated from member_id
        last_name: fields["Nachname"].as_str().map(|s| s.to_string()),
        first_name: fields["Vorname"].as_str().map(|s| s.to_string()),
        created_on: None,
        date: fields["Datum"].as_str().map(|s| {
            use chrono::DateTime;
            use chrono_tz::Europe::Berlin;
            DateTime::parse_from_rfc3339(s)
                .map(|dt| dt.with_timezone(&Berlin).date_naive().to_string())
                .unwrap_or_else(|_| s.get(0..10).unwrap_or("").to_string())
        }),
        description: fields["Tätigkeit"].as_str().map(|s| s.to_string()),
        duration_seconds: fields["Stunden"].as_f64().map(|h| h * 3600.0), // Convert back to seconds
    })
}

pub async fn delete_work_hour(client: &Client, work_hour_id: &str) -> Result<()> {
    let (api_url, token, _base_id, _, work_hours_table_id) =
        get_teable_config().map_err(|e| anyhow::anyhow!("Config error: {}", e))?;

    let url = format!(
        "{}/table/{}/record/{}",
        api_url, work_hours_table_id, work_hour_id
    );

    let response = client
        .delete(&url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await?;

    handle_teable_response(response, "delete_work_hour").await?;
    println!("✅ Teable: Work hour {} deleted successfully", work_hour_id);

    Ok(())
}
