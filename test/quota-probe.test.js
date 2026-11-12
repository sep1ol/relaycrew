import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUsageBucket, findScopedWeeklyLimit, normalizeUsagePayload, fetchUsage } from '../src/oauth.js';
import { AccountManager, isFableModel, parseRequestModel } from '../src/account-manager.js';
import { Prober, MAX_PROBE_INTERVAL_MS, probeApplicable } from '../src/prober.js';

function oauth(name, extra = {}) {
  return { name, type: 'oauth', accessToken: 't-' + name, expiresAt: Date.now() + 3600_000, ...extra };
}

// ── normalizeUsageBucket ──────────────────────────────────────

test('normalizeUsageBucket converts OAuth usage percentages to 0-1', () => {
  assert.equal(normalizeUsageBucket({ used_percentage: 42 }).utilization, 0.42);
  assert.equal(normalizeUsageBucket({ utilization: 1 }).utilization, 0.01);
  assert.equal(normalizeUsageBucket({ utilization: 2 }).utilization, 0.02);
  assert.equal(normalizeUsageBucket({ utilization: 100 }).utilization, 1);
  assert.equal(normalizeUsageBucket({ used_percentage: '30' }).utilization, 0.3);
  assert.equal(normalizeUsageBucket({ used_percentage: 1 }).utilization, 0.01);
  assert.equal(normalizeUsageBucket({ used_percentage: '1' }).utilization, 0.01);
  assert.equal(normalizeUsageBucket({ usedPercentage: '1' }).utilization, 0.01);
  assert.equal(normalizeUsageBucket({ utilization: '1' }).utilization, 0.01);
  assert.equal(normalizeUsageBucket(null), null);
  assert.equal(normalizeUsageBucket({}).utilization, null);
});

test('normalizeUsageBucket normalizes resets to ms epoch', () => {
  assert.equal(normalizeUsageBucket({ resets_at: 1700000000 }).resetAt, 1700000000000);     // seconds → ms
  assert.equal(normalizeUsageBucket({ resets_at: 1700000000000 }).resetAt, 1700000000000);  // already ms
  assert.equal(normalizeUsageBucket({ resets_at: '2026-01-01T00:00:00Z' }).resetAt, Date.parse('2026-01-01T00:00:00Z'));
});

// ── findScopedWeeklyLimit ─────────────────────────────────────

test('findScopedWeeklyLimit pulls a per-model weekly bucket from limits[]', () => {
  // Shape mirrors the real /api/oauth/usage payload: model-scoped weekly quota
  // lives in limits[] (the legacy seven_day_<model> top-level keys read null).
  const data = { limits: [
    { kind: 'session', group: 'session', percent: 47, scope: null },
    { kind: 'weekly_all', group: 'weekly', percent: 8, scope: null },
    { kind: 'weekly_scoped', group: 'weekly', percent: 100,
      resets_at: '2026-07-03T17:00:00Z', scope: { model: { display_name: 'Fable' } } },
  ]};
  const b = normalizeUsageBucket(findScopedWeeklyLimit(data, /fable/i));
  assert.equal(b.utilization, 1);
  assert.equal(b.resetAt, Date.parse('2026-07-03T17:00:00Z'));

  assert.equal(findScopedWeeklyLimit(data, /sonnet/i), null);   // no Sonnet-scoped entry
  assert.equal(findScopedWeeklyLimit({}, /fable/i), null);      // no limits[] at all
  assert.equal(findScopedWeeklyLimit({ limits: [] }, /fable/i), null);
});

// ── applyUsageData ────────────────────────────────────────────

test('applyUsageData populates 5h/7d/sonnet/fable without counting a request', () => {
  const am = new AccountManager([oauth('a')], 0.98);
  am.applyUsageData(0, {
    fiveHour: { utilization: 0.2, resetAt: 111 },
    sevenDay: { utilization: 0.4, resetAt: 222 },
    sevenDaySonnet: { utilization: 0.6, resetAt: 333 },
    sevenDayFable: { utilization: 0.5, resetAt: 444 },
  });
  const a = am.accounts[0];
  assert.equal(a.quota.unified5h, 0.2);
  assert.equal(a.quota.unified7d, 0.4);
  assert.equal(a.quota.unified7dSonnet, 0.6);
  assert.equal(a.quota.unified7dSonnetReset, 333);
  assert.equal(a.quota.unified7dFable, 0.5);
  assert.equal(a.quota.unified7dFableReset, 444);
  assert.equal(a.usage.totalRequests, 0);   // a probe is not real traffic
  assert.equal(a.probing, false);            // learned the weekly window…
  assert.equal(a.requalify, true);           // …so re-evaluate selection
});

