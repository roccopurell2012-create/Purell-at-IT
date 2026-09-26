const { kv } = require('@vercel/kv');
const { escapeHtml, sendEmail, siteUrl } = require('./_lib/email');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, subject, category, priority, urgent, message, attachment, contactMethod } = req.body || {};

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'Name, email, subject and message are required' });
  }

  try {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const cleanEmail = String(email).toLowerCase().trim();
    const cleanContactMethod = contactMethod === 'chat' ? 'chat' : 'email';

    const ticket = {
      id,
      name: String(name).trim(),
      email: cleanEmail,
      subject: String(subject).trim(),
      category: category || 'Other',
      priority: priority || 'Normal',
      urgent: !!urgent,
      message: String(message).trim(),
      attachment: attachment || null,
      status: 'open',
      contactMethod: cleanContactMethod,
      createdAt: new Date().toISOString(),
    };

    await kv.set(`ticket:${id}`, ticket);

    const indexKey = `index:${cleanEmail}`;
    const ids = (await kv.get(indexKey)) || [];
    ids.push(id);
    await kv.set(indexKey, ids);

    // maintain a global index so the admin view can list every ticket
    const allIds = (await kv.get('index:all')) || [];
    allIds.push(id);
    await kv.set('index:all', allIds);

    // set up a private chat + long-lived token if the client chose that
    let chatLink = null;
    if (cleanContactMethod === 'chat') {
      const chatToken = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
      await kv.set(`chattoken:${chatToken}`, { ticketId: id, email: cleanEmail }, { ex: 60 * 60 * 24 * 60 }); // 60 days
      await kv.set(`chattoken-by-ticket:${id}`, chatToken, { ex: 60 * 60 * 24 * 60 });
      chatLink = `${siteUrl(req)}/chat.html?token=${chatToken}`;
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      await sendEmail({
        to: adminEmail,
        subject: `New ticket: ${ticket.subject}${ticket.urgent ? ' (URGENT)' : ''}`,
        html: `
          <p><strong>From:</strong> ${escapeHtml(ticket.name)} (${escapeHtml(ticket.email)})</p>
          <p><strong>Category:</strong> ${escapeHtml(ticket.category)} &nbsp;•&nbsp; <strong>Priority:</strong> ${escapeHtml(ticket.priority)}${ticket.urgent ? ' &nbsp;•&nbsp; <strong style="color:#c0392b">URGENT</strong>' : ''}</p>
          <p><strong>Follow-up:</strong> ${cleanContactMethod === 'chat' ? 'Private chat on the site' : 'Email'}</p>
          <p><strong>Subject:</strong> ${escapeHtml(ticket.subject)}</p>
          <p style="white-space:pre-wrap">${escapeHtml(ticket.message)}</p>
          <p style="color:#888;font-size:12px">Ticket ID: ${id}</p>
        `,
      });
    } else {
      console.warn('ADMIN_EMAIL not set — skipping admin notification email');
    }

    // confirmation email to the client, always sent
    await sendEmail({
      to: cleanEmail,
      subject: `We've got your ticket: ${ticket.subject}`,
      html: `
        <p>Hi ${escapeHtml(ticket.name)},</p>
        <p>This is a confirmation of the ticket you just submitted:</p>
        <p><strong>Subject:</strong> ${escapeHtml(ticket.subject)}</p>
        <p><strong>Category:</strong> ${escapeHtml(ticket.category)} &nbsp;•&nbsp; <strong>Priority:</strong> ${escapeHtml(ticket.priority)}</p>
        <p style="white-space:pre-wrap">${escapeHtml(ticket.message)}</p>
        ${
          chatLink
            ? `<p>You chose to follow up in a private chat. Open it here:</p><p><a href="${chatLink}">${chatLink}</a></p><p>Keep this email — this link is how you get back into the chat.</p>`
            : `<p>We'll follow up with you by email at this address.</p>`
        }
        <p style="color:#888;font-size:12px">Ticket ID: ${id}</p>
      `,
    });

    return res.status(200).json({ ok: true, id });
  } catch (err) {
    console.error('submit-ticket error:', err);
    return res.status(500).json({ error: 'Something went wrong saving your ticket' });
  }
};
