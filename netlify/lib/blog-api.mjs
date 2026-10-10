import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import sanitizeHtml from 'sanitize-html';

const scrypt = promisify(scryptCallback);
const COOKIE = '__Host-fifthtable_admin';
const MAX_AGE = 8 * 60 * 60;
const ADMIN_EMAIL = 'thisvishnurajnair@gmail.com';
const digest = value => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('hex');
const equal = (a, b) => timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

export function cleanContent(content) {
  return sanitizeHtml(content, {
    allowedTags: ['p', 'div', 'span', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    allowedAttributes: { a: ['href', 'title', 'rel'], th: ['colspan', 'rowspan', 'scope'], td: ['colspan', 'rowspan'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowProtocolRelative: false,
    transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }) }
  }).trim();
}

function passwordCheck(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) {
    throw fail('Use a password between 12 and 256 characters.');
  }
}

async function passwordRecord(password) {
  passwordCheck(password);
  const salt = secret();
  const hash = (await scrypt(password, salt, 64)).toString('hex');
  return { salt, hash, version: secret(), email: ADMIN_EMAIL };
}

async function passwordMatches(password, record) {
  if (typeof password !== 'string' || password.length > 256 || !record) return false;
  const hash = (await scrypt(password, record.salt, 64)).toString('hex');
  return equal(hash, record.hash);
}