test('sonnet + fable quota survive the persistence round-trip', () => {
  const am1 = new AccountManager([oauth('a', { accountUuid: 'p1' })], 0.98);
  am1.applyUsageData(0, {
    sevenDaySonnet: { utilization: 0.7, resetAt: 999 },
    sevenDayFable: { utilization: 0.3, resetAt: 888 },
  });
  const am2 = new AccountManager([oauth('a', { accountUuid: 'p1' })], 0.98);
  am2.restoreQuotaState(am1.exportQuotaState());
  assert.equal(am2.accounts[0].quota.unified7dSonnet, 0.7);
  assert.equal(am2.accounts[0].quota.unified7dSonnetReset, 999);
  assert.equal(am2.accounts[0].quota.unified7dFable, 0.3);
  assert.equal(am2.accounts[0].quota.unified7dFableReset, 888);
});

// ── normalizeUsagePayload: what a probe can conclude ──────────

// Shape copied from a real Max payload: the account has a Fable cap it has not
// touched (percent 0, no window started) and no Sonnet cap at all.
const USAGE_PAYLOAD = {
  five_hour: { utilization: 15, resets_at: '2026-09-02T13:59:59Z' },
  seven_day: { utilization: 6, resets_at: '2026-09-04T03:59:59Z' },
  seven_day_sonnet: null,
  limits: [
    { kind: 'session', group: 'session', percent: 15, scope: null },
    { kind: 'weekly_all', group: 'weekly', percent: 6, scope: null },
    { kind: 'weekly_scoped', group: 'weekly', percent: 0, resets_at: null,
      scope: { model: { id: null, display_name: 'Fable' } } },
  ],
};

test('shared usage falls back to unscoped limits when legacy readings are unusable', () => {
  const u = normalizeUsagePayload({
    five_hour: null,
    seven_day: { utilization: 'unknown' },
    limits: [
      { kind: 'session', group: 'session', percent: 12, scope: null, resets_at: '2026-12-01T13:00:00Z' },
      { kind: 'weekly_all', group: 'weekly', percent: 0, scope: null, resets_at: '2026-12-05T13:00:00Z' },
    ],
  });
  assert.deepEqual(u.fiveHour, { utilization: 0.12, resetAt: Date.parse('2026-12-01T13:00:00Z') });
  assert.deepEqual(u.sevenDay, { utilization: 0, resetAt: Date.parse('2026-12-05T13:00:00Z') });
});

test('usable legacy shared readings win over limits, including explicit zero', () => {
  for (const percent of [35, 0]) {
    const bucket = { utilization: percent, resets_at: '2026-12-01T13:00:00Z' };
    const u = normalizeUsagePayload({
      five_hour: bucket,
      seven_day: bucket,
      limits: [
        { kind: 'session', group: 'session', percent: 90, scope: null },
        { kind: 'weekly_all', group: 'weekly', percent: 90, scope: null },
      ],
    });
    const expected = { utilization: percent / 100, resetAt: Date.parse(bucket.resets_at) };
    assert.deepEqual(u.fiveHour, expected);
    assert.deepEqual(u.sevenDay, expected);
  }
});

test('missing or malformed shared limits preserve unknown readings and stored usage', () => {
  const limitsCases = [undefined, [], 'invalid', [
    null,
    { kind: 'session', group: 'session', percent: 'unknown', scope: null },
    { kind: 'weekly_all', group: 'weekly', percent: null, scope: null },
    { kind: 'session', group: 'session', percent: 0, scope: { model: { display_name: 'Sonnet' } } },
    { kind: 'weekly_all', group: 'weekly', percent: 0, scope: { model: { display_name: 'Sonnet' } } },
    { kind: 'weekly_scoped', group: 'weekly', percent: 0, scope: null },
    { kind: 'session', group: 'weekly', percent: 0, scope: null },
    { kind: 'weekly_all', group: 'session', percent: 0, scope: null },
  ]];
  const am = new AccountManager([oauth('a')], 0.98);
  const resetAt = Date.now() + 3600_000;
  am.applyUsageData(0, {
    fiveHour: { utilization: 0.98, resetAt },
    sevenDay: { utilization: 0.99, resetAt },
  });
  const before = { ...am.accounts[0].quota };
  for (const limits of limitsCases) {
    const u = normalizeUsagePayload({ limits });
    assert.equal(u.fiveHour, null);
    assert.equal(u.sevenDay, null);
    am.applyUsageData(0, u);
    for (const key of ['unified5h', 'unified7d', 'unified5hReset', 'unified7dReset', 'unified5hSeenAt', 'unified7dSeenAt']) {
      assert.equal(am.accounts[0].quota[key], before[key], key);
    }
  }
});

