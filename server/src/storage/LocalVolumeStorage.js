const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseKey } = require('./keys');

/**
 * File storage on a local directory - in production, a Railway Volume mounted into the service.
 *
 * It implements the storage interface used by the application:
 *   name()                          -> 'volume'
 *   put(key, buffer)                -> void        (never overwrites; atomic write)
 *   get(key)                        -> { stream, size } | null
 *   delete(key)                     -> boolean     (false if it was already gone)
 *   healthCheck()                   -> writes, reads back and deletes a probe file
 *   list()                          -> [{ key, size, modifiedAt }]  (for the cleanup script)
 * An S3-compatible implementation only has to provide the same methods; nothing else changes.
 *
 * Safety: keys are validated against the exact server-generated shape (storage/keys.js), the
 * resolved path must stay inside the storage root (including after symlink resolution), files are
 * written with mode 0640 (never executable) and are never served by URL - only streamed by the API
 * after an ownership check.
 */
class LocalVolumeStorage {
  constructor(rootDir) {
    this.root = path.resolve(rootDir);
  }

  name() {
    return 'volume';
  }

  // Maps a key to an absolute path, or throws. Defence in depth: the key shape already excludes traversal.
  _resolve(key) {
    if (!parseKey(key)) throw new Error('Invalid storage key.');
    const full = path.resolve(this.root, ...key.split('/'));
    if (full !== this.root && !full.startsWith(this.root + path.sep)) throw new Error('Invalid storage key.');
    return full;
  }

  // For reads/deletes: a key that fails validation (e.g. a tampered database value) simply "does not exist".
  _tryResolve(key) {
    try {
      return this._resolve(key);
    } catch {
      return null;
    }
  }

  // After symlink resolution the real path must still be inside the real root.
  async _assertRealInsideRoot(full) {
    const [realRoot, realFull] = await Promise.all([fsp.realpath(this.root), fsp.realpath(full)]);
    if (!realFull.startsWith(realRoot + path.sep)) throw new Error('Invalid storage key.');
  }

  async put(key, buffer) {
    const full = this._resolve(key);
    await fsp.mkdir(path.dirname(full), { recursive: true, mode: 0o750 });
    const tmp = `${full}.tmp-${crypto.randomBytes(6).toString('hex')}`;
    try {
      await fsp.writeFile(tmp, buffer, { flag: 'wx', mode: 0o640 });
      // Publish without ever replacing an existing file. A hard link fails if the target exists;
      // on filesystems without hard links, fall back to an existence check + rename.
      try {
        await fsp.link(tmp, full);
      } catch (err) {
        if (err.code === 'EEXIST') throw err;
        const exists = await fsp.access(full).then(() => true, () => false);
        if (exists) throw Object.assign(new Error('Storage key already exists.'), { code: 'EEXIST' });
        await fsp.rename(tmp, full);
      }
    } finally {
      await fsp.unlink(tmp).catch(() => {});
    }
  }

  async get(key) {
    const full = this._tryResolve(key);
    if (!full) return null;
    let stat;
    try {
      stat = await fsp.stat(full);
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
    if (!stat.isFile()) return null;
    try {
      await this._assertRealInsideRoot(full);
    } catch {
      return null; // a symlink pointing outside the storage root is never served
    }
    return { stream: fs.createReadStream(full), size: stat.size };
  }

  async delete(key) {
    const full = this._tryResolve(key);
    if (!full) return false;
    try {
      await fsp.unlink(full);
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') return false;
      throw err;
    }
  }

  async healthCheck() {
    const probeKey = `users/00000000-0000-4000-8000-000000000000/${crypto.randomUUID()}.txt`;
    const payload = Buffer.from(`probe-${crypto.randomBytes(8).toString('hex')}`);
    await this.put(probeKey, payload);
    try {
      const got = await this.get(probeKey);
      const chunks = [];
      for await (const c of got.stream) chunks.push(c);
      if (!Buffer.concat(chunks).equals(payload)) throw new Error('Storage read-back mismatch.');
    } finally {
      await this.delete(probeKey).catch(() => {});
    }
    return true;
  }

  // Every stored file with its size and age (used by scripts/storageCleanup.js).
  async list() {
    const out = [];
    const usersDir = path.join(this.root, 'users');
    let userDirs = [];
    try {
      userDirs = await fsp.readdir(usersDir, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') return out;
      throw err;
    }
    for (const d of userDirs) {
      if (!d.isDirectory()) continue;
      for (const f of await fsp.readdir(path.join(usersDir, d.name), { withFileTypes: true })) {
        if (!f.isFile()) continue;
        const key = `users/${d.name}/${f.name}`;
        if (!parseKey(key)) continue; // temp files and anything unexpected are ignored
        const stat = await fsp.stat(path.join(usersDir, d.name, f.name));
        out.push({ key, size: stat.size, modifiedAt: stat.mtime });
      }
    }
    return out;
  }
}

module.exports = LocalVolumeStorage;
