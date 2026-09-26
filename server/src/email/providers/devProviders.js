// Providers that never touch the network. Each is refused in production (see email/index.js).

// NODE_ENV=test only: keeps sent mail in memory so automated tests can read the message.
class TestOutboxProvider {
  constructor() {
    this.outbox = [];
  }

  name() {
    return 'test';
  }

  async send(message) {
    this.outbox.push({ ...message, sentAt: new Date() });
    return { id: `test-${this.outbox.length}` };
  }
}

// NODE_ENV=development only, explicit opt-in (EMAIL_PROVIDER=console): prints the message to the LOCAL
// terminal so a developer can click the link. This is the one place a reset link (which contains the
// token) is ever printed - never in production, where this provider is refused.
class ConsoleProvider {
  name() {
    return 'console';
  }

  async send({ to, subject, text }) {
    console.log(`\n[email:console] (development only) To: ${to}\nSubject: ${subject}\n${text}\n`);
    return { id: 'console' };
  }
}

module.exports = { TestOutboxProvider, ConsoleProvider };
