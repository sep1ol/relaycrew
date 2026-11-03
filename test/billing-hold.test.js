import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AccountManager } from '../src/account-manager.js';
import { createProxyServer } from '../src/server.js';
import { normalizeCodexUsagePayload } from '../src/codex-usage.js';
import { BILLING_RECHECK_SECONDS } from '../src/billing.js';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const resetAt = () => Math.floor(Date.now() / 1000) + 27 * 86400;
const codexAccount = (port, extra = {}) => ({
  name: 'private-free-account', type: 'oauth', provider: 'codex',
  accessToken: 't', refreshToken: 'r', expiresAt: Date.now() + 3600_000,
  accountId: 'a', upstream: `http://127.0.0.1:${port}`, ...extra,
});
const limitReached = (plan, resets) => JSON.stringify({ error: {
  type: 'usage_limit_reached', message: 'The usage limit has been reached', plan_type: plan, resets_at: resets,
} });
const freeHeaders = resets => ({
  'content-type': 'application/json', 'x-codex-plan-type': 'free',
  'x-codex-primary-used-percent': '100', 'x-codex-primary-window-minutes': '43200', 'x-codex-primary-reset-at': String(resets),
});

async function fixture(t, handler, { accounts = port => [codexAccount(port)], config = { proxy: { apiKey: 'k' } } } = {}) {
  const hits = [];
  const upstream = http.createServer((req, res) => { hits.push(req.headers); handler(req, res, hits.length); });
  const am = new AccountManager(accounts(await listen(upstream)), 0.98);
  const proxy = createProxyServer(am, config);
  const port = await listen(proxy);
  t.after(() => { for (const server of [proxy, upstream]) { server.closeAllConnections(); server.close(); } });
  const call = async (model = 'gpt-6-luna', headers = {}) => {
    const start = Date.now();
    const response = await fetch(`http://127.0.0.1:${port}/backend-api/codex/responses`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ model, input: [], stream: true }),
    });
    const text = await response.text();
    return { status: response.status, retryAfter: Number(response.headers.get('retry-after')), text,
      json: () => JSON.parse(text), ms: Date.now() - start };
  };
  return { am, hits, call };
}

test('free-plan usage_limit_reached 429 does not pause the account: a second request on another model answers within 2s', async t => {
  const resets = resetAt();
  let release;
  const firstHit = new Promise(resolve => { release = resolve; });
  const f = await fixture(t, (_req, res) => { res.writeHead(429, freeHeaders(resets)); res.end(limitReached('free', resets)); release(); },
    { config: { proxy: { apiKey: 'k', holdSeconds: 30 } } });
  const check = result => {
    assert.equal(result.status, 429);
    assert.ok(result.ms < 2000, `answered in ${result.ms}ms`);
    assert.ok(result.retryAfter >= 1 && result.retryAfter <= 3600);
    const body = result.json();
    assert.deepEqual(Object.keys(body), ['error']);
    assert.equal(body.error.type, 'usage_limit_reached');
    assert.equal(body.error.plan_type, 'free');
    assert.equal(body.error.resets_at, resets);
    assert.match(body.error.message, /no paid account available/);
  };
  const [first, second] = await Promise.all([f.call('gpt-6-luna'), firstHit.then(() => f.call('nope-model'))]);
  check(first);
  check(second);
  assert.ok(f.hits.length <= 2);
  assert.equal(f.am.isPaused(0), false);
  assert.equal(f.am.unavailableReason(f.am.accounts[0]), 'billing');
});

test('body-only and monthly Codex refusals hold and answer both models without waiting', async t => {
  for (const headers of [{}, { 'x-codex-primary-window-minutes': '43200' }, { 'x-should-retry': 'false' }]) {
    const resets = resetAt();
    const f = await fixture(t, (_req, res) => { res.writeHead(429, { 'content-type': 'application/json', ...headers }); res.end(limitReached('free', resets)); });
    for (const model of ['gpt-6-luna', 'nope-model']) {
      const result = await f.call(model);
      assert.equal(result.status, 429);
      assert.ok(result.ms < 2000, `answered in ${result.ms}ms`);
      assert.match(result.json().error.message, /no paid account available/);
      assert.equal(result.json().error.plan_type, 'free');
      assert.equal(result.json().error.resets_at, resets);
      assert.equal(result.retryAfter, 3600);
    }
    assert.equal(f.hits.length, 1);
    assert.equal(f.am.unavailableReason(f.am.accounts[0]), 'billing');
    assert.equal(f.am.isPaused(0), false);
  }
});