test('a listed-but-unused family reads as zero with no window', () => {
  const u = normalizeUsagePayload(USAGE_PAYLOAD);
  assert.equal(u.sevenDayFable.utilization, 0);
  assert.equal(u.sevenDayFable.resetAt, null);   // the window has not started
  assert.equal(u.sevenDaySonnet, null);          // this account has no Sonnet cap
  assert.equal(u.scopedWeeklyListed, true);      // …and upstream said so explicitly
});

test('Sonnet is read from the enumeration too, not only the legacy key', () => {
  const u = normalizeUsagePayload({ limits: [
    { kind: 'weekly_scoped', group: 'weekly', percent: 40, resets_at: '2026-09-04T03:59:59Z',
      scope: { model: { display_name: 'Sonnet' } } },
  ]});
  assert.equal(u.sevenDaySonnet.utilization, 0.4);
  // The legacy top-level key still wins where a plan still reports it.
  assert.equal(normalizeUsagePayload({ seven_day_sonnet: { utilization: 70 }, limits: [] }).sevenDaySonnet.utilization, 0.7);
});

test('a payload with no enumeration concludes nothing about families', () => {
  const u = normalizeUsagePayload({ five_hour: { utilization: 3 } });
  assert.equal(u.sevenDayFable, null);
  assert.equal(u.sevenDaySonnet, null);
  assert.equal(u.scopedWeeklyListed, false);
});

// ── applyUsageData: the probe revalidates family buckets ──────

// Put an account in the state #167 described: a spent family reading whose own
// reset is days out, so nothing expires it and selection refuses the family.
function sealFable(am, { utilization = 0.99 } = {}) {
  const q = am.accounts[0].quota;
  q.unified7dFable = utilization;
  q.unified7dFableReset = Date.now() + 7 * 24 * 3600_000;
  q.unified7dFableSeenAt = Date.now() - 60_000;
  return q;
}

test('a probe that reports the family available breaks the seal', () => {
  const am = new AccountManager([oauth('a')], 0.98);
  const q = sealFable(am);
  assert.equal(am.getActiveAccount(null, 'claude-fable-5'), null);   // refusing Fable

  am.applyUsageData(0, normalizeUsagePayload(USAGE_PAYLOAD));

  assert.equal(q.unified7dFable, 0);
  // The stale reset went with it: it was the shared weekly window, copied in by
  // the header path, and keeping it would misdate the bar and misrank selection.
  assert.equal(q.unified7dFableReset, null);
  assert.ok(q.unified7dFableSeenAt > Date.now() - 5000);             // freshly confirmed
  assert.equal(am.getActiveAccount(null, 'claude-fable-5').name, 'a');
});

test('a family missing from an enumeration is cleared, not kept', () => {
  const am = new AccountManager([oauth('a')], 0.98);
  const q = sealFable(am);
  // Upstream listed this account's scoped weekly caps and Fable was not among
  // them — the cap is gone, so the family falls back to the shared weekly gate.
  am.applyUsageData(0, normalizeUsagePayload({ limits: [
    { kind: 'weekly_all', group: 'weekly', percent: 6, scope: null },
  ]}));
  assert.equal(q.unified7dFable, null);
  assert.equal(q.unified7dFableReset, null);
  assert.equal(q.unified7dFableSeenAt, null);
  assert.equal(am.getActiveAccount(null, 'claude-fable-5').name, 'a');
});

test('a payload that enumerates nothing leaves the reading alone', () => {
  const am = new AccountManager([oauth('a')], 0.98);
  const q = sealFable(am);
  const reset = q.unified7dFableReset;
  // No enumeration: the family is missing because we cannot see it, not because
  // upstream says it is gone. Clearing here would drop a real cap and overspend.
  am.applyUsageData(0, normalizeUsagePayload({ five_hour: { utilization: 3 } }));
  assert.equal(q.unified7dFable, 0.99);
  assert.equal(q.unified7dFableReset, reset);
  // The staleness floor still frees it later; that path is unchanged.
});

