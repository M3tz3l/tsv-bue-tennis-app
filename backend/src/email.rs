use crate::config::{Config, EmailConfig};
use lettre::{
    message::{header::ContentType, Attachment, Mailbox, Message, MultiPart, SinglePart},
    transport::smtp::authentication::Credentials,
    SmtpTransport, Transport,
};
use tracing::{error, info};

/// Represents a file attachment for an email
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
}

impl EmailService {
    pub fn new() -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
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
        })
    }

    /// Creates a fresh SMTP transport connection for each send to avoid session limits
    fn create_transport(&self) -> Result<SmtpTransport, Box<dyn std::error::Error + Send + Sync>> {
        let creds = Credentials::new(self.smtp_user.clone(), self.smtp_password.clone());
        let transport = if self.use_implicit_tls {
            SmtpTransport::relay(&self.smtp_host)?
                .port(self.smtp_port)
                .credentials(creds)
                .build()
        } else {
            SmtpTransport::starttls_relay(&self.smtp_host)?
                .port(self.smtp_port)
                .credentials(creds)
                .build()
        };
        Ok(transport)
    }

    pub async fn send_email(
        &self,
        to: &str,
        subject: &str,
        html_content: &str,
        text_content: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
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
                Err(Box::new(e))
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
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
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
                    Err(Box::new(e))
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
                    Err(Box::new(e))
                }
            }
        }
    }

    pub async fn send_password_reset_email(
        &self,
        email: &str,
        reset_token: &str,
        user_id: String, // Changed from u32 to String
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
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
