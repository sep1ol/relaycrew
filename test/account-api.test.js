import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountManager } from '../src/account-manager.js';
import { createProxyServer } from '../src/server.js';
import { MemberLogins } from '../src/member-logins.js';
import { codeRace } from '../src/login-flow.js';
import { loadConfig, saveConfig } from '../src/config.js';
import { syncAccountsFromDisk } from '../src/sync-accounts.js';

async function fixture(t, teamMode = true) {
  const dir = await mkdtemp(join(tmpdir(), 'relaycrew-account-api-'));
  const previous = process.env.RELAYCREW_CONFIG;
  const path = process.env.RELAYCREW_CONFIG = join(dir, 'config.json');
  const config = {
    proxy: { teamMode, apiKey: 'admin-secret', clientKeys: [
      { name: 'alice', key: 'alice-key', accounts: [] },
      { name: 'bob', key: 'bob-key', accounts: '*' },
    ] }, accounts: [],
  };
  await writeFile(path, JSON.stringify(config));
  const start = async ({ signal, timeoutMs, loopback, listen }) => {
    assert.ok(loopback === false || listen === false);
    const race = codeRace({ signal, timeoutMs, parse: text => {
      if (text.startsWith('https:')) throw new Error('That is the sign-in link itself. Paste the code.');
      return text;
    } });
    const credentials = race.result.then(code => {
      if (code === 'fail') throw new Error('provider response with secret');
      return { email: `${code}@example.com`, accountId: code, userId: 'user', accessToken: 'access-secret', refreshToken: 'refresh-secret', expiresAt: Date.now() + 3600_000 };
    });
    return { url: 'https://claude.ai/oauth/authorize?fake=1', submit: race.submit, tokens: credentials, credentials };
  };
  const logins = new MemberLogins({ startClaude: start, startCodex: start });
  const manager = new AccountManager([]);
  let failReload = false;
  const server = createProxyServer(manager, config, { reload: async () => {
    if (failReload) throw new Error('reload failed');
    const disk = await loadConfig();
    await syncAccountsFromDisk(disk, config, manager);
    config.proxy = disk.proxy;
  } }, null, null, null, { logins });
  t.after(async () => {
    for (const pending of logins.pending.values()) logins.drop(pending);
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    if (previous === undefined) delete process.env.RELAYCREW_CONFIG; else process.env.RELAYCREW_CONFIG = previous;
    await rm(dir, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  async function request(route = '/relaycrew/accounts', key = 'alice-key', body, headers = {}) {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'x-api-key': key, 'content-type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(3000),
    });
    return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() };
  }
  return { request, manager, path, failReload: () => { failReload = true; } };
}

test('members add, list, update and remove accounts through the real server gates', async t => {
  const f = await fixture(t);
  const login = await f.request('/teamclaude/accounts/login', 'alice-key', { provider: 'codex', sharing: 'pool' });
  assert.equal(login.status, 201);
  assert.equal(login.cache, 'no-store');
  assert.equal(login.body.login.paste, 'callback-url');
  const added = await f.request('/relaycrew/accounts/login/complete', 'alice-key', { id: login.body.login.id, code: 'alice' });
  assert.equal(added.status, 200);
  assert.equal(added.body.action, 'added');
  assert.equal(added.body.applied, true);
  const { id } = added.body.account;
  assert.deepEqual(added.body.account, { id, name: 'alice@example.com', provider: 'codex', owner: 'alice', sharing: 'pool', disabled: false });
  const listing = await f.request();
  assert.deepEqual(listing.body.accounts, [added.body.account]);
  assert.equal(JSON.stringify(listing).includes('secret'), false);
  assert.deepEqual((await f.request('/relaycrew/accounts', 'bob-key')).body.accounts, []);
  for (const other of [id, 'unknown']) {
    for (const action of ['update', 'remove']) {
      const response = await f.request(`/relaycrew/accounts/${action}`, 'bob-key', { id: other, ...(action === 'update' ? { disabled: true } : {}) });
      assert.equal(response.status, 403);
      assert.equal(response.body.error, 'That account is not yours.');
    }
  }
  const duplicate = await f.request('/relaycrew/accounts/login', 'bob-key', { provider: 'codex', sharing: 'private' });
  const before = await readFile(f.path, 'utf8');
  const conflict = await f.request('/relaycrew/accounts/login/complete', 'bob-key', { id: duplicate.body.login.id, code: 'alice' });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error, 'This provider account is already in the gateway.');
  assert.equal(await readFile(f.path, 'utf8'), before);
  const stale = await loadConfig();
  const revision = (await f.request('/relaycrew/team', 'admin-secret')).body.revision;
  const update = await f.request('/relaycrew/accounts/update', 'alice-key', { id, sharing: 'private', disabled: true });
  assert.equal(update.body.account.disabled, true);
  assert.deepEqual(f.manager.accounts[0].owner, { name: 'alice', sharing: 'private' });
  assert.equal(f.manager.accounts[0].disabled, true);
  const team = (await f.request('/relaycrew/team', 'admin-secret')).body;
  assert.notEqual(team.revision, revision);
  assert.equal(team.accounts[0].sharing, 'private');
  await saveConfig(stale);
  assert.deepEqual((await loadConfig()).accounts[0].owner, { name: 'alice', sharing: 'private' });
  const removed = await f.request('/relaycrew/accounts/remove', 'alice-key', { id });
  assert.equal(removed.body.removed, id);
  assert.equal(f.manager.accounts.length, 0);
  assert.deepEqual((await f.request()).body.accounts, []);
});

