const { kv } = require('@vercel/kv');

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

  const { id } = req.body || {};
  if (!id) {
    return res.status(400).json({ error: 'A ticket id is required' });
  }

  try {
    const ticket = await kv.get(`ticket:${id}`);
    if (!ticket) {
      return res.status(404).json({ error: 'Not found' });
    }

    await kv.del(`ticket:${id}`);

    const allIds = (await kv.get('index:all')) || [];
    await kv.set('index:all', allIds.filter((x) => x !== id));

    const emailIds = (await kv.get(`index:${ticket.email}`)) || [];
    await kv.set(`index:${ticket.email}`, emailIds.filter((x) => x !== id));

    // clean up any chat thread / chat link tied to this ticket
    await kv.del(`chat:${id}`);
    const chatToken = await kv.get(`chattoken-by-ticket:${id}`);
    if (chatToken) {
      await kv.del(`chattoken:${chatToken}`);
      await kv.del(`chattoken-by-ticket:${id}`);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('delete-ticket error:', err);
    return res.status(500).json({ error: 'Something went wrong deleting that' });
  }
};
