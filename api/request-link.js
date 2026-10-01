const { kv } = require('@vercel/kv');
const { sendEmail, siteUrl } = require('./_lib/email');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body || {};
  if (!email || !String(email).includes('@')) {
    return res.status(400).json({ error: 'A valid email is required' });
  }

  try {
    const cleanEmail = String(email).toLowerCase().trim();
    const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;

    // one-time, 15-minute token
    await kv.set(`linktoken:${token}`, { email: cleanEmail }, { ex: 60 * 15 });

    const link = `${siteUrl(req)}/?token=${token}`;
    await sendEmail({
      to: cleanEmail,
      subject: 'Your sign-in link — IT Ticket Desk',
      html: `
        <p>Click below to view your tickets and requests:</p>
        <p><a href="${link}">${link}</a></p>
        <p>This link expires in 15 minutes and works once.</p>
      `,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('request-link error:', err);
    return res.status(500).json({ error: 'Something went wrong sending the link' });
  }
};