test('a failed probe is not evidence', () => {
  const am = new AccountManager([oauth('a')], 0.98);
  const q = sealFable(am);
  am.applyUsageData(0, { error: 'HTTP 503', status: 503 });
  assert.equal(q.unified7dFable, 0.99);
  assert.equal(am.getActiveAccount(null, 'claude-fable-5'), null);
});

test('a probe that reports the family still spent keeps it spent', () => {
  const am = new AccountManager([oauth('a')], 0.98);
  const q = sealFable(am);
  const at = Math.floor((Date.now() + 48 * 3600_000) / 1000) * 1000;
  am.applyUsageData(0, normalizeUsagePayload({ limits: [
    { kind: 'weekly_scoped', group: 'weekly', percent: 99, resets_at: new Date(at).toISOString(),
      scope: { model: { display_name: 'Fable' } } },
  ]}));
  assert.equal(q.unified7dFable, 0.99);
  assert.equal(q.unified7dFableReset, at);        // now dated by its OWN window
  assert.equal(am.getActiveAccount(null, 'claude-fable-5'), null);
});

// ── updateQuota: Fable weekly from response headers ───────────

test('updateQuota records the Fable weekly bucket from the 7d_oi header', () => {
  const am = new AccountManager([oauth('a')], 0.98);
  const reset = Math.floor((Date.now() + 3600_000) / 1000);
  am.updateQuota(0, {
    'anthropic-ratelimit-unified-7d-utilization': '0.56',
    'anthropic-ratelimit-unified-7d-reset': String(reset),
    'anthropic-ratelimit-unified-7d_oi-utilization': '1.01',   // Fable, in overage
    'anthropic-ratelimit-unified-7d_oi-reset': String(reset),
  });
  const q = am.accounts[0].quota;
  assert.equal(q.unified7d, 0.56);
  assert.equal(q.unified7dFable, 1.01);                        // stored as a 0-1 fraction, can exceed 1
  assert.equal(q.unified7dFableReset, reset * 1000);           // seconds → ms
});

// ── model-aware selection: Fable exhaustion is model-scoped ───

test('isFableModel / parseRequestModel', () => {
  assert.equal(isFableModel('claude-fable-5'), true);
  assert.equal(isFableModel('claude-opus-4-8'), false);
  assert.equal(isFableModel(null), false);
  assert.equal(parseRequestModel(Buffer.from('{"model":"claude-fable-5","max_tokens":1}')), 'claude-fable-5');
  assert.equal(parseRequestModel('{ "model" : "claude-opus-4-8" }'), 'claude-opus-4-8');
  assert.equal(parseRequestModel('{"max_tokens":1}'), null);
  assert.equal(parseRequestModel(null), null);
});

test('a Fable-exhausted account is skipped for Fable but used for other models', () => {
  const am = new AccountManager([oauth('a'), oauth('b')], 0.98);
  // Account a: Fable weekly spent (from a prior 429's 7d_oi header); everything else fine.
  am.updateQuota(0, {
    'anthropic-ratelimit-unified-7d_oi-utilization': '1.01',
    'anthropic-ratelimit-unified-7d_oi-reset': String(Math.floor((Date.now() + 3600_000) / 1000)),
  });
  am.currentIndex = 0;

  // A Fable request must NOT land on the exhausted account…
  const forFable = am.getActiveAccount(null, 'claude-fable-5');
  assert.equal(forFable.name, 'b');

  // …but a non-Fable request still uses it (its Fable cap is irrelevant).
  am.currentIndex = 0;
  const forOpus = am.getActiveAccount(null, 'claude-opus-4-8');
  assert.equal(forOpus.name, 'a');

  // No model context → behaves as before (account a is available).
  am.currentIndex = 0;
  assert.equal(am.getActiveAccount().name, 'a');
});

test('all accounts Fable-exhausted → no account for a Fable request', () => {
  const am = new AccountManager([oauth('a'), oauth('b')], 0.98);
  const reset = String(Math.floor((Date.now() + 3600_000) / 1000));
  for (const i of [0, 1]) am.updateQuota(i, {
    'anthropic-ratelimit-unified-7d_oi-utilization': '1.0',
    'anthropic-ratelimit-unified-7d_oi-reset': reset,
  });
  // Probe is throttled off by default here, so a Fable request finds nothing…
  assert.equal(am.getActiveAccount(null, 'claude-fable-5'), null);
  // …while an Opus request is unaffected.
  assert.ok(am.getActiveAccount(null, 'claude-opus-4-8'));
});

// ── Prober ────────────────────────────────────────────────────

