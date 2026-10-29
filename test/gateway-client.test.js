import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GatewayClient, RetryablePaste, resolveGateway } from '../src/gateway-client.js';

test('gateway resolution follows flag and environment precedence without local config', () => {
  const env = { RELAYCREW_GATEWAY: 'https://primary', ANTHROPIC_BASE_URL: 'https://fallback', RELAYCREW_KEY: 'primary', TEAM_GATEWAY_KEY: 'team', ANTHROPIC_AUTH_TOKEN: 'anthropic' };
  assert.deepEqual(resolveGateway(['--gateway', 'https://flag', '--key', 'flag'], env), { baseUrl: 'https://flag', key: 'flag' });
  assert.deepEqual(resolveGateway([], env), { baseUrl: 'https://primary', key: 'primary' });
  delete env.RELAYCREW_KEY;
  assert.equal(resolveGateway([], env).key, 'team');
  delete env.TEAM_GATEWAY_KEY;
  assert.equal(resolveGateway([], env).key, 'anthropic');
  delete env.RELAYCREW_GATEWAY;
  assert.equal(resolveGateway([], env).baseUrl, 'https://fallback');
  assert.deepEqual(resolveGateway([], { TEAMROUTER_GATEWAY: 'http://legacy', TEAMCLAUDE_KEY: 'legacy' }), { baseUrl: 'http://legacy', key: 'legacy' });
  assert.deepEqual(resolveGateway([], {}), { baseUrl: undefined, key: undefined });
});

test('gateway client preserves prefixes, sends keys only in headers, retries pastes and refuses redirects', async () => {
  const calls = [];
  const responses = [
    { status: 200, body: { ok: true, accounts: [] } },
    { status: 400, body: { ok: false, error: 'Paste the code.' } },
    { status: 307 },
  ];
  const client = new GatewayClient({ baseUrl: 'https://gateway.invalid/prefix/', key: 'secret', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    const reply = responses.shift();
    return { status: reply.status, ok: reply.status === 200, json: async () => reply.body, body: { cancel: async () => {} } };
  } });
  assert.deepEqual(await client.accounts(), { ok: true, accounts: [] });
  await assert.rejects(client.completeLogin('id', 'bad'), RetryablePaste);
  await assert.rejects(client.cancelLogin('id'), /redirects are refused/);
  assert.equal(calls[0].url, 'https://gateway.invalid/prefix/relaycrew/accounts');
  for (const { url, options } of calls) {
    assert.equal(options.headers['x-api-key'], 'secret');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.authorization, undefined);
    assert.equal(url.includes('secret'), false);
  }
  assert.equal(calls[1].options.body, JSON.stringify({ id: 'id', code: 'bad' }));
  assert.throws(() => new GatewayClient({ baseUrl: 'file:///tmp/config', key: 'secret' }), /http or https/);
});
