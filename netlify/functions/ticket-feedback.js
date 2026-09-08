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

function corsHeaders(){
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

exports.handler = async (event) => {
  const headers = corsHeaders();
  if(event.httpMethod === 'OPTIONS'){
    return { statusCode: 204, headers, body: '' };
  }
  if(event.httpMethod !== 'POST'){
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let payload;
  try{
    payload = JSON.parse(event.body || '{}');
  }catch(e){
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { id, action } = payload;
  if(!id || !['helpful', 'unhelpful', 'outdated'].includes(action)){
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing id or invalid action' }) };
  }

  const store = getTicketStore();
  const tickets = (await store.get(KEY, { type: 'json' })) || [];
  const idx = tickets.findIndex(t => t.id === id);
  if(idx === -1){
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Ticket not found' }) };
  }

  if(action === 'helpful') tickets[idx].helpful = (tickets[idx].helpful || 0) + 1;
  if(action === 'unhelpful') tickets[idx].unhelpful = (tickets[idx].unhelpful || 0) + 1;
  if(action === 'outdated') tickets[idx].outdatedReported = true;

  await store.setJSON(KEY, tickets);
  return { statusCode: 200, headers, body: JSON.stringify({
    id: tickets[idx].id,
    helpful: tickets[idx].helpful,
    unhelpful: tickets[idx].unhelpful,
    outdatedReported: tickets[idx].outdatedReported
  }) };
};
