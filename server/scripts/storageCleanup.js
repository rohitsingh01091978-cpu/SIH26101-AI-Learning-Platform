#!/usr/bin/env node
// Finds stored files that no database record points to ("orphans", e.g. from a crash between storing a
// file and saving its record) and, only with --apply, deletes them. Also reports records whose file is missing.
//
//   npm run storage:cleanup                      dry run (lists only)
//   npm run storage:cleanup -- --apply           delete orphans
//   npm run storage:cleanup -- --min-age-hours 48
//
// Files younger than --min-age-hours (default 24) are never touched, so an upload in progress is safe.
require('dotenv').config();
const prisma = require('../src/utils/prisma');
const { getStorage } = require('../src/storage');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const ageIdx = args.indexOf('--min-age-hours');
const minAgeHours = ageIdx > -1 && Number(args[ageIdx + 1]) >= 0 ? Number(args[ageIdx + 1]) : 24;

(async () => {
  const storage = getStorage();
  const files = await storage.list();
  const rows = await prisma.learningMaterial.findMany({ where: { storageKey: { not: null } }, select: { storageKey: true } });
  const referenced = new Set(rows.map((r) => r.storageKey));
  const cutoff = Date.now() - minAgeHours * 3600 * 1000;

  const orphans = files.filter((f) => !referenced.has(f.key) && f.modifiedAt.getTime() < cutoff);
  const onDisk = new Set(files.map((f) => f.key));
  const missing = [...referenced].filter((k) => !onDisk.has(k));

  console.log(`stored files: ${files.length} | records with a file: ${referenced.size}`);
  console.log(`orphaned files older than ${minAgeHours}h: ${orphans.length} (${orphans.reduce((n, f) => n + f.size, 0)} bytes)`);
  console.log(`records whose file is missing: ${missing.length}${missing.length ? '  (the extracted text and analysis still work; only downloading is affected)' : ''}`);

  if (!apply) {
    console.log(orphans.length ? 'Dry run - nothing deleted. Re-run with --apply to delete the orphaned files.' : 'Nothing to clean up.');
  } else {
    let deleted = 0;
    for (const f of orphans) if (await storage.delete(f.key)) deleted += 1;
    console.log(`deleted ${deleted} orphaned file(s).`);
  }
  await prisma.$disconnect();
})().catch((err) => {
  console.error('storage cleanup failed:', err.message);
  process.exit(1);
});
