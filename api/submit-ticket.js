const { kv } = require('@vercel/kv');
const { escapeHtml, sendEmail, siteUrl } = require('./_lib/email');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, subject, category, priority, urgent, message, attachment, contactMethod, kind, requestType, details } = req.body || {};

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'Name, email, subject and message are required' });
  }

  try {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const cleanEmail = String(email).toLowerCase().trim();
    const cleanContactMethod = contactMethod === 'chat' ? 'chat' : 'email';
    // "ticket" (something is broken) or "request" (asking for equipment/access/etc.)
    const cleanKind = kind === 'request' ? 'request' : 'ticket';

    // Keep only the filled-in detail fields, capped and stringified so the store
    // and the emails stay tidy regardless of what the form sends.
    let cleanDetails = null;
    if (cleanKind === 'request' && details && typeof details === 'object') {
      cleanDetails = {};
      for (const [k, v] of Object.entries(details)) {
        if (v === null || v === undefined || v === '' || v === false) continue;
        cleanDetails[String(k).slice(0, 60)] = String(v).slice(0, 500);
      }
      if (Object.keys(cleanDetails).length === 0) cleanDetails = null;
    }

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
      kind: cleanKind,
      requestType: cleanKind === 'request' && requestType ? String(requestType).slice(0, 80) : null,
      details: cleanDetails,
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

    // Render the structured request detail fields as an HTML list for the emails.
    const detailsHtml = ticket.details
      ? `<table style="border-collapse:collapse;font-size:14px;margin:4px 0">${Object.entries(ticket.details)
          .map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#555;vertical-align:top"><strong>${escapeHtml(k)}</strong></td><td style="padding:2px 0">${escapeHtml(v)}</td></tr>`)
          .join('')}</table>`
      : '';

    const noun = ticket.kind === 'request' ? 'request' : 'ticket';
    const typeLine = ticket.kind === 'request' && ticket.requestType
      ? `<p><strong>Request type:</strong> ${escapeHtml(ticket.requestType)}</p>`
      : '';

    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      await sendEmail({
        to: adminEmail,
        subject: `New ${noun}: ${ticket.subject}${ticket.urgent ? ' (URGENT)' : ''}`,
        html: `
          <p><strong>From:</strong> ${escapeHtml(ticket.name)} (${escapeHtml(ticket.email)})</p>
          ${typeLine}
          <p><strong>Category:</strong> ${escapeHtml(ticket.category)} &nbsp;•&nbsp; <strong>Priority:</strong> ${escapeHtml(ticket.priority)}${ticket.urgent ? ' &nbsp;•&nbsp; <strong style="color:#c0392b">URGENT</strong>' : ''}</p>
          <p><strong>Follow-up:</strong> ${cleanContactMethod === 'chat' ? 'Private chat on the site' : 'Email'}</p>
          <p><strong>Subject:</strong> ${escapeHtml(ticket.subject)}</p>
          <p style="white-space:pre-wrap">${escapeHtml(ticket.message)}</p>
          ${detailsHtml}
          ${chatLink ? `<p><strong>Chat link:</strong> <a href="${chatLink}">${chatLink}</a></p>` : ''}
          <p style="color:#888;font-size:12px">${ticket.kind === 'request' ? 'Request' : 'Ticket'} ID: ${id}</p>
        `,
      });
    } else {
      console.warn('ADMIN_EMAIL not set — skipping admin notification email');
    }

    // confirmation email to the client, always sent — just the ticket/request summary
    await sendEmail({
      to: cleanEmail,
      subject: `We've got your ${noun}: ${ticket.subject}`,
      html: `
        <p>Hi ${escapeHtml(ticket.name)},</p>
        <p>This is what you submitted:</p>
        ${typeLine}
        <p><strong>Subject:</strong> ${escapeHtml(ticket.subject)}</p>
        <p><strong>Category:</strong> ${escapeHtml(ticket.category)} &nbsp;•&nbsp; <strong>Priority:</strong> ${escapeHtml(ticket.priority)}</p>
        <p style="white-space:pre-wrap">${escapeHtml(ticket.message)}</p>
        ${detailsHtml}
        ${chatLink ? '' : `<p>We'll follow up with you by email at this address.</p>`}
        <p style="color:#888;font-size:12px">${ticket.kind === 'request' ? 'Request' : 'Ticket'} ID: ${id}</p>
      `,
    });

    // separate email with the private chat link, only when that was chosen
    if (chatLink) {
      await sendEmail({
        to: cleanEmail,
        subject: `Your private chat link — ${ticket.subject}`,
        html: `
          <p>Hi ${escapeHtml(ticket.name)},</p>
          <p>You chose to follow up in a private chat on the site. Here's your link:</p>
          <p><a href="${chatLink}">${chatLink}</a></p>
          <p>Keep this email — this link is how you get back into the chat.</p>
        `,
      });
    }

    return res.status(200).json({ ok: true, id });
  } catch (err) {
    console.error('submit-ticket error:', err);
    return res.status(500).json({ error: 'Something went wrong saving your ticket' });
  }
};
