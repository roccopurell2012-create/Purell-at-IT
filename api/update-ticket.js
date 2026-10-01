const { kv } = require('@vercel/kv');
const { escapeHtml, sendEmail } = require('./_lib/email');

const VALID_STATUSES = ['open', 'in_progress', 'fixed', 'approved', 'denied'];

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

    // let the client know when a request is approved or denied
    if (status === 'approved' || status === 'denied') {
      await sendEmail({
        to: ticket.email,
        subject: `Your request was ${status}: ${ticket.subject}`,
        html: `
          <p>Hi ${escapeHtml(ticket.name)},</p>
          <p>Your request "<strong>${escapeHtml(ticket.subject)}</strong>" has been <strong>${status}</strong>.</p>
          <p style="color:#888;font-size:12px">Request ID: ${id}</p>
        `,
      });
    }

    return res.status(200).json({ ok: true, ticket });
  } catch (err) {
    console.error('update-ticket error:', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
};
