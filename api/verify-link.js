const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  const token = (req.query && req.query.token) || (req.body && req.body.token);
  if (!token) {
    return res.status(400).json({ error: 'A token is required' });
  }

  try {
    const record = await kv.get(`linktoken:${token}`);
    if (!record) {
      return res.status(401).json({ error: 'This link is invalid or has expired.' });
    }
    await kv.del(`linktoken:${token}`); // one-time use

    const sessionToken = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
    await kv.set(`session:${sessionToken}`, { email: record.email }, { ex: 60 * 60 * 24 * 7 }); // 7 days

    return res.status(200).json({ ok: true, sessionToken, email: record.email });
  } catch (err) {
    console.error('verify-link error:', err);
    return res.status(500).json({ error: 'Something went wrong verifying the link' });
  }
};
