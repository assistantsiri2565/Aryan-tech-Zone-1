# Aryan Tech Zone - Company Website

Professional IT services website with work request forms, UPI payment integration, SQL Server database, and email notifications.

## Features

- Modern, client-friendly responsive website
- Company branding with custom logo
- 100+ workers showcase and IT services listing
- **3-step workflow:** Fill form → Pay via UPI → Confirmation
- Work requests saved to **SQL Server**
- Email notifications to **aryankumar112211225@gmail.com**
- UPI payment to **aryankumar112211225-1@okhdfcbank**

## Quick Start

### 1. Install SQL Server

Install [SQL Server Express](https://www.microsoft.com/en-us/sql-server/sql-server-downloads) and run the setup script:

```sql
-- Open SQL Server Management Studio (SSMS) and run:
-- backend/sql/setup.sql
```

### 2. Configure Backend

```bash
cd backend
npm install
```

Copy `.env.example` to `.env` and update your settings:

```bash
copy .env.example .env
```

Edit `.env` with your details:

| Variable | Description |
|----------|-------------|
| `DB_SERVER` | SQL Server address (default: localhost) |
| `DB_PASSWORD` | Your SQL Server password |
| `EMAIL_PASS` | Gmail App Password (see below) |
| `ADMIN_EMAIL` | aryankumar112211225@gmail.com |

**Gmail App Password setup:**
1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable 2-Step Verification
3. Go to App Passwords → Create one for "Mail"
4. Paste the 16-character password in `EMAIL_PASS`

### 3. Start the Server

```bash
cd backend
npm start
```

Open **http://localhost:3000** in your browser.

## How It Works

1. **Client fills work form** → Saved to SQL Server → Email sent to admin
2. **Client pays via UPI** (9319704764) → Enters transaction ID
3. **Payment confirmed** → Saved to SQL Server → Payment + work details emailed to admin

## Project Structure

```
my company/
├── frontend/
│   ├── index.html          # Main website
│   ├── css/style.css       # Styling
│   ├── js/app.js           # Frontend logic
│   └── assets/logo.png     # Company logo
├── backend/
│   ├── server.js           # Express API server
│   ├── db.js               # SQL Server connection
│   ├── email.js            # Email notifications
│   ├── sql/setup.sql       # Database setup script
│   ├── package.json
│   └── .env.example
└── README.md
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/work-request` | Submit work request |
| POST | `/api/payment` | Confirm UPI payment |
| GET | `/api/health` | Server health check |

## Contact

- **Phone:** +91 9319704764
- **UPI ID:** aryankumar112211225-1@okhdfcbank
- **Email:** aryankumar112211225@gmail.com
- **Company:** Aryan Tech Zone
