use axum::{
    extract::{Multipart, State},
    http::HeaderMap,
    response::IntoResponse,
    routing::get,
    Json,
};
use tracing::{debug, error, info, warn};

use crate::email;
use crate::models::RecipientFilter;
use crate::state::AppState;
use crate::teable;
use crate::utils::extract_auth_claims_from_headers;

pub fn member_count_routes() -> axum::Router<AppState> {
    axum::Router::new().route("/recipient-counts", get(get_member_counts))
}

const MAX_ATTACHMENT_SIZE: usize = 25 * 1024 * 1024;

fn escape_html(input: &str) -> String {
    input
        .replace('\x26', "\x26amp;")
        .replace('\x3C', "\x26lt;")
        .replace('\x3E', "\x26gt;")
        .replace('\x22', "\x26quot;")
        .replace('\'', "\x26#39;")
}

fn build_signature(sender_first_name: &str) -> (String, String) {
    let safe_name = escape_html(sender_first_name);
    let html = format!(
        r#"<p style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb;">mit sportlichen Grüßen,<br/>{safe_name} / die Abteilungsleitung</p><p style="margin-top: 12px;"><strong>Tennisabteilung des TSV Bad Überkingen</strong><br/><a href="mailto:tennisabteilung@tsv-bad-ueberkingen.de">tennisabteilung@tsv-bad-ueberkingen.de</a></p>"#
    );
    let text = format!(
        "mit sportlichen Grüßen,\n{sender_first_name} / die Abteilungsleitung\n\nTennisabteilung des TSV Bad Überkingen\nE-Mail: tennisabteilung@tsv-bad-ueberkingen.de"
    );
    (html, text)
}

pub async fn send_test_mail(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<impl IntoResponse, axum::http::StatusCode> {
    let claims = extract_auth_claims_from_headers(&headers)?;

    let user = teable::get_member_by_id_with_projection(
        &state.http_client,
        &claims.sub,
        Some(&["Vorname", "Nachname", "Email", "Rolle"][..]),
    )
    .await
    .map_err(|e| {
        error!("Send test mail: failed to load current member: {}", e);
        axum::http::StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(axum::http::StatusCode::NOT_FOUND)?;

    let has_orga_claim = claims
        .role
        .as_ref()
        .is_some_and(|r| r.trim().eq_ignore_ascii_case("orga"));
    let has_orga_member_role = user.has_role("orga");

    if !has_orga_claim && !has_orga_member_role {
        warn!(
            "Send test mail denied for user {} (missing orga role)",
            user.id
        );
        return Err(axum::http::StatusCode::FORBIDDEN);
    }

    if user.email.trim().is_empty() {
        error!(
            "Send test mail denied for user {}: missing email in member record",
            user.id
        );
        return Err(axum::http::StatusCode::BAD_REQUEST);
    }

    // Parse multipart form data
    let mut subject = String::new();
    let mut message = String::new();
    let mut attachments: Vec<email::EmailAttachment> = Vec::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| axum::http::StatusCode::BAD_REQUEST)?
    {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "subject" => {
                subject = field.text().await.unwrap_or_default();
            }
            "message" => {
                message = field.text().await.unwrap_or_default();
            }
            _ => {
                // Treat any other field as a file attachment
                let file_name = field.file_name().unwrap_or("attachment").to_string();
                let content_type = field
                    .content_type()
                    .unwrap_or("application/octet-stream")
                    .to_string();
                let data = field
                    .bytes()
                    .await
                    .map_err(|_| axum::http::StatusCode::BAD_REQUEST)?;
                if data.len() > MAX_ATTACHMENT_SIZE {
                    return Ok(Json(serde_json::json!({
                        "success": false,
                        "message": format!("Datei '{}' überschreitet die maximale Größe von 25MB", file_name)
                    })));
                }
                attachments.push(email::EmailAttachment {
                    filename: file_name,
                    content_type,
                    data: data.to_vec(),
                    content_id: None,
                });
            }
        }
    }

    if subject.is_empty() {
        subject = "TSV Tennis Test-Mail".to_string();
    }
    if message.is_empty() {
        message = "Dies ist eine Test-Mail aus dem neuen Rundmail-Modul.".to_string();
    }

    let safe_first_name = escape_html(&user.first_name);
    let safe_message = escape_html(&message).replace('\n', "<br/>");
    let (signature_html, signature_text) = build_signature(&user.first_name);

    let html_content =
        format!("<p>Hallo {safe_first_name},</p><p>{safe_message}</p>{signature_html}");
    let text_content = format!(
        "Hallo {},\n\n{}\n\n{}",
        user.first_name, message, signature_text
    );

    state
        .email_service
        .send_email_with_attachments(
            &user.email,
            &subject,
            &html_content,
            &text_content,
            &attachments,
        )
        .await
        .map_err(|e| {
            error!("Send test mail failed for {}: {}", user.email, e);
            axum::http::StatusCode::INTERNAL_SERVER_ERROR
        })?;

    info!(
        "Send test mail with {} attachment(s) succeeded for orga user {}",
        attachments.len(),
        user.id
    );

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Test mail sent successfully"
    })))
}

