const ResendEmailProvider = require('./providers/ResendEmailProvider');
const { TestOutboxProvider, ConsoleProvider } = require('./providers/devProviders');

/**
 * Email delivery abstraction. Features that need email (currently: password reset) ask
 * getEmailProvider(); when it returns null, email is NOT configured and those features report
 * themselves as unavailable instead of pretending a message was sent.
 *
 *   EMAIL_PROVIDER unset / "none"  -> no email (default; nothing is ever sent)
 *   EMAIL_PROVIDER=resend          -> Resend; needs EMAIL_API_KEY and EMAIL_FROM
 *   EMAIL_PROVIDER=console         -> development only: prints to the local terminal
 *   EMAIL_PROVIDER=test            -> automated tests only: in-memory outbox
 *
 * Adding another provider (SendGrid, SES, SMTP...) means one class with name() and
 * send({to, subject, text, html}) plus one case below.
 */

const isProduction = () => process.env.NODE_ENV === 'production';
let cached = { key: null, provider: null };

function build() {
  const kind = (process.env.EMAIL_PROVIDER || 'none').trim().toLowerCase();
  const key = `${kind}|${process.env.NODE_ENV}|${process.env.EMAIL_API_KEY ? 'k' : ''}|${process.env.EMAIL_FROM || ''}`;
  if (cached.key === key) return cached.provider;

  let provider = null;
  if (kind === 'resend') {
    try {
      provider = new ResendEmailProvider({ apiKey: (process.env.EMAIL_API_KEY || '').trim(), from: (process.env.EMAIL_FROM || '').trim() });
    } catch (err) {
      console.error(`[email] EMAIL_PROVIDER=resend but it cannot start (${err.message}). Email features are unavailable.`);
    }
  } else if (kind === 'console' || kind === 'test') {
    const allowed = kind === 'console' ? process.env.NODE_ENV === 'development' : process.env.NODE_ENV === 'test';
    if (allowed) {
      provider = kind === 'test' ? (cached.provider && cached.provider.name() === 'test' ? cached.provider : new TestOutboxProvider()) : new ConsoleProvider();
    } else {
      console.error(`[email] EMAIL_PROVIDER=${kind} is not allowed with NODE_ENV=${process.env.NODE_ENV || 'unset'}. Email features are unavailable.`);
    }
  } else if (kind !== 'none') {
    console.error(`[email] Unknown EMAIL_PROVIDER "${kind}". Email features are unavailable.`);
  }

  cached = { key, provider };
  return provider;
}

const getEmailProvider = () => build();
const isEmailConfigured = () => Boolean(build());

/** Sends a message through the configured provider. Throws if none is configured or delivery fails. */
async function sendEmail(message) {
  const provider = build();
  if (!provider) throw new Error('Email is not configured.');
  return provider.send(message);
}

module.exports = { getEmailProvider, isEmailConfigured, sendEmail, isProduction };
