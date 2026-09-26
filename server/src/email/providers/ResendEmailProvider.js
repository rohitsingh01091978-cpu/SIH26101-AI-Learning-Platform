// Resend (https://resend.com) adapter. INERT unless EMAIL_PROVIDER=resend with EMAIL_API_KEY and
// EMAIL_FROM configured as server environment variables. It has been exercised only against a
// mocked HTTP endpoint - it has NOT been run against the real Resend service.
//
// Errors are deliberately generic: the API key, the recipient, the message body (which contains the
// reset link) and Resend's response text are never included in errors or logs.
const TIMEOUT_MS = 10000;
const ENDPOINT = 'https://api.resend.com/emails';

class ResendEmailProvider {
  constructor({ apiKey, from }) {
    if (!apiKey || !from) throw new Error('Resend is not configured (EMAIL_API_KEY / EMAIL_FROM missing).');
    this.apiKey = apiKey;
    this.from = from;
  }

  name() {
    return 'resend';
  }

  async send({ to, subject, text, html }) {
    let response;
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify({ from: this.from, to: [to], subject, text, html }),
      });
    } catch {
      throw new Error('Email provider request failed.');
    }
    if (!response.ok) {
      await response.text().catch(() => ''); // drained and discarded
      throw new Error(`Email provider returned HTTP ${response.status}.`);
    }
    const data = await response.json().catch(() => ({}));
    return { id: data && data.id ? String(data.id) : null };
  }
}

module.exports = ResendEmailProvider;
