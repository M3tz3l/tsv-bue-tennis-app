//! Email service using SMTP for transactional and bulk mail delivery.

use crate::config::{Config, EmailConfig};
use crate::models::MailJobStore;
use lettre::{
    message::{header::ContentType, Attachment, Mailbox, Message, MultiPart, SinglePart},
    transport::smtp::{
        authentication::Credentials,
        client::{Tls, TlsParameters},
    },
    AsyncSmtpTransport, AsyncTransport, Tokio1Executor,
};
use tracing::{error, info, warn};

/// Escape HTML special characters to prevent XSS in email content
pub fn escape_html(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

/// Wrap URLs in an already HTML-escaped string into clickable `<a>` tags.
/// Input must already be escaped via [`escape_html`]. URLs are detected by the
/// `http://`, `https://` or `www.` prefix and terminated at whitespace, HTML
/// markup (`<`, `>`) or trailing punctuation.
pub fn auto_link_html(input: &str) -> String {
    let mut out = String::with_capacity(input.len() + 32);
    let mut pos = 0;
    while pos < input.len() {
        let remaining = &input[pos..];
        let Some(rel) = find_earliest_url(remaining) else {
            out.push_str(remaining);
            break;
        };

        out.push_str(&remaining[..rel]);
        let url_start = pos + rel;
        let url_end = find_url_end(input, url_start);
        let url = &input[url_start..url_end];
        let href = if url.starts_with("www.") {
            format!("http://{url}")
        } else {
            url.to_string()
        };
        out.push_str(&format!(r#"<a href="{href}">{url}</a>"#));
        pos = url_end;
    }
    out
}

/// Return the byte offset at which the URL starting at `url_start` ends,
/// operating on UTF-8 character boundaries. Whitepsace, HTML markup or a
/// trailing punctuation run terminates the URL.
fn find_url_end(input: &str, url_start: usize) -> usize {
    let bytes = input.as_bytes();
    let mut j = url_start;
    while j < bytes.len() {
        let c = unsafe_char_at(input, j);
        // The input is already HTML-escaped, so `&lt;`, `&gt;`, `&quot;` and
        // `&#39;` represent `&`-terminated markup/attribute boundaries and must
        // not be swallowed into the URL. `&amp;` is left alone because a real
        // `&` inside a URL is serialized as `&amp;`.
        let rest = &bytes[j..];
        if rest.starts_with(b"&lt;")
            || rest.starts_with(b"&gt;")
            || rest.starts_with(b"&quot;")
            || rest.starts_with(b"&#39;")
        {
            return j;
        }
        if c.is_whitespace() || c == '<' || c == '>' {
            return j;
        }
        if is_trail_punct(c) {
            let run_end = scan_punct_run(input, j);
            if run_end >= bytes.len() {
                // Reaches the end: trailing run stays literal text.
                return j;
            }
            let next = unsafe_char_at(input, run_end);
            if next.is_whitespace() || next == '<' || next == '>' {
                return j;
            }
            // Non-trailing run belongs to the URL; resume past it in one step.
            j = run_end;
            continue;
        }
        j += utf8_char_len(bytes[j]);
    }
    input.len()
}

/// Minimum positive length of the UTF-8 character starting at `bytes[idx]`.
/// Only called on valid character boundaries.
fn utf8_char_len(lead: u8) -> usize {
    if lead < 0x80 {
        1
    } else if lead >> 5 == 0b110 {
        2
    } else if lead >> 4 == 0b1110 {
        3
    } else if lead >> 3 == 0b11110 {
        4
    } else {
        1
    }
}

/// First character of `input` starting at `idx`. Only called on valid boundaries.
fn unsafe_char_at(input: &str, idx: usize) -> char {
    input[idx..].chars().next().unwrap()
}

/// Byte offset just past the run of trailing-punctuation characters from `start`.
fn scan_punct_run(input: &str, start: usize) -> usize {
    let bytes = input.as_bytes();
    let mut k = start;
    while k < bytes.len() {
        let c = unsafe_char_at(input, k);
        if !is_trail_punct(c) {
            break;
        }
        k += utf8_char_len(bytes[k]);
    }
    k
}

fn is_trail_punct(c: char) -> bool {
    matches!(c, '.' | ',' | ';' | ':' | '!' | '?' | ')')
}

/// Return the byte offset (relative to `input`) of the earliest valid URL
/// candidate, searching across all supported prefixes. A candidate is rejected
/// when preceded by an ASCII alphanumeric character (i.e. it is embedded inside
/// a larger token such as `abchttps://x`). When a rejected candidate is skipped,
/// scanning continues past it so a later genuine URL is still found.
fn find_earliest_url(input: &str) -> Option<usize> {
    const PREFIXES: [&str; 3] = ["http://", "https://", "www."];
    let bytes = input.as_bytes();
    let mut best: Option<usize> = None;
    for p in PREFIXES {
        let mut search_from = 0;
        while let Some(rel) = input[search_from..].find(p) {
            let pos = search_from + rel;
            let valid = pos == 0 || !(bytes[pos - 1] as char).is_ascii_alphanumeric();
            if valid {
                if best.is_none_or(|b| pos < b) {
                    best = Some(pos);
                }
                break;
            }
            search_from = pos + p.len();
        }
    }
    best
}

#[cfg(test)]
mod tests {
    use super::auto_link_html;

    #[test]
    fn links_plain_http_url() {
        assert_eq!(
            auto_link_html("Besuch https://example.com jetzt"),
            "Besuch <a href=\"https://example.com\">https://example.com</a> jetzt"
        );
    }

    #[test]
    fn links_www_with_http_prefix() {
        assert_eq!(
            auto_link_html("Siehe www.example.com/foo"),
            "Siehe <a href=\"http://www.example.com/foo\">www.example.com/foo</a>"
        );
    }

    #[test]
    fn does_not_link_alphanumeric_token() {
        assert_eq!(auto_link_html("abcwww.example.com"), "abcwww.example.com");
    }

    #[test]
    fn does_not_link_embedded_https_token() {
        assert_eq!(
            auto_link_html("abchttps://example.com"),
            "abchttps://example.com"
        );
    }

    #[test]
    fn does_not_link_embedded_http_token() {
        assert_eq!(
            auto_link_html("abcxhttp://example.com"),
            "abcxhttp://example.com"
        );
    }

    #[test]
    fn links_genuine_url_after_rejected_embedded_token() {
        assert_eq!(
            auto_link_html("abchttps://example.com und http://pdf.com/a"),
            "abchttps://example.com und <a href=\"http://pdf.com/a\">http://pdf.com/a</a>"
        );
    }

    #[test]
    fn links_earliest_of_mixed_url_types() {
        assert_eq!(
            auto_link_html("Siehe www.example.com/first und dann https://two.example"),
            concat!(
                "Siehe <a href=\"http://www.example.com/first\">www.example.com/first</a> ",
                "und dann <a href=\"https://two.example\">https://two.example</a>"
            )
        );
    }

    #[test]
    fn strips_trailing_sentence_punctuation() {
        assert_eq!(
            auto_link_html("Klick https://example.com."),
            "Klick <a href=\"https://example.com\">https://example.com</a>."
        );
    }

    #[test]
    fn strips_trailing_punctuation_run() {
        assert_eq!(
            auto_link_html("Siehe (https://example.com)."),
            "Siehe (<a href=\"https://example.com\">https://example.com</a>)."
        );
    }

    #[test]
    fn handles_non_ascii_whitespace_without_panicking() {
        assert_eq!(
            auto_link_html("https://example.com\u{00A0}weiter"),
            "<a href=\"https://example.com\">https://example.com</a>\u{00A0}weiter"
        );
    }

    #[test]
    fn keeps_non_trailing_punctuation_run_inside_url() {
        assert_eq!(
            auto_link_html("https://example.com/path..weiter"),
            "<a href=\"https://example.com/path..weiter\">https://example.com/path..weiter</a>"
        );
    }

    #[test]
    fn stops_before_escaped_quote_and_keeps_escaped_amp() {
        assert_eq!(
            auto_link_html("https://example.com?q=1&amp;x=2&quot;\"weiter\""),
            "<a href=\"https://example.com?q=1&amp;x=2\">https://example.com?q=1&amp;x=2</a>&quot;\"weiter\""
        );
    }

    #[test]
    fn stops_at_br_tag() {
        assert_eq!(
            auto_link_html("https://example.com<br/>weiter"),
            "<a href=\"https://example.com\">https://example.com</a><br/>weiter"
        );
    }

    #[test]
    fn leaves_escaped_html_unchanged_without_url() {
        assert_eq!(auto_link_html("a &lt; b &gt; c"), "a &lt; b &gt; c");
    }

    #[test]
    fn does_not_touch_plain_text() {
        assert_eq!(auto_link_html("Hallo Mitglieder"), "Hallo Mitglieder");
    }
}

/// Represents a file attachment for an email
#[derive(Clone)]
pub struct EmailAttachment {
    pub filename: String,
    pub content_type: String,
    pub data: Vec<u8>,
    pub content_id: Option<String>, // For inline images
}

/// Options that tune how a bulk mail job is sent.
pub struct BulkMailOptions {
    pub subject: String,
    pub message: String,
    pub safe_message: String,
    pub signature_html: String,
    pub signature_text: String,
    pub include_greeting: bool,
    pub max_concurrency: usize,
    pub batch_size: usize,
    pub batch_delay: std::time::Duration,
    pub retries: usize,
    pub retry_delay: std::time::Duration,
}

pub struct EmailService {
    smtp_host: String,
    smtp_port: u16,
    smtp_user: String,
    smtp_password: String,
    use_implicit_tls: bool,
    from_email: String,
    disable_send: bool,
    accept_invalid_certs: bool,
}

impl EmailService {
    pub fn new() -> Result<Self, anyhow::Error> {
        let email_config = EmailConfig::from_env()?;

        let disable_send = std::env::var("EMAIL_DISABLE_SEND")
            .ok()
            .map(|v| v.eq_ignore_ascii_case("true") || v == "1")
            .unwrap_or(false);

        Ok(EmailService {
            smtp_host: email_config.host,
            smtp_port: email_config.port,
            smtp_user: email_config.user,
            smtp_password: email_config.password,
            use_implicit_tls: email_config.use_implicit_tls,
            from_email: email_config.from_email,
            disable_send,
            accept_invalid_certs: email_config.accept_invalid_certs,
        })
    }

    /// Build TLS parameters, optionally accepting invalid certificates (for testing with self-signed certs).
    fn build_tls_params(&self) -> Result<TlsParameters, anyhow::Error> {
        let mut builder = TlsParameters::builder(self.smtp_host.clone());
        if self.accept_invalid_certs {
            builder = builder.dangerous_accept_invalid_certs(true);
        }
        Ok(builder.build()?)
    }

    /// Creates an async SMTP transport for bulk operations (non-blocking)
    fn create_async_transport(&self) -> Result<AsyncSmtpTransport<Tokio1Executor>, anyhow::Error> {
        let builder = if self.use_implicit_tls {
            let tls = self.build_tls_params()?;
            AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&self.smtp_host)
                .port(self.smtp_port)
                .tls(Tls::Wrapper(tls))
        } else {
            let tls = self.build_tls_params()?;
            AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&self.smtp_host)
                .port(self.smtp_port)
                .tls(Tls::Required(tls))
        };
        let builder = if !self.smtp_user.is_empty() {
            builder.credentials(Credentials::new(
                self.smtp_user.clone(),
                self.smtp_password.clone(),
            ))
        } else {
            builder
        };
        Ok(builder.build())
    }

    /// Send bulk mail in batches with bounded concurrency per batch.
    /// Each batch uses a fresh SMTP transport to avoid server-side connection limits.
    /// Returns (sent_count, failed_count, failed_recipients).
    pub async fn send_bulk_mail_concurrent(
        &self,
        recipients: &[(String, String)], // (email, first_name)
        attachments: &[EmailAttachment],
        options: BulkMailOptions,
        job_store: MailJobStore,
        job_id: String,
    ) -> (usize, usize, Vec<String>) {
        let BulkMailOptions {
            subject,
            message,
            safe_message,
            signature_html,
            signature_text,
            include_greeting,
            max_concurrency,
            batch_size,
            batch_delay,
            retries,
            retry_delay,
        } = options;

        // A zero batch_size makes `chunks(0)` panic and a zero max_concurrency
        // leaves semaphore acquisition waiting indefinitely, so reject invalid
        // options before entering the send loop.
        if batch_size == 0 || max_concurrency == 0 {
            error!(
                "Invalid bulk mail options: batch_size={}, max_concurrency={}",
                batch_size, max_concurrency
            );
            return (
                0,
                recipients.len(),
                recipients.iter().map(|(e, _)| e.clone()).collect(),
            );
        }

        if self.disable_send {
            info!(
                "EMAIL_DISABLE_SEND=true - skipping bulk send to {} recipients",
                recipients.len()
            );
            return (recipients.len(), 0, Vec::new());
        }

        let from_address = format!("TSV BÜ Tennis App <{}>", self.from_email);
        let attachments: Vec<_> = attachments
            .iter()
            .map(|a| EmailAttachment {
                filename: a.filename.clone(),
                content_type: a.content_type.clone(),
                data: a.data.clone(),
                content_id: a.content_id.clone(),
            })
            .collect();

        let mut total_sent = 0;
        let mut total_failed = 0;
        let mut all_failed_recipients = Vec::new();

        // Parse from address once — it's the same for all recipients
        let from_mailbox: Mailbox = match from_address.parse() {
            Ok(m) => m,
            Err(e) => {
                error!("Invalid from address '{}': {}", from_address, e);
                return (
                    0,
                    recipients.len(),
                    recipients.iter().map(|(e, _)| e.clone()).collect(),
                );
            }
        };

        for (batch_idx, chunk) in recipients.chunks(batch_size).enumerate() {
            if batch_idx > 0 {
                info!(
                    "Batch {} complete (sent={}, failed={}), waiting {:?} before next batch",
                    batch_idx, total_sent, total_failed, batch_delay
                );
                tokio::time::sleep(batch_delay).await;
            }

            info!(
                "Starting batch {}/{} ({} recipients)",
                batch_idx + 1,
                recipients.len().div_ceil(batch_size),
                chunk.len()
            );

            // Fresh transport per batch
            let transport = match self.create_async_transport() {
                Ok(t) => std::sync::Arc::new(t),
                Err(e) => {
                    error!(
                        "Failed to create SMTP transport for batch {}: {}",
                        batch_idx + 1,
                        e
                    );
                    total_failed += chunk.len();
                    for (email, _) in chunk {
                        all_failed_recipients.push(email.clone());
                    }
                    // Write progress before skipping this batch
                    {
                        let mut jobs = job_store.write().await;
                        if let Some(job) = jobs.get_mut(&job_id) {
                            job.sent = total_sent as i32;
                            job.failed = total_failed as i32;
                        }
                    }
                    continue;
                }
            };

            let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(max_concurrency));
            let mut handles = Vec::with_capacity(chunk.len());

            for (email, first_name) in chunk {
                let permit = semaphore.clone().acquire_owned().await.unwrap();
                let transport = transport.clone();
                let email_addr = email.clone();
                let first = first_name.clone();
                let from_mailbox = from_mailbox.clone();
                let subject = subject.clone();
                let message = message.clone();
                let safe_message = safe_message.clone();
                let signature_html = signature_html.clone();
                let signature_text = signature_text.clone();
                let attachments = attachments.clone();

                handles.push(tokio::spawn(async move {
                    let html_content = if include_greeting {
                        format!(
                            "<p>Hallo {safe_first_name},</p><p>{safe_message}</p>{signature_html}",
                            safe_first_name = escape_html(&first),
                        )
                    } else {
                        format!("<p>{safe_message}</p>{signature_html}")
                    };
                    let text_content = if include_greeting {
                        format!("Hallo {first},\n\n{message}\n\n{signature_text}",)
                    } else {
                        format!("{message}\n\n{signature_text}",)
                    };

                    let to_mailbox: Mailbox = match email_addr.parse() {
                        Ok(m) => m,
                        Err(e) => {
                            drop(permit);
                            return Err((email_addr, format!("Invalid to address: {e}")));
                        }
                    };

                    let email_msg = match build_message(
                        from_mailbox,
                        to_mailbox,
                        &subject,
                        &html_content,
                        &text_content,
                        &attachments,
                    ) {
                        Ok(m) => m,
                        Err(e) => {
                            drop(permit);
                            return Err((email_addr, format!("Build error: {e}")));
                        }
                    };

                    let result = send_with_retry(&transport, email_msg, retries, retry_delay).await;
                    drop(permit);
                    match result {
                        Ok(_) => Ok(email_addr),
                        Err(e) => Err((email_addr, e)),
                    }
                }));
            }

            for handle in handles {
                match handle.await {
                    Ok(Ok(_)) => total_sent += 1,
                    Ok(Err((addr, err))) => {
                        warn!("Bulk mail failed for {}: {}", addr, err);
                        total_failed += 1;
                        all_failed_recipients.push(addr);
                    }
                    Err(e) => {
                        error!("Task join error in bulk send: {}", e);
                        total_failed += 1;
                    }
                }
            }

            // Write intermediate progress to the job store after each batch
            {
                let mut jobs = job_store.write().await;
                if let Some(job) = jobs.get_mut(&job_id) {
                    job.sent = total_sent as i32;
                    job.failed = total_failed as i32;
                }
            }
        }

        (total_sent, total_failed, all_failed_recipients)
    }

    pub async fn send_email(
        &self,
        to: &str,
        subject: &str,
        html_content: &str,
        text_content: &str,
    ) -> Result<(), anyhow::Error> {
        if self.disable_send {
            info!("EMAIL_DISABLE_SEND=true - skipping SMTP send to {}", to);
            return Ok(());
        }

        let from_mailbox: Mailbox = format!("TSV BÜ Tennis App <{}>", self.from_email).parse()?;
        let to_mailbox: Mailbox = to.parse()?;

        let email = Message::builder()
            .from(from_mailbox)
            .to(to_mailbox)
            .subject(subject)
            .multipart(
                lettre::message::MultiPart::alternative()
                    .singlepart(
                        lettre::message::SinglePart::builder()
                            .header(ContentType::TEXT_PLAIN)
                            .body(text_content.to_string()),
                    )
                    .singlepart(
                        lettre::message::SinglePart::builder()
                            .header(ContentType::TEXT_HTML)
                            .body(html_content.to_string()),
                    ),
            )?;

        let transport = self.create_async_transport()?;
        match transport.send(email).await {
            Ok(response) => {
                info!("Email sent successfully: {:?}", response);
                Ok(())
            }
            Err(e) => {
                error!("Failed to send email: {}", e);
                Err(e.into())
            }
        }
    }

    /// Send an email with attachments and/or inline images
    pub async fn send_email_with_attachments(
        &self,
        to: &str,
        subject: &str,
        html_content: &str,
        text_content: &str,
        attachments: &[EmailAttachment],
    ) -> Result<(), anyhow::Error> {
        if self.disable_send {
            info!("EMAIL_DISABLE_SEND=true - skipping SMTP send to {}", to);
            return Ok(());
        }

        let from_mailbox: Mailbox = format!("TSV BÜ Tennis App <{}>", self.from_email).parse()?;
        let to_mailbox: Mailbox = to.parse()?;

        // Build the text+HTML alternative body
        let body = MultiPart::alternative()
            .singlepart(
                SinglePart::builder()
                    .header(ContentType::TEXT_PLAIN)
                    .body(text_content.to_string()),
            )
            .singlepart(
                SinglePart::builder()
                    .header(ContentType::TEXT_HTML)
                    .body(html_content.to_string()),
            );

        let transport = self.create_async_transport()?;

        if attachments.is_empty() {
            let email = Message::builder()
                .from(from_mailbox)
                .to(to_mailbox)
                .subject(subject)
                .multipart(body)?;

            match transport.send(email).await {
                Ok(response) => {
                    info!("Email sent successfully: {:?}", response);
                    Ok(())
                }
                Err(e) => {
                    error!("Failed to send email: {}", e);
                    Err(e.into())
                }
            }
        } else {
            // Wrap body + attachments in multipart/mixed
            let mut mixed = MultiPart::mixed().multipart(body);

            for att in attachments {
                let content_type: ContentType = att
                    .content_type
                    .parse()
                    .unwrap_or(ContentType::parse("application/octet-stream").unwrap());

                if let Some(ref cid) = att.content_id {
                    // Inline image with Content-ID
                    let part = SinglePart::builder()
                        .header(content_type)
                        .header(lettre::message::header::ContentId::from(
                            format!("<{cid}>",),
                        ))
                        .header(
                            lettre::message::header::ContentDisposition::inline_with_name(
                                &att.filename,
                            ),
                        )
                        .body(att.data.clone());
                    mixed = mixed.singlepart(part);
                } else {
                    // Regular attachment
                    let attachment =
                        Attachment::new(att.filename.clone()).body(att.data.clone(), content_type);
                    mixed = mixed.singlepart(attachment);
                }
            }

            let email = Message::builder()
                .from(from_mailbox)
                .to(to_mailbox)
                .subject(subject)
                .multipart(mixed)?;

            match transport.send(email).await {
                Ok(response) => {
                    info!(
                        "Email with {} attachment(s) sent successfully: {:?}",
                        attachments.len(),
                        response
                    );
                    Ok(())
                }
                Err(e) => {
                    error!("Failed to send email with attachments: {}", e);
                    Err(e.into())
                }
            }
        }
    }

    pub async fn send_password_reset_email(
        &self,
        email: &str,
        reset_token: &str,
        user_id: String, // Changed from u32 to String
    ) -> Result<(), anyhow::Error> {
        let config = Config::from_env()?;
        let reset_url = format!(
            "{}/resetPassword?token={}&id={}",
            config.frontend_url, reset_token, user_id
        );

        let html_content = format!(
            r#"
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Passwort zurücksetzen</h2>
                <p>Sie haben eine Passwort-Zurücksetzung für Ihr TSV BÜ Tennis App Konto angefordert.</p>
                <p>Klicken Sie auf die Schaltfläche unten, um Ihr Passwort zurückzusetzen:</p>
                <a href="{reset_url}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 16px 0;">Passwort zurücksetzen</a>
                <p>Oder kopieren Sie diese URL und fügen Sie sie in Ihren Browser ein:</p>
                <p style="word-break: break-all; color: #666;">{reset_url}</p>
                <p style="color: #666; font-size: 14px;">Dieser Link läuft in 24 Stunden ab.</p>
                <p style="color: #666; font-size: 14px;">Falls Sie diese Anfrage nicht gestellt haben, ignorieren Sie diese E-Mail bitte.</p>
            </div>
            "#
        );

        let text_content = format!(
            r#"
Passwort zurücksetzen

Sie haben eine Passwort-Zurücksetzung für Ihr TSV BÜ Tennis App Konto angefordert.

Klicken Sie auf diesen Link, um Ihr Passwort zurückzusetzen: {reset_url}

Dieser Link läuft in 24 Stunden ab.

Falls Sie diese Anfrage nicht gestellt haben, ignorieren Sie diese E-Mail bitte.
            "#
        );

        self.send_email(
            email,
            "Passwort zurücksetzen - TSV BÜ Tennis App",
            &html_content,
            &text_content,
        )
        .await
    }
}

