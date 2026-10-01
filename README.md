# IT Ticket Desk (Vercel version)

## ⚠️ Why emails to clients might not arrive (read this first)

If `FROM_EMAIL` is left unset, emails send from `onboarding@resend.dev` —
Resend's own domain. **That domain can only deliver to the email address on
your Resend account.** It will NOT reach clients/colleagues at other
addresses — Resend just rejects the send silently from the app's point of
view (it shows up as an error in Vercel's function logs, not to the user).

To fix this for real:
1. In Resend → **Domains** → **Add Domain**, add a domain you own.
2. Add the DNS records Resend gives you (SPF/DKIM) at your domain registrar.
3. Wait for it to show **Verified** in Resend.
4. Set the `FROM_EMAIL` env var in Vercel to an address on that domain, e.g.
   `IT Ticket Desk <noreply@yourdomain.com>`.
5. Redeploy.

Until that's done, only emails to your own Resend account address will work.

## 1. Create the KV database (storage)

In your Vercel project → **Storage** tab → **Create Database** → choose
**KV** (or install the **Upstash Redis** integration from the Marketplace if
KV isn't offered — it's the same thing under a new name). Connect it to this
project, enabling all environments.

## 2. Environment variables (Project settings → Environment Variables)

| Key | Required | Notes |
|---|---|---|
| `RESEND_API_KEY` | Yes | From resend.com → API Keys |
| `ADMIN_EMAIL` | Yes | Where new-ticket/request notifications go |
| `FROM_EMAIL` | Yes, for client email to actually work | See the warning above |
| `SITE_URL` | No | Only needed if the auto-detected deployment URL isn't the one you want links to use |
| `ADMIN_PASSWORD` | Yes | Password for `/admin.html` |

## 3. Deploy

Push this folder to a GitHub repo and import it into Vercel. No `vercel.json`
is needed — a root `index.html` plus an `/api` folder is picked up
automatically.

## How it works

- **Submit a ticket / Request something** — writes to KV (`ticket:<id>` +
  a per-email `index:<email>` list + a global `index:all` list) and emails
  `ADMIN_EMAIL`. The client always gets a confirmation email with what they
  submitted; if they chose the private chat option, they get a **separate**
  second email with the chat link, and the admin notification email also
  includes that chat link.
- **General fixes** — stored in KV (`fixes:all`), editable from the admin
  dashboard's "General fixes" tab. Seeded with 8 defaults on first load if
  nothing's been saved yet.
- **My tickets** — passwordless: entering an email calls `/api/request-link`,
  which stores a 15-minute one-time token in KV and emails a link. Clicking
  it calls `/api/verify-link`, which trades that token for a 7-day session
  token kept in the browser's `localStorage`. `/api/get-tickets` uses the
  session token to look up that email's tickets and requests.
- **Private chat** — `/chat.html?token=...`; messages trigger an email to
  the other party either way (client → admin, admin → client).
- **Admin (`/admin.html`)** — enter `ADMIN_PASSWORD` to see every ticket and
  request. Tickets get Open / In progress / Fixed. Requests additionally get
  **Approved / Denied** — picking either emails the client automatically.
  Every item can be **deleted** permanently. A second tab manages General
  Fixes.

## After deploying

1. Confirm the KV/Upstash database is connected and all env vars above are
   set (especially `FROM_EMAIL` on a verified domain), then redeploy — env
   var changes need a fresh deploy to take effect.
2. Submit a test ticket from an email address that is **not** your own
   Resend account email, and confirm it actually arrives — this is the real
   test of whether `FROM_EMAIL` is working.
3. Try "Send me a link" on My tickets and confirm the sign-in email arrives
   and the link signs you in and shows your tickets/requests.
4. In `/admin.html`, submit a test request and try Approve/Deny and Delete.
