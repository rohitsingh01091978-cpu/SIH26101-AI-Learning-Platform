require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

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

const app = express();
const PORT = process.env.PORT || 5000;

// Railway (and most PaaS hosts) terminate TLS at a reverse proxy.
app.set('trust proxy', 1);
app.disable('x-powered-by');

const uploadDir = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ---------- CORS ----------
// FRONTEND_URL may hold one origin or a comma-separated list. CLIENT_URL is
// still honoured as a legacy alias. Localhost origins are only allowed
// outside production.
const normalizeOrigin = (o) => o.trim().replace(/\/+$/, '');
const allowedOrigins = (process.env.FRONTEND_URL || process.env.CLIENT_URL || '')
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);
if (!isProduction) {
  allowedOrigins.push('http://localhost:5173', 'http://127.0.0.1:5173');
}

app.use(
  cors({
    origin: (origin, callback) => {
      // No Origin header: same-origin, curl, health checks, server-to-server.
      if (!origin || allowedOrigins.includes(normalizeOrigin(origin))) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(isProduction ? 'combined' : 'dev'));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'SIH26101 AI Learning & Competency Intelligence Platform API',
    aiProvider: process.env.AI_PROVIDER || 'demo',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT} (${isProduction ? 'production' : 'development'})`);
  console.log(`AI provider: ${process.env.AI_PROVIDER || 'demo'}`);
  console.log(`CORS allowed origins: ${allowedOrigins.join(', ') || '(none)'}`);
});

// Graceful shutdown so Railway redeploys don't drop in-flight requests.
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
