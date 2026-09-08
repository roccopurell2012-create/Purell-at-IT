const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'tickets';
const KEY = 'all';
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024; // 3MB raw, ~4MB base64

function getTicketStore(){
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
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-code, x-dev-code',
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
    const q = event.queryStringParameters || {};
    let filtered = tickets;
    if(q.status) filtered = filtered.filter(t => t.status === q.status);
    if(q.category) filtered = filtered.filter(t => t.category === q.category);
    if(q.flagged === 'true') filtered = filtered.filter(t => t.outdatedReported);
    if(q.public === 'true'){
      filtered = filtered.map(t => ({
        id: t.id, subject: t.subject, description: t.description,
        category: t.category, status: t.status, updatedAt: t.updatedAt,
        helpful: t.helpful || 0, unhelpful: t.unhelpful || 0
      }));
    }
    return { statusCode: 200, headers, body: JSON.stringify(filtered) };
  }

  if(event.httpMethod === 'POST'){
    let payload;
    try{
      payload = JSON.parse(event.body || '{}');
    }catch(e){
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }

    const { name, email, subject, description, priority, category, urgent, urgentReason, attachment } = payload;
    if(!name || !email || !subject || !description){
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    let cleanAttachment = null;
    if(attachment && attachment.dataBase64){
      const approxBytes = attachment.dataBase64.length * 0.75;
      if(approxBytes > MAX_ATTACHMENT_BYTES){
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Attachment too large (3MB max)' }) };
      }
      cleanAttachment = {
        filename: String(attachment.filename || 'attachment').slice(0, 150),
        contentType: String(attachment.contentType || 'application/octet-stream').slice(0, 100),
        dataBase64: attachment.dataBase64
      };
    }

    const tickets = await getTickets(store);
    const ticket = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: String(name).slice(0, 200),
      email: String(email).slice(0, 200),
      subject: String(subject).slice(0, 300),
      description: String(description).slice(0, 4000),
      priority: ['low', 'normal', 'high'].includes(priority) ? priority : 'normal',
      category: ['hardware', 'software', 'network', 'account'].includes(category) ? category : null,
      urgent: !!urgent,
      urgentReason: urgent ? String(urgentReason || '').slice(0, 500) : '',
      attachment: cleanAttachment,
      status: 'open',
      helpful: 0,
      unhelpful: 0,
      outdatedReported: false,
      internalNotes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    tickets.push(ticket);
    await store.setJSON(KEY, tickets);

    try{ await sendAdminEmail(ticket); }catch(e){ console.error('Admin email failed:', e); }
    try{ await sendConfirmationEmail(ticket); }catch(e){ console.error('Confirmation email failed:', e); }

    const { attachment: _omit, ...safeTicket } = ticket;
    return { statusCode: 201, headers, body: JSON.stringify(safeTicket) };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};

async function sendAdminEmail(ticket){
  const apiKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;
  const fromEmail = process.env.FROM_EMAIL || 'IT Ticket Desk <onboarding@resend.dev>';
  if(!apiKey || !adminEmail){
    console.warn('RESEND_API_KEY or ADMIN_EMAIL not set — skipping admin email.');
    return;
  }
  const urgentLine = ticket.urgent
    ? `<p style="color:#8A3226;"><strong>Marked urgent:</strong> ${escapeHtml(ticket.urgentReason)}</p>`
    : '';
  await callResend(apiKey, {
    from: fromEmail,
    to: [adminEmail],
    subject: `${ticket.urgent ? '[URGENT] ' : ''}New ticket: ${ticket.subject}`,
    html: `
      <h2>New IT ticket submitted</h2>
      <p><strong>From:</strong> ${escapeHtml(ticket.name)} (${escapeHtml(ticket.email)})</p>
      <p><strong>Priority:</strong> ${escapeHtml(ticket.priority)}${ticket.category ? ' &middot; ' + escapeHtml(ticket.category) : ''}</p>
      ${urgentLine}
      <p><strong>Subject:</strong> ${escapeHtml(ticket.subject)}</p>
      <p><strong>Description:</strong><br>${escapeHtml(ticket.description).replace(/\n/g, '<br>')}</p>
      ${ticket.attachment ? `<p><em>Includes an attachment: ${escapeHtml(ticket.attachment.filename)}</em></p>` : ''}
      <p style="color:#888;font-size:12px;">Ticket ID: ${ticket.id}</p>
    `
  });
}

async function sendConfirmationEmail(ticket){
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || 'IT Ticket Desk <onboarding@resend.dev>';
  if(!apiKey) return;
  await callResend(apiKey, {
    from: fromEmail,
    to: [ticket.email],
    subject: `We received your ticket: ${ticket.subject}`,
    html: `
      <h2>Got it, ${escapeHtml(ticket.name)}!</h2>
      <p>Your ticket has been submitted and someone will take a look shortly.</p>
      <p><strong>Subject:</strong> ${escapeHtml(ticket.subject)}</p>
      <p><strong>What you told us:</strong><br>${escapeHtml(ticket.description).replace(/\n/g, '<br>')}</p>
      <p style="color:#888;font-size:12px;">Reference ID: ${ticket.id}</p>
    `
  });
}

async function callResend(apiKey, body){
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if(!res.ok){
    const text = await res.text();
    throw new Error(`Resend API error: ${res.status} ${text}`);
  }
}

function escapeHtml(str){
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
