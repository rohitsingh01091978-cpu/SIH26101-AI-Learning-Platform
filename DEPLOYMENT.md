# Deployment Guide — SIH26101

Frontend → **Vercel** · Backend → **Railway** · Database → **Railway PostgreSQL**

The repo is a monorepo: `client/` (React + Vite) and `server/` (Express + Prisma).
Each platform is pointed at its own sub-folder ("Root Directory").

---

# PART A — LOCAL DEVELOPMENT

```bash
# 1. Backend
cd server
npm install
cp ../.env.example .env        # set DATABASE_URL and JWT_SECRET
npx prisma migrate dev         # applies the 3 existing migrations to your local DB
npm run seed                   # competency framework, prototype iGOT catalog, demo accounts
npm run dev                    # http://localhost:5000  (health: /api/health)

# 2. Frontend (new terminal)
cd client
npm install
npm run dev                    # http://localhost:5173
```

- Leave `VITE_API_URL` **unset** locally. The frontend calls `/api`, and `vite.config.js` proxies it to `localhost:5000`.
- CORS automatically allows `http://localhost:5173` when `NODE_ENV` is not `production`.

---

# PART B — PRODUCTION DEPLOYMENT

Order matters: **database → backend → frontend → back to backend (FRONTEND_URL)**.

## B1. GitHub repository

This folder is not yet a git repository.

```bash
cd SIH26101
git init
git add .
git status            # confirm NO .env file and NO server/uploads/* files are listed
git commit -m "Prepare for deployment"
git branch -M main
# create an empty repo on github.com first, then:
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

`.gitignore` already excludes `.env`, `node_modules/`, `client/dist/` and uploaded files. If `git status` shows `server/.env`, stop and fix `.gitignore` before pushing.

## B2. Railway — create PostgreSQL

1. railway.app → **New Project** → **Provision PostgreSQL**.
2. Keep this project open; the backend service goes into the **same project**.

## B3. Railway — deploy the backend

1. In the same project: **New** → **GitHub Repo** → select your repo.
2. Service **Settings** → **Root Directory** = `server`.
   (`server/railway.json` then supplies the start command and health check.)
3. **Variables** tab — add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Railway reference variable; replace `Postgres` with your DB service name) |
| `JWT_SECRET` | 48+ random chars (see below) |
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | your Vercel URL — set it after B5; use a placeholder for the first deploy |
| `AI_PROVIDER` | `demo` (or `external` + `EXTERNAL_AI_API_KEY`, `EXTERNAL_AI_BASE_URL`, `EXTERNAL_AI_MODEL`) |

Generate a secret locally:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

In production the server **refuses to start** if `JWT_SECRET` is missing, shorter than 32 characters, or still the placeholder from `.env.example`, or if `DATABASE_URL` is missing.

Do **not** set `PORT` — Railway injects it.

4. **Settings → Networking → Generate Domain**. Copy the URL, e.g. `https://sih26101-server.up.railway.app`. This is your **backend public URL**.

## B4. Prisma migrations and seed data

**Migrations run automatically.** The start command (`npm run start:prod`) runs `prisma migrate deploy` and then starts the server. `migrate deploy` only applies pending migrations; it never resets or drops data. The equivalent manual command is `npx prisma migrate deploy` from `server/`.

**Seed (one time only).** The competency framework, prototype iGOT catalog and demo accounts live in the database, so a fresh DB needs the seed once. Railway's `DATABASE_URL` uses an internal hostname that is not reachable from your laptop, so use the database's **public** URL (Postgres service → **Variables** → `DATABASE_PUBLIC_URL`):

```powershell
# PowerShell, from the server/ folder
$env:DATABASE_URL = "<DATABASE_PUBLIC_URL from Railway>"
npm run seed
Remove-Item Env:DATABASE_URL
```

```bash
# bash
cd server && DATABASE_URL="<DATABASE_PUBLIC_URL>" npm run seed
```

Do not re-run the seed against a database with real user activity: it deletes and re-creates the prototype course catalog (linked progress/recommendation rows are detached, `onDelete: SetNull`) and re-applies the demo accounts.

