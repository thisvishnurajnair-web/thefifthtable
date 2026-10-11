import { getStore } from '@netlify/blobs';
import { createProjectsHandler } from '../lib/projects-api.mjs';

export default request => createProjectsHandler({
  store: getStore({ name: 'thefifthtable-projects', consistency: 'strong' }),
  adminStore: getStore({ name: 'thefifthtable-blog', consistency: 'strong' })
})(request);

export const config = { path: '/api/projects' };