test('account HTTP validation, CSRF, pending-login errors and non-team boundaries', async t => {
  const f = await fixture(t);
  for (const route of ['/relaycrew/accounts/login', '/teamrouter/accounts/login', '/%74eamclaude/accounts/login', '/relaycrew/%61ccounts/login']) {
    const refused = await f.request(route, 'alice-key', { provider: 'claude', sharing: 'private' }, { origin: 'https://other.invalid' });
    assert.equal(refused.status, 403);
    assert.equal(refused.cache, 'no-store');
  }
  for (const body of [[], { provider: 'grok', sharing: 'pool' }, { provider: 'claude', sharing: 'public' }, { provider: 'claude', sharing: 'pool', owner: 'bob' }, { provider: 'claude', sharing: 'x'.repeat(65536) }]) {
    assert.equal((await f.request('/relaycrew/accounts/login', 'alice-key', body)).status, 400);
  }
  const started = await f.request('/relaycrew/accounts/login', 'alice-key', { provider: 'claude', sharing: 'private' });
  const id = started.body.login.id;
  assert.equal((await f.request('/relaycrew/accounts/login/complete', 'bob-key', { id, code: 'fail' })).status, 404);
  assert.equal((await f.request('/relaycrew/accounts/login/complete', 'alice-key', { id, code: started.body.login.url })).status, 400);
  const failed = await f.request('/relaycrew/accounts/login/complete', 'alice-key', { id, code: 'fail' });
  assert.equal(failed.status, 502);
  assert.equal(JSON.stringify(failed).includes('secret'), false);
  assert.equal((await f.request('/relaycrew/accounts/login/complete', 'alice-key', { id, code: 'fail' })).status, 404);
  const cancelled = await f.request('/relaycrew/accounts/login', 'alice-key', { provider: 'codex', sharing: 'private' });
  assert.equal((await f.request('/relaycrew/accounts/login/cancel', 'alice-key', { id: cancelled.body.login.id })).status, 200);
  const admin = await f.request('/relaycrew/accounts/login', 'admin-secret', { provider: 'codex' });
  const operator = await f.request('/relaycrew/accounts/login/complete', 'admin-secret', { id: admin.body.login.id, code: 'operator' });
  assert.equal(operator.body.account.owner, null);
  assert.equal(operator.body.account.sharing, 'operator');
  assert.equal((await f.request('/relaycrew/accounts/update', 'admin-secret', { id: operator.body.account.id, sharing: 'pool' })).status, 400);
  f.failReload();
  const saved = await f.request('/relaycrew/accounts/update', 'admin-secret', { id: operator.body.account.id, disabled: true });
  assert.equal(saved.body.applied, false);
  assert.ok(saved.body.warning);
  assert.equal((await loadConfig()).accounts[0].disabled, true);
});

test('account routes return 404 outside team mode', async t => {
  const f = await fixture(t, false);
  assert.equal((await f.request('/relaycrew/accounts', 'admin-secret')).status, 404);
  assert.equal((await f.request('/relaycrew/accounts/login', 'admin-secret', { provider: 'claude', sharing: 'pool' })).status, 404);
});
