import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { BrowserStorage } from '../../dist-test/browser-storage.js';
import { BrowserServices } from '../../dist-test/browser-services.js';

test('BrowserStorage put/get round-trips values', async () => {
  const storage = new BrowserStorage('put-get-test');
  await storage.open(['projects']);
  await storage.put('projects', 'p1', { id: 'p1', name: 'demo' });
  const value = await storage.get('projects', 'p1');
  assert.equal(value?.name, 'demo');
  const missing = await storage.get('projects', 'nope');
  assert.equal(missing, null);
});

test('BrowserStorage list returns all stored values', async () => {
  const storage = new BrowserStorage('list-test');
  await storage.open(['projects']);
  await storage.put('projects', 'a', { id: 'a' });
  await storage.put('projects', 'b', { id: 'b' });
  const all = await storage.list('projects');
  assert.equal(all.length, 2);
});

test('BrowserStorage delete removes values', async () => {
  const storage = new BrowserStorage('delete-test');
  await storage.open(['projects']);
  await storage.put('projects', 'a', { id: 'a' });
  await storage.delete('projects', 'a');
  const value = await storage.get('projects', 'a');
  assert.equal(value, null);
});

function fakeFetchOver() {
  const tree = {
    tree: [
      { path: 'main.tf', type: 'blob' },
      { path: 'modules/storage.tf', type: 'blob' },
    ],
  };
  const files = {
    '/repos/o/r/git/trees/main?recursive=1': () => ({ status: 200, body: tree }),
    '/repos/o/r/contents/main.tf?ref=main': () => ({
      status: 200,
      body: 'variable "name" {\n  type = string\n}',
    }),
    '/repos/o/r/contents/modules/storage.tf?ref=main': () => ({
      status: 200,
      body: '# storage\nvariable "sku" {\n  type    = string\n  default = "LRS"\n}',
    }),
  };
  return async (url, init) => {
    const path = url.replace('https://api.github.com', '');
    const handler = files[path];
    if (!handler) {
      return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
    }
    const { status, body } = handler();
    return {
      ok: status < 300,
      status,
      json: async () => body,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    };
  };
}

test('BrowserServices addRepository scans and parses remote modules', async () => {
  const services = new BrowserServices(new BrowserStorage('services-repo-test'));
  services.setTransportFetchForTests(fakeFetchOver());
  await services.initialize();
  const result = await services.addRepository('https://github.com/o/r', 'main', { type: 'none' });
  assert.equal(result.modules, 2);
  const modules = await services.listModules(result.id);
  assert.equal(modules[0].parameters.length, 1);
});

test('BrowserServices persists projects across service instances', async () => {
  const services = new BrowserServices(new BrowserStorage('services-persist-test'));
  await services.initialize();
  await services.saveProject({ id: 'p1', name: 'demo', content: 'x', updatedAt: 1 });
  const second = new BrowserServices(new BrowserStorage('services-persist-test'));
  await second.initialize();
  const loaded = await second.loadProject('p1');
  assert.equal(loaded?.name, 'demo');
  const all = await second.listProjects();
  assert.equal(all.length, 1);
});
