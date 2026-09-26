# Google sign-in setup

The app supports two ways to sign in: email + password, and "Continue with Google"
(OAuth 2.0 authorization-code flow with PKCE and OpenID Connect ID-token validation).
Users authenticate on Google's own page; this app never sees a Google password.

## How the flow works

1. The **Continue with Google** button is a link to `GET /api/auth/google` on the backend.
2. The backend redirects to Google with a random `state`, `nonce` and PKCE challenge
   (remembered in a short-lived, signed, HttpOnly cookie).
3. The user picks a Google account on Google's page and consents.
4. Google redirects to `GOOGLE_CALLBACK_URL` (`GET /api/auth/google/callback`).
5. The backend checks `state`, exchanges the code (using the client secret and PKCE verifier),
   and validates the ID token: signature, issuer, audience (= our client ID), expiry, `nonce`,
   and `email_verified = true`.
6. Find or create the user:
   - Known Google account -> signs in.
   - New email -> a **learner** account is created (Google sign-up can never create an admin).
   - Email already belongs to an email/password account -> the user must enter that
     account's password once to link Google (prevents someone taking over an account by
     registering an email they do not own). Nothing is overwritten.
7. The backend redirects to the frontend `/auth/callback#code=...` with a one-time,
   60-second code, which the frontend exchanges (`POST /api/auth/google/exchange`) for the same
   JWT session that email/password login uses. The JWT is never placed in a URL.

## 1. Create the Google Cloud project
1. Open <https://console.cloud.google.com/> and create (or pick) a project.

## 2. Configure the OAuth consent screen
1. **APIs & Services -> OAuth consent screen** (may appear as *Google Auth Platform -> Branding*).
2. User type: **External** (so any Google account can sign in).
3. Fill in app name, support email and developer contact email.
4. Scopes: only the defaults `openid`, `email`, `profile` are needed (no sensitive scopes).
5. While the publishing status is **Testing**, only listed *test users* can sign in.
   To let **any** Google account sign in, click **Publish app** (moves it to *In production*).
   Apps that only use `openid`/`email`/`profile` do not need Google verification.

## 3. Create the OAuth client
1. **APIs & Services -> Credentials -> Create credentials -> OAuth client ID**.
2. Application type: **Web application**.
3. **Authorized JavaScript origins** (optional for this server-side flow, but harmless):
   - `http://localhost:5173`
   - `https://<your-app>.vercel.app`
4. **Authorized redirect URIs** (required, must match `GOOGLE_CALLBACK_URL` exactly):
   - Local: `http://localhost:5000/api/auth/google/callback`
   - Production (Railway backend): `https://<your-backend>.up.railway.app/api/auth/google/callback`
5. Create, then copy the **Client ID** and **Client secret**. Keep the secret private.

## 4. Environment variables

**Local `server/.env`** (never committed):
```
GOOGLE_CLIENT_ID=<client id>
GOOGLE_CLIENT_SECRET=<client secret>
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback
FRONTEND_URL=http://localhost:5173
```

**Railway (backend service -> Variables):**
| Variable | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | client ID from step 3 |
| `GOOGLE_CLIENT_SECRET` | client secret from step 3 |
| `GOOGLE_CALLBACK_URL` | `https://<your-backend>.up.railway.app/api/auth/google/callback` |
| `FRONTEND_URL` | `https://<your-app>.vercel.app` (users return here after Google; also the CORS origin) |
| `NODE_ENV` | `production` |

**Vercel:** no Google variables at all. The frontend only needs the existing `VITE_API_URL`
(the Railway backend URL); the button links to `<VITE_API_URL>/api/auth/google`.
**Never** put the client secret in a `VITE_*` variable.

## 5. Database
This feature adds one migration (`20260926120000_add_google_auth`): `users.googleId` (unique),
`users.authProvider` (default `local`) and makes `users.password` nullable. It is additive; existing
users and passwords are untouched. Railway applies it automatically on start (`prisma migrate deploy`
is part of `npm run start:prod`).

## 6. Testing Google login manually
1. Start the backend (`cd server && npm start`) and frontend (`cd client && npm run dev`).
2. Open <http://localhost:5173/login> and click **Continue with Google**.
3. The address bar must show `accounts.google.com`. Pick an account and consent.
4. You should land on the learner dashboard. Check:
   - a new learner row exists for that email (`authProvider = google`, `password` empty);
   - `/admin` redirects you away (learners cannot open admin pages);
   - Sign out, then sign in with Google again -> same account, no duplicate.
5. Cancel on Google's page -> you return to the login page with "Google sign-in was cancelled."
6. Link flow: register an email/password account with your own Gmail address, sign out, then
   use Google with that Gmail -> you are asked for the account password once, then signed in.
7. In production repeat steps 2-4 on the Vercel URL. If Google shows `redirect_uri_mismatch`,
   the redirect URI in Google Cloud does not exactly match `GOOGLE_CALLBACK_URL`.

## Automated tests
`cd server && npm test` covers our side of the flow with Google's two network calls stubbed.
It does **not** replace step 6 above: only a real Google account proves the end-to-end login.

## Limitations
- Handoff codes are kept in memory (single backend instance; they live 60 seconds).
- There is no password reset (Google-only users have no password to reset).