test('monthly Codex exhaustion rotates to a paid sibling without pausing', async t => {
  const f = await fixture(t, (req, res) => {
    if (req.headers.authorization === 'Bearer t') {
      res.writeHead(429, { 'content-type': 'application/json', 'x-codex-primary-window-minutes': '43200' });
      res.end(limitReached('free', null));
    } else { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); }
  }, { accounts: port => [codexAccount(port), codexAccount(port, { name: 'paid', accountId: 'paid', accessToken: 'paid' })] });
  const result = await f.call();
  assert.equal(result.status, 200);
  assert.ok(result.ms < 2000, `answered in ${result.ms}ms`);
  assert.equal(f.hits.length, 2);
  assert.equal(f.am.unavailableReason(f.am.accounts[0]), 'billing');
  assert.equal(f.am.isPaused(0), false);
});

test('a paid usage_limit_reached 429 is a rate-limit hold until its reset, not a billing hold, and does not fast-fail', async t => {
  const resets = Math.floor(Date.now() / 1000) + 1800;
  const f = await fixture(t, (_req, res) => {
    res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '45', 'x-codex-plan-type': 'pro',
      'x-codex-primary-used-percent': '50', 'x-codex-primary-window-minutes': '10080' });
    res.end(limitReached('pro', resets));
  });
  const before = Date.now();
  const result = await f.call();
  assert.equal(result.status, 429);
  assert.equal(result.json().type, 'error');
  assert.equal(result.json().error.type, 'rate_limit_error');
  assert.equal(f.hits.length, 1);
  const account = f.am.accounts[0];
  assert.equal(account.quota.billingHold, null);
  assert.equal(f.am.unavailableReason(account), 'throttled');
  assert.ok(account.rateLimitedUntil >= before + 1799_000 && account.rateLimitedUntil <= Date.now() + 1800_000);
  assert.ok(result.retryAfter >= 1795 && result.retryAfter <= 1800);
  assert.equal(f.am.isPaused(0), false);
});

test('a paid wham verdict leaves billing alone; a free one holds, allowed:true clears, and a missing verdict keeps the hold', () => {
  const am = new AccountManager([codexAccount(1)], 0.98);
  const resets = resetAt();
  const window = { limit_window_seconds: 2592000, used_percent: 100, reset_at: resets };
  am.applyCodexUsageData(0, normalizeCodexUsagePayload({ plan_type: 'pro', rate_limit: { allowed: false, limit_reached: true, primary_window: window } }));
  assert.equal(am.accounts[0].quota.billingHold, null);
  assert.equal(am.unavailableReason(am.accounts[0]), null);
  am.applyCodexUsageData(0, normalizeCodexUsagePayload({ plan_type: 'free', rate_limit: { allowed: false, primary_window: window } }));
  assert.equal(am.unavailableReason(am.accounts[0]), 'billing');
  assert.equal(am.accounts[0].quota.billingHold.until, resets * 1000);
  assert.equal(am.getStatus().accounts[0].billing.kind, 'exhausted');
  am.applyCodexUsageData(0, normalizeCodexUsagePayload({}));
  assert.equal(am.unavailableReason(am.accounts[0]), 'billing');
  am.applyCodexUsageData(0, normalizeCodexUsagePayload({ plan_type: 'free', rate_limit: { allowed: true } }));
  assert.equal(am.accounts[0].quota.billingHold, null);
  assert.equal(am.unavailableReason(am.accounts[0]), null);
  assert.equal(am.getStatus().accounts[0].billing.kind, 'free');
});

test('restart restores the hold until its date and the latest reset replaces an older one', () => {
  const account = codexAccount(1);
  const am = new AccountManager([account], 0.98);
  const until = Date.now() + 27 * 86400_000;
  am.holdBilling(0, { reason: 'exhausted', until: until + 1000, plan: 'free' });
  am.holdBilling(0, { reason: 'exhausted', until, plan: 'free' });
  const restored = new AccountManager([account], 0.98);
  restored.restoreQuotaState(JSON.parse(JSON.stringify(am.exportQuotaState())));
  assert.equal(restored.accounts[0].quota.billingHold.until, until);
  assert.equal(restored.unavailableReason(restored.accounts[0]), 'billing');
  assert.equal(restored.getStatus().accounts[0].billing.plan, 'Free');
  restored.accounts[0].quota.billingHold.until = Date.now() - 1;
  assert.equal(restored.unavailableReason(restored.accounts[0]), null);
});

