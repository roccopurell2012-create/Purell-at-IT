const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'tickets';
const KEY = 'all';
const VALID_STATUSES = ['open', 'in-progress', 'fixed'];

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
    'Access-Control-Allow-Methods': 'PATCH, OPTIONS'
  };
}

function isAuthorized(event){
  const adminCode = process.env.ADMIN_CODE || '2012';
  const devCode = process.env.DEV_CODE || '7007';
  const provided = event.headers['x-admin-code'] || event.headers['X-Admin-Code']
    || event.headers['x-dev-code'] || event.headers['X-Dev-Code'];
  return provided === adminCode || provided === devCode;
}

exports.handler = async (event) => {
  const headers = corsHeaders();

  if(event.httpMethod === 'OPTIONS'){
    return { statusCode: 204, headers, body: '' };
  }
  if(event.httpMethod !== 'PATCH'){
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if(!isAuthorized(event)){
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid access code' }) };
  }

  let payload;
  try{
    payload = JSON.parse(event.body || '{}');
  }catch(e){
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const store = getTicketStore();
  const tickets = (await store.get(KEY, { type: 'json' })) || [];

  // Bulk update: { ids: [...], status }
  if(Array.isArray(payload.ids)){
    if(!VALID_STATUSES.includes(payload.status)){
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid status' }) };
    }
    let updated = 0;
    payload.ids.forEach(id => {
      const idx = tickets.findIndex(t => t.id === id);
      if(idx !== -1){
        tickets[idx].status = payload.status;
        tickets[idx].updatedAt = new Date().toISOString();
        updated++;
      }
    });
    await store.setJSON(KEY, tickets);
    return { statusCode: 200, headers, body: JSON.stringify({ updated }) };
  }

  // Single update: { id, status?, internalNotes? }
  const { id, status, internalNotes } = payload;
  if(!id){
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing id' }) };
  }
  const idx = tickets.findIndex(t => t.id === id);
  if(idx === -1){
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Ticket not found' }) };
  }

  if(status !== undefined){
    if(!VALID_STATUSES.includes(status)){
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid status' }) };
    }
    tickets[idx].status = status;
  }
  if(internalNotes !== undefined){
    tickets[idx].internalNotes = String(internalNotes).slice(0, 4000);
  }
  tickets[idx].updatedAt = new Date().toISOString();

  await store.setJSON(KEY, tickets);
  const { attachment: _omit, ...safeTicket } = tickets[idx];
  return { statusCode: 200, headers, body: JSON.stringify(safeTicket) };
};