/// Build a lettre `Message` with optional attachments (shared by sync and async paths)
/// Send with a bounded number of retries for transient failures (e.g. the SMTP
/// server dropping the connection mid-conversation, reported by lettre as
/// "incomplete response"). Non-transient errors fail immediately.
async fn send_with_retry(
    transport: &AsyncSmtpTransport<Tokio1Executor>,
    message: Message,
    max_retries: usize,
    delay: std::time::Duration,
) -> Result<(), String> {
    let mut attempt = 0usize;
    loop {
        match transport.send(message.clone()).await {
            Ok(_) => return Ok(()),
            Err(e) => {
                if attempt < max_retries && is_transient_smtp_error(&e) {
                    attempt += 1;
                    warn!(
                        "Bulk mail send attempt {} retrying after SMTP error: {}",
                        attempt, e
                    );
                    tokio::time::sleep(delay).await;
                    continue;
                }
                return Err(e.to_string());
            }
        }
    }
}

/// Heuristic: treat connection-level losses as transient and worth retrying.
fn is_transient_smtp_error(err: &lettre::transport::smtp::Error) -> bool {
    let msg = err.to_string().to_lowercase();
    msg.contains("incomplete response")
        || msg.contains("connection refused")
        || msg.contains("connection reset")
        || msg.contains("closed")
        || msg.contains("deadline")
        || msg.contains("timed out")
        || msg.contains("eof")
}

