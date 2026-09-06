# IT Ticket Desk

A small internal helpdesk site: submit a ticket, browse "General fixes"
(resolved tickets), and an admin panel behind a PIN to manage status and
get emailed when a new ticket comes in.

## Important — about the email API key

GitHub Pages only serves static files; it can't run server code. That
matters here because sending email needs your **Resend API key**, and a
key placed anywhere in the site's HTML/JS would be visible to anyone who
opens the page or looks at the public repo — they could then use your
key to send email on your account and run up your usage.

So this project keeps the key out of the code entirely. It's set as an
environment variable on the hosting platform instead, and only the
server-side function (which visitors never see) reads it. That means:

- **GitHub** hosts the code (as you asked).
- **Netlify** (free tier, connects directly to your GitHub repo) runs
  the two small server functions that store tickets and send email.
  This is the piece plain GitHub Pages can't do.

You'll paste your Resend key into Netlify's dashboard, not into any file
in this repo. Never commit it to `.env` or any tracked file.

## Setup

1. **Push this folder to a new GitHub repo.**

2. **Create a Netlify site from that repo**
   [app.netlify.com](https://app.netlify.com) → *Add new site* → *Import
   an existing project* → pick your GitHub repo. Netlify will detect
   `netlify.toml` automatically. Deploy.

3. **Add environment variables** in Netlify: *Site configuration →
   Environment variables*:
   | Key | Value |
   |---|---|
   | `RESEND_API_KEY` | your Resend key |
   | `ADMIN_EMAIL` | the email address that should receive ticket notifications |
   | `FROM_EMAIL` | (optional) a "from" address verified in Resend, e.g. `IT Desk <tickets@yourdomain.com>`. Defaults to Resend's shared test sender. |
   | `ADMIN_CODE` | (optional) overrides the default admin PIN `2012` |

   Redeploy after adding these (Netlify → *Deploys* → *Trigger deploy*).

4. **Enable Netlify Blobs** — no setup needed, it's built into Netlify
   Functions automatically on deploy.

5. **Replace the "Rocco Creations" link** in `index.html`'s footer with
   your actual site URL (currently a placeholder pointing at
   `example.com`).

## About the admin PIN

The code is `2012` by default. Two things worth knowing:

- The front-end gate (the screen that asks for the code) is just a
  convenience — anyone could view the page's source and read the code
  that checks it. That's inherent to any static site with client-side
  logic; it keeps casual visitors out but isn't a real lock.
- The part that actually matters — changing a ticket's status — is
  checked **again on the server**, against `ADMIN_CODE`. So even if
  someone bypassed the front-end screen, they still couldn't modify
  tickets without the right code.

If this needs to be genuinely secure (e.g. sensitive ticket contents),
swap the PIN for real authentication (Netlify Identity, or a proper
login) rather than a shared code — happy to help set that up.

## Local structure

```
index.html               public page: submit ticket / general fixes
admin.html                admin panel (PIN + dashboard)
style.css, app.js, admin.js
netlify/functions/
  tickets.js               GET list / POST create (+ sends email)
  ticket-update.js          PATCH status (admin-code protected)
```

## Notes

- Tickets are stored in Netlify Blobs, shared across all visitors — not
  browser-local storage — so the admin panel and "General fixes" list
  reflect everyone's submissions.
- If email sending isn't configured, ticket submission still works;
  the email step just silently skips.
