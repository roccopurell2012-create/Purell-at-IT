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

  if (req.method === 'GET') {
    try {
      const fixes = (await kv.get('fixes:all')) || [];
      return res.status(200).json({ ok: true, fixes });
    } catch (err) {
      console.error('admin-fixes GET error:', err);
      return res.status(500).json({ error: 'Something went wrong' });
    }
  }

  if (req.method === 'POST') {
    const { fixes } = req.body || {};
    if (!Array.isArray(fixes)) {
      return res.status(400).json({ error: 'fixes must be an array' });
    }
    try {
      const clean = fixes
        .map((f) => ({
          title: String((f && f.title) || '').slice(0, 200).trim(),
          body: String((f && f.body) || '').slice(0, 4000).trim(),
        }))
        .filter((f) => f.title);
      await kv.set('fixes:all', clean);
      return res.status(200).json({ ok: true, fixes: clean });
    } catch (err) {
      console.error('admin-fixes POST error:', err);
      return res.status(500).json({ error: 'Something went wrong saving' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
