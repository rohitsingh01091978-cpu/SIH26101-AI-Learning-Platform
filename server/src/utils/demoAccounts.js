// Demo accounts (seeded @demo.gov.in users) have publicly documented credentials, so they must
// not be usable on a real deployment. Nothing here touches the database: the accounts and their
// data stay exactly as they are; sign-in through them is simply refused when disabled.
//
//   DEMO_ACCOUNTS_ENABLED=true   demo accounts may sign in
//   DEMO_ACCOUNTS_ENABLED=false  demo accounts are blocked
//   (unset)                      enabled in development/test, BLOCKED in production
const DEMO_DOMAIN = '@demo.gov.in';

const isDemoEmail = (email) => typeof email === 'string' && email.trim().toLowerCase().endsWith(DEMO_DOMAIN);

function demoAccountsEnabled() {
  const flag = (process.env.DEMO_ACCOUNTS_ENABLED || '').trim().toLowerCase();
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

// True when this user must be refused because demo accounts are switched off.
const isBlockedDemoUser = (user) => Boolean(user) && isDemoEmail(user.email) && !demoAccountsEnabled();

module.exports = { isDemoEmail, demoAccountsEnabled, isBlockedDemoUser, DEMO_DOMAIN };