test('prober probes oauth accounts and applies the usage data', async () => {
  const am = new AccountManager([oauth('a')], 0.98);
  let calls = 0;
  const probeFn = async () => { calls++; return { fiveHour: { utilization: 0.1, resetAt: 1000 }, sevenDay: { utilization: 0.2, resetAt: 2000 } }; };
  const prober = new Prober(am, { intervalMs: 0, probeFn, log: () => {} });
  await prober.probeAll();
  assert.equal(calls, 1);
  assert.equal(am.accounts[0].quota.unified5h, 0.1);
  assert.equal(am.accounts[0].quota.unified7d, 0.2);
});

test('a successful limits-only probe replaces stale shared usage and makes the account available', async () => {
  const am = new AccountManager([oauth('a')], 0.98);
  const account = am.accounts[0];
  const q = account.quota;
  const now = Date.now();
  Object.assign(q, {
    unified5h: 0.98, unified5hReset: now + 3600_000, unified5hSeenAt: now - 60_000,
    unified7d: 0.99, unified7dReset: now + 24 * 3600_000, unified7dSeenAt: now - 60_000,
  });
  assert.equal(am._isAvailable(account), false);
  const sessionReset = now + 2 * 3600_000;
  const weeklyReset = now + 2 * 24 * 3600_000;
  const prober = new Prober(am, {
    intervalMs: 0,
    probeFn: (token, routing) => fetchUsage(token, routing, {
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          five_hour: null,
          seven_day: null,
          limits: [
            { kind: 'session', group: 'session', percent: 12, scope: null, resets_at: new Date(sessionReset).toISOString() },
            { kind: 'weekly_all', group: 'weekly', percent: 0, scope: null, resets_at: new Date(weeklyReset).toISOString() },
          ],
        }),
      }),
    }),
    log: () => {},
  });

  await prober.probeAll();

  assert.equal(prober.getStatus().accounts[0].status, 'ok');
  assert.equal(q.unified5h, 0.12);
  assert.equal(q.unified7d, 0);
  assert.equal(q.unified5hReset, sessionReset);
  assert.equal(q.unified7dReset, weeklyReset);
  assert.ok(q.unified5hSeenAt >= now);
  assert.ok(q.unified7dSeenAt >= now);
  assert.equal(am._isAvailable(account), true);
  assert.equal(account.usage.totalRequests, 0);
});

test('prober learns missing quota tier metadata with the first quota refresh', async () => {
  const am = new AccountManager([oauth('a')], 0.98);
  const prober = new Prober(am, {
    intervalMs: 0,
    probeFn: async () => ({ sevenDay: { utilization: 0.2, resetAt: 2000 } }),
    profileFn: async () => ({
      organizationType: 'claude_team', rateLimitTier: 'default_raven',
      seatTier: 'team_standard', hasClaudeMax: true, hasClaudePro: false,
    }),
    log: () => {},
  });

  await prober.probeAll();

  assert.equal(am.accounts[0].organizationType, 'claude_team');
  assert.equal(am.accounts[0].rateLimitTier, 'default_raven');
  assert.equal(am.accounts[0].seatTier, 'team_standard');
  assert.equal(am.getQuotaSummary().accounts[0].tier.weight, 1);
});

// A third-party backend account is typed `oauth` with a static token (the
// documented DeepSeek/GLM pattern), so a type check alone sends THAT provider's
// key to api.anthropic.com every cycle — which answers 429, leaving a permanent
// probe error on an account that is serving traffic normally.
test('prober never sends a third-party key to the Anthropic usage endpoint', async () => {
  const am = new AccountManager([
    oauth('claude'),
    { ...oauth('deepseek'), upstream: 'https://api.deepseek.com/anthropic' },
  ], 0.98);
  const probed = [];
  const probeFn = async (token) => { probed.push(token); return { fiveHour: { utilization: 0.1, resetAt: 1 } }; };
  // The DeepSeek backend publishes its own quota, so it IS a probe target now —
  // of the backend read, which must go to its own host and never to Anthropic.
  // Stubbed: the real read would leave the test suite for the network.
  const backendRead = [];
  const backendFn = async (account) => { backendRead.push(account.name); return { error: 'stub' }; };
  await new Prober(am, { intervalMs: 0, probeFn, backendFn, log: () => {} }).probeAll();

  assert.deepEqual(probed, ['t-claude']);
  assert.deepEqual(backendRead, ['deepseek']);
  // …and the backend's own quota is left untouched rather than recorded as an error.
  assert.equal(am.accounts[1].quota.unified5h, null);
});

