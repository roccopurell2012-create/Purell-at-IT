const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'tickets';
const KEY = 'all';

function getTicketStore(){
  // On some Netlify project configurations, Blobs' automatic environment
  // wiring isn't available inside functions, which throws
  // MissingBlobsEnvironmentError. Passing siteID + token explicitly avoids
  // relying on that automatic detection.
  const siteID = process.env.SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  if(siteID && token){
    return getStore({ name: STORE_NAME, siteID, token });
  }
  return getStore(STORE_NAME);
}

function corsHeaders(){
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-code',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
}

async function getTickets(store){
  const data = await store.get(KEY, { type: 'json' });
  return data || [];
}

exports.handler = async (event) => {
  const headers = corsHeaders();

  if(event.httpMethod === 'OPTIONS'){
    return { statusCode: 204, headers, body: '' };
  }

  const store = getTicketStore();

  if(event.httpMethod === 'GET'){
    const tickets = await getTickets(store);
    const status = event.queryStringParameters && event.queryStringParameters.status;
    const filtered = status ? tickets.filter(t => t.status === status) : tickets;
    return { statusCode: 200, headers, body: JSON.stringify(filtered) };
  }

  if(event.httpMethod === 'POST'){
    let payload;
    try{
      payload = JSON.parse(event.body || '{}');
    }catch(e){
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }

    const { name, email, subject, description, priority } = payload;
    if(!name || !email || !subject || !description){
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    const tickets = await getTickets(store);
    const ticket = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: String(name).slice(0, 200),
      email: String(email).slice(0, 200),
      subject: String(subject).slice(0, 300),
      description: String(description).slice(0, 4000),
      priority: ['low', 'normal', 'high'].includes(priority) ? priority : 'normal',
      status: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    tickets.push(ticket);
    await store.setJSON(KEY, tickets);

    // Email the admin — failure to send should never block ticket creation.
    try{
      await sendAdminEmail(ticket);
    }catch(e){
      console.error('Email notification failed:', e);
    }

    return { statusCode: 201, headers, body: JSON.stringify(ticket) };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};

async function sendAdminEmail(ticket){
  const apiKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;
  const fromEmail = process.env.FROM_EMAIL || 'IT Ticket Desk <onboarding@resend.dev>';

  if(!apiKey || !adminEmail){
    console.warn('RESEND_API_KEY or ADMIN_EMAIL not set — skipping email notification.');
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [adminEmail],
      subject: `New ticket: ${ticket.subject}`,
      html: `
        <h2>New IT ticket submitted</h2>
        <p><strong>From:</strong> ${escapeHtml(ticket.name)} (${escapeHtml(ticket.email)})</p>
        <p><strong>Priority:</strong> ${escapeHtml(ticket.priority)}</p>
        <p><strong>Subject:</strong> ${escapeHtml(ticket.subject)}</p>
        <p><strong>Description:</strong><br>${escapeHtml(ticket.description).replace(/\n/g, '<br>')}</p>
        <p style="color:#888;font-size:12px;">Ticket ID: ${ticket.id}</p>
      `
    })
  });

  if(!res.ok){
    const text = await res.text();
    throw new Error(`Resend API error: ${res.status} ${text}`);
  }
}

function escapeHtml(str){
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
