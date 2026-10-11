import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectInitializer } from '../server/seed-projects.mjs';
import { createPreviewStore } from '../scripts/preview-store.mjs';

const photos = [{ id: 'first' }, { id: 'second' }];
const image = id => Buffer.from('photo ' + id);

test('initial deployment imports every image before making the gallery visible', async () => {
  const store = createPreviewStore();
  const initialize = createProjectInitializer({ photos, readPhoto: async id => image(id) });
  await Promise.all([initialize(store), initialize(store)]);
  assert.deepEqual(await store.get('photos', { type: 'json' }), photos);
  for (const photo of photos) assert.deepEqual(Buffer.from(await store.get('images/' + photo.id)), image(photo.id));
});

test('redeployment preserves populated and deliberately emptied galleries', async () => {
  for (const existing of [[{ id: 'owner-upload' }], []]) {
    const store = createPreviewStore();
    await store.setJSON('photos', existing);
    const initialize = createProjectInitializer({ photos, readPhoto: () => { throw new Error('Must not re-import'); } });
    await initialize(store);
    assert.deepEqual(await store.get('photos', { type: 'json' }), existing);
    assert.equal(await store.get('images/first'), null);
  }
});

test('an incomplete import stays invisible and can be retried', async () => {
  const store = createPreviewStore();
  let fail = true;
  const initialize = createProjectInitializer({ photos, readPhoto: async id => {
    if (fail) throw new Error('Temporary failure');
    return image(id);
  } });
  await assert.rejects(initialize(store), /Temporary failure/);
  assert.equal(await store.get('photos', { type: 'json' }), null);
  fail = false;
  await initialize(store);
  assert.deepEqual(await store.get('photos', { type: 'json' }), photos);
});

test('an owner update racing with import is preserved', async () => {
  const store = createPreviewStore();
  const initialize = createProjectInitializer({ photos, readPhoto: async id => {
    await store.setJSON('photos', [{ id: 'owner-upload' }]);
    return image(id);
  } });
  await initialize(store);
  assert.deepEqual(await store.get('photos', { type: 'json' }), [{ id: 'owner-upload' }]);
});
