const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  const sessionToken = req.headers['x-session-token'];
  if (!sessionToken) {
    return res.status(401).json({ error: 'Not signed in' });
  }

  try {
    const session = await kv.get(`session:${sessionToken}`);
    if (!session) {
      return res.status(401).json({ error: 'Your session has expired — request a new link.' });
    }

    const ids = (await kv.get(`index:${session.email}`)) || [];
    const tickets = [];
    for (const id of ids) {
      const t = await kv.get(`ticket:${id}`);
      if (t) tickets.push(t);
    }
    tickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.status(200).json({ ok: true, email: session.email, tickets });
  } catch (err) {
    console.error('get-tickets error:', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
};
