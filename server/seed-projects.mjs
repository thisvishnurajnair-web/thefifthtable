// Populate only a brand-new gallery. An existing index, including an empty one,
// always wins, so later deployments never restore photos an admin deleted.
export function createProjectInitializer({ photos, readPhoto }) {
  let pending;
  return store => {
    pending ??= (async () => {
      if (await store.get('photos', { type: 'json' }) !== null) return;
      await Promise.all(photos.map(async photo => {
        const bytes = await readPhoto(photo.id);
        await store.set('images/' + photo.id, new Uint8Array(bytes).buffer, { onlyIfNew: true });
      }));
      // Publish the complete index last. Conditional creation also protects an
      // admin edit or another initializer running in a different function.
      await store.setJSON('photos', photos, { onlyIfNew: true });
    })().catch(error => { pending = undefined; throw error; });
    return pending;
  };
}
