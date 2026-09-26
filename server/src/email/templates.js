// Email content. Plain text is the primary version; the HTML is a minimal equivalent.
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function passwordReset({ name, link, ttlMinutes }) {
  const greeting = name ? `Hello ${name},` : 'Hello,';
  const subject = 'Reset your password - SIH26101 Learning & Competency Platform';
  const text = [
    greeting,
    '',
    'We received a request to reset the password for your SIH26101 account.',
    `Use this link within ${ttlMinutes} minutes to choose a new password:`,
    '',
    link,
    '',
    'The link works once. If you did not ask for this, you can ignore this email: your password will not change.',
    '',
    'SIH26101 AI Learning & Competency Intelligence Platform',
  ].join('\n');
  const html =
    `<p>${escapeHtml(greeting)}</p>` +
    '<p>We received a request to reset the password for your SIH26101 account.</p>' +
    `<p>Use this link within ${ttlMinutes} minutes to choose a new password:</p>` +
    `<p><a href="${escapeHtml(link)}">Reset your password</a></p>` +
    '<p>The link works once. If you did not ask for this, you can ignore this email: your password will not change.</p>' +
    '<p>SIH26101 AI Learning &amp; Competency Intelligence Platform</p>';
  return { subject, text, html };
}

module.exports = { passwordReset };
