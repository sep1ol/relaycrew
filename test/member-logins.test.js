import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemberLogins } from '../src/member-logins.js';
import { codeRace } from '../src/login-flow.js';
import { startCodexLogin } from '../src/codex-auth.js';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleAccountRequest } from '../src/account-api.js';
import { authenticateTeam } from '../src/team-access.js';

test('pending logins bind keys, retry pastes, replace older flows and enforce cap and expiry', async () => {
  let now = 1000;
  let exchange = null;
  let finishExchange;
  const signals = [];
  const start = async options => {
    assert.ok(options.loopback === false || options.listen === false);
    signals.push(options.signal);
    const race = codeRace({ signal: options.signal, timeoutMs: 0, parse: text => {
      if (text !== 'code') throw new Error('Paste the code.');
      return text;
    } });
    return { url: 'https://provider.invalid/authorize', submit: race.submit, tokens: race.result.then(() => exchange ?? { accessToken: 'secret' }) };
  };
  const logins = new MemberLogins({ now: () => now, max: 1, timeoutMs: 100, startClaude: start });
  const alice = { kind: 'member', name: 'alice', fingerprint: 'key1' };
  const options = { provider: 'claude', sharing: 'private' };
  const first = await logins.start(alice, options);
  assert.equal(logins.find({ ...alice, fingerprint: 'key2' }, first.id), null);
  assert.equal(logins.find({ ...alice, name: 'bob' }, first.id), null);
  await assert.rejects(logins.start({ ...alice, name: 'bob' }, options), { status: 429 });
  const replacement = await logins.start({ ...alice, fingerprint: 'key2' }, options);
  assert.equal(signals[0].aborted, true);
  assert.equal(logins.find(alice, first.id), null);
  now += 101;
  assert.equal(logins.find({ ...alice, fingerprint: 'key2' }, replacement.id), null);
  assert.equal(signals[1].aborted, true);
  const login = await logins.start(alice, options);
  assert.throws(() => logins.submit(alice, login.id, 'bad'), /Paste the code/);
  assert.ok(logins.find(alice, login.id));
  assert.equal(logins.submit(alice, login.id, 'code'), true);
  assert.equal(logins.submit(alice, login.id, 'code'), false);
  assert.deepEqual(await logins.result(alice, login.id), { accessToken: 'secret' });
  assert.equal(logins.find(alice, login.id), null);
  const cancelled = await logins.start(alice, options);
  logins.cancel(alice, cancelled.id);
  assert.equal(logins.find(alice, cancelled.id), null);
  exchange = new Promise(resolve => { finishExchange = resolve; });
  const inFlight = await logins.start(alice, options);
  logins.submit(alice, inFlight.id, 'code');
  const result = logins.result(alice, inFlight.id);
  logins.cancel(alice, inFlight.id);
  await assert.rejects(result, { status: 404 });
  finishExchange({ accessToken: 'too late' });
  assert.equal(logins.find(alice, inFlight.id), null);
});

test('Codex paste-only login skips the listener and exchanges the pasted callback', async () => {
  const flow = await startCodexLogin({ listen: false, port: -1, exchange: async ({ code }) => ({ accessToken: code }) });
  assert.equal(flow.listening, false);
  assert.equal(flow.listenError, null);
  const state = new URL(flow.url).searchParams.get('state');
  assert.equal(flow.submit(`http://localhost:1455/auth/callback?state=${state}&code=fake-code`), true);
  assert.deepEqual(await flow.credentials, { accessToken: 'fake-code' });
});

test('Grok member completion returns 202, retains authorization between polls, then saves the owned account', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'relaycrew-grok-login-'));
  const previous = process.env.RELAYCREW_CONFIG;
  const path = process.env.RELAYCREW_CONFIG = join(dir, 'config.json');
  const config = { accounts: [], proxy: { teamMode: true, apiKey: 'admin', clientKeys: [{ name: 'alice', key: 'member-key', accounts: '*' }] } };
  await writeFile(path, JSON.stringify(config));
  let authorize;
  const credentials = new Promise(resolve => { authorize = resolve; });
  let now = 1000;
  const logins = new MemberLogins({ now: () => now, waitMs: 1, startGrok: async ({ timeoutMs }) => {
    assert.equal(timeoutMs, 15 * 60_000);
    return { url: 'https://accounts.x.ai/device', userCode: 'ABCD-EFGH', expiresAt: now + timeoutMs, credentials };
  } });
  t.after(async () => {
    for (const pending of logins.pending.values()) logins.drop(pending);
    if (previous === undefined) delete process.env.RELAYCREW_CONFIG; else process.env.RELAYCREW_CONFIG = previous;
    await rm(dir, { recursive: true, force: true });
  });
  const identity = authenticateTeam(config.proxy, 'member-key').identity;
  async function request(route, body) {
    let status, data;
    const response = { writeHead(code) { status = code; }, end(text) { data = JSON.parse(text); } };
    await handleAccountRequest({ method: 'POST', url: `/relaycrew/accounts/${route}`, tcTeamIdentity: identity }, response, {
      config, logins, readBody: async () => JSON.stringify(body), hooks: { reload: async () => {} },
    });
    return { status, data };
  }
  const started = await request('login', { provider: 'grok', sharing: 'private' });
  assert.equal(started.status, 201);
  assert.equal(started.data.login.paste, 'none');
  assert.equal(started.data.login.userCode, 'ABCD-EFGH');
  assert.equal(started.data.login.expiresAt, now + 15 * 60_000);
  const id = started.data.login.id;
  assert.deepEqual(await request('login/complete', { id }), { status: 202, data: { ok: true, pending: true } });
  authorize({ userId: 'grok-user', teamId: 'grok-team', email: 'alice@example.invalid', accessToken: 'access-secret', refreshToken: 'refresh-secret', expiresAt: Date.now() + 21600_000 });
  await logins.result(identity, id);
  assert.ok(logins.find(identity, id));
  const complete = await request('login/complete', { id });
  assert.equal(complete.status, 200);
  assert.equal(complete.data.account.provider, 'grok');
  assert.equal(complete.data.account.owner, 'alice');
  assert.equal(JSON.stringify(complete).includes('secret'), false);
  assert.equal(logins.find(identity, id), null);
  const saved = JSON.parse(await readFile(path, 'utf8')).accounts[0];
  assert.deepEqual(saved.owner, { name: 'alice', sharing: 'private' });
  assert.equal(saved.refreshToken, 'refresh-secret');
  const next = await logins.start(identity, { provider: 'grok', sharing: 'pool' });
  now += 15 * 60_000;
  assert.equal(logins.find(identity, next.id), null);
});
