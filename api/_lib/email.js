function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function sendEmail({ to, subject, html }) {
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || 'IT Ticket Desk <onboarding@resend.dev>';
  if (!resendKey) {
    console.warn('RESEND_API_KEY not set — skipping email:', subject);
    return;
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail, to: [to], subject, html }),
    });
    if (!r.ok) console.error('Resend email failed:', subject, r.status, await r.text());
  } catch (e) {
    console.error('Resend email threw:', subject, e);
  }
}

function siteUrl(req) {
  return (
    process.env.SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `https://${req.headers.host}`)
  );
}

module.exports = { escapeHtml, sendEmail, siteUrl };
