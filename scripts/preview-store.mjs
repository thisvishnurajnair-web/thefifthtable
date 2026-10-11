import { readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

// Isolated local implementation of the Blobs methods used by the real handlers.
// Compare-and-set happens synchronously inside one Node process.
export function createPreviewStore(directory) {
  const memory = new Map();
  if (directory) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = key => path.join(directory, createHash('sha256').update(key).digest('hex') + '.json');
  function read(key) {
    if (!directory) return memory.get(key) || null;
    try { return JSON.parse(readFileSync(filename(key), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  function write(key, data, kind, options) {
    const previous = read(key);
    if (options.onlyIfNew && previous || options.onlyIfMatch && previous?.etag !== options.onlyIfMatch) return { modified: false };
    const entry = { data, kind, etag: randomUUID() };
    if (!directory) memory.set(key, entry);
    else {
      const temporary = filename(key) + '.' + randomUUID() + '.tmp';
      writeFileSync(temporary, JSON.stringify(entry), { mode: 0o600 });
      renameSync(temporary, filename(key));
    }
    return { modified: true, etag: entry.etag };
  }
  function decode(entry, options = {}) {
    if (!entry) return null;
    if (entry.kind === 'json') return structuredClone(entry.data);
    const buffer = Buffer.from(entry.data, 'base64');
    return options.type === 'arrayBuffer' ? new Uint8Array(buffer).buffer : buffer.toString();
  }
  return {
    async get(key, options) { return decode(read(key), options); },
    async getWithMetadata(key, options) {
      const entry = read(key); return entry ? { data: decode(entry, options), etag: entry.etag, metadata: {} } : null;
    },
    async setJSON(key, data, options = {}) { return write(key, structuredClone(data), 'json', options); },
    async set(key, data, options = {}) { return write(key, Buffer.from(data).toString('base64'), 'binary', options); },
    async delete(key) {
      if (!directory) memory.delete(key);
      else try { unlinkSync(filename(key)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  };
}
