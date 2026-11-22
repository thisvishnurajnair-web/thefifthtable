import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createBlogHandler } from '../netlify/lib/blog-api.mjs';
import { createProjectsHandler, MAX_PHOTO_BYTES } from '../netlify/lib/projects-api.mjs';
import { createPreviewStore } from './preview-store.mjs';
import initialPosts from '../data/blog-posts.js';
import { createProjectInitializer } from '../server/seed-projects.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PREVIEW_PORT || 4173);
const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
const setupKey = randomBytes(32).toString('hex');
const previewPassword = randomBytes(32).toString('hex');
const adminStore = createPreviewStore();
const photoStore = createPreviewStore(path.join(root, '.local-preview-data/projects'));
const initialPhotos = JSON.parse(await readFile(path.join(root, 'migration/project-photos/manifest.json'), 'utf8'));
await createProjectInitializer({
  photos: initialPhotos,
  readPhoto: id => readFile(path.join(root, 'migration/project-photos', id + '.jpg'))
})(photoStore);
const blog = createBlogHandler({ store: adminStore, setupKey, initialPosts });
const projects = createProjectsHandler({ store: photoStore, adminStore });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
function loginRequest(origin, action, payload) {
  return new Request(origin + '/api/blog', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ action, payload }) });
}
await blog(loginRequest(`http://localhost:${port}`, 'setupAdmin', { setupKey, password: previewPassword }), 'local-setup');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.webp':'image/webp', '.svg':'image/svg+xml', '.txt':'text/plain', '.xml':'application/xml', '.ico':'image/x-icon', '.woff2':'font/woff2' };
const pages = new Set(['index.html','about.html','solutions.html','projects.html','products.html','category.html','product.html','blogs.html','cafe-setup-consulting.html','hospitality-consulting.html','turnkey-cafe-projects.html','menu-development-costing.html','restaurant-setup-consulting.html','office-coffee-solutions.html','robots.txt','sitemap.xml']);

const server = http.createServer(async (incoming, outgoing) => {
  let response;
  try {
    const host = incoming.headers.host;
    if (!hosts.has(host)) response = json({ ok:false, message:'Local preview only.' }, 403);
    else {
      const origin = 'http://' + host;
      const url = new URL(incoming.url, origin);
      if (!['GET','HEAD'].includes(incoming.method) && incoming.headers.origin !== origin) response = json({ ok:false, message:'Request origin is not allowed.' }, 403);
      else if (url.pathname === '/__preview/status' && incoming.method === 'GET') response = json({ ok:true, projectAdminPreview:true });
      else if (url.pathname === '/__preview/admin-session' && incoming.method === 'POST') {
        response = await blog(loginRequest(origin, 'verifyAdmin', { password:previewPassword }), 'local-preview-session');
      } else if (['/api/blog','/api/projects'].includes(url.pathname)) {
        let body;
        if (!['GET','HEAD'].includes(incoming.method)) {
          const chunks = []; let size = 0;
          for await (const chunk of incoming) {
            size += chunk.length;
            if (size > MAX_PHOTO_BYTES + 1024) throw Object.assign(new Error('Photo too large.'), { status:413 });
            chunks.push(chunk);
          }
          body = Buffer.concat(chunks);
        }
        const request = new Request(url, { method:incoming.method, headers:incoming.headers, ...(body ? { body } : {}) });
        response = await (url.pathname === '/api/blog' ? blog(request, 'local-browser') : projects(request));
      } else if (['GET','HEAD'].includes(incoming.method)) {
        const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
        const parts = relative.split('/');
        const allowed = !parts.some(part => part.startsWith('.')) && (pages.has(relative) || ['images','css','js','data'].includes(parts[0]));
        const file = path.resolve(root, relative);
        if (!allowed || !file.startsWith(root) || !(await stat(file).catch(() => null))?.isFile()) response = json({ ok:false, message:'Not found.' }, 404);
        else response = new Response(incoming.method === 'HEAD' ? null : await readFile(file), { headers: { 'content-type':types[path.extname(file)] || 'application/octet-stream', 'cache-control':'no-store', 'x-content-type-options':'nosniff' } });
      } else response = json({ ok:false, message:'Not found.' }, 404);
    }
  } catch (error) { response = json({ ok:false, message:error.status ? error.message : 'Local preview request failed.' }, error.status || 500); }
  outgoing.writeHead(response.status, Object.fromEntries(response.headers));
  outgoing.end(Buffer.from(await response.arrayBuffer()));
});
server.listen(port, '127.0.0.1', () => console.log(`The Fifth Table local preview: http://localhost:${port}\nGallery example: http://localhost:${port}/projects.html?preview=gallery\nPhoto manager: http://localhost:${port}/projects.html#admin`));
