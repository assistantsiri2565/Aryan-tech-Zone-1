# Deploy Aryan Tech Zone on Render

Render does not support SQL Server. This project uses **PostgreSQL on Render** (same tables: forms, payments, emails, fraud alerts).

## Step 1 — Push code to GitHub

1. Create a repo on GitHub
2. Push this project:

```bash
git add .
git commit -m "Prepare for Render deployment"
git push origin main
```

## Step 2 — Create Render account

Go to [render.com](https://render.com) and sign up (free).

## Step 3 — Deploy with Blueprint

1. Click **New +** → **Blueprint**
2. Connect your GitHub repo
3. Render reads `render.yaml` automatically
4. It creates:
   - **Web Service** — your website
   - **PostgreSQL Database** — replaces SQL Server

## Step 4 — Add environment variables

In Render Dashboard → your web service → **Environment**:

| Variable | Value |
|----------|--------|
| `EMAIL_PASS` | Your Gmail App Password |
| `BASE_URL` | Your Render URL (e.g. `https://aryan-tech-zone.onrender.com`) |

`DATABASE_URL` is set automatically when PostgreSQL is linked.

## Step 5 — Gmail App Password

1. [Google App Passwords](https://myaccount.google.com/apppasswords)
2. Create password for Mail
3. Paste in Render → `EMAIL_PASS`

## Step 6 — Open your live site

Your URL will be like:

`https://aryan-tech-zone.onrender.com`

---

## Local vs Render database

| Environment | Database |
|-------------|----------|
| Your PC (local) | SQL Server (`sa` / `root`) or SQLite |
| Render (live) | PostgreSQL (auto via `DATABASE_URL`) |

Same features on both: work forms, payments, Gmail alerts, fraud detection.

---

## Manual deploy (without Blueprint)

1. **New +** → **PostgreSQL** → create free database
2. **New +** → **Web Service** → connect repo
   - Root Directory: `backend`
   - Build: `npm install`
   - Start: `npm start`
3. Link PostgreSQL → `DATABASE_URL` is added automatically
4. Add env vars: `EMAIL_USER`, `EMAIL_PASS`, `ADMIN_EMAIL`, `UPI_ID`, `BASE_URL`

---

## Notes

- Free tier sleeps after 15 min inactivity (first visit may be slow)
- Set `BASE_URL` to your exact Render URL so payment approve links work in Gmail
- PostgreSQL data persists on Render (unlike SQLite on free web-only deploy)
