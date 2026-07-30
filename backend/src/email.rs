//! Email service using SMTP for transactional and bulk mail delivery.

use crate::config::{Config, EmailConfig};
use crate::models::MailJobStore;
use lettre::{
    message::{header::ContentType, Attachment, Mailbox, Message, MultiPart, SinglePart},
    transport::smtp::{
        authentication::Credentials,
        client::{Tls, TlsParameters},
    },
    AsyncSmtpTransport, AsyncTransport, SmtpTransport, Tokio1Executor, Transport,
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

/// Represents a file attachment for an email
#[derive(Clone)]
pub struct EmailAttachment {
    pub filename: String,
    pub content_type: String,
    pub data: Vec<u8>,
    pub content_id: Option<String>, // For inline images
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

    /// Creates a fresh SMTP transport connection for each send to avoid session limits
    fn create_transport(&self) -> Result<SmtpTransport, anyhow::Error> {
        let builder = if self.use_implicit_tls {
            let tls = self.build_tls_params()?;
            SmtpTransport::builder_dangerous(&self.smtp_host)
                .port(self.smtp_port)
                .tls(Tls::Wrapper(tls))
        } else {
            let tls = self.build_tls_params()?;
            SmtpTransport::builder_dangerous(&self.smtp_host)
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

    /// Creates an async SMTP transport for bulk operations (non-blocking)
    fn create_async_transport(
        &self,
    ) -> Result<AsyncSmtpTransport<Tokio1Executor>, anyhow::Error> {
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
        subject: &str,
        message: &str,
        safe_message: &str,
        signature_html: &str,
        signature_text: &str,
        attachments: &[EmailAttachment],
        include_greeting: bool,
        max_concurrency: usize,
        batch_size: usize,
        batch_delay: std::time::Duration,
        job_store: MailJobStore,
        job_id: String,
    ) -> (usize, usize, Vec<String>) {
        if self.disable_send {
            info!(
                "EMAIL_DISABLE_SEND=true - skipping bulk send to {} recipients",
                recipients.len()
            );
            return (recipients.len(), 0, Vec::new());
        }

        let from_address = format!("TSV BÜ Tennis App <{}>", self.from_email);
        let subject = subject.to_string();
        let message = message.to_string();
        let safe_message = safe_message.to_string();
        let signature_html = signature_html.to_string();
        let signature_text = signature_text.to_string();
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
                (recipients.len() + batch_size - 1) / batch_size,
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

                    let result = transport.send(email_msg).await;
                    drop(permit);
                    match result {
                        Ok(_) => Ok(email_addr),
                        Err(e) => Err((email_addr, e.to_string())),
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

        // Create a fresh transport per send to avoid SMTP session limits
        let transport = self.create_transport()?;
        match transport.send(&email) {
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

        // Create a fresh transport per send to avoid SMTP session limits
        let transport = self.create_transport()?;

        if attachments.is_empty() {
            // No attachments — send as multipart/alternative only
            let email = Message::builder()
                .from(from_mailbox)
                .to(to_mailbox)
                .subject(subject)
                .multipart(body)?;

            match transport.send(&email) {
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

            match transport.send(&email) {
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
