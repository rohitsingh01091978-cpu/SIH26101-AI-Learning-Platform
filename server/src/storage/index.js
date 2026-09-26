const path = require('node:path');
const ApiError = require('../utils/ApiError');
const LocalVolumeStorage = require('./LocalVolumeStorage');

/**
 * Storage provider selection.
 *
 *   STORAGE_PROVIDER   "volume" (default) - a local directory, i.e. a Railway Volume in production.
 *                      (An S3-compatible provider can be added here later; callers only use the interface.)
 *   STORAGE_ROOT       directory for stored files. If unset, Railway's RAILWAY_VOLUME_MOUNT_PATH
 *                      (set automatically when a Volume is attached) is used, as <mount>/uploads.
 *
 * In PRODUCTION the application refuses to store files unless one of those points at a persistent
 * volume - it will not quietly write to the container's ephemeral disk. STORAGE_ALLOW_EPHEMERAL=true
 * is an explicit, not-recommended opt-out (files are lost on every redeploy).
 * In development/test, files go to server/uploads (or STORAGE_ROOT).
 */

const isProduction = () => process.env.NODE_ENV === 'production';

const storageUnavailable = () =>
  new ApiError(503, 'File storage is temporarily unavailable. Please try again later.', null, 'STORAGE_UNAVAILABLE');

// Returns { root, persistent, source } or null when no safe location is configured.
function resolveConfig() {
  const explicit = (process.env.STORAGE_ROOT || '').trim();
  if (explicit) return { root: path.resolve(explicit), persistent: true, source: 'STORAGE_ROOT' };

  const mount = (process.env.RAILWAY_VOLUME_MOUNT_PATH || '').trim();
  if (mount) return { root: path.resolve(mount, 'uploads'), persistent: true, source: 'RAILWAY_VOLUME_MOUNT_PATH' };

  if (!isProduction()) return { root: path.resolve(__dirname, '..', '..', 'uploads'), persistent: false, source: 'development default' };

  if ((process.env.STORAGE_ALLOW_EPHEMERAL || '').trim().toLowerCase() === 'true') {
    return { root: path.resolve(__dirname, '..', '..', 'uploads'), persistent: false, source: 'STORAGE_ALLOW_EPHEMERAL' };
  }
  return null;
}

let cached = { key: null, storage: null };

/** The active storage provider. Throws a 503 ApiError (STORAGE_UNAVAILABLE) when none is configured. */
function getStorage() {
  const provider = (process.env.STORAGE_PROVIDER || 'volume').trim().toLowerCase();
  if (provider !== 'volume' && provider !== 'local') {
    console.error(`[storage] Unknown STORAGE_PROVIDER "${provider}". File storage is unavailable.`);
    throw storageUnavailable();
  }
  const cfg = resolveConfig();
  if (!cfg) {
    console.error('[storage] No persistent storage configured (attach a Railway Volume, or set STORAGE_ROOT). File uploads are disabled.');
    throw storageUnavailable();
  }
  if (cached.key !== cfg.root) cached = { key: cfg.root, storage: new LocalVolumeStorage(cfg.root) };
  return cached.storage;
}

/** Describes the configuration without exposing paths to clients. Used by startup checks and scripts. */
function describeStorage() {
  const cfg = resolveConfig();
  if (!cfg) return { configured: false, persistent: false, source: null, root: null };
  return { configured: true, persistent: cfg.persistent, source: cfg.source, root: cfg.root };
}

module.exports = { getStorage, describeStorage, storageUnavailable };
