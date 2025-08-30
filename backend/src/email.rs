use crate::config::{Config, EmailConfig};
use lettre::{
    message::{header::ContentType, Mailbox},
    transport::smtp::{authentication::Credentials, PoolConfig},
    Message, SmtpTransport, Transport,
};
use tracing::{error, info};

pub struct EmailService {
    transport: SmtpTransport,
    from_email: String,
}

impl EmailService {
    pub fn new() -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let email_config = EmailConfig::from_env()?;

        let creds = Credentials::new(email_config.user.clone(), email_config.password);

        let transport = if email_config.use_implicit_tls {
            // For port 465 (implicit TLS) - TLS connection starts immediately
            SmtpTransport::relay(&email_config.host)?
                .port(email_config.port)
                .credentials(creds)
                .pool_config(PoolConfig::new().max_size(1))
                .build()
        } else {
            // For port 587 (STARTTLS) - connection starts in plaintext then upgrades
            SmtpTransport::starttls_relay(&email_config.host)?
                .port(email_config.port)
                .credentials(creds)
                .pool_config(PoolConfig::new().max_size(1))
                .build()
        };

        Ok(EmailService {
            transport,
            from_email: email_config.from_email,
        })
    }

    pub async fn send_email(
        &self,
        to: &str,
        subject: &str,
        html_content: &str,
        text_content: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
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

        match self.transport.send(&email) {
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