test('a third-party backend reads not-applicable, not a pending probe', () => {
  // A backend whose provider publishes nothing (see backend-quota.js). One that
  // DOES publish is probeable and reads `never` until its first cycle — covered
  // in backend-quota.test.js.
  const am = new AccountManager([
    oauth('claude'),
    { ...oauth('other'), upstream: 'https://api.example.invalid/anthropic' },
  ], 0.98);
  const rows = new Prober(am, { intervalMs: 300_000, log: () => {} }).getStatus().accounts;
  assert.equal(rows[0].status, 'never');            // probed, just not yet
  assert.equal(rows[1].status, 'not-applicable');   // nothing to probe, ever
});

// #512: the status a server reports before its Prober exists is built from
// probeApplicable, so it has to give the Prober's own answer for every kind of
// account — a backend with a quota provider included, which the old copy of the
// rule in index.js called not-applicable.
test('probeApplicable agrees with the Prober for every kind of account', () => {
  const am = new AccountManager([
    oauth('claude'),
    { ...oauth('codex'), provider: 'codex', accountId: 'acct-1' },
    { name: 'deepseek', type: 'apikey', apiKey: 'sk', upstream: 'https://api.deepseek.com/anthropic' },
    { name: 'silent', type: 'apikey', apiKey: 'sk', upstream: 'https://api.example.invalid/anthropic' },
    { name: 'key', type: 'apikey', apiKey: 'sk' },
  ], 0.98);
  const rows = new Prober(am, { intervalMs: 300_000, log: () => {} }).getStatus().accounts;
  assert.deepEqual(rows.map(r => r.status), ['never', 'never', 'never', 'not-applicable', 'not-applicable']);
  assert.deepEqual(am.accounts.map(a => probeApplicable(a)), [true, true, true, false, false]);
});

test('prober skips API-key accounts', async () => {
  const am = new AccountManager([{ name: 'k', type: 'apikey', apiKey: 'sk' }], 0.98);
  let calls = 0;
  const prober = new Prober(am, { intervalMs: 0, probeFn: async () => { calls++; return {}; }, log: () => {} });
  await prober.probeAll();
  assert.equal(calls, 0);
});

test('prober sends Codex accounts only to the Codex usage endpoint', async () => {
  const am = new AccountManager([oauth('codex', { provider: 'codex', accountId: 'acct-codex' })], 0.98);
  let anthropicCalls = 0;
  let codexCalls = 0;
  const prober = new Prober(am, {
    intervalMs: 0,
    probeFn: async () => { anthropicCalls++; return { error: 'HTTP 401', status: 401 }; },
    codexProbeFn: async account => { codexCalls++; assert.equal(account.accountId, 'acct-codex'); return { sevenDay: { utilization: 0.2, resetAt: 123 } }; },
    log: () => {},
  });
  await prober.probeAll();
  assert.equal(anthropicCalls, 0);
  assert.equal(codexCalls, 1);
  assert.equal(prober.getStatus().accounts[0].status, 'ok');
  assert.equal(am.accounts[0].quota.unified7d, 0.2);
});

test('prober retries once on a 401', async () => {
  const am = new AccountManager([oauth('a')], 0.98); // no refreshToken → ensureTokenFresh is a no-op
  let calls = 0;
  const probeFn = async () => {
    calls++;
    if (calls === 1) return { error: 'HTTP 401', status: 401 };
    return { sevenDay: { utilization: 0.3, resetAt: 5000 } };
  };
  const prober = new Prober(am, { intervalMs: 0, probeFn, log: () => {} });
  await prober.probeAll();
  assert.equal(calls, 2);
  assert.equal(am.accounts[0].quota.unified7d, 0.3);
});
test('prober status records account probe results', async () => {
  const am = new AccountManager([oauth('a'), { name: 'k', type: 'apikey', apiKey: 'sk' }], 0.98);
  const prober = new Prober(am, {
    intervalMs: 300_000,
    probeFn: async () => ({ sevenDay: { utilization: 0.3, resetAt: 5000 } }),
    log: () => {},
  });

  await prober.probeAll();
  const status = prober.getStatus();
  assert.equal(status.enabled, true);
  assert.equal(status.intervalSeconds, 300);
  assert.equal(status.accounts[0].name, 'a');
  assert.equal(status.accounts[0].status, 'ok');
  assert.equal(typeof status.accounts[0].lastProbedAt, 'string');
  assert.equal(status.accounts[1].status, 'not-applicable');
});

