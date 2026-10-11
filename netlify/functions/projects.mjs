import { getStore } from '@netlify/blobs';
import { createProjectsHandler } from '../lib/projects-api.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createProjectInitializer } from '../../server/seed-projects.mjs';
import photos from '../../migration/project-photos/manifest.json' with { type: 'json' };

const initialize = createProjectInitializer({
  photos,
  readPhoto: id => readFile(path.join(process.cwd(), 'migration/project-photos', id + '.jpg'))
});

export default async request => {
  const store = getStore({ name: 'thefifthtable-projects', consistency: 'strong' });
  try { await initialize(store); }
  catch (error) {
    console.error('Initial project import failed:', error.name);
    return Response.json({ ok: false, message: 'The photo gallery is being prepared. Please try again shortly.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  return createProjectsHandler({ store, adminStore: getStore({ name: 'thefifthtable-blog', consistency: 'strong' }) })(request);
};

export const config = { path: '/api/projects' };
