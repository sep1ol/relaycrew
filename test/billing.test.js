import { test } from 'node:test';
import assert from 'node:assert/strict';
import { billingStatus, billingBlockers, codexLimitReached, codexUsageHold, isCreditBalanceRefusal, grokBillingHold, noPaidAccountMessage, providerErrorBody, parseJsonOrNull, BILLING_RECHECK_SECONDS } from '../src/billing.js';

const now = 1_800_000_000_000;
const until = now + 27 * 86400_000;
const account = (reason = 'exhausted', extra = {}) => ({ name: 'private@example.com', provider: 'codex', type: 'oauth',
  quota: { planType: 'free', billingHold: { reason, until, seenAt: now } }, ...extra });

test('billingStatus derives all kinds and expires holds without mutating the account', () => {
  const held = account();
  const before = globalThis.structuredClone(held);
  assert.deepEqual(billingStatus(held, now), { kind: 'exhausted', plan: 'Free', until, reason: 'exhausted' });
  assert.deepEqual(billingStatus(held, until), { kind: 'free', plan: 'Free', until: null, reason: null });
  assert.deepEqual(held, before);
  assert.equal(billingStatus(account('no-credits'), now).kind, 'no-credits');
  assert.deepEqual(billingStatus({ provider: 'codex', quota: { planType: 'pro' } }, now), { kind: 'paid', plan: 'Pro', until: null, reason: null });
  assert.equal(billingStatus({}, now).kind, 'unknown');
  assert.equal(billingStatus({ hasClaudePro: false, hasClaudeMax: false }, now).kind, 'free');
  assert.equal(billingStatus({ hasClaudePro: false, hasClaudeMax: false, rateLimitTier: 'default_claude_ai' }, now).kind, 'free');
  assert.equal(billingStatus({ hasClaudePro: false }, now).kind, 'unknown');
  assert.equal(billingStatus({ hasClaudePro: false, hasClaudeMax: false, organizationType: 'team' }, now).plan, 'Team');
  assert.equal(billingStatus({ hasClaudePro: true }, now).plan, 'Pro');
});

test('Codex billing JSON parsers accept explicit free-plan verdicts and reject paid, unrelated or missing signals', () => {
  assert.deepEqual(codexLimitReached({ error: { type: 'usage_limit_reached', plan_type: 'free', resets_at: until / 1000 } }), { resetAt: until, plan: 'free' });
  assert.deepEqual(codexLimitReached({ error: { type: 'usage_limit_reached', resets_at: 'bad' } }), { resetAt: null, plan: null });
  for (const body of [null, {}, { error: { type: 'rate_limit_error' } }]) assert.equal(codexLimitReached(body), null);
  assert.deepEqual(codexUsageHold({ plan_type: 'free', rate_limit: { allowed: false, primary_window: { reset_at: until / 1000 } } }), { resetAt: until });
  assert.deepEqual(codexUsageHold({ plan_type: 'free', rate_limit: { limit_reached: true } }), { resetAt: null });
  assert.deepEqual(codexUsageHold({ plan_type: 'pro', rate_limit: { allowed: true, limit_reached: true } }), { clear: true });
  assert.equal(codexUsageHold({ plan_type: 'pro', rate_limit: { allowed: false, limit_reached: true } }), null);
  assert.equal(codexUsageHold({ rate_limit: { allowed: false } }), null);
  assert.equal(codexUsageHold({ plan_type: 'free', rate_limit: {} }), null);
  assert.equal(codexUsageHold(null), null);
  assert.deepEqual(parseJsonOrNull(Buffer.from('{"a":1}')), { a: 1 });
  assert.equal(parseJsonOrNull(Buffer.from('not json')), null);
  assert.equal(parseJsonOrNull(null), null);
});

test('credit and Grok refusals classify only observed billing signals', () => {
  assert.equal(isCreditBalanceRefusal({ error: { message: 'Your credit balance is too low' } }), true);
  assert.equal(isCreditBalanceRefusal({ error: { message: 'invalid model' } }), false);
  assert.equal(isCreditBalanceRefusal({ messages: [{ content: 'credit balance is too low' }] }), false);
  assert.equal(isCreditBalanceRefusal(null), false);
  assert.deepEqual(grokBillingHold(402, Buffer.from('out of credits'), null, now), { reason: 'no-credits', until: now + BILLING_RECHECK_SECONDS * 1000 });
  assert.deepEqual(grokBillingHold(429, Buffer.from('usage limit reached'), null, now), { reason: 'exhausted', until: now + 60_000 });
  assert.deepEqual(grokBillingHold(429, Buffer.from('usage limit reached'), '30', now), { reason: 'exhausted', until: now + 30_000 });
  assert.deepEqual(grokBillingHold(429, Buffer.from('usage limit reached'), '99999', now), { reason: 'exhausted', until: now + BILLING_RECHECK_SECONDS * 1000 });
  assert.equal(grokBillingHold(403, Buffer.from('permission denied'), null, now), null);
  assert.equal(grokBillingHold(429, null, null, now), null);
});

test('pool billing messages omit member account names and retain the actual reset date', () => {
  const blockers = billingBlockers([account(), { disabled: true }], now);
  assert.equal(blockers.all, true);
  assert.equal(blockers.soonestUntil, until);
  const date = new Date(until).toISOString().slice(0, 10);
  assert.equal(noPaidAccountMessage('codex', blockers, { names: false }), `Codex pool: no paid account available; 1 account is on a free plan, limit reached, resets ${date}`);
  assert.equal(noPaidAccountMessage('codex', blockers, { names: true }), `Codex pool: no paid account available; "private@example.com" is on a free plan, limit reached, resets ${date}`);
  const credits = billingBlockers([account('no-credits', { provider: 'anthropic', type: 'apikey', quota: { billingHold: { reason: 'no-credits', until, seenAt: now } } })], now);
  assert.equal(noPaidAccountMessage('anthropic', credits, { names: false }), 'Claude pool: no paid account available; 1 account has no credits');
  const message = noPaidAccountMessage('codex', blockers, { names: false });
  assert.deepEqual(providerErrorBody('codex', message, blockers), {
    error: { type: 'usage_limit_reached', message, plan_type: 'free', resets_at: until / 1000 },
  });
  assert.deepEqual(providerErrorBody('anthropic', message, blockers), {
    type: 'error', error: { type: 'rate_limit_error', message },
  });
  assert.equal(billingBlockers([account(), { quota: {} }], now).all, false);
  assert.equal(billingBlockers([], now).all, false);
  assert.equal(billingBlockers([account()], until).all, false);
  const sooner = account('exhausted', { name: 'sooner', quota: { planType: 'free', billingHold: { reason: 'exhausted', until: until - 1000, seenAt: now } } });
  assert.equal(billingBlockers([account(), sooner], now).held[0].account.name, 'sooner');
});
