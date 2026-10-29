import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startGrokLogin, refreshGrokToken } from '../src/grok-auth.js';
import { AccountManager } from '../src/account-manager.js';

const jwt = payload => `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
const tokens = () => ({ access_token: jwt({ principal_id: 'user', sub: 'fallback', team_id: 'team', exp: 2_000_000_000 }), refresh_token: 'rotated', expires_in: 21600, id_token: jwt({ email: 'member@example.invalid' }) });
const reply = (data, status = 200) => ({ ok: status < 300, status, json: async () => data });

test('Grok device flow sends forms, respects pending and slow_down, and extracts identity', async () => {
  const calls = [], waits = [];
  const responses = [
    reply({ device_code: 'device-secret', user_code: 'ABCD-EFGH', verification_uri_complete: 'https://accounts.x.ai/oauth2/device?user_code=ABCD-EFGH', expires_in: 1800, interval: 5 }),
    reply({ error: 'authorization_pending' }, 400), reply({ error: 'slow_down' }, 400), reply(tokens()),
  ];
  const routing = { host: 'proxy.invalid', port: 1234 };
  const flow = await startGrokLogin({ routing, fetchImpl: async (url, options) => {
    calls.push({ url, options, form: new URLSearchParams(options.body) });
    return responses.shift();
  }, sleep: async ms => { waits.push(ms); } });
  assert.equal(flow.userCode, 'ABCD-EFGH');
  assert.equal(flow.url, 'https://accounts.x.ai/oauth2/device?user_code=ABCD-EFGH');
  assert.deepEqual(await flow.credentials, {
    accessToken: tokens().access_token, refreshToken: 'rotated', userId: 'user', teamId: 'team', email: 'member@example.invalid',
    expiresAt: (await flow.credentials).expiresAt,
  });
  assert.ok((await flow.credentials).expiresAt > Date.now() + 5 * 3600_000);
  assert.deepEqual(waits, [5000, 5000, 10000]);
  assert.equal(calls[0].url, 'https://auth.x.ai/oauth2/device/code');
  assert.equal(calls[0].form.get('scope'), 'openid profile email offline_access grok-cli:access api:access');
  for (const call of calls) {
    assert.equal(call.options.routing, routing);
    assert.equal(call.options.headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.equal(call.form.get('client_id'), 'b1a00492-073a-47ea-816f-4c329264a828');
  }
  for (const call of calls.slice(1)) {
    assert.equal(call.url, 'https://auth.x.ai/oauth2/token');
    assert.equal(call.form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:device_code');
    assert.equal(call.form.get('device_code'), 'device-secret');
  }
});

test('Grok device flow reports denial, expiry and cancellation without real endpoints', async () => {
  for (const error of ['expired_token', 'access_denied']) {
    let count = 0;
    const flow = await startGrokLogin({ fetchImpl: async () => ++count === 1
      ? reply({ device_code: 'fake', user_code: 'CODE', verification_uri: 'https://accounts.x.ai/device', expires_in: 1800 })
      : reply({ error }, 400), sleep: async () => {} });
    await assert.rejects(flow.credentials, error === 'expired_token' ? /expired/ : /denied/);
    assert.equal(count, 2);
  }
  const controller = new AbortController();
  const flow = await startGrokLogin({ signal: controller.signal, fetchImpl: async () => reply({ device_code: 'fake', user_code: 'CODE', verification_uri: 'https://accounts.x.ai/device', expires_in: 1800 }) });
  controller.abort();
  await assert.rejects(flow.credentials, { name: 'AbortError' });
});

test('Grok userinfo fallback and refresh preserve or rotate the refresh token', async () => {
  const data = { ...tokens(), access_token: jwt({ sub: 'fallback', team_id: 'team' }), id_token: undefined };
  let count = 0;
  const flow = await startGrokLogin({ fetchImpl: async (url, options) => {
    if (++count === 1) return reply({ device_code: 'fake', user_code: 'CODE', verification_uri: 'https://accounts.x.ai/device', expires_in: 1800 });
    if (count === 2) return reply(data);
    assert.equal(url, 'https://auth.x.ai/oauth2/userinfo');
    assert.equal(options.headers.Authorization, `Bearer ${data.access_token}`);
    return reply({ email: 'userinfo@example.invalid' });
  }, sleep: async () => {} });
  assert.equal((await flow.credentials).email, 'userinfo@example.invalid');
  assert.equal((await flow.credentials).userId, 'fallback');
  for (const rotated of ['new-refresh', undefined]) {
    const result = await refreshGrokToken('previous', undefined, null, { fetchImpl: async (url, options) => {
      assert.equal(url, 'https://auth.x.ai/oauth2/token');
      const form = new URLSearchParams(options.body);
      assert.equal(form.get('grant_type'), 'refresh_token');
      assert.equal(form.get('refresh_token'), 'previous');
      assert.equal(form.get('client_id'), 'b1a00492-073a-47ea-816f-4c329264a828');
      return reply({ ...tokens(), refresh_token: rotated });
    } });
    assert.equal(result.refreshToken, rotated || 'previous');
  }
  await assert.rejects(refreshGrokToken('fake', undefined, null, { fetchImpl: async () => reply({ error: 'invalid_grant' }, 400) }), { status: 400 });
  await assert.rejects(refreshGrokToken('fake', undefined, null, { fetchImpl: async () => reply({}) }), /identity|access_token/);
});

test('account manager dispatches early and forced refreshes to Grok and announces rotated tokens', async () => {
  let refreshes = 0;
  const persisted = [];
  const manager = new AccountManager([{ name: 'grok', type: 'oauth', provider: 'grok', accessToken: 'old', refreshToken: 'previous', userId: 'user', teamId: 'team', email: 'member@example.invalid', expiresAt: Date.now() + 4 * 60_000 }], 0.98, {
    forcedRefreshFloorMs: 0,
    refreshFn: async () => assert.fail('Anthropic refresh must not run'),
    codexRefreshFn: async () => assert.fail('Codex refresh must not run'),
    grokRefreshFn: async refreshToken => {
      assert.equal(refreshToken, refreshes ? 'new-1' : 'previous');
      refreshes++;
      return { accessToken: `access-${refreshes}`, refreshToken: `new-${refreshes}`, expiresAt: Date.now() + 6 * 3600_000 };
    },
  });
  manager.onTokenRefresh((_index, value) => persisted.push(value));
  await manager.ensureTokenFresh(0);
  await manager.ensureTokenFresh(0);
  assert.equal(refreshes, 1);
  await manager.ensureTokenFresh(0, true);
  assert.equal(refreshes, 2);
  assert.equal(persisted[1].refreshToken, 'new-2');
  assert.equal(manager.accounts[0].credential, 'access-2');
  assert.equal(manager.accounts[0].teamId, 'team');
  assert.equal(manager.accounts[0].email, 'member@example.invalid');
});
