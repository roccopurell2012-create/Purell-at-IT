const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  const password = req.headers['x-admin-password'];
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD is not configured on this site' });
  }
  if (!password || password !== adminPassword) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  try {
    const ids = (await kv.get('index:all')) || [];
    const tickets = [];
    for (const id of ids) {
      const t = await kv.get(`ticket:${id}`);
      if (t) tickets.push(t);
    }
    tickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.status(200).json({ ok: true, tickets });
  } catch (err) {
    console.error('admin-tickets error:', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
};
