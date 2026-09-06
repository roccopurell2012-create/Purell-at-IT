const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'tickets';
const KEY = 'all';
const VALID_STATUSES = ['open', 'in-progress', 'fixed'];

function getTicketStore(){
  // On some Netlify project configurations, Blobs' automatic environment
  // wiring isn't available inside functions, which throws
  // MissingBlobsEnvironmentError. Passing siteID + token explicitly avoids
  // relying on that automatic detection.
  const siteID = process.env.NETLIFY_SITE_ID;
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
    'Access-Control-Allow-Methods': 'PATCH, OPTIONS'
  };
}

exports.handler = async (event) => {
  const headers = corsHeaders();

  if(event.httpMethod === 'OPTIONS'){
    return { statusCode: 204, headers, body: '' };
  }

  if(event.httpMethod !== 'PATCH'){
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const adminCode = process.env.ADMIN_CODE || '2012';
  const providedCode = event.headers['x-admin-code'] || event.headers['X-Admin-Code'];
  if(providedCode !== adminCode){
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid admin code' }) };
  }

  let payload;
  try{
    payload = JSON.parse(event.body || '{}');
  }catch(e){
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { id, status } = payload;
  if(!id || !VALID_STATUSES.includes(status)){
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing id or invalid status' }) };
  }

  const store = getTicketStore();
  const tickets = (await store.get(KEY, { type: 'json' })) || [];
  const idx = tickets.findIndex(t => t.id === id);
  if(idx === -1){
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Ticket not found' }) };
  }

  tickets[idx].status = status;
  tickets[idx].updatedAt = new Date().toISOString();
  await store.setJSON(KEY, tickets);

  return { statusCode: 200, headers, body: JSON.stringify(tickets[idx]) };
};
