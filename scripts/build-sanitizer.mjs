import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

// Lambda disables require(ESM), including on Node 22/24. Bundle the current
// sanitizer and its ESM parser into ordinary CommonJS without changing either
// dependency's security behavior or enabling experimental runtime features.
await build({
  entryPoints: [require.resolve('sanitize-html')],
  outfile: fileURLToPath(new URL('../netlify/generated/sanitize-html.cjs', import.meta.url)),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  legalComments: 'inline',
  logLevel: 'warning'
});
console.log('Server sanitizer bundled for the Lambda runtime.');
