# TSV Tennis Backend (Rust)

A high-performance Rust backend for the TSV Tennis application using Axum web framework.

## Features

- **Fast & Type-Safe**: Built with Rust for maximum performance and safety
- **JWT Authentication**: Secure token-based authentication
- **Teable Integration**: Direct API integration with Teable database
- **Family Support**: Multi-member family management
- **CORS Enabled**: Cross-origin resource sharing for frontend integration

## Quick Start

1. **Install Rust** (if not already installed):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source ~/.cargo/env
   ```

2. **Clone and setup**:
   ```bash
   cp .env.example .env
   # Edit .env with your Teable token and configuration
   ```

3. **Run the server**:
   ```bash
   cargo run
   ```

The server will start on `http://localhost:5000`

## API Endpoints

### Authentication
- `POST /login` - User login
- `POST /register` - User registration  
- `POST /forgot-password` - Password reset request
- `POST /reset-password` - Password reset with token

### User & Dashboard
- `GET /user` - Get current user info
- `GET /dashboard` - Get dashboard data with family members

### Work Hours
- `GET /workHours` - Get user's work hours
- `POST /workHours` - Create new work hour entry
- `POST /workHours/{id}` - Update work hour entry
- `DELETE /workHours/{id}` - Delete work hour entry

## Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Database Configuration
DATABASE_URL=mysql://username:password@localhost:3306/database_name

# Teable Configuration  
TEABLE_TOKEN=your-teable-token-here
JWT_SECRET=your-jwt-secret-key-here
PORT=5000

# Email Configuration (for password reset)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-gmail-app-password
FRONTEND_URL=http://localhost:3000
```

### Database Setup

The application requires a MySQL database for secure password storage:

```sql
-- Create database
CREATE DATABASE tsv_tennis;

-- Tables are created automatically on first run
-- - details: User authentication (email, hashed password)
-- - reset_tokens: Password reset tokens
```

### Email Setup (Gmail)

1. **Enable 2-Factor Authentication** on your Gmail account
2. **Generate App Password**:
   - Go to Google Account settings
   - Security → 2-Step Verification → App passwords
   - Generate password for "Mail"
   - Use this password in `EMAIL_PASSWORD`
3. **Configure Environment**: Set `EMAIL_USER` to your Gmail address

## Performance Benefits

Compared to the Node.js version:
- **30-40% smaller codebase** - More concise, expressive code
- **Better performance** - Memory safety and zero-cost abstractions
- **Type safety** - Compile-time error checking
- **Concurrent by default** - Built-in async/await with Tokio

## Architecture

The backend uses a **hybrid data storage approach** for security and functionality:

### **Password Storage** 🔐
- **MySQL Database**: Stores hashed passwords securely using bcrypt
- **Never stored in Teable**: Passwords are kept separate from profile data

### **Profile Data Storage** 📊
- **Teable**: Stores member profiles, family relationships, work hours
- **Public-safe data**: No sensitive authentication information

```
src/
├── main.rs         # Server setup, routing, middleware
├── auth.rs         # JWT token handling
├── database.rs     # MySQL password authentication
├── teable.rs       # Teable profile data integration
├── email.rs        # Email service for password resets
├── token_store.rs  # Password reset token management
└── models.rs       # Data structures and API models
```

### **Authentication Flow**
1. **Login**: Verify password against MySQL → Get profile from Teable
2. **Password Reset**: Store reset tokens in MySQL → Send email
3. **Dashboard**: Use Teable for family/work hour data

## Dependencies

- **axum** - Web framework
- **tokio** - Async runtime
- **reqwest** - HTTP client for Teable API
- **jsonwebtoken** - JWT handling
- **serde** - JSON serialization
- **tower-http** - CORS middleware

## Development

```bash
# Run with auto-reload
cargo watch -x run

# Run tests
cargo test

# Check code
cargo clippy

# Format code
cargo fmt
```
