import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlogHandler } from '../netlify/lib/blog-api.mjs';
import initialPosts from '../data/blog-posts.js';

class MemoryStore {
  records = new Map();
  revision = 0;
  async get(key) { return structuredClone(this.records.get(key)?.data ?? null); }
  async getWithMetadata(key) { return structuredClone(this.records.get(key) ?? null); }
  async setJSON(key, data, options = {}) {
    const previous = this.records.get(key);
    if (options.onlyIfNew && previous) return { modified: false };
    if (options.onlyIfMatch && previous?.etag !== options.onlyIfMatch) return { modified: false };
    const etag = String(++this.revision);
    this.records.set(key, { data: structuredClone(data), etag });
    return { modified: true, etag };
  }
  async delete(key) { this.records.delete(key); }
}

const key = 'test-only-owner-setup-key-with-32-characters';
const password = 'test-only-password-12345';
const post = { id: 'article-1', title: 'Coffee guide', category: 'Equipment Guide', date: '2026-10-10', content: '<h2>Choose carefully</h2><p>Find the right machine.</p>', published: true };

function fixture(initialPosts = []) {
  const store = new MemoryStore();
  let currentTime = Date.now();
  const handler = createBlogHandler({ store, setupKey: key, initialPosts, now: () => currentTime });
  async function request(action, payload = {}, cookie = '', options = {}) {
    const readOnly = ['adminStatus', 'listPublished'].includes(action);
    const result = await handler(new Request('https://thefifthtable.in/api/blog' + (readOnly ? '?action=' + action : ''), {
      method: readOnly ? 'GET' : 'POST',
      headers: { origin: 'https://thefifthtable.in', 'content-type': 'application/json', cookie, 'x-nf-client-connection-ip': options.ip || '127.0.0.1', ...options.headers },
      ...(readOnly ? {} : { body: JSON.stringify({ action, payload }) })
    }), options.ip || '127.0.0.1');
    return { status: result.status, body: await result.json(), cookie: (result.headers.get('set-cookie') || '').split(';')[0], rawCookie: result.headers.get('set-cookie') };
  }
  return { store, request, advance: milliseconds => currentTime += milliseconds };
}

test('owner key gates first setup; password is hashed and setup cannot be repeated', async () => {
  const { request, store } = fixture();
  assert.equal((await request('setupAdmin', { setupKey: 'wrong', password })).status, 403);
  const setup = await request('setupAdmin', { setupKey: key, password });
  assert.equal(setup.status, 200);
  assert.match(setup.rawCookie, /HttpOnly; Secure; SameSite=Strict/);
  const admin = await store.get('admin');
  assert.ok(admin.salt && admin.hash);
  assert.equal(JSON.stringify(admin).includes(password), false);
  assert.equal((await request('setupAdmin', { setupKey: key, password })).status, 409);
  assert.equal((await request('adminStatus', {}, setup.cookie)).body.loggedIn, true);
});

test('publish, edit, draft, cross-device login and deletion are persisted independently', async () => {
  const { request } = fixture([{ ...post, id: 'seed-article' }]);
  assert.equal((await request('listPublished')).body.posts.length, 1);
  assert.equal((await request('listAll')).status, 401);
  assert.equal((await request('upsertPost', { post })).status, 401);
  const setup = await request('setupAdmin', { setupKey: key, password });
  assert.equal((await request('upsertPost', { post }, setup.cookie)).status, 200);
  assert.equal((await request('listPublished')).body.posts.length, 2);
  const secondDevice = await request('verifyAdmin', { password });
  assert.equal(secondDevice.status, 200);
  assert.equal((await request('upsertPost', { post: { ...post, title: 'Draft title', published: false } }, secondDevice.cookie)).status, 200);
  assert.equal((await request('listPublished')).body.posts.length, 1);
  const all = (await request('listAll', {}, setup.cookie)).body.posts;
  assert.equal(all.find(entry => entry.id === post.id).title, 'Draft title');
  assert.equal((await request('deletePost', { postId: 'seed-article' }, secondDevice.cookie)).status, 200);
  assert.equal((await request('listPublished')).body.posts.length, 0);
  assert.equal((await request('deletePost', { postId: post.id }, secondDevice.cookie)).status, 200);
  assert.equal((await request('listAll', {}, secondDevice.cookie)).body.posts.length, 0);
});

