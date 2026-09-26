const { kv } = require('@vercel/kv');

// Resolves who is making a chat request: admin, a client with a chat-link
// token, or a client already signed in on "My tickets" (session token).
// Returns { role: 'admin' } or { role: 'client', email } or null.
async function resolveChatIdentity(req, ticketId) {
  const adminPassword = req.headers['x-admin-password'];
  if (adminPassword) {
    if (adminPassword === process.env.ADMIN_PASSWORD) return { role: 'admin' };
    return null;
  }

  const chatToken = req.headers['x-chat-token'] || (req.body && req.body.token) || (req.query && req.query.token);
  if (chatToken) {
    const record = await kv.get(`chattoken:${chatToken}`);
    if (record && record.ticketId === ticketId) return { role: 'client', email: record.email };
    return null;
  }

  const sessionToken = req.headers['x-session-token'];
  if (sessionToken) {
    const session = await kv.get(`session:${sessionToken}`);
    if (!session) return null;
    const ticket = await kv.get(`ticket:${ticketId}`);
    if (ticket && ticket.email === session.email) return { role: 'client', email: session.email };
    return null;
  }

  return null;
}

module.exports = { resolveChatIdentity };
