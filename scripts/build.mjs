import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const pages = ['index.html', 'about.html', 'products.html', 'category.html', 'product.html', 'blogs.html', 'robots.txt', 'sitemap.xml'];
const entries = new Set(await readdir(root));
for (const name of [...pages, 'css', 'js', 'images', 'data']) {
  if (entries.has(name)) await cp(path.join(root, name), path.join(output, name), { recursive: true });
}
console.log('Public website built in dist/.');