**Verify the backend:**

```bash
curl https://<backend-url>/api/health
# {"status":"ok", ... "aiProvider":"demo"}
```

## B5. Vercel — deploy the frontend

1. vercel.com → **Add New… → Project** → import the same GitHub repo.
2. **Root Directory** = `client`. Framework preset: **Vite** (auto-detected).
   Build command `npm run build`, output directory `dist` (also set in `client/vercel.json`).
3. **Environment Variables** (Production):

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://<backend-url>` (the Railway domain; `/api` is appended automatically, so `https://<backend-url>/api` also works) |

4. **Deploy**. Copy the production URL, e.g. `https://sih26101.vercel.app`.

`client/vercel.json` rewrites every path to `index.html`, so deep links and page refreshes (`/dashboard`, `/materials/123`) work with React Router.

`VITE_API_URL` is read **at build time**. If you change it, redeploy the frontend.

## B6. CORS — connect the two

1. Railway → backend service → Variables → set `FRONTEND_URL` to the exact Vercel origin, no trailing slash: `https://sih26101.vercel.app`.
   Multiple origins (e.g. a custom domain as well) can be comma-separated.
2. Railway redeploys automatically.

In production only the origins in `FRONTEND_URL` are allowed; localhost is **not**. Vercel *preview* deployment URLs (`*-git-branch-*.vercel.app`) are different origins and will be blocked unless you add them explicitly — test on the production URL.

## B7. Final testing checklist

1. `https://<backend-url>/api/health` returns `status: ok`.
2. Open the Vercel URL → redirected to `/login`.
3. Browser DevTools → Network: login request goes to `https://<backend-url>/api/auth/login`, status 200, no CORS error in the console.
4. Log in as learner → Dashboard loads. Refresh the page on `/dashboard` → still works (rewrite rule).
5. Walk the demo flow: Profile → Assessment → Skill Gaps → upload a PDF/DOCX/TXT → Analyze → Insights → Generate MCQs → Adaptive Quiz → Results → Learning Path → iGOT Courses → Progress.
6. Log out, log in as admin → Admin dashboard loads. A learner opening `/admin` is redirected away.
7. Railway → backend → **Deploy Logs** shows `AI provider: demo` and the expected `CORS allowed origins`.

---

# Reference

## Environment variables

**Backend (Railway):** `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, `NODE_ENV=production` (required) · `PORT` (injected) · `AI_PROVIDER`, `EXTERNAL_AI_API_KEY`, `EXTERNAL_AI_BASE_URL`, `EXTERNAL_AI_MODEL` · `JWT_EXPIRES_IN`, `BCRYPT_SALT_ROUNDS`, `MAX_UPLOAD_SIZE_MB`, `UPLOAD_DIR` · `IGOT_API_BASE_URL`, `IGOT_API_KEY` (unused by the prototype).

**Frontend (Vercel):** `VITE_API_URL` only.

## Known deployment considerations

- **Cloud persistence consideration: uploaded files stored on local filesystem may not persist across deployments/restarts.** Uploads use multer disk storage (`server/uploads`). Railway container disks are ephemeral. Impact today is limited: the extracted text and the analysis are saved in PostgreSQL, and no code re-reads the original file after extraction, so analysis, quizzes and recommendations keep working. The original file itself is lost on redeploy. To keep originals, attach a Railway **Volume** mounted at `/app/uploads` (or move to object storage in a future change).
- **Demo accounts are shown on the login page** (`learner@demo.gov.in`, `admin@demo.gov.in`, with the passwords in the seed script). On a public URL anyone can sign in as the admin. Fine for a supervised demo; before sharing the link widely, change those passwords in the database or remove the demo-credentials panel.
- **AI labelling:** with `AI_PROVIDER=demo` the app uses the built-in rule-based `DemoAIProvider`; it is not a live LLM. `external` falls back to demo if the provider is unconfigured or fails.
- **iGOT:** the course catalog is a prototype/integration-ready catalog stored in the database. No live iGOT/Karmayogi API is called.
- No login rate limiting is implemented; consider adding it before high-traffic use.
