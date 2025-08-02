use lettre::{
    message::{header::ContentType, Mailbox},
    transport::smtp::{authentication::Credentials, PoolConfig},
    Message, SmtpTransport, Transport,
};
use crate::config::{Config, EmailConfig};
use tracing::{error, info};

pub struct EmailService {
    transport: SmtpTransport,
    from_email: String,
}

impl EmailService {
    pub fn new() -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let email_config = EmailConfig::from_env()?;

        let creds = Credentials::new(email_config.user.clone(), email_config.password);

        let transport = SmtpTransport::starttls_relay(&email_config.host)?
            .port(email_config.port)
            .credentials(creds)
            .pool_config(PoolConfig::new().max_size(1))
            .build();

        Ok(EmailService {
            transport,
            from_email: email_config.user,
        })
    }

    pub async fn send_email(
        &self,
        to: &str,
        subject: &str,
        html_content: &str,
        text_content: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let from_mailbox: Mailbox = format!("Tennis App <{}>", self.from_email).parse()?;
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
        let reset_url = format!("{}/resetPassword?token={}&id={}", config.frontend_url, reset_token, user_id);

        let html_content = format!(
            r#"
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Password Reset Request</h2>
                <p>You requested a password reset for your Tennis App account.</p>
                <p>Click the button below to reset your password:</p>
                <a href="{}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 16px 0;">Reset Password</a>
                <p>Or copy and paste this URL into your browser:</p>
                <p style="word-break: break-all; color: #666;">{}</p>
                <p style="color: #666; font-size: 14px;">This link will expire in 24 hours.</p>
                <p style="color: #666; font-size: 14px;">If you didn't request this, please ignore this email.</p>
            </div>
            "#,
            reset_url, reset_url
        );

        let text_content = format!(
            r#"
Password Reset Request

You requested a password reset for your Tennis App account.

Click this link to reset your password: {}

This link will expire in 24 hours.

If you didn't request this, please ignore this email.
            "#,
            reset_url
        );

        self.send_email(
            email,
            "Password Reset - Tennis App",
            &html_content,
            &text_content,
        )
        .await
    }
}
