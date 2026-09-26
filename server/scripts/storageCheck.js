#!/usr/bin/env node
// Verifies the file-storage configuration: where files go, whether that location is persistent, and
// that it is actually writable (writes, reads back and deletes a probe file).
//
//   npm run storage:check
//
// Run it INSIDE the Railway service (e.g. its shell) to verify the attached Volume. Prints paths, so it is
// for the operator's terminal only - never expose this output to users.
require('dotenv').config();
const { describeStorage, getStorage } = require('../src/storage');

(async () => {
  const info = describeStorage();
  console.log('Storage configuration');
  console.log(`  provider   : ${process.env.STORAGE_PROVIDER || 'volume'}`);
  console.log(`  configured : ${info.configured}`);
  if (info.configured) {
    console.log(`  location   : ${info.root}`);
    console.log(`  source     : ${info.source}`);
    console.log(`  persistent : ${info.persistent}${info.persistent ? '' : '   <-- NOT persistent: files are lost on redeploy'}`);
  } else {
    console.log('  -> No persistent location configured. Attach a Railway Volume (RAILWAY_VOLUME_MOUNT_PATH) or set STORAGE_ROOT.');
    process.exit(2);
  }
  try {
    await getStorage().healthCheck();
    console.log('  write/read/delete probe: OK');
  } catch (err) {
    console.log(`  write/read/delete probe: FAILED (${err.code || err.message})`);
    console.log('  Hint: on Railway, if the app runs as a non-root user the volume may not be writable; see docs/storage-setup.md.');
    process.exit(1);
  }
  const files = await getStorage().list();
  console.log(`  stored files: ${files.length} (${files.reduce((n, f) => n + f.size, 0)} bytes)`);
})().catch((err) => {
  console.error('storage check failed:', err.message);
  process.exit(1);
});
