import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AccountManager } from '../src/account-manager.js';
import { createProxyServer } from '../src/server.js';
import { BILLING_RECHECK_SECONDS } from '../src/billing.js';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const creditTooLow = '{"error":{"message":"Your credit balance is too low"}}';

async function fixture(t, provider, handler, { count = 2, holdSeconds } = {}) {
  const hits = [];
  const upstream = http.createServer((req, res) => { hits.push(req.headers); handler(req, res); });
  const origin = `http://127.0.0.1:${await listen(upstream)}`;
  const accounts = ['first', 'second'].slice(0, count).map(name => provider === 'grok'
    ? { name, provider, type: 'oauth', accessToken: name, refreshToken: 'r', expiresAt: Date.now() + 3600_000, userId: name, teamId: name, upstream: origin }
    : { name, type: 'apikey', apiKey: name });
  const am = new AccountManager(accounts, 0.98);
  const proxy = createProxyServer(am, { proxy: { apiKey: 'k', holdSeconds }, upstream: origin });
  const port = await listen(proxy);
  t.after(() => { for (const server of [proxy, upstream]) { server.closeAllConnections(); server.close(); } });
  const call = async () => {
    const start = Date.now();
    const path = provider === 'grok' ? '/grok/v1/chat/completions' : '/v1/messages';
    const model = provider === 'grok' ? 'grok-4' : 'claude-sonnet-4-6';
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: [] }),
    });
    const text = await response.text();
    return { status: response.status, headers: response.headers, text, json: () => JSON.parse(text), ms: Date.now() - start };
  };
  return { am, hits, call };
}

test('Claude 400 credit balance too low holds for an hour and rotates', async t => {
  const f = await fixture(t, 'anthropic', (req, res) => {
    if (req.headers['x-api-key'] === 'first') { res.writeHead(400, { 'content-type': 'application/json' }); res.end(creditTooLow); }
    else { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); }
  });
  const before = Date.now();
  const result = await f.call();
  assert.equal(result.status, 200);
  assert.deepEqual(f.hits.map(hit => hit['x-api-key']), ['first', 'second']);
  const hold = f.am.accounts[0].quota.billingHold;
  assert.equal(hold.reason, 'no-credits');
  assert.ok(hold.until >= before + BILLING_RECHECK_SECONDS * 1000);
  assert.ok(hold.until <= Date.now() + BILLING_RECHECK_SECONDS * 1000);
  assert.equal(f.am.unavailableReason(f.am.accounts[0]), 'billing');
  assert.equal(f.am.isPaused(0), false);
});

test('a dry Claude credit pool answers at once despite a hold budget', async t => {
  const f = await fixture(t, 'anthropic', (_req, res) => { res.writeHead(400, { 'content-type': 'application/json' }); res.end(creditTooLow); },
    { count: 1, holdSeconds: 30 });
  const result = await f.call();
  assert.equal(result.status, 429);
  assert.ok(result.ms < 2000, `answered in ${result.ms}ms`);
  assert.equal(result.headers.get('retry-after'), '3600');
  assert.equal(result.json().type, 'error');
  assert.equal(result.json().error.type, 'rate_limit_error');
  assert.match(result.json().error.message, /no paid account available; "first" has no credits\.$/);
  assert.equal(f.hits.length, 1);
});

test('other Claude 400s relay untouched, including a body beyond the inspection limit', async t => {
  for (const message of ['invalid model', 'x'.repeat(80_000)]) {
    const body = JSON.stringify({ error: { message } });
    const f = await fixture(t, 'anthropic', (_req, res) => { res.writeHead(400, { 'content-type': 'application/json', 'x-original': 'yes' }); res.end(body); });
    const result = await f.call();
    assert.equal(result.status, 400);
    assert.equal(result.text, body);
    assert.equal(result.headers.get('x-original'), 'yes');
    assert.equal(f.hits.length, 1);
    assert.equal(f.am.accounts[0].quota.billingHold, null);
  }
});

test('Grok exhaustion creates a billing hold and rotates: a minute for a usage limit, an hour for credits', async t => {
  for (const [status, message, reason, seconds] of [[402, 'out of credits', 'no-credits', 3600], [429, 'usage limit reached', 'exhausted', 60], [403, 'usage balance exhausted', 'no-credits', 3600]]) {
    const f = await fixture(t, 'grok', (req, res) => {
      if (req.headers.authorization === 'Bearer first') { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message } })); }
      else { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); }
    });
    const before = Date.now();
    const result = await f.call();
    assert.equal(result.status, 200);
    assert.equal(f.hits.length, 2);
    const hold = f.am.accounts[0].quota.billingHold;
    assert.equal(hold.reason, reason);
    assert.ok(hold.until >= before + seconds * 1000 && hold.until <= Date.now() + seconds * 1000, `${status}: held ${(hold.until - before) / 1000}s`);
    assert.equal(f.am.accounts[0].rateLimitedUntil, null);
    assert.equal(f.am.unavailableReason(f.am.accounts[0]), 'billing');
    assert.equal(f.am.isPaused(0), false);
  }
});
