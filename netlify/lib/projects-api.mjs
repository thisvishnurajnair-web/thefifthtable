import { randomUUID } from 'node:crypto';
import { authenticateAdmin } from './blog-api.mjs';

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const validId = value => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value || '');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});

function jpegDimensions(bytes) {
  if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) return null;
  for (let offset = 2; offset + 4 < bytes.length;) {
    if (bytes[offset++] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) {
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      if (width > 0 && height > 0 && width <= 2400 && height <= 2400) return { width, height };
      return null;
    }
    offset += length;
  }
  return null;
}

export function createProjectsHandler({ store, adminStore, now = () => Date.now() }) {
  const photos = async () => (await store.get('photos', { type: 'json' })) || [];
  async function updatePhotos(update) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const entry = await store.getWithMetadata('photos', { type: 'json' });
      const next = update(entry?.data || []);
      const result = await store.setJSON('photos', next, entry ? { onlyIfMatch: entry.etag } : { onlyIfNew: true });
      if (result.modified) return next;
    }
    throw fail('Another photo is being updated. Please try again.', 409);
  }

  return async request => {
    try {
      const url = new URL(request.url);
      if (request.method === 'GET') {
        const id = url.searchParams.get('photo');
        if (id === null) return json({ ok: true, photos: await photos() });
        if (!validId(id) || !(await photos()).some(photo => photo.id === id)) throw fail('Photograph not found.', 404);
        const data = await store.get('images/' + id, { type: 'arrayBuffer' });
        if (!data) throw fail('Photograph not found.', 404);
        return new Response(data, { headers: {
          'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline',
          'Cross-Origin-Resource-Policy': 'same-origin'
        } });
      }
      if (!['POST', 'DELETE'].includes(request.method)) throw fail('Method not allowed.', 405);
      if (request.headers.get('origin') !== url.origin) throw fail('Request origin is not allowed.', 403);
      if (!await authenticateAdmin(request, adminStore, now)) throw fail('Please sign in to manage project photos.', 401);

      if (request.method === 'POST') {
        if (request.headers.get('content-type') !== 'image/jpeg') throw fail('Choose a JPG, PNG or WebP photo using the photo uploader.', 415);
        if (Number(request.headers.get('content-length')) > MAX_PHOTO_BYTES) throw fail('This photograph is too large.', 413);
        const bytes = Buffer.from(await request.arrayBuffer());
        if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) throw fail('This photograph is too large.', 413);
        const dimensions = jpegDimensions(bytes);
        if (!dimensions) throw fail('The photograph could not be read. Please choose another image.');
        const id = randomUUID();
        const photo = { id, src: '/api/projects?photo=' + id, ...dimensions, uploadedAt: new Date(now()).toISOString() };
        await store.set('images/' + id, new Uint8Array(bytes).buffer);
        try {
          await updatePhotos(all => {
            if (all.length >= 500) throw fail('The gallery is full. Delete a photo before adding another.');
            return [photo, ...all];
          });
        } catch (error) {
          await store.delete('images/' + id).catch(() => {});
          throw error;
        }
        return json({ ok: true, photo }, 201);
      }

      const id = url.searchParams.get('photo');
      if (!validId(id)) throw fail('Invalid photograph.');
      await updatePhotos(all => all.filter(photo => photo.id !== id));
      // The image route checks the index first, so a failed storage cleanup cannot
      // expose a deleted photograph or undo a successful gallery removal.
      await store.delete('images/' + id).catch(() => console.error('Project image cleanup failed.'));
      return json({ ok: true });
    } catch (error) {
      if (!error.status) console.error('Project service error:', error.name);
      return json({ ok: false, message: error.status ? error.message : 'The photo service is temporarily unavailable. Please try again.' }, error.status || 503);
    }
  };
}
