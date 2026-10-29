import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { upsertCodexAccount, upsertOAuthAccount } from '../src/account-upsert.js';
import { setUpstreamProxy, resolveUpstreamProxy, resetUpstreamProxy } from '../src/upstream-proxy.js';

for (const [provider, upsert] of [['codex', upsertCodexAccount], ['anthropic', upsertOAuthAccount]]) test(`${provider} upserts preserve the same owner and refuse a different owner without writing`, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'relaycrew-upsert-'));
  const previous = process.env.RELAYCREW_CONFIG;
  const path = process.env.RELAYCREW_CONFIG = join(dir, 'config.json');
  const fetchImpl = globalThis.fetch;
  setUpstreamProxy(resolveUpstreamProxy({ upstreamProxy: false }, {}));
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.anthropic.com/api/oauth/profile');
    const other = options.headers.Authorization === 'Bearer other-new';
    return { ok: true, json: async () => ({ account: { uuid: other ? 'other-acct' : 'acct', email: other ? 'My account' : 'new@example.com' }, organization: { uuid: 'org' } }) };
  };
  t.after(async () => {
    globalThis.fetch = fetchImpl;
    resetUpstreamProxy();
    if (previous === undefined) delete process.env.RELAYCREW_CONFIG; else process.env.RELAYCREW_CONFIG = previous;
    await rm(dir, { recursive: true, force: true });
  });
  const owner = { name: 'alice', sharing: 'pool' };
  const original = { id: 'stable', name: 'My account', type: 'oauth', provider, ...(provider === 'codex' ? { accountId: 'acct', userId: 'user' } : { accountUuid: 'acct', orgUuid: 'org' }), owner, disabled: true, accessToken: 'old' };
  await writeFile(path, JSON.stringify({ accounts: [original] }));
  const creds = { accountId: 'acct', userId: 'user', email: 'new@example.com', accessToken: 'new', refreshToken: 'refresh', expiresAt: Date.now() + 3600_000 };
  assert.deepEqual(await upsert(creds, { owner: { ...owner, sharing: 'private' } }), { action: 'updated', id: 'stable', name: 'My account' });
  let saved = JSON.parse(await readFile(path, 'utf8'));
  assert.deepEqual(saved.accounts[0].owner, owner);
  assert.equal(saved.accounts[0].disabled, true);
  assert.equal(saved.accounts[0].accessToken, 'new');
  const before = await readFile(path, 'utf8');
  for (const incoming of [{ name: 'bob', sharing: 'private' }, null]) {
    await assert.rejects(upsert(creds, { owner: incoming }), { status: 409, message: 'This provider account is already in the gateway.' });
    assert.equal(await readFile(path, 'utf8'), before);
  }
  delete saved.accounts[0].owner;
  await writeFile(path, JSON.stringify(saved));
  const operator = await readFile(path, 'utf8');
  await assert.rejects(upsert(creds, { owner }), { status: 409 });
  assert.equal(await readFile(path, 'utf8'), operator);

  const added = await upsert({ ...creds, accountId: 'other-acct', email: 'My account', accessToken: 'other-new' }, { owner });
  assert.equal(added.name, 'My account (alice)');
  assert.ok(added.id);
  saved = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(saved.accounts.length, 2);
  assert.deepEqual(saved.accounts[1].owner, owner);
});