fn build_message(
    from: Mailbox,
    to: Mailbox,
    subject: &str,
    html_content: &str,
    text_content: &str,
    attachments: &[EmailAttachment],
) -> Result<Message, anyhow::Error> {
    let body = MultiPart::alternative()
        .singlepart(
            SinglePart::builder()
                .header(ContentType::TEXT_PLAIN)
                .body(text_content.to_string()),
        )
        .singlepart(
            SinglePart::builder()
                .header(ContentType::TEXT_HTML)
                .body(html_content.to_string()),
        );

    if attachments.is_empty() {
        Ok(Message::builder()
            .from(from)
            .to(to)
            .subject(subject)
            .multipart(body)?)
    } else {
        let mut mixed = MultiPart::mixed().multipart(body);
        for att in attachments {
            let content_type: ContentType = att
                .content_type
                .parse()
                .unwrap_or(ContentType::parse("application/octet-stream").unwrap());
            if let Some(ref cid) = att.content_id {
                let part = SinglePart::builder()
                    .header(content_type)
                    .header(lettre::message::header::ContentId::from(format!("<{cid}>")))
                    .header(
                        lettre::message::header::ContentDisposition::inline_with_name(
                            &att.filename,
                        ),
                    )
                    .body(att.data.clone());
                mixed = mixed.singlepart(part);
            } else {
                let attachment =
                    Attachment::new(att.filename.clone()).body(att.data.clone(), content_type);
                mixed = mixed.singlepart(attachment);
            }
        }
        Ok(Message::builder()
            .from(from)
            .to(to)
            .subject(subject)
            .multipart(mixed)?)
    }
}
