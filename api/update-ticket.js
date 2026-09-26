const { kv } = require('@vercel/kv');

const VALID_STATUSES = ['open', 'in_progress', 'fixed'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const password = req.headers['x-admin-password'];
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD is not configured on this site' });
  }
  if (!password || password !== adminPassword) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  const { id, status } = req.body || {};
  if (!id || !status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'A valid ticket id and status are required' });
  }

  try {
    const key = `ticket:${id}`;
    const ticket = await kv.get(key);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    ticket.status = status;
    await kv.set(key, ticket);
    return res.status(200).json({ ok: true, ticket });
  } catch (err) {
    console.error('update-ticket error:', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
};
