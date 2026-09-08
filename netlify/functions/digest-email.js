const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'tickets';
const KEY = 'all';

function getTicketStore(){
  const siteID = process.env.SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  if(siteID && token){
    return getStore({ name: STORE_NAME, siteID, token });
  }
  return getStore(STORE_NAME);
}

async function runDigest(){
  const apiKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;
  const fromEmail = process.env.FROM_EMAIL || 'IT Ticket Desk <onboarding@resend.dev>';
  if(!apiKey || !adminEmail){
    console.warn('Digest skipped: RESEND_API_KEY or ADMIN_EMAIL not set.');
    return;
  }

  const store = getTicketStore();
  const tickets = (await store.get(KEY, { type: 'json' })) || [];
  const open = tickets.filter(t => t.status === 'open');
  const inProgress = tickets.filter(t => t.status === 'in-progress');

  if(open.length === 0 && inProgress.length === 0){
    return; // nothing to report
  }

  const rows = [...open, ...inProgress]
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map(t => `<li><strong>${escapeHtml(t.subject)}</strong> — ${escapeHtml(t.status)} ${t.urgent ? '(urgent)' : ''} — ${escapeHtml(t.name)}</li>`)
    .join('');

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromEmail,
      to: [adminEmail],
      subject: `Daily digest — ${open.length} open, ${inProgress.length} in progress`,
      html: `<h2>Daily ticket digest</h2><ul>${rows}</ul>`
    })
  });
}

function escapeHtml(str){
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Runs automatically once a day (Netlify Scheduled Functions).
module.exports.handler = async () => {
  try{ await runDigest(); }catch(e){ console.error('Digest failed:', e); }
  return { statusCode: 200, body: 'ok' };
};

module.exports.config = { schedule: '0 6 * * *' }; // 06:00 UTC daily
