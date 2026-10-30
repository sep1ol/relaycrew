import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPoolView } from '../src/pool-view.js';
import { authenticateTeam } from '../src/team-access.js';

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;
const proxy = { teamMode: true, apiKey: 'admin-secret', clientKeys: [{ name: 'alice', key: 'alice-secret', accounts: ['claude-ops'] }] };
const alice = authenticateTeam(proxy, 'alice-secret').identity;

const accounts = () => [
  { id: 'claude-ops', name: 'ops@example.com', type: 'oauth', provider: 'anthropic', rateLimitTier: 'default_claude_max_20x', quota: {
    unified5h: 0.25, unified5hReset: NOW + HOUR, unified5hSeenAt: NOW - 60_000,
    unified7d: 0.5, unified7dReset: NOW + 48 * HOUR, unified7dSeenAt: NOW - 60_000,
    unified7dSonnet: 0.875, unified7dSonnetReset: NOW + 48 * HOUR, unified7dSonnetSeenAt: NOW - 60_000,
    unified7dFable: null, unified7dFableReset: null,
    scopedWeekly: { opus: { utilization: 0.75, resetAt: NOW + 24 * HOUR } },
  } },
  { id: 'claude-marina', name: 'marina@example.com', type: 'oauth', provider: 'anthropic', owner: { name: 'marina', sharing: 'pool' }, rateLimitTier: 'default_claude_max_x5', quota: {
    unified5h: 0.5, unified5hReset: NOW + 2 * HOUR, unified7d: 0.5, unified7dReset: NOW - 1,
  } },
  { id: 'claude-bob', name: 'bob@example.com', type: 'oauth', provider: 'anthropic', owner: { name: 'bob', sharing: 'private' }, quota: { unified5h: 0 } },
  { id: 'claude-alice', name: 'alice@example.com', type: 'oauth', provider: 'anthropic', owner: { name: 'alice', sharing: 'private' }, hasClaudePro: true, quota: { unified5h: null } },
  { id: 'claude-carol', name: 'carol@example.com', type: 'oauth', provider: 'anthropic', owner: { name: 'carol', sharing: 'pool' }, disabled: true, unavailable: 'disabled', quota: { unified5h: 0, unified5hReset: NOW + HOUR } },
  { id: 'codex-ops', name: 'codex@example.com', type: 'oauth', provider: 'codex', quota: {
    unified5h: 0.125, unified5hReset: NOW + HOUR, unified7d: 0.5, unified7dReset: NOW + 24 * HOUR, planType: 'pro',
    codexModelBuckets: { 'gpt-5-codex': { name: 'GPT-5 Codex', utilization: 0.75, resetAt: NOW + 24 * HOUR, seenAt: NOW - 120_000 } },
  } },
  { id: 'grok-dave', name: 'dave@example.com', type: 'oauth', provider: 'grok', owner: { name: 'dave', sharing: 'pool' }, quota: {} },
  { id: 'apikey-ops', name: 'metered key', type: 'apikey', quota: { tokensLimit: 1000, tokensRemaining: 250, requestsLimit: null, requestsRemaining: null, resetsAt: '2027-02-01T00:00:00Z' } },
  { id: 'backend-ops', name: 'kimi key', type: 'apikey', upstream: 'https://api.example.test', quota: { backend: { label: 'Plan', text: 'balance $12.30', utilization: 0.25, at: NOW - 3 * HOUR, windows: { weekly: { utilization: 0.25, resetAt: NOW + 24 * HOUR } } } } },
];

