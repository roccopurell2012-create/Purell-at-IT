# IT Ticket Desk

An internal helpdesk site: submit a ticket, browse resolved "General
fixes," check your own tickets by email, and an admin + dev panel behind
separate PIN codes to manage everything.

## What's new in this build

- **Attachments** on ticket submission (3MB max, screenshots/PDFs/text)
- **Urgent flag** with a required reason, surfaced in the admin table and email subject
- **Confirmation email** sent to the submitter immediately, on top of the admin notification
- **Reopen** a fixed ticket from its detail view
- **11 languages** via the switcher in the header (UI text only — ticket content itself is never translated)
- **"My tickets"** — passwordless lookup: enter your email, get a link, see your tickets
- **Suggested subjects & categories** (hardware / software / network / account)
- **Internal-only admin notes** per ticket, never shown to the submitter
- **Bulk status updates** — select multiple tickets, change them all at once
- **CSV export** of the current filtered view
- **Ticket detail modal** instead of a cramped row
- **Category tags** shown throughout admin and general fixes
- **7-day activity chart** on both admin and dev dashboards
- **Daily digest email** to the admin, automatically, summarizing open/in-progress tickets
- **30-minute session expiry** on both admin and dev logins
- **Voting + "report outdated"** on resolved fixes, with a flagged list visible to admins
- **Dev panel** (`dev.html`, separate PIN) — same ticket dashboard, plus a site-name setting and basic system info
- Footer links now stack vertically, and include Admin panel + Dev login

### Deliberately not included in this pass

Two items from your list need infrastructure I can't fully wire or test
from here, and adding them on top of everything else risked another
silent failure like the Blobs issue we just fixed:

- **Push notifications** — needs generated VAPID keys and browser
  permission handling.
- **Two-way email replies** — Resend does support this, but it requires
  you to set up an inbound domain/webhook in the Resend dashboard first
  (a manual step on their end, not something in this codebase).

Happy to build both as a follow-up once the rest of this is confirmed
live and working.

## Setup

1. **Push this folder to a new GitHub repo**, replacing your existing one (or push over it).

2. **Netlify site** — if you already have one connected to this repo from before, you just need to redeploy after pushing (step 5). Otherwise: [app.netlify.com](https://app.netlify.com) → *Add new site → Import an existing project* → pick your repo.

3. **Environment variables** — *Site configuration → Environment variables*:

   | Key | Value |
   |---|---|
   | `RESEND_API_KEY` | your Resend key |
   | `ADMIN_EMAIL` | address that receives ticket notifications + daily digest |
   | `FROM_EMAIL` | (optional) a verified "from" address in Resend |
   | `ADMIN_CODE` | (optional) overrides the default admin PIN `2012` |
   | `DEV_CODE` | (optional) overrides the default dev PIN `7007` — **set this to something only you know** |
   | `NETLIFY_BLOBS_TOKEN` | a Netlify personal access token (see below) |

4. **Netlify Blobs token** (this is the fix for the crash you hit earlier):
   - Netlify avatar (top right) → **User settings → Applications → Personal access tokens → New access token**
   - Copy it, add it as `NETLIFY_BLOBS_TOKEN` above.

5. **Redeploy** — Deploys tab → Trigger deploy → Deploy site.

6. **Replace the "Rocco Creations" link** in `index.html`'s footer with your real site URL.

## About the PIN codes

Both `2012` (admin) and `7007` (dev) work the same way: the front-end
gate is a convenience screen only — readable in the page source, like any
static-site lock. What actually protects your data is the server-side
check on every write request (status changes, bulk updates, notes, site
settings) against `ADMIN_CODE` / `DEV_CODE`. Change `DEV_CODE` in
particular to something private, since the dev panel can edit site
settings.

## Daily digest email

Runs automatically once a day at 06:00 UTC via a Netlify Scheduled
Function — no extra setup needed beyond `RESEND_API_KEY` and
`ADMIN_EMAIL` already being set. It only sends if there's at least one
open or in-progress ticket.

## Local structure

```
index.html, app.js          public site (submit / fixes / my tickets)
admin.html, admin.js         admin dashboard
dev.html, dev.js             dev panel
i18n.js                      translation dictionary + language switching
style.css                    shared styles
netlify/functions/
  tickets.js                  GET list / POST create (+ emails)
  ticket-update.js             PATCH status/notes (single or bulk)
  ticket-feedback.js           POST vote / report-outdated
  my-tickets.js                magic-link request + view
  site-config.js                dev-panel site name get/set
  digest-email.js               scheduled daily digest
```

## Notes

- Tickets, votes, and config are stored in Netlify Blobs, shared across
  all visitors.
- Translation quality: English, Afrikaans, French, Spanish, Portuguese,
  German, and Swahili are solid. Zulu, Xhosa, Sesotho, and Setswana are
  best-effort machine translation — worth a native-speaker check before
  relying on them for anything formal.
- Attachments are capped at 3MB and stored as part of the ticket record.
