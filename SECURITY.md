# Security notes

## Authentication
- Passwords: `bcryptjs` (cost from `BCRYPT_SALT_ROUNDS`, default 10). Never logged or returned. Unknown-email logins still run a bcrypt compare so response time does not reveal which emails exist.
- Sessions: stateless HS256 JWT (`sub`, `role`), signed with `JWT_SECRET` (env only), lifetime `JWT_EXPIRES_IN` (default `7d`). Verification pins the algorithm; the user's role is always re-read from the database.
- Login/register responses: generic `Invalid email or password.` (401); malformed input returns 400 with field/message pairs only (submitted values are never echoed).

## Rate limiting (`server/src/middleware/rateLimiters.js`)
Only auth endpoints are limited; only failed logins count; blocks expire by themselves (HTTP 429 + `Retry-After`).

| Variable | Default | Meaning |
|---|---|---|
| `LOGIN_RATE_LIMIT_WINDOW_MINUTES` | 15 | window |
| `LOGIN_RATE_LIMIT_MAX` | 5 | failed logins per IP + email per window |
| `LOGIN_IP_RATE_LIMIT_MAX` | 30 | failed logins per IP per window |
| `REGISTER_RATE_LIMIT_MAX` | 20 | sign-ups per IP per hour |

The store is in memory (single instance; resets on restart).

## Token storage — known tradeoff
The JWT lives in `localStorage` (or `sessionStorage` when "Remember me" is unchecked) and is sent as `Authorization: Bearer`. Unlike an HttpOnly cookie, page JavaScript can read it, so an XSS bug could steal it. HttpOnly cookies were **not** adopted because the frontend (Vercel) and API (Railway) are on different sites: cookies would need `SameSite=None` (blocked by many browsers as third-party cookies) plus CSRF protection. Mitigations: React escapes output, no `dangerouslySetInnerHTML`, Helmet/security headers on the API, and a configurable token lifetime.

Logout clears the token from both storages and signs out other open tabs. Because JWTs are stateless, a copied token stays valid until it expires; lower `JWT_EXPIRES_IN` to shorten that window.

## Tests
`cd server && npm test` (auth/RBAC/CORS/rate-limit) and `npm run test:flow` (full demo flow; writes rows). Both require a **local**, seeded database and refuse to run otherwise.
