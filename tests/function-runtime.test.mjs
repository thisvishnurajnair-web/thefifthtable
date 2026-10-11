import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { config } from '../netlify/functions/blog.mjs';
import projectsHandler, { config as projectsConfig } from '../netlify/functions/projects.mjs';

test('deployed function imports with Lambda experimental features disabled', () => {
  assert.ok(process.execArgv.includes('--no-experimental-require-module'));
  assert.ok(process.execArgv.includes('--no-experimental-detect-module'));
  assert.equal(typeof handler, 'function');
  assert.equal(config.path, '/api/blog');
  assert.equal(typeof projectsHandler, 'function');
  assert.equal(projectsConfig.path, '/api/projects');
});
