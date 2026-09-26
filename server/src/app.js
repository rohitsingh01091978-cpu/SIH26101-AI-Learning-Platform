const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { describeStorage } = require('./storage');

const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const isProduction = process.env.NODE_ENV === 'production';

const app = express();

// Railway (and most PaaS hosts) terminate TLS at a reverse proxy.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ---------- Security headers ----------
// This service only returns JSON (the React app is served by Vercel), so
// Helmet's defaults are safe. The one override: the API is called cross-origin
// from the Vercel domain, so its responses must not carry
// Cross-Origin-Resource-Policy: same-origin. Who may read them is decided by CORS below.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// ---------- CORS ----------
// FRONTEND_URL may hold one origin or a comma-separated list. CLIENT_URL is
// still honoured as a legacy alias. Localhost origins are only allowed
// outside production. A wildcard is never accepted.
const normalizeOrigin = (o) => o.trim().replace(/\/+$/, '');
const allowedOrigins = (process.env.FRONTEND_URL || process.env.CLIENT_URL || '')
  .split(',')
  .map(normalizeOrigin)
  .filter((o) => o && o !== '*');
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
    maxAge: 600,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(isProduction ? 'combined' : 'dev'));
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'SIH26101 AI Learning & Competency Intelligence Platform API',
    aiProvider: process.env.AI_PROVIDER || 'demo',
    // status word only: never a path
    storage: describeStorage().configured ? 'configured' : 'not-configured',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = { app, allowedOrigins };