function getCookie(request) {
  const value = (request.headers.get('cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith(COOKIE + '='));
  return value ? value.slice(COOKIE.length + 1) : '';
}

function sessionCookie(value, age = MAX_AGE) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
}

export function createBlogHandler({ store, setupKey = '', initialPosts = [], now = () => Date.now() }) {
  const read = key => store.get(key, { type: 'json' });
  const response = (body, status = 200, cookie) => new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(cookie ? { 'Set-Cookie': cookie } : {})
    }
  });

  async function auth(request) {
    const token = getCookie(request);
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const [session, admin] = await Promise.all([read('sessions/' + digest(token)), read('admin')]);
    if (!session || !admin || session.expires <= now() || session.version !== admin.version) return null;
    return admin;
  }

  async function startSession(admin) {
    const token = secret();
    await store.setJSON('sessions/' + digest(token), { version: admin.version, expires: now() + MAX_AGE * 1000 });
    return sessionCookie(token);
  }

  async function checkLoginLimit(ip) {
    const key = 'login-limit/' + digest(ip);
    for (let attempt = 0; attempt < 5; attempt++) {
      const entry = await store.getWithMetadata(key, { type: 'json' });
      const current = entry?.data?.reset > now() ? entry.data : { count: 0, reset: now() + 15 * 60 * 1000 };
      if (current.count >= 10) throw fail('Too many sign-in attempts. Please try again in 15 minutes.', 429);
      const result = await store.setJSON(key, { ...current, count: current.count + 1 }, entry ? { onlyIfMatch: entry.etag } : { onlyIfNew: true });
      if (result.modified) return;
    }
    throw fail('Please wait a moment before trying again.', 429);
  }

  async function posts() {
    return (await read('posts')) || initialPosts;
  }

  async function updatePosts(update) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const entry = await store.getWithMetadata('posts', { type: 'json' });
      const next = update(entry?.data || initialPosts);
      const result = await store.setJSON('posts', next, entry ? { onlyIfMatch: entry.etag } : { onlyIfNew: true });
      if (result.modified) return;
    }
    throw fail('Another edit is in progress. Please try saving again.', 409);
  }

  return async function handle(request, clientIP = 'unknown') {
    try {
      if (request.method === 'GET') {
        const action = new URL(request.url).searchParams.get('action') || 'listPublished';
        if (action === 'listPublished') return response({ ok: true, posts: (await posts()).filter(post => post.published).sort((a, b) => b.date.localeCompare(a.date)) });
        if (action === 'adminStatus') return response({ ok: true, adminConfigured: !!(await read('admin')), setupAvailable: setupKey.length >= 32, loggedIn: !!(await auth(request)) });
        throw fail('Unknown action.');
      }
      if (request.method !== 'POST') return response({ ok: false, message: 'Method not allowed.' }, 405);
      const origin = request.headers.get('origin');
      if (!origin || origin !== new URL(request.url).origin) throw fail('Request origin is not allowed.', 403);
      if (!request.headers.get('content-type')?.startsWith('application/json')) throw fail('JSON is required.', 415);
      const raw = await request.text();
      if (raw.length > 150000) throw fail('This post is too large.', 413);
      let body;
      try { body = JSON.parse(raw); } catch { throw fail('Invalid request.'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail('Invalid request.');
      const { action, payload = {} } = body;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw fail('Invalid request payload.');

      if (action === 'setupAdmin') {
        await checkLoginLimit(clientIP);
        if (setupKey.length < 32 || typeof payload.setupKey !== 'string' || !equal(setupKey, payload.setupKey)) throw fail('The owner setup key is incorrect or has not been configured.', 403);
        if (await read('admin')) throw fail('Admin is already configured. Please sign in.', 409);
        const admin = await passwordRecord(payload.password);
        const result = await store.setJSON('admin', admin, { onlyIfNew: true });
        if (!result.modified) throw fail('Admin is already configured. Please sign in.', 409);
        return response({ ok: true }, 200, await startSession(admin));
      }

      if (action === 'verifyAdmin') {
        await checkLoginLimit(clientIP);
        const admin = await read('admin');
        if (!await passwordMatches(payload.password, admin)) throw fail('Incorrect password.', 401);
        return response({ ok: true }, 200, await startSession(admin));
      }

      if (action === 'logout') {
        const token = getCookie(request);
        if (/^[a-f0-9]{64}$/.test(token)) await store.delete('sessions/' + digest(token));
        return response({ ok: true }, 200, sessionCookie('', 0));
      }

      const admin = await auth(request);
      if (!admin) throw fail('Please sign in to manage articles.', 401);
      if (action === 'listAll') return response({ ok: true, posts: (await posts()).sort((a, b) => b.date.localeCompare(a.date)) });

      if (action === 'upsertPost') {
        const incoming = payload.post || {};
        const id = typeof incoming.id === 'string' ? incoming.id : '';
        if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw fail('Invalid article ID.');
        const title = String(incoming.title || '').trim();
        const category = String(incoming.category || '').trim();
        const date = String(incoming.date || '');
        const content = cleanContent(String(incoming.content || ''));
        if (!title || title.length > 200 || category.length > 80 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !content || content.length > 100000) throw fail('Please check the title, date and article content.');
        const post = { id, title, category, date, content, published: incoming.published === true, updatedAt: new Date(now()).toISOString() };
        await updatePosts(all => [post, ...all.filter(existing => existing.id !== id)]);
        return response({ ok: true, post });
      }

      if (action === 'deletePost') {
        if (typeof payload.postId !== 'string') throw fail('Missing article ID.');
        await updatePosts(all => all.filter(post => post.id !== payload.postId));
        return response({ ok: true });
      }

      if (action === 'changeAdminPassword') {
        await checkLoginLimit(clientIP);
        const current = await store.getWithMetadata('admin', { type: 'json' });
        if (!await passwordMatches(payload.currentPassword, current?.data)) throw fail('Current password is incorrect.', 401);
        const next = await passwordRecord(payload.newPassword);
        const result = await store.setJSON('admin', next, { onlyIfMatch: current.etag });
        if (!result.modified) throw fail('Your password changed in another session. Please sign in again.', 409);
        return response({ ok: true }, 200, await startSession(next));
      }
      throw fail('Unknown action.');
    } catch (error) {
      if (!error.status) console.error('Blog service error:', error.name);
      return response({ ok: false, message: error.status ? error.message : 'The blog service is temporarily unavailable. Please try again.' }, error.status || 503);
    }
  };
}
