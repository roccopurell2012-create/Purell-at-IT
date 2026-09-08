const { getStore } = require('@netlify/blobs');

const TICKETS_STORE = 'tickets';
const TOKENS_STORE = 'magic-tokens';
const KEY = 'all';
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function store(name){
  const siteID = process.env.SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  if(siteID && token){
    return getStore({ name, siteID, token });
  }
  return getStore(name);
}

function corsHeaders(){
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
  };
}

function randomToken(){
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
}

exports.handler = async (event) => {
  const headers = corsHeaders();
  if(event.httpMethod === 'OPTIONS'){
    return { statusCode: 204, headers, body: '' };
  }

  const action = (event.queryStringParameters || {}).action;

  // Step 1: request a link
  if(event.httpMethod === 'POST' && action === 'request'){
    let payload;
    try{ payload = JSON.parse(event.body || '{}'); }catch(e){
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }
    const email = String(payload.email || '').trim().toLowerCase();
    if(!email || !email.includes('@')){
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valid email required' }) };
    }

    const ticketsStore = store(TICKETS_STORE);
    const tickets = (await ticketsStore.get(KEY, { type: 'json' })) || [];
    const hasTickets = tickets.some(t => t.email.toLowerCase() === email);

    // Always respond the same way whether or not tickets exist, so this
    // can't be used to check who has submitted tickets.
    if(hasTickets){
      const tokensStore = store(TOKENS_STORE);
      const tokenData = (await tokensStore.get('all', { type: 'json' })) || {};
      const tok = randomToken();
      tokenData[tok] = { email, expires: Date.now() + TOKEN_TTL_MS };
      await tokensStore.setJSON('all', tokenData);

      const siteUrl = process.env.URL || '';
      const link = `${siteUrl}/index.html?tickets_email=${encodeURIComponent(email)}&tickets_token=${tok}`;
      try{ await sendLinkEmail(email, link); }catch(e){ console.error('Magic link email failed:', e); }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  // Step 2: view tickets with a valid token
  if(event.httpMethod === 'GET' && action === 'view'){
    const q = event.queryStringParameters || {};
    const email = String(q.email || '').trim().toLowerCase();
    const tok = q.token;
    if(!email || !tok){
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing email or token' }) };
    }
    const tokensStore = store(TOKENS_STORE);
    const tokenData = (await tokensStore.get('all', { type: 'json' })) || {};
    const entry = tokenData[tok];
    if(!entry || entry.email !== email || entry.expires < Date.now()){
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid or expired link' }) };
    }
    const ticketsStore = store(TICKETS_STORE);
    const tickets = (await ticketsStore.get(KEY, { type: 'json' })) || [];
    const mine = tickets
      .filter(t => t.email.toLowerCase() === email)
      .map(({ attachment, ...safe }) => safe);
    return { statusCode: 200, headers, body: JSON.stringify(mine) };
  }

  return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };
};

async function sendLinkEmail(email, link){
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || 'IT Ticket Desk <onboarding@resend.dev>';
  if(!apiKey) return;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromEmail,
      to: [email],
      subject: 'Your ticket link',
      html: `<p>Here's your secure link to view your tickets:</p><p><a href="${link}">${link}</a></p><p>This link works for 24 hours.</p>`
    })
  });
  if(!res.ok){
    const text = await res.text();
    throw new Error(`Resend API error: ${res.status} ${text}`);
  }
}