test('prober refreshes expired token before probing', async () => {
  const am = new AccountManager(
    [oauth('a', { refreshToken: 'refresh', expiresAt: Date.now() - 1000 })],
    0.98,
    { refreshFn: async () => ({ accessToken: 'fresh', refreshToken: 'refresh2', expiresAt: Date.now() + 3600_000 }) },
  );
  let token = null;
  const prober = new Prober(am, {
    intervalMs: 0,
    probeFn: async credential => {
      token = credential;
      return { sevenDay: { utilization: 0.3, resetAt: 5000 } };
    },
    log: () => {},
  });

  await prober.probeAll();
  assert.equal(token, 'fresh');
});

// A probe forces a refresh and sends the token upstream. Neither belongs to an
// account the operator disabled, nor to one whose refresh token upstream has
// already rejected: re-sending it just rotates the family once more.
test('prober skips disabled accounts', async () => {
  const am = new AccountManager([oauth('a'), oauth('b')], 0.98);
  am.setDisabled(0, true);
  const probed = [];
  const prober = new Prober(am, { intervalMs: 0, probeFn: async cred => { probed.push(cred); return {}; }, log: () => {} });
  await prober.probeAll();
  assert.deepEqual(probed, ['t-b']);
});

test('prober skips an account holding a rejected refresh token, until a new one arrives', async () => {
  let refreshes = 0;
  const am = new AccountManager(
    [oauth('a', { refreshToken: 'rt-dead', expiresAt: Date.now() - 1000 })],
    0.98,
    { refreshFn: async () => { refreshes++; const e = new Error('invalid_grant'); e.status = 400; throw e; } },
  );
  let probes = 0;
  const prober = new Prober(am, { intervalMs: 0, probeFn: async () => { probes++; return {}; }, log: () => {} });

  await prober.probeAll();                 // first cycle: the refresh is tried once and rejected
  assert.equal(refreshes, 1);
  assert.equal(am.accounts[0]._deadRefreshToken, 'rt-dead');
  const probesAfterRejection = probes;

  await prober.probeAll();
  await prober.probeAll();
  assert.equal(probes, probesAfterRejection, 'no token is sent for an account that needs a re-login');
  assert.equal(refreshes, 1);

  // A re-login lifts the skip: the manager's guard is keyed on the token value.
  am.updateAccountTokens(0, { accessToken: 'at-new', refreshToken: 'rt-new', expiresAt: Date.now() + 3600_000 });
  await prober.probeAll();
  assert.equal(probes, probesAfterRejection + 1);
});

// setInterval coerces a delay above 2^31-1 ms to 1 ms, which would turn an
// interval meant as "practically never" into a tight probing loop.
test('prober clamps its interval so the timer cannot overflow', () => {
  const am = new AccountManager([oauth('a')], 0.98);
  const prober = new Prober(am, { intervalMs: 0, probeFn: async () => ({}), log: () => {} });
  try {
    prober.reschedule(365 * 24 * 3600 * 1000);
    assert.equal(prober.intervalMs, MAX_PROBE_INTERVAL_MS);
    assert.ok(prober.intervalMs <= 2 ** 31 - 1);
    assert.equal(prober.getStatus().intervalSeconds, MAX_PROBE_INTERVAL_MS / 1000);
    assert.ok(prober.nextRunAt - Date.now() <= MAX_PROBE_INTERVAL_MS);
  } finally {
    prober.stop();
  }
  const huge = new Prober(am, { intervalMs: Number.MAX_SAFE_INTEGER, probeFn: async () => ({}), log: () => {} });
  assert.equal(huge.intervalMs, MAX_PROBE_INTERVAL_MS, 'the constructor clamps too');
  assert.equal(new Prober(am, { intervalMs: NaN, log: () => {} }).intervalMs, 0, 'a non-number is off');
});

