// Shared setup for the API tests. These run against a LOCAL PostgreSQL database
// that has been seeded (npm run seed). They refuse to run against anything else.
process.env.NODE_ENV = 'test';
require('dotenv').config();

// Tests store files in a throw-away directory, never in the real uploads folder / volume.
const fsSync = require('node:fs');
const osSync = require('node:os');
const pathSync = require('node:path');
if (!process.env.STORAGE_ROOT_FOR_TESTS_SET) {
  process.env.STORAGE_ROOT = fsSync.mkdtempSync(pathSync.join(osSync.tmpdir(), 'sih-test-storage-'));
  process.env.STORAGE_ROOT_FOR_TESTS_SET = '1';
  process.on('exit', () => {
    try {
      fsSync.rmSync(process.env.STORAGE_ROOT, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });
}

const dbUrl = process.env.DATABASE_URL || '';
const host = (dbUrl.match(/@([^:/?]+)/) || [])[1];
if (!['localhost', '127.0.0.1'].includes(host)) {
  throw new Error('Refusing to run tests: DATABASE_URL must point at a local database.');
}

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-not-for-production-use';
process.env.FRONTEND_URL = 'https://sih-frontend.example.vercel.app';
process.env.LOGIN_RATE_LIMIT_MAX = '5';
process.env.LOGIN_IP_RATE_LIMIT_MAX = '1000'; // keep the IP-wide layer out of the way of other tests
process.env.REGISTER_RATE_LIMIT_MAX = '1000';

const { app } = require('../src/app');
const prisma = require('../src/utils/prisma');

const LEARNER = { email: 'learner@demo.gov.in', password: 'Learner@123' };
const ADMIN = { email: 'admin@demo.gov.in', password: 'Admin@123' };

async function startServer() {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  return { server, base };
}

async function request(base, method, path, { token, body, headers = {}, raw } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload = raw;
  if (body !== undefined) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${base}${path}`, { method, headers: h, body: payload });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, data, headers: res.headers };
}

async function stop(server) {
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
}

module.exports = { LEARNER, ADMIN, startServer, request, stop };
