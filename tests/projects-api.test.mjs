import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBlogHandler } from '../netlify/lib/blog-api.mjs';
import { createProjectsHandler, MAX_PHOTO_BYTES } from '../netlify/lib/projects-api.mjs';
import { createPreviewStore } from '../scripts/preview-store.mjs';

const origin = 'https://thefifthtable.in';
const setupKey = 'project-tests-only-owner-key-with-32-characters';
const password = 'project-tests-only-password-1234';
const jpeg = await readFile(new URL('../images/hospitality/kitchen.jpg', import.meta.url));

async function fixture() {
  const adminStore = createPreviewStore();
  const store = createPreviewStore();
  let now = Date.now();
  const blogHandler = createBlogHandler({ store:adminStore, setupKey, now:() => now });
  const handler = createProjectsHandler({ store, adminStore, now:() => now });
  const blog = (action, payload = {}, cookie = '') => blogHandler(new Request(origin + '/api/blog', {
    method:'POST', headers:{ origin, cookie, 'content-type':'application/json' }, body:JSON.stringify({ action, payload })
  }));
  const setup = await blog('setupAdmin', { setupKey, password });
  const cookie = setup.headers.get('set-cookie').split(';')[0];
  const request = (method = 'GET', body, headers = {}, query = '') => handler(new Request(origin + '/api/projects' + query, {
    method, headers:{ origin, cookie, ...(body ? { 'content-type':'image/jpeg' } : {}), ...headers }, ...(body ? { body } : {})
  }));
  return { store, adminStore, cookie, handler, request, blog, advance:ms => now += ms };
}

test('blog login authorizes photo uploads; public gallery and image bytes persist across handlers', async () => {
  const f = await fixture();
  assert.deepEqual((await (await f.request()).json()).photos, []);
  const uploaded = await f.request('POST', jpeg);
  assert.equal(uploaded.status, 201);
  const { photo } = await uploaded.json();
  assert.deepEqual([photo.width, photo.height], [1000, 667]);
  assert.deepEqual(Object.keys(photo).sort(), ['height','id','src','uploadedAt','width']);
  const visitor = createProjectsHandler({ store:f.store, adminStore:f.adminStore });
  const list = await visitor(new Request(origin + '/api/projects'));
  assert.equal((await list.json()).photos[0].id, photo.id);
  const image = await visitor(new Request(origin + photo.src));
  assert.equal(image.headers.get('content-type'), 'image/jpeg');
  assert.equal(image.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), jpeg);
  assert.equal((await f.request('DELETE', undefined, {}, '?photo=' + photo.id)).status, 200);
  assert.deepEqual((await (await f.request()).json()).photos, []);
  assert.equal((await visitor(new Request(origin + photo.src))).status, 404);
  assert.equal(await f.store.get('images/' + photo.id), null);
});

test('unauthenticated, cross-origin, malformed and oversized uploads are rejected', async () => {
  const f = await fixture();
  assert.equal((await f.request('POST', jpeg, { cookie:'' })).status, 401);
  assert.equal((await f.request('POST', jpeg, { origin:'https://other.example' })).status, 403);
  assert.equal((await f.request('POST', jpeg, { origin:'' })).status, 403);
  assert.equal((await f.request('DELETE', undefined, { cookie:'' }, '?photo=bad')).status, 401);
  assert.equal((await f.request('POST', '<svg onload="alert(1)"></svg>', { 'content-type':'image/svg+xml' })).status, 415);
  assert.equal((await f.request('POST', Buffer.from([255,216,255,0,255,217]))).status, 400);
  assert.equal((await f.request('POST', new Uint8Array(MAX_PHOTO_BYTES + 1))).status, 413);
  assert.equal((await f.request('GET', undefined, {}, '?photo=../../admin')).status, 404);
  assert.equal((await f.request('PUT')).status, 405);
  assert.deepEqual((await (await f.request()).json()).photos, []);
});

test('password changes, logout and session expiry revoke photo administration', async () => {
  const f = await fixture();
  await f.blog('changeAdminPassword', { currentPassword:password, newPassword:password + '-changed' }, f.cookie);
  assert.equal((await f.request('POST', jpeg)).status, 401);
  const signIn = await f.blog('verifyAdmin', { password:password + '-changed' });
  const cookie = signIn.headers.get('set-cookie').split(';')[0];
  assert.equal((await f.request('POST', jpeg, { cookie })).status, 201);
  await f.blog('logout', {}, cookie);
  assert.equal((await f.request('POST', jpeg, { cookie })).status, 401);
  const again = await f.blog('verifyAdmin', { password:password + '-changed' });
  const nextCookie = again.headers.get('set-cookie').split(';')[0];
  f.advance(8 * 3600 * 1000 + 1);
  assert.equal((await f.request('POST', jpeg, { cookie:nextCookie })).status, 401);
});

test('simultaneous uploads retry without losing photos and newest uploads appear first', async () => {
  const f = await fixture();
  const results = await Promise.all([f.request('POST', jpeg), f.request('POST', jpeg), f.request('POST', jpeg)]);
  assert.ok(results.every(response => response.status === 201));
  const ids = await Promise.all(results.map(async response => (await response.json()).photo.id));
  const photos = (await (await f.request()).json()).photos;
  assert.equal(photos.length, 3);
  assert.deepEqual(new Set(photos.map(photo => photo.id)), new Set(ids));
  const last = (await (await f.request('POST', jpeg)).json()).photo;
  assert.equal((await (await f.request()).json()).photos[0].id, last.id);
});

test('failed index writes clean up uploads; deleted photos stay inaccessible if binary cleanup fails', async () => {
  const f = await fixture();
  const rejectedStore = { ...f.store, setJSON:async () => ({ modified:false }) };
  let uploadedKey;
  rejectedStore.set = async (...args) => { uploadedKey = args[0]; return f.store.set(...args); };
  const failing = createProjectsHandler({ store:rejectedStore, adminStore:f.adminStore });
  const failure = await failing(new Request(origin + '/api/projects', { method:'POST', headers:{ origin, cookie:f.cookie, 'content-type':'image/jpeg' }, body:jpeg }));
  assert.equal(failure.status, 409);
  assert.equal(await f.store.get(uploadedKey), null);
  const { photo } = await (await f.request('POST', jpeg)).json();
  const cleanupFailure = createProjectsHandler({ store:{ ...f.store, delete:async () => { throw new Error('storage cleanup'); } }, adminStore:f.adminStore });
  assert.equal((await cleanupFailure(new Request(origin + photo.src, { method:'DELETE', headers:{ origin, cookie:f.cookie } }))).status, 200);
  assert.equal((await f.request('GET', undefined, {}, '?photo=' + photo.id)).status, 404);
});

test('local photo storage survives restarting the preview and stays separate from blog data', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'fifth-photo-test-'));
  try {
    const first = createPreviewStore(directory);
    await first.set('images/test', new Uint8Array(jpeg).buffer);
    await first.setJSON('photos', [{ id:'test' }]);
    const restarted = createPreviewStore(directory);
    assert.deepEqual(await restarted.get('photos', { type:'json' }), [{ id:'test' }]);
    assert.deepEqual(Buffer.from(await restarted.get('images/test', { type:'arrayBuffer' })), jpeg);
    assert.equal(await restarted.get('admin'), null);
  } finally { await rm(directory, { recursive:true, force:true }); }
});
