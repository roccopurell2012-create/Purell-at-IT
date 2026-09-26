# IT Ticket Desk (Vercel version)

## 1. Create the KV database (storage)

In your Vercel project → **Storage** tab → **Create Database** → choose **KV**.
Connect it to this project. Vercel then automatically injects the KV environment
variables (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, etc.) — you don't set those yourself.

## 2. Environment variables (Project settings → Environment Variables)

| Key | Required | Notes |
|---|---|---|
| `RESEND_API_KEY` | Yes | From resend.com → API Keys |
| `ADMIN_EMAIL` | Yes | Where new-ticket notifications go |
| `FROM_EMAIL` | No | Defaults to `IT Ticket Desk <onboarding@resend.dev>`. Set once you've verified your own domain in Resend. |
| `SITE_URL` | No | Only needed if the auto-detected deployment URL isn't the one you want sign-in links to use (e.g. a custom domain). |
| `ADMIN_PASSWORD` | Yes, for admin | Password for the `/admin` page where you mark tickets open / in progress / fixed. Pick your own value. |

## 3. Deploy

Push this folder to a GitHub repo and import it into Vercel, or run `vercel deploy` from
inside the folder. No `vercel.json` is needed — a root `index.html` plus an `/api` folder
is picked up automatically.

## How it works

- **Submit a ticket** — writes to KV (`ticket:<id>` + a per-email `index:<email>` list) and
  emails `ADMIN_EMAIL` via Resend.
- **General fixes** — static content baked into `index.html`, no backend involved.
- **My tickets** — passwordless: entering an email calls `/api/request-link`, which stores a
  15-minute one-time token in KV and emails a link. Clicking it calls `/api/verify-link`,
  which trades that token for a 7-day session token kept in the browser's `localStorage`.
  `/api/get-tickets` uses the session token to look up that email's tickets. KV's own
  expiry (`ex`) handles cleaning up expired tokens — nothing to do manually.
- **Admin (`/admin`)** — enter `ADMIN_PASSWORD` to see every ticket (a global `index:all`
  list is maintained in KV on each submission) and change its status. Password is sent as
  a header on each request, not stored anywhere server-side.

## After deploying

1. Confirm the KV database is connected and the three env vars above are set, then redeploy
   (env var changes need a fresh deploy to take effect).
2. Submit a test ticket and confirm the admin email arrives.
3. Try "Send me a link" on My tickets and confirm the sign-in email arrives and the link
   signs you in.
