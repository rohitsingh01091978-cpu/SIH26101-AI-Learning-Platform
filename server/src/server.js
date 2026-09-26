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

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT} (${isProduction ? 'production' : 'development'})`);
  console.log(`AI provider: ${process.env.AI_PROVIDER || 'demo'}`);
  console.log(`CORS allowed origins: ${allowedOrigins.join(', ') || '(none)'}`);
});

// Graceful shutdown so Railway redeploys don't drop in-flight requests.
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
