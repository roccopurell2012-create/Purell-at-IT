const { kv } = require('@vercel/kv');

const DEFAULT_FIXES = [
  { title: 'Computer running slow', body: 'Restart it first — this clears memory that background apps have quietly eaten up. If it is still sluggish, check Task Manager (Windows) or Activity Monitor (Mac) for a single process using unusually high CPU, and confirm you have at least 10–15% of your drive free, since a nearly-full disk slows everything down.' },
  { title: 'Wi-Fi will not connect', body: 'Toggle Wi-Fi off and on, then forget the network and rejoin it so it re-authenticates. If other devices are also struggling, the router likely needs a restart — unplug it for 10 seconds before powering it back on.' },
  { title: "Can't log in to an account", body: 'Double-check caps lock and any leading/trailing spaces pasted into the password field. Use "Forgot password" to reset if you are still locked out, and confirm the account is not temporarily locked from too many failed attempts.' },
  { title: 'Printer not printing', body: 'Confirm the printer shows "Ready" and not "Paused" or "Offline" in your system\'s printer settings, then clear the print queue and resend the job. A restart of both the printer and your computer resolves most stuck-queue issues.' },
  { title: 'Email not syncing', body: 'Check that you have an internet connection, then remove and re-add the email account in your mail app — this forces a fresh sync. If it is a work account, confirm your password has not expired.' },
  { title: 'App keeps crashing', body: 'Update the app to the latest version first, since most crashes are fixed in a later release. If that does not help, restart your device, and if the crash is tied to one specific file or action, try reproducing it after a fresh restart to see if it is consistent.' },
  { title: 'Screen frozen or unresponsive', body: 'Give it 30 seconds — background updates can freeze the interface temporarily. If nothing changes, force a restart (hold the power button 10 seconds on most devices), then check Task Manager or Activity Monitor for the culprit app after it comes back.' },
  { title: 'Forgotten password for a shared tool', body: 'Use the tool\'s own password reset flow tied to your work email rather than asking a colleague — this keeps the account tied to you specifically. If there is no self-service reset, submit a ticket with the tool name and your account email.' },
];

module.exports = async (req, res) => {
  try {
    const fixes = await kv.get('fixes:all');
    return res.status(200).json({ ok: true, fixes: fixes || DEFAULT_FIXES });
  } catch (err) {
    console.error('get-fixes error:', err);
    // fail open with the defaults rather than breaking the page
    return res.status(200).json({ ok: true, fixes: DEFAULT_FIXES });
  }
};
