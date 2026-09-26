# Security notes

## Authentication
- Passwords: `bcryptjs` (cost from `BCRYPT_SALT_ROUNDS`, default 10). Never logged or returned. Unknown-email logins still run a bcrypt compare so response time does not reveal which emails exist.
- Sessions: stateless HS256 JWT (`sub`, `role`), signed with `JWT_SECRET` (env only), lifetime `JWT_EXPIRES_IN` (default `7d`). Verification pins the algorithm; the user's role is always re-read from the database.
- Login/register responses: generic `Invalid email or password.` (401); malformed input returns 400 with field/message pairs only (submitted values are never echoed).

## Google sign-in
Real OAuth 2.0 / OpenID Connect (authorization code + PKCE) via `google-auth-library`; setup in `docs/google-oauth-setup.md`.
- `state`, `nonce` and the PKCE verifier are tied to the browser by a signed HttpOnly `SameSite=Lax` cookie; the ID token's signature, issuer, audience, expiry, nonce and `email_verified` are all checked. Only Google's verified `sub`/`email` are trusted.
- Google sign-up always creates a `LEARNER`. Admins are provisioned only by the seed script.
- A verified Google email matching an existing email/password account is **not** signed in automatically (registration does not verify emails, so that would allow account pre-registration takeover). The user must enter that account's password once to link Google (rate limited like a login).
- After Google, the backend redirects with a one-time 60-second code in the URL fragment; the frontend exchanges it for the normal JWT. The JWT is never in a URL. `GOOGLE_CLIENT_SECRET` exists only in the server environment.
- Google-only accounts have no password (`password` is NULL) and cannot use password login.

## Karmayogi AI Assistant
`POST /api/assistant/chat` is learner-only and identifies the learner solely from the JWT; body fields such as `learnerId` are ignored. Answers use only that learner's data. With `AI_PROVIDER=demo` an offline rule-based engine answers (no model is involved and replies are labelled "Offline demo assistant"). With `AI_PROVIDER=external`, the learner's data (minus their name) is sent server-side to the configured model; the API key stays in the server environment and if the model fails the offline engine answers and the reply says so. Chat is rate limited per learner.

## Rate limiting (`server/src/middleware/rateLimiters.js`)
Only auth endpoints are limited; only failed logins count; blocks expire by themselves (HTTP 429 + `Retry-After`).

| Variable | Default | Meaning |
|---|---|---|
| `LOGIN_RATE_LIMIT_WINDOW_MINUTES` | 15 | window |
| `LOGIN_RATE_LIMIT_MAX` | 5 | failed logins per IP + email per window |
| `LOGIN_IP_RATE_LIMIT_MAX` | 30 | failed logins per IP per window |
| `REGISTER_RATE_LIMIT_MAX` | 20 | sign-ups per IP per hour |
| `GOOGLE_RATE_LIMIT_MAX` | 60 | Google flow requests per IP per window (linking also uses `LOGIN_RATE_LIMIT_MAX` failed attempts) |

The store is in memory (single instance; resets on restart).

## Token storage — known tradeoff
The JWT lives in `localStorage` (or `sessionStorage` when "Remember me" is unchecked) and is sent as `Authorization: Bearer`. Unlike an HttpOnly cookie, page JavaScript can read it, so an XSS bug could steal it. HttpOnly cookies were **not** adopted because the frontend (Vercel) and API (Railway) are on different sites: cookies would need `SameSite=None` (blocked by many browsers as third-party cookies) plus CSRF protection. Mitigations: React escapes output, no `dangerouslySetInnerHTML`, Helmet/security headers on the API, and a configurable token lifetime.

Logout clears the token from both storages and signs out other open tabs. Because JWTs are stateless, a copied token stays valid until it expires; lower `JWT_EXPIRES_IN` to shorten that window.

## Tests
`cd server && npm test` (auth/RBAC/CORS/rate-limit) and `npm run test:flow` (full demo flow; writes rows). Both require a **local**, seeded database and refuse to run otherwise.
