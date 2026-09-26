const { kv } = require('@vercel/kv');
const { resolveChatIdentity } = require('./_lib/auth');
const { escapeHtml, sendEmail, siteUrl } = require('./_lib/email');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticketId, text } = req.body || {};
  if (!ticketId || !text || !String(text).trim()) {
    return res.status(400).json({ error: 'ticketId and text are required' });
  }

  try {
    const identity = await resolveChatIdentity(req, ticketId);
    if (!identity) {
      return res.status(401).json({ error: 'Not authorized to post in this chat' });
    }

    const ticket = await kv.get(`ticket:${ticketId}`);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const message = {
      sender: identity.role, // 'admin' or 'client'
      text: String(text).trim().slice(0, 4000),
      createdAt: new Date().toISOString(),
    };

    const messages = (await kv.get(`chat:${ticketId}`)) || [];
    messages.push(message);
    await kv.set(`chat:${ticketId}`, messages);

    // notify the other party
    if (identity.role === 'client') {
      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail) {
        await sendEmail({
          to: adminEmail,
          subject: `New chat message — ${ticket.subject}`,
          html: `
            <p>${escapeHtml(ticket.name)} replied in the chat for ticket "${escapeHtml(ticket.subject)}":</p>
            <p style="white-space:pre-wrap">${escapeHtml(message.text)}</p>
            <p><a href="${siteUrl(req)}/admin.html">Open admin</a></p>
          `,
        });
      }
    } else {
      const chatToken = await kv.get(`chattoken-by-ticket:${ticketId}`);
      if (chatToken) {
        await sendEmail({
          to: ticket.email,
          subject: `New reply on your ticket — ${ticket.subject}`,
          html: `
            <p>You have a new reply on your ticket "${escapeHtml(ticket.subject)}":</p>
            <p style="white-space:pre-wrap">${escapeHtml(message.text)}</p>
            <p><a href="${siteUrl(req)}/chat.html?token=${chatToken}">Open the chat</a></p>
          `,
        });
      }
    }

    return res.status(200).json({ ok: true, message });
  } catch (err) {
    console.error('chat-send error:', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
};