test('pool view projects shared quota per provider without identifying accounts', () => {
  const view = buildPoolView({ accounts: accounts(), proxy, identity: alice, now: NOW });
  const text = JSON.stringify(view);
  for (const secret of ['@example.com', 'bob', 'claude-ops', 'codex-ops', 'metered key', 'kimi key', 'balance', '"id"', 'upstream']) assert.ok(!text.includes(secret), secret);

  assert.equal(view.generatedAt, NOW);
  assert.deepEqual(view.groups.map(group => [group.provider, group.label]), [['anthropic', 'Claude'], ['codex', 'ChatGPT/Codex'], ['grok', 'Grok'], ['apikey', 'API keys'], ['backend', 'Other']]);
  const [claude, codex, grok, apikey, backend] = view.groups;

  assert.deepEqual(claude.accounts.map(account => [account.key, account.owner, account.ownerIsViewer, account.plan, account.sharing, account.usable, account.state]), [
    ['0', 'team', false, 'Max 20x', 'team', true, 'ok'],
    ['1', 'marina', false, 'Max 5x', 'pool', false, 'ok'],
    ['2', 'alice', true, 'Pro', 'private', true, 'ok'],
    ['3', 'carol', false, null, 'pool', false, 'disabled'],
  ], 'keys are dense so a hidden private row leaves no gap');
  assert.deepEqual(claude.accounts[0].windows, [
    { key: 'fiveHour', label: '5h', remaining: 0.75, resetAt: NOW + HOUR, seenAt: NOW - 60_000 },
    { key: 'weekly', label: 'Week', remaining: 0.5, resetAt: NOW + 48 * HOUR, seenAt: NOW - 60_000 },
    { key: 'weekly:opus', label: 'Opus', remaining: 0.25, resetAt: NOW + 24 * HOUR, seenAt: null },
    { key: 'weekly:sonnet', label: 'Sonnet', remaining: 0.125, resetAt: NOW + 48 * HOUR, seenAt: NOW - 60_000 },
  ], 'dedicated model windows only, never the shared-weekly fallback');
  assert.deepEqual(claude.accounts[1].windows.find(window => window.key === 'weekly'), { key: 'weekly', label: 'Week', remaining: null, resetAt: null, seenAt: null }, 'an expired window reads as unknown');
  assert.deepEqual(claude.totals.map(total => [total.key, total.remaining, total.accounts, total.nextResetAt]), [
    ['fiveHour', (0.75 * 20 + 0.5 * 5) / 25, 2, NOW + HOUR],
    ['weekly', 0.5, 1, NOW + 48 * HOUR],
    ['weekly:opus', 0.25, 1, NOW + 24 * HOUR],
    ['weekly:sonnet', 0.125, 1, NOW + 48 * HOUR],
  ], 'tier-weighted, disabled and unread accounts excluded');

  assert.deepEqual(codex.accounts.map(account => [account.owner, account.plan, account.usable]), [['team', 'Pro', false]]);
  assert.deepEqual(codex.accounts[0].windows.map(window => [window.key, window.label, window.remaining]), [['fiveHour', '5h', 0.875], ['weekly', 'Week', 0.5], ['weekly:gpt-5-codex', 'GPT-5 Codex', 0.25]]);
  assert.deepEqual(codex.totals.map(total => [total.key, total.remaining, total.accounts]), [['fiveHour', 0.875, 1], ['weekly', 0.5, 1], ['weekly:gpt-5-codex', 0.25, 1]]);

  assert.deepEqual(grok.accounts.map(account => [account.owner, account.plan, account.windows]), [['dave', null, []]]);
  assert.deepEqual(grok.totals, []);

  assert.deepEqual(apikey.accounts[0].windows, [{ key: 'tokens', label: 'Tokens', remaining: 0.25, resetAt: Date.parse('2027-02-01T00:00:00Z'), seenAt: null }]);
  assert.deepEqual(backend.accounts[0].windows, [{ key: 'weekly', label: 'Week', remaining: 0.75, resetAt: NOW + 24 * HOUR, seenAt: NOW - 3 * HOUR }]);
});

test('pool view for the administrator hides every private account and never marks rows as theirs', () => {
  const admin = authenticateTeam(proxy, 'admin-secret').identity;
  const view = buildPoolView({ accounts: accounts(), proxy, identity: admin, now: NOW });
  assert.deepEqual(view.groups[0].accounts.map(account => [account.owner, account.ownerIsViewer, account.usable]), [['team', false, true], ['marina', false, true], ['carol', false, true]]);
  assert.ok(!JSON.stringify(view).includes('alice'));
});