test('a held account is probed once an hour: no upstream hit inside the hour, then a 2xx clears the hold', async t => {
  const f = await fixture(t, (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); });
  f.am.holdBilling(0, { reason: 'exhausted', until: Date.now() + 27 * 86400_000, plan: 'free' });
  const inside = await f.call();
  assert.equal(inside.status, 429);
  assert.equal(f.hits.length, 0);
  f.am.accounts[0].quota.billingHold.seenAt -= BILLING_RECHECK_SECONDS * 1000 + 1;
  const after = await f.call();
  assert.equal(after.status, 200);
  assert.equal(f.hits.length, 1);
  assert.equal(f.am.accounts[0].quota.billingHold, null);
});

test('a member on a dry free pool sees the pool message without account names or unpermitted accounts', async t => {
  const f = await fixture(t, (_req, res) => { res.writeHead(500); res.end(); }, {
    accounts: port => [codexAccount(port, { id: 'allowed' }), codexAccount(port, { id: 'other', name: 'unpermitted-paid', accountId: 'other' })],
    config: { proxy: { teamMode: true, apiKey: 'admin', clientKeys: [{ name: 'alice', key: 'member', accounts: ['allowed'] }] } },
  });
  f.am.holdBilling(0, { reason: 'exhausted', until: Date.now() + 27 * 86400_000, plan: 'free' });
  const result = await f.call('gpt-6-luna', { 'x-api-key': 'member' });
  assert.equal(result.status, 429);
  assert.ok(result.ms < 2000, `answered in ${result.ms}ms`);
  assert.equal(f.hits.length, 0);
  assert.match(result.json().error.message, /no paid account available; 1 account is on a free plan/);
  assert.ok(!result.text.includes('private-free-account'));
  assert.ok(!result.text.includes('unpermitted-paid'));
  assert.equal(result.json().error.plan_type, 'free');
});

test('a mixed pool caps retry-after at an hour while the message keeps the reset date', async t => {
  const f = await fixture(t, (_req, res) => { res.writeHead(500); res.end(); },
    { accounts: port => [codexAccount(port), codexAccount(port, { name: 'needs-login', accountId: 'b', accessToken: 'b' })] });
  const until = Date.now() + 27 * 86400_000;
  f.am.holdBilling(0, { reason: 'exhausted', until, plan: 'free' });
  f.am.accounts[1].status = 'error';
  const result = await f.call();
  assert.equal(result.status, 429);
  assert.equal(f.hits.length, 0);
  assert.ok(result.retryAfter >= 1 && result.retryAfter <= 3600, `retry-after ${result.retryAfter}`);
  assert.match(result.json().error.message, /needs re-login/);
  assert.match(result.json().error.message, /no paid account available; "private-free-account" is on a free plan, limit reached, resets \d{4}-\d{2}-\d{2}, and no other account/);
});

test('a named-family refusal at the retry limit holds nothing account-wide', async t => {
  process.env.RELAYCREW_HEADERLESS_429_RETRY_DELAY_MS = '1';
  t.after(() => { delete process.env.RELAYCREW_HEADERLESS_429_RETRY_DELAY_MS; });
  const f = await fixture(t, (_req, res, hit) => {
    if (hit === 1) {
      res.writeHead(429, { 'content-type': 'application/json' });
      res.end('{"error":{"message":"blip"}}');
      return;
    }
    res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '45', 'x-codex-plan-type': 'pro',
      'x-codex-primary-used-percent': '50', 'x-codex-primary-window-minutes': '10080',
      'x-codex-gpt-5-limit-name': 'gpt-5', 'x-codex-gpt-5-secondary-used-percent': '100', 'x-codex-gpt-5-secondary-window-minutes': '10080' });
    res.end(limitReached('pro', Math.floor(Date.now() / 1000) + 7 * 86400));
  });
  const result = await f.call('gpt-5');
  assert.equal(result.status, 429);
  assert.equal(f.hits.length, 2);
  const account = f.am.accounts[0];
  assert.equal(account.quota.billingHold, null);
  assert.equal(account.rateLimitedUntil, null);
  assert.equal(account.status, 'active');
});

test('an unrelated Codex no-retry 429 relays its body without changing account billing', async t => {
  const body = '{"error":{"message":"invalid model"}}';
  const f = await fixture(t, (_req, res) => { res.writeHead(429, { 'content-type': 'application/json', 'x-should-retry': 'false' }); res.end(body); });
  const result = await f.call();
  assert.equal(result.status, 429);
  assert.equal(result.text, body);
  assert.equal(f.hits.length, 1);
  assert.equal(f.am.accounts[0].quota.billingHold, null);
  assert.equal(f.am.isPaused(0), false);
});
