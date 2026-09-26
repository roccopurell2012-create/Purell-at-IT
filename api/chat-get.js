const { kv } = require('@vercel/kv');
const { resolveChatIdentity } = require('./_lib/auth');

module.exports = async (req, res) => {
  let ticketId = (req.query && req.query.ticketId) || (req.body && req.body.ticketId);
  const token = (req.query && req.query.token) || (req.headers && req.headers['x-chat-token']);

  if (!ticketId && token) {
    const record = await kv.get(`chattoken:${token}`);
    if (record) ticketId = record.ticketId;
  }
  if (!ticketId) {
    return res.status(400).json({ error: 'ticketId is required' });
  }

  try {
    const identity = await resolveChatIdentity(req, ticketId);
    if (!identity) {
      return res.status(401).json({ error: 'Not authorized to view this chat' });
    }

    const ticket = await kv.get(`ticket:${ticketId}`);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const messages = (await kv.get(`chat:${ticketId}`)) || [];
    return res.status(200).json({ ok: true, ticket, messages });
  } catch (err) {
    console.error('chat-get error:', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
};
