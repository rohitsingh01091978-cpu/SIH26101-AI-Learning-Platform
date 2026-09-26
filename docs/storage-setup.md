# File storage (Railway Volume)

Uploaded learning material (PDF, DOCX, TXT) is kept on a **Railway Volume**, not on the container's own disk
(which is erased on every redeploy). Only metadata is in PostgreSQL; the extracted text and AI analysis stay in
PostgreSQL as before.

## How it works
- `POST /api/materials/upload` validates the file (extension **and** real file signature), extracts the text in
  memory, then stores the file under a server-generated key: `users/<userId>/<random-uuid>.<pdf|docx|txt>`.
  The client's filename is only kept, sanitised, for display and for the download header. It never becomes a path.
- `GET /api/materials/:id/file` streams the original to its owner. `DELETE /api/materials/:id` removes the file,
  extracted text and analysis (generated quizzes and results are kept). Both look the material up by
  **id AND the signed-in user**, so someone else's file is indistinguishable from a missing one (404).
- Files are never exposed as URLs. Nothing in any API response contains a filesystem path or storage key.
- The code talks to storage only through a small interface (`server/src/storage`): `put`, `get`, `delete`,
  `healthCheck`, `list`. An S3-compatible provider can be added later by implementing those five methods.

## Railway setup (manual, once)
1. Railway project -> the **backend service** -> **Settings -> Volumes** (or right-click the service canvas ->
   *Attach Volume*) -> **Create/Attach Volume**. Choose a mount path, e.g. `/data`, and a size.
2. Railway then injects `RAILWAY_VOLUME_MOUNT_PATH` into the service. Files are stored in `<mount>/uploads`.
   (To choose the folder yourself instead, set the variable `STORAGE_ROOT=/data/uploads`.)
3. **Do this before deploying this version.** In production the app deliberately refuses uploads (HTTP 503,
   "File storage is temporarily unavailable") when no volume is configured, rather than quietly using the
   ephemeral disk. `STORAGE_ALLOW_EPHEMERAL=true` overrides that (not recommended: files vanish on redeploy).
4. Redeploy. The service log should show `[storage] OK (source: RAILWAY_VOLUME_MOUNT_PATH, persistent: true)`, and
   `GET /api/health` should report `"storage":"configured"`.
5. If the log says the location is not usable (permission denied), the app process may not be allowed to write to the
   volume. Railway mounts volumes as root; if your service runs as a non-root user, set `RAILWAY_RUN_UID=0` (see
   Railway's volume documentation).

Notes to verify in Railway's own docs/plan: volume size limits, whether volumes are backed up on your plan, and that
a service with a volume runs a single replica and may have a brief interruption while redeploying.

## Verifying it
Run inside the Railway service shell (or locally with the same variables):

    npm run storage:check      # shows configuration, persistence, and does a write/read/delete probe
    npm run storage:cleanup    # dry run: lists files no database record points to (older than 24h)
    npm run storage:cleanup -- --apply --min-age-hours 48   # actually delete such orphans

## Existing uploads
Materials uploaded **before** this change have no stored file (they were on the ephemeral disk). They keep their
extracted text, analysis and quizzes; the UI simply does not offer *Download* for them (their *Delete* still works).
No existing database row is changed by the migration.

## Environment variables
| Variable | Default | Meaning |
|---|---|---|
| `RAILWAY_VOLUME_MOUNT_PATH` | set by Railway | volume mount; files go in `<mount>/uploads` |
| `STORAGE_ROOT` | - | explicit storage folder (wins over the variable above) |
| `STORAGE_PROVIDER` | `volume` | only `volume` exists today |
| `STORAGE_ALLOW_EPHEMERAL` | unset | `true` = allow non-persistent storage in production (not recommended) |
| `MAX_UPLOAD_SIZE_MB` | `10` | upload size limit (over it: HTTP 413) |
| `UPLOAD_RATE_LIMIT_PER_MINUTE` | `10` | per-user uploads per minute |
| `FILE_ACCESS_RATE_LIMIT_PER_MINUTE` | `30` | per-user downloads/deletes per minute |

## Limitations
- No antivirus scanning yet (validation is by extension + file signature; files are never executed or served inline).
- Not multi-replica safe (a volume attaches to one instance).
- Deleting a user account (no such feature yet) would not remove that user's files automatically.
