import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemberLogins } from '../src/member-logins.js';
import { codeRace } from '../src/login-flow.js';
import { startCodexLogin } from '../src/codex-auth.js';

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