pub async fn send_bulk_mail(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<impl IntoResponse, axum::http::StatusCode> {
    let claims = extract_auth_claims_from_headers(&headers)?;

    // Check orga role from token claim
    let has_orga_claim = claims
        .role
        .as_ref()
        .is_some_and(|r| r.trim().eq_ignore_ascii_case("orga"));

    // Also fetch member record to double-check role
    let user = teable::get_member_by_id_with_projection(
        &state.http_client,
        &claims.sub,
        Some(&["Vorname", "Nachname", "Email", "Rolle"][..]),
    )
    .await
    .map_err(|e| {
        error!("Send bulk mail: failed to load current member: {}", e);
        axum::http::StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(axum::http::StatusCode::NOT_FOUND)?;

    let has_orga_member_role = user.has_role("orga");

    if !has_orga_claim && !has_orga_member_role {
        warn!(
            "Send bulk mail denied for user {} (missing orga role)",
            user.id
        );
        return Err(axum::http::StatusCode::FORBIDDEN);
    }

    // Parse multipart form data
    let mut subject = String::new();
    let mut message = String::new();
    let mut recipient_filter_str = String::from("all");
    let mut attachments: Vec<email::EmailAttachment> = Vec::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| axum::http::StatusCode::BAD_REQUEST)?
    {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "subject" => {
                subject = field.text().await.unwrap_or_default();
            }
            "message" => {
                message = field.text().await.unwrap_or_default();
            }
            "recipient_filter" => {
                recipient_filter_str = field.text().await.unwrap_or_default();
            }
            _ => {
                let file_name = field.file_name().unwrap_or("attachment").to_string();
                let content_type = field
                    .content_type()
                    .unwrap_or("application/octet-stream")
                    .to_string();
                let data = field
                    .bytes()
                    .await
                    .map_err(|_| axum::http::StatusCode::BAD_REQUEST)?;
                if data.len() > MAX_ATTACHMENT_SIZE {
                    return Ok(Json(serde_json::json!({
                        "success": false,
                        "message": format!("Datei '{}' überschreitet die maximale Größe von 25MB", file_name)
                    })));
                }
                attachments.push(email::EmailAttachment {
                    filename: file_name,
                    content_type,
                    data: data.to_vec(),
                    content_id: None,
                });
            }
        }
    }

    if subject.is_empty() || message.is_empty() {
        return Ok(Json(serde_json::json!({
            "success": false,
            "message": "Betreff und Nachricht sind erforderlich"
        })));
    }

    let recipient_filter: RecipientFilter = match recipient_filter_str.as_str() {
        "orga" => RecipientFilter::Orga,
        "all" => RecipientFilter::All,
        _ => {
            return Ok(Json(serde_json::json!({
                "success": false,
                "message": format!("Unknown recipient_filter: '{}'. Valid values: 'all', 'orga'", recipient_filter_str)
            })));
        }
    };

    let (signature_html, signature_text) = build_signature(&user.first_name);

    let recipients = match recipient_filter {
        RecipientFilter::Orga => teable::get_all_active_members(&state.http_client, Some("orga"))
            .await
            .map_err(|e| {
                error!("Send bulk mail: failed to fetch orga members: {}", e);
                axum::http::StatusCode::INTERNAL_SERVER_ERROR
            })?,
        RecipientFilter::All | RecipientFilter::Active => {
            teable::get_all_active_members(&state.http_client, None)
                .await
                .map_err(|e| {
                    error!("Send bulk mail: failed to fetch all members: {}", e);
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR
                })?
        }
    };

    let recipients_len = recipients.len();

    if recipients.is_empty() {
        warn!(
            "Send bulk mail: no recipients found for filter '{:?}'",
            recipient_filter
        );
        return Ok(Json(serde_json::json!({
            "success": false,
            "message": "No valid recipients found"
        })));
    }

    let safe_message = escape_html(&message).replace('\n', "<br/>");

    // Deduplicate recipients by email address to avoid sending the same mail multiple times
    let mut seen_emails = std::collections::HashSet::new();
    let unique_recipients: Vec<_> = recipients
        .into_iter()
        .filter(|r| {
            let normalized = r.email.trim().to_lowercase();
            if normalized.is_empty() {
                return false;
            }
            seen_emails.insert(normalized)
        })
        .collect();

    if unique_recipients.is_empty() {
        warn!(
            "Send bulk mail: no valid recipients after deduplication for filter '{:?}'",
            recipient_filter
        );
        return Ok(Json(serde_json::json!({
            "success": false,
            "message": "No valid recipients found"
        })));
    }

    info!(
        "Send bulk mail: deduplicated {} recipients to {} unique recipients for filter '{:?}'",
        recipients_len,
        unique_recipients.len(),
        recipient_filter
    );

    let mut sent_count = 0;
    let mut failed_count = 0;
    let mut failed_recipients = Vec::new();

    for recipient in unique_recipients {
        let html_content = format!(
            "<p>Hallo {safe_first_name},</p>\
             <p>{safe_message}</p>\n            {signature_html}",
            safe_first_name = escape_html(&recipient.first_name),
            safe_message = safe_message,
        );
        let text_content = format!(
            "Hallo {first_name},\n\n{message}\n\n{signature_text}",
            first_name = recipient.first_name,
            message = message,
        );

        match state
            .email_service
            .send_email_with_attachments(
                &recipient.email,
                &subject,
                &html_content,
                &text_content,
                &attachments,
            )
            .await
        {
            Ok(_) => {
                debug!("Bulk mail sent to {}", recipient.email);
                sent_count += 1;
            }
            Err(e) => {
                error!("Bulk mail failed for {}: {}", recipient.email, e);
                failed_count += 1;
                failed_recipients.push(recipient.email);
            }
        }
    }

    info!(
        "Bulk mail completed by user {}: sent={}, failed={}",
        user.id, sent_count, failed_count
    );

    Ok(Json(serde_json::json!({
        "success": failed_count == 0,
        "message": if failed_count == 0 {
            format!("Bulk mail sent successfully to {sent_count} recipients")
        } else {
            format!("Bulk mail sent to {sent_count} recipients, {failed_count} failed")
        },
        "sent": sent_count,
        "failed": failed_count,
        "failed_recipients": failed_recipients,
    })))
}

pub async fn get_member_counts(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, axum::http::StatusCode> {
    // Fetch all active members count using Teable filtering
    let all_members = teable::get_all_active_members(&state.http_client, None)
        .await
        .map_err(|e| {
            error!("Failed to fetch all member counts: {}", e);
            axum::http::StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // Fetch orga members count using Teable role filtering
    let orga_members = teable::get_all_active_members(&state.http_client, Some("orga"))
        .await
        .map_err(|e| {
            error!("Failed to fetch orga member counts: {}", e);
            axum::http::StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(serde_json::json!({
        "success": true,
        "data": {
            "all": all_members.len(),
            "orga": orga_members.len()
        }
    })))
}