test('concurrent manual and timer probes await the same active upstream cycle', async () => {
  const am = new AccountManager([oauth('a'), oauth('b')], 0.98);
  const pending = [];
  const prober = new Prober(am, { probeFn: () => new Promise(resolve => pending.push(resolve)), log: () => {} });
  const first = prober.probeAll();
  await new Promise(resolve => setImmediate(resolve));
  let completed = false;
  const second = prober.probeAll().then(() => { completed = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(completed, false, 'overlapping callers must wait for the actual quota readings');
  assert.equal(pending.length, 2, 'one upstream reading per account');
  assert.equal(prober.getStatus().running, true);
  for (const resolve of pending) resolve({ fiveHour: { utilization: 0.25 }, sevenDay: { utilization: 0.5 } });
  await Promise.all([first, second]);
  assert.equal(prober.getStatus().running, false);
  assert.deepEqual(am.accounts.map(account => account.quota.unified5h), [0.25, 0.25]);
});

test('manual quota refresh reads after the click and coalesces one follow-up cycle', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const am = new AccountManager([oauth('a'), oauth('b')], 0.98);
  const resetAt = Date.now() + 7 * 24 * 3600_000;
  const usage = percent => normalizeUsagePayload({
    five_hour: { utilization: 10 },
    seven_day: { utilization: 50 },
    limits: [{ kind: 'weekly_scoped', group: 'weekly', percent,
      resets_at: new Date(resetAt).toISOString(), scope: { model: { display_name: 'Fable' } } }],
  });
  for (const account of am.accounts) {
    am.applyUsageData(account.index, usage(98));
    assert.equal(am._isAvailable(account, 'claude-fable-5'), false);
  }
  const pending = [];
  const readings = [];
  let clicked = false;
  const prober = new Prober(am, { probeFn: token => {
    readings.push({ token, afterClick: clicked });
    return clicked ? Promise.resolve(usage(0)) : new Promise(resolve => pending.push(resolve));
  }, log: () => {} });
  const background = prober.probeAll();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pending.length, 2);
  const backgroundStartedAt = prober.lastRunStartedAt;
  t.mock.timers.tick(1);
  clicked = true;
  const clickedAt = Date.now();
  const manual = prober.probeAll();
  const secondManual = prober.probeAll();
  for (const resolve of pending) resolve(usage(98));
  await Promise.all([background, manual, secondManual]);

  for (const account of am.accounts) {
    assert.equal(account.quota.unified7dFable, 0, 'manual refresh must read the Fable reset after the click');
    assert.equal(am._isAvailable(account, 'claude-fable-5'), true);
  }
  assert.deepEqual(readings, [
    { token: 't-a', afterClick: false }, { token: 't-b', afterClick: false },
    { token: 't-a', afterClick: true }, { token: 't-b', afterClick: true },
  ], 'two manual callers share exactly one follow-up reading per account');
  const status = prober.getStatus();
  assert.ok(Date.parse(status.lastRunStartedAt) > backgroundStartedAt);
  assert.ok(Date.parse(status.lastRunStartedAt) >= clickedAt);
  assert.ok(status.accounts.every(row => Date.parse(row.startedAt) >= clickedAt));
  assert.equal(status.running, false);
});

test('background minute cycles read every eligible account without a dashboard', async t => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: Date.now() });
  const am = new AccountManager([oauth('a'), oauth('b')], 0.98);
  const readings = [];
  const prober = new Prober(am, { intervalMs: 60_000, probeFn: async token => {
    readings.push(token); return { fiveHour: { utilization: 0.2 }, sevenDay: { utilization: 0.4 } };
  }, log: () => {} });
  t.after(() => prober.stop());
  prober.start();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(readings, ['t-a', 't-b']);
  for (let cycle = 2; cycle <= 3; cycle++) {
    t.mock.timers.tick(60_000);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(readings.length, cycle * 2);
    assert.deepEqual(readings.slice(-2), ['t-a', 't-b']);
  }
});

test('probe results remain separate for accounts with the same name', async () => {
  const am = new AccountManager([
    oauth('shared', { id: 'claude-shared' }),
    oauth('shared', { id: 'codex-shared', provider: 'codex', accountId: 'acct-shared' }),
  ], 0.98);
  const prober = new Prober(am, {
    probeFn: async () => ({ error: 'Claude refused', status: 429 }),
    codexProbeFn: async () => ({ sevenDay: { utilization: 0.07 } }),
    log: () => {},
  });
  await prober.probeAll();
  const rows = prober.getStatus().accounts;
  assert.deepEqual(rows.map(row => row.status), ['error', 'ok']);
  assert.deepEqual(rows.map(row => row.id), ['claude-shared', 'codex-shared']);
  assert.deepEqual(rows.map(row => row.provider), ['anthropic', 'codex']);
});

test('a rejected probe cycle clears the shared operation and permits retry', async () => {
  const am = new AccountManager([oauth('a')], 0.98);
  const prober = new Prober(am, { log: () => {} });
  prober.probeAccount = async () => { throw new Error('unexpected cycle failure'); };
  await assert.rejects(prober.probeAll(), /unexpected cycle failure/);
  assert.equal(prober.getStatus().running, false);
  prober.probeAccount = async () => {};
  await prober.probeAll();
  assert.equal(prober.getStatus().running, false);
});
