import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubBrowserTransport } from '../../dist-test/browser-services.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

function transportWith(handler) {
  return new GitHubBrowserTransport(async (url, init) => handler(url, init));
}

test('parses GitHub repo URLs', () => {
  const t = new GitHubBrowserTransport();
  assert.deepEqual(t.parseRepoUrl('https://github.com/owner/repo'), { owner: 'owner', repo: 'repo' });
  assert.deepEqual(t.parseRepoUrl('https://github.com/owner/repo.git'), { owner: 'owner', repo: 'repo' });
  assert.throws(() => t.parseRepoUrl('https://gitlab.com/owner/repo'), /Not a GitHub repository URL/);
});

test('lists bicep files from tree', async () => {
  const t = transportWith(() =>
    jsonResponse(200, { tree: [
      { path: 'main.tf', type: 'blob' },
      { path: 'modules/storage.tf', type: 'blob' },
      { path: 'README.md', type: 'blob' },
      { path: 'subdir', type: 'tree' },
    ] })
  );
  const files = await t.listTerraformFiles('owner', 'repo', 'main');
  assert.deepEqual(files, ['main.tf', 'modules/storage.tf']);
});

test('sends session token as bearer and never in URL', async () => {
  let seen = { url: '', auth: '' };
  const t = transportWith((url, init) => {
    seen = { url, auth: init.headers.Authorization ?? '' };
    return jsonResponse(200, { tree: [] });
  });
  t.setSessionToken('ghp_test');
  await t.listTerraformFiles('owner', 'repo', 'main');
  assert.ok(!seen.url.includes('ghp_test'), 'token must not appear in URL');
  assert.equal(seen.auth, 'Bearer ghp_test');
});

test('maps 401/403/404 to structured errors', async () => {
  for (const status of [401, 403, 404]) {
    const t = transportWith(() => jsonResponse(status, {}));
    await assert.rejects(() => t.listTerraformFiles('owner', 'repo', 'main'), error => /ERR_/.test(error.code));
  }
});

test('maps network failure to ERR_NETWORK', async () => {
  const t = new GitHubBrowserTransport(async () => { throw new TypeError('fetch failed'); });
  await assert.rejects(() => t.listTerraformFiles('owner', 'repo', 'main'), error => error.code === 'ERR_NETWORK');
});
