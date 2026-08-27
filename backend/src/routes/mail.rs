//! Bulk mail routes: test send, bulk dispatch, job status, recipient counts.

use axum::{
    extract::{Multipart, Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::get,
    Json,
};
use tracing::{error, info, warn};

use crate::auth;
use crate::email::{self, auto_link_html, escape_html};
use crate::models::{MailJob, MailJobStatus, Member, RecipientFilter};
use crate::state::AppState;
use crate::teable;
use crate::utils::extract_auth_claims_from_headers;

pub fn member_count_routes() -> axum::Router<AppState> {
    axum::Router::new().route("/mail/recipient-counts", get(get_member_counts))
}

const MAX_ATTACHMENT_SIZE: usize = 25 * 1024 * 1024;
const BULK_MAIL_CONCURRENCY: usize = 5;
const BULK_MAIL_BATCH_SIZE: usize = 8;
const BULK_MAIL_BATCH_DELAY_SECS: u64 = 5;
const BULK_MAIL_RETRIES: usize = 3;
const BULK_MAIL_RETRY_DELAY_SECS: u64 = 3;

struct MailForm {
    subject: String,
    message: String,
    include_greeting: bool,
    attachments: Vec<email::EmailAttachment>,
    recipient_filter: String,
}

async fn parse_mail_multipart(mut multipart: Multipart) -> Result<MailForm, StatusCode> {
    let mut subject = String::new();
    let mut message = String::new();
    let mut recipient_filter = String::from("all");
    let mut include_greeting = true;
    let mut attachments: Vec<email::EmailAttachment> = Vec::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?
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
                recipient_filter = field.text().await.unwrap_or_default();
            }
            "include_greeting" => {
                let val = field.text().await.unwrap_or_default();
                include_greeting = val != "false" && val != "0";
            }
            _ => {
                let file_name = field.file_name().unwrap_or("attachment").to_string();
                let content_type = field
                    .content_type()
                    .unwrap_or("application/octet-stream")
                    .to_string();
                let data = field.bytes().await.map_err(|_| StatusCode::BAD_REQUEST)?;
                if data.len() > MAX_ATTACHMENT_SIZE {
                    return Err(StatusCode::BAD_REQUEST);
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

    Ok(MailForm {
        subject,
        message,
        include_greeting,
        attachments,
        recipient_filter,
    })
}

async fn require_orga_role(
    state: &AppState,
    claims: &auth::AuthClaims,
) -> Result<Member, StatusCode> {
    let has_orga_claim = claims
        .role
        .as_ref()
        .is_some_and(|r| r.trim().eq_ignore_ascii_case("orga"));

    let user = teable::get_member_by_id_with_projection(
        &state.teable_config,
        &state.http_client,
        &claims.sub,
        Some(&["Vorname", "Nachname", "Email", "Rolle"][..]),
    )
    .await
    .map_err(|e| {
        error!("Mail: failed to load current member: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    let has_orga_member_role = user.has_role("orga");

    if !has_orga_claim && !has_orga_member_role {
        warn!("Mail denied for user {} (missing orga role)", user.id);
        return Err(StatusCode::FORBIDDEN);
    }

    Ok(user)
}

/// Drop empty-email and duplicate-email recipients, matching how the bulk send
/// counts recipients. Keeps the composer's preview count in sync with the
/// actual job recipient count.
fn dedupe_recipients_by_email(recipients: Vec<Member>) -> Vec<Member> {
    let mut seen = std::collections::HashSet::new();
    recipients
        .into_iter()
        .filter(|r| {
            let normalized = r.email.trim().to_lowercase();
            !normalized.is_empty() && seen.insert(normalized)
        })
        .collect()
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
    multipart: Multipart,
) -> Result<impl IntoResponse, axum::http::StatusCode> {
    let claims = extract_auth_claims_from_headers(&state.jwt_secret, &headers)?;
    let user = require_orga_role(&state, &claims).await?;

    if user.email.trim().is_empty() {
        error!(
            "Send test mail denied for user {}: missing email in member record",
            user.id
        );
        return Err(StatusCode::BAD_REQUEST);
    }

    let form = parse_mail_multipart(multipart).await?;

    let subject = if form.subject.is_empty() {
        "TSV Tennis Test-Mail".to_string()
    } else {
        form.subject
    };
    let message = if form.message.is_empty() {
        "Dies ist eine Test-Mail aus dem neuen Rundmail-Modul.".to_string()
    } else {
        form.message
    };

    let safe_first_name = escape_html(&user.first_name);
    let safe_message = auto_link_html(&escape_html(&message).replace('\n', "<br/>"));
    let (signature_html, signature_text) = build_signature(&user.first_name);

    let html_content = if form.include_greeting {
        format!("<p>Hallo {safe_first_name},</p><p>{safe_message}</p>{signature_html}")
    } else {
        format!("<p>{safe_message}</p>{signature_html}")
    };
    let text_content = if form.include_greeting {
        format!(
            "Hallo {},\n\n{}\n\n{}",
            user.first_name, message, signature_text
        )
    } else {
        format!("{}\n\n{}", message, signature_text)
    };

    state
        .email_service
        .send_email_with_attachments(
            &user.email,
            &subject,
            &html_content,
            &text_content,
            &form.attachments,
        )
        .await
        .map_err(|e| {
            error!("Send test mail failed for {}: {}", user.email, e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    info!(
        "Send test mail with {} attachment(s) succeeded for orga user {}",
        form.attachments.len(),
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
    multipart: Multipart,
) -> Result<impl IntoResponse, axum::http::StatusCode> {
    let claims = extract_auth_claims_from_headers(&state.jwt_secret, &headers)?;
    let user = require_orga_role(&state, &claims).await?;

    let form = parse_mail_multipart(multipart).await?;

    if form.subject.is_empty() || form.message.is_empty() {
        return Ok(Json(serde_json::json!({
            "success": false,
            "message": "Betreff und Nachricht sind erforderlich"
        })));
    }

    let recipient_filter: RecipientFilter = match form.recipient_filter.as_str() {
        "orga" => RecipientFilter::Orga,
        "all" => RecipientFilter::All,
        _ => {
            return Ok(Json(serde_json::json!({
                "success": false,
                "message": format!("Unknown recipient_filter: '{}'. Valid values: 'all', 'orga'", form.recipient_filter)
            })));
        }
    };

    // Fetch recipients
    let recipients = match recipient_filter {
        RecipientFilter::Orga => {
            teable::get_all_active_members(&state.teable_config, &state.http_client, Some("orga"))
                .await
                .map_err(|e| {
                    error!("Send bulk mail: failed to fetch orga members: {}", e);
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR
                })?
        }
        RecipientFilter::All | RecipientFilter::Active => {
            teable::get_all_active_members(&state.teable_config, &state.http_client, None)
                .await
                .map_err(|e| {
                    error!("Send bulk mail: failed to fetch all members: {}", e);
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR
                })?
        }
    };

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

    // Deduplicate recipients by email address
    let unique_recipients = dedupe_recipients_by_email(recipients);

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

    let total = unique_recipients.len();

    // Pre-build template parts (done once, not per recipient)
    let safe_message = auto_link_html(&escape_html(&form.message).replace('\n', "<br/>"));
    let (signature_html, signature_text) = build_signature(&user.first_name);

    // Prepare recipient data for the background task
    let recipient_data: Vec<(String, String)> = unique_recipients
        .into_iter()
        .map(|r| (r.email, r.first_name))
        .collect();

    // Create job and return immediately
    let job_id = uuid::Uuid::new_v4().to_string();
    let job = MailJob {
        id: job_id.clone(),
        status: MailJobStatus::Pending,
        total_recipients: total as i32,
        sent: 0,
        failed: 0,
        failed_recipients: Vec::new(),
        error: None,
        created_at: chrono::Utc::now(),
    };

    state.mail_jobs.write().await.insert(job_id.clone(), job);

    // Spawn background task
    let email_service = state.email_service.clone();
    let job_store = state.mail_jobs.clone();
    let jid = job_id.clone();
    let subject = form.subject;
    let message = form.message;
    let attachments = form.attachments;
    let include_greeting = form.include_greeting;

    tokio::spawn(async move {
        // Mark as running
        {
            let mut jobs = job_store.write().await;
            if let Some(job) = jobs.get_mut(&jid) {
                job.status = MailJobStatus::Running;
            }
        }

        // Run the actual send in a nested spawn so we can detect panics
        // via the JoinHandle (catch_unwind is not async-safe)
        let job_store_inner = job_store.clone();
        let jid_inner = jid.clone();
        let send_handle = tokio::spawn(async move {
            let options = email::BulkMailOptions {
                subject,
                message,
                safe_message,
                signature_html,
                signature_text,
                include_greeting,
                max_concurrency: BULK_MAIL_CONCURRENCY,
                batch_size: BULK_MAIL_BATCH_SIZE,
                batch_delay: std::time::Duration::from_secs(BULK_MAIL_BATCH_DELAY_SECS),
                retries: BULK_MAIL_RETRIES,
                retry_delay: std::time::Duration::from_secs(BULK_MAIL_RETRY_DELAY_SECS),
            };
            email_service
                .send_bulk_mail_concurrent(
                    &recipient_data,
                    &attachments,
                    options,
                    job_store_inner,
                    jid_inner,
                )
                .await
        });

        let result = send_handle.await;
        let mut jobs = job_store.write().await;
        if let Some(job) = jobs.get_mut(&jid) {
            match result {
                Ok((sent, failed, failed_recipients)) => {
                    if sent == 0 && failed > 0 {
                        job.status = MailJobStatus::Failed;
                        job.error = Some(format!("All {} emails failed to send", failed));
                    } else {
                        job.status = MailJobStatus::Completed;
                    }
                    job.sent = sent as i32;
                    job.failed = failed as i32;
                    job.failed_recipients = failed_recipients;
                    info!(
                        "Bulk mail job {} completed: sent={}, failed={}",
                        jid, sent, failed
                    );
                }
                Err(join_err) => {
                    job.status = MailJobStatus::Failed;
                    job.error = Some(format!("Background task panicked: {}", join_err));
                    error!("Bulk mail job {} panicked: {}", jid, join_err);
                }
            }
        }
    });

    info!(
        "Bulk mail job {} created for {} recipients by user {}",
        job_id, total, user.id
    );

    Ok(Json(serde_json::json!({
        "success": true,
        "job_id": job_id,
        "total_recipients": total,
        "message": format!("Mail-Versand gestartet für {} Empfänger", total),
    })))
}

pub async fn get_mail_job_status(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let jobs = state.mail_jobs.read().await;
    match jobs.get(&job_id) {
        Some(job) => {
            info!("Job status lookup: id={}, status={:?}", job_id, job.status);
            Ok(Json(serde_json::json!({
                "success": true,
                "job": job,
            })))
        }
        None => Err((
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({
                "success": false,
                "message": "Job nicht gefunden"
            })),
        )),
    }
}

pub async fn get_member_counts(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, axum::http::StatusCode> {
    // Serve cached counts within the TTL to avoid hammering the Teable API
    // every time the mail composer is opened.
    if let Some((all, orga)) = state.member_counts.get() {
        return Ok(Json(serde_json::json!({
            "success": true,
            "data": { "all": all, "orga": orga }
        })));
    }

    // Serialize refreshes so concurrent expired-cache misses perform a single
    // Teable fetch instead of N. Re-check the cache once the lock is held.
    let _refresh_guard = state.member_counts.lock_refresh().await;
    if let Some((all, orga)) = state.member_counts.get() {
        return Ok(Json(serde_json::json!({
            "success": true,
            "data": { "all": all, "orga": orga }
        })));
    }

    // Fetch all active members count using Teable filtering
    let all_members =
        teable::get_all_active_members(&state.teable_config, &state.http_client, None)
            .await
            .map_err(|e| {
                error!("Failed to fetch all member counts: {}", e);
                axum::http::StatusCode::INTERNAL_SERVER_ERROR
            })?;

    // Fetch orga members count using Teable role filtering
    let orga_members =
        teable::get_all_active_members(&state.teable_config, &state.http_client, Some("orga"))
            .await
            .map_err(|e| {
                error!("Failed to fetch orga member counts: {}", e);
                axum::http::StatusCode::INTERNAL_SERVER_ERROR
            })?;

    state
        .member_counts
        .set((all_members.len(), orga_members.len()));

    Ok(Json(serde_json::json!({
        "success": true,
        "data": {
            "all": dedupe_recipients_by_email(all_members).len(),
            "orga": dedupe_recipients_by_email(orga_members).len()
        }
    })))
}
