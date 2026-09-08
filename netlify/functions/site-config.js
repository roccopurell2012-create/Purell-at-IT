const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'config';
const KEY = 'site';

function getConfigStore(){
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
    'Access-Control-Allow-Headers': 'Content-Type, x-dev-code',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
}

exports.handler = async (event) => {
  const headers = corsHeaders();
  if(event.httpMethod === 'OPTIONS'){
    return { statusCode: 204, headers, body: '' };
  }

  const store = getConfigStore();

  if(event.httpMethod === 'GET'){
    const config = (await store.get(KEY, { type: 'json' })) || { siteName: 'IT Ticket Desk' };
    return { statusCode: 200, headers, body: JSON.stringify(config) };
  }

  if(event.httpMethod === 'POST'){
    const devCode = process.env.DEV_CODE || '7007';
    const provided = event.headers['x-dev-code'] || event.headers['X-Dev-Code'];
    if(provided !== devCode){
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid dev code' }) };
    }
    let payload;
    try{ payload = JSON.parse(event.body || '{}'); }catch(e){
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }
    const config = { siteName: String(payload.siteName || 'IT Ticket Desk').slice(0, 100) };
    await store.setJSON(KEY, config);
    return { statusCode: 200, headers, body: JSON.stringify(config) };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};
