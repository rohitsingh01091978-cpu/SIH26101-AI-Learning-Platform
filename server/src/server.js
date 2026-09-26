require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

// ---------- Environment validation (fail fast with a clear message) ----------
function validateEnv() {
  const problems = [];
  if (!process.env.DATABASE_URL) problems.push('DATABASE_URL is not set.');
  if (!process.env.JWT_SECRET) {
    problems.push('JWT_SECRET is not set.');
  } else if (isProduction) {
    const secret = process.env.JWT_SECRET;
    if (secret.length < 32 || /change-this|changeme/i.test(secret)) {
      problems.push('JWT_SECRET must be a long random string (32+ chars) in production.');
    }
  }
  if (problems.length) {
    console.error('[startup] Invalid environment configuration:');
    problems.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }
  if (isProduction && !process.env.FRONTEND_URL && !process.env.CLIENT_URL) {
    console.warn('[startup] FRONTEND_URL is not set - browsers will be blocked by CORS.');
  }
}
validateEnv();

const { app, allowedOrigins } = require('./app');
const { demoAccountsEnabled } = require('./utils/demoAccounts');
const { describeStorage, getStorage } = require('./storage');

if (isProduction) {
  if (process.env.AI_PROVIDER !== 'external') {
    console.warn('[startup] WARNING: production is running the offline DEMO AI provider. Set AI_PROVIDER=external with AI_API_KEY / AI_BASE_URL / AI_MODEL for real AI.');
  }
  if (demoAccountsEnabled()) {
    console.warn('[startup] WARNING: DEMO_ACCOUNTS_ENABLED=true - demo accounts with publicly documented passwords can sign in.');
  } else {
    console.log('[startup] Demo accounts are disabled (default in production).');
  }
}

const PORT = process.env.PORT || 5000;

// Verify file storage once at start-up (write/read/delete probe). Never blocks or crashes the server:
// if storage is unusable, uploads answer 503 and this log says why.
async function verifyStorage() {
  const info = describeStorage();
  if (!info.configured) {
    console.error('[storage] WARNING: no persistent storage configured - file uploads are disabled. Attach a Railway Volume or set STORAGE_ROOT.');
    return;
  }
  if (!info.persistent) console.warn(`[storage] WARNING: storage is NOT persistent (${info.source}); uploaded files will be lost on redeploy.`);
  try {
    await getStorage().healthCheck();
    console.log(`[storage] OK (source: ${info.source}, persistent: ${info.persistent})`);
  } catch (err) {
    console.error(`[storage] ERROR: the storage location is not usable (${err.code || err.message}). File uploads will fail until this is fixed.`);
  }
}

const server = app.listen(PORT, () => {
  verifyStorage();
  console.log(`API server listening on port ${PORT} (${isProduction ? 'production' : 'development'})`);
  console.log(`AI provider: ${process.env.AI_PROVIDER || 'demo'}`);
  console.log(`CORS allowed origins: ${allowedOrigins.join(', ') || '(none)'}`);
});

// Graceful shutdown so Railway redeploys don't drop in-flight requests.
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