test('rich text is sanitized on the server; the original editor formatting is preserved', async () => {
  const { request } = fixture();
  const setup = await request('setupAdmin', { setupKey: key, password });
  const result = await request('upsertPost', { post: { ...post, content: '<h2>Guide</h2><p><strong>Bold</strong><u>Underline</u><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">Bad</a><a href="https://example.com">Source</a></p>' } }, setup.cookie);
  assert.equal(result.status, 200);
  assert.match(result.body.post.content, /<strong>Bold<\/strong><u>Underline<\/u>/);
  assert.doesNotMatch(result.body.post.content, /script|onerror|javascript|<img/i);
  assert.match(result.body.post.content, /href="https:\/\/example.com"/);
});

test('password changes invalidate other devices; logout and expiry invalidate sessions', async () => {
  const { request, advance } = fixture();
  const first = await request('setupAdmin', { setupKey: key, password });
  const other = await request('verifyAdmin', { password });
  const newPassword = password + '-new';
  const change = await request('changeAdminPassword', { currentPassword: password, newPassword }, first.cookie);
  assert.equal(change.status, 200);
  assert.equal((await request('listAll', {}, other.cookie)).status, 401);
  assert.equal((await request('verifyAdmin', { password })).status, 401);
  assert.equal((await request('listAll', {}, change.cookie)).status, 200);
  await request('logout', {}, change.cookie);
  assert.equal((await request('listAll', {}, change.cookie)).status, 401);
  const login = await request('verifyAdmin', { password: newPassword });
  advance(8 * 60 * 60 * 1000 + 1);
  assert.equal((await request('listAll', {}, login.cookie)).status, 401);
});

test('cross-origin writes and repeated guesses are blocked', async () => {
  const { request } = fixture();
  assert.equal((await request('setupAdmin', { setupKey: key, password }, '', { headers: { origin: 'https://other.example' } })).status, 403);
  await request('setupAdmin', { setupKey: key, password });
  for (let i = 0; i < 10; i++) assert.equal((await request('verifyAdmin', { password: 'wrong' }, '', { ip: 'other-ip' })).status, 401);
  assert.equal((await request('verifyAdmin', { password }, '', { ip: 'other-ip' })).status, 429);
});

test('first setup stays disabled until the deployment has a private setup key', async () => {
  const handler = createBlogHandler({ store: new MemoryStore() });
  const status = await handler(new Request('https://thefifthtable.in/api/blog?action=adminStatus'));
  assert.equal((await status.json()).setupAvailable, false);
});

test('all nineteen migrated articles have valid dates, independent branding and safe rich text', () => {
  assert.equal(initialPosts.length, 19);
  const content = initialPosts.map(post => post.content).join('');
  assert.match(content, /<table>/);
  for (const post of initialPosts) {
    assert.equal(post.published, true);
    assert.match(post.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(post.title && post.content);
    assert.doesNotMatch(JSON.stringify(post), /snscoffee|S(?:&amp;|&)S\s+Coffee/i);
    assert.doesNotMatch(post.content, /<script|<iframe|<svg|<form|\son\w+=|javascript:/i);
  }
});

test('malformed JSON objects return a client error instead of a service failure', async () => {
  const handler = createBlogHandler({ store: new MemoryStore() });
  for (const body of ['null', '[]', '{"action":"setupAdmin","payload":null}']) {
    const result = await handler(new Request('https://thefifthtable.in/api/blog', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://thefifthtable.in' }, body
    }));
    assert.equal(result.status, 400);
  }
});
