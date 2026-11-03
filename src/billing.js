import { providerOf, isGrokExhaustion } from './provider.js';
import { quotaTier } from './quota-summary.js';
import { safeLine } from './safe-text.js';

/** @typedef {'paid'|'free'|'exhausted'|'no-credits'|'unknown'} BillingKind */
/** @typedef {{reason: 'exhausted'|'no-credits', until: number, seenAt: number}} BillingHold */
/** @typedef {{kind: BillingKind, plan: string|null, until: number|null, reason: string|null}} BillingStatus */
export const BILLING_RECHECK_SECONDS = 3600;
const GROK_EXHAUSTED_SECONDS = 60;

/** @param {Buffer|null|undefined} raw @returns {any} */
export function parseJsonOrNull(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw.toString('utf8')); } catch { return null; }
}

/** @param {Record<string, any>} account @returns {string|null} */
export function planLabel(account) {
  const provider = providerOf(account);
  if (provider === 'codex') {
    const plan = account.quota?.planType;
    return typeof plan === 'string' && plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : null;
  }
  if (provider !== 'anthropic') return null;
  const tier = [account.rateLimitTier, account.seatTier, account.organizationType].join(' ').toLowerCase();
  if (tier.includes('enterprise')) return 'Enterprise';
  if (tier.includes('team') || tier.includes('raven')) return 'Team';
  if (account.hasClaudePro === false && account.hasClaudeMax === false) return 'Free';
  const weight = quotaTier(account).weight;
  if (weight === 20) return 'Max 20x';
  if (weight === 5) return 'Max 5x';
  if (account.hasClaudeMax === true) return 'Max';
  if (weight === 1 || account.hasClaudePro === true) return 'Pro';
  return null;
}

/** @param {Record<string, any>} account @param {number} now @returns {BillingStatus} */
export function billingStatus(account, now) {
  const plan = planLabel(account);
  const hold = account.quota?.billingHold;
  if (hold && hold.until > now) return { kind: hold.reason, plan, until: hold.until, reason: hold.reason };
  return { kind: plan?.toLowerCase() === 'free' ? 'free' : plan ? 'paid' : 'unknown', plan, until: null, reason: null };
}

/** @param {any} payload @returns {string|null} */
export function codexPlanType(payload) {
  return typeof payload?.plan_type === 'string' ? safeLine(payload.plan_type, 64) || null : null;
}

function resetMs(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

/** @param {any} body @returns {{resetAt: number|null, plan: string|null}|null} */
export function codexLimitReached(body) {
  if (body?.error?.type !== 'usage_limit_reached') return null;
  return { resetAt: resetMs(body.error.resets_at), plan: codexPlanType(body.error) };
}

/** A free plan has one window, so its spent limit is a billing hold; a paid
 * plan's spent window belongs to the quota path.
 * @param {any} payload @returns {{resetAt: number|null}|{clear: true}|null} */
export function codexUsageHold(payload) {
  const limit = payload?.rate_limit || payload?.rate_limits;
  if (limit?.allowed === true) return { clear: true };
  if (codexPlanType(payload) !== 'free') return null;
  if (limit?.allowed === false || limit?.limit_reached === true) {
    return { resetAt: resetMs(limit.primary_window?.reset_at ?? limit.secondary_window?.reset_at) };
  }
  return null;
}

/** @param {any} body */
export function isCreditBalanceRefusal(body) {
  return /credit balance is too low/i.test(String(body?.error?.message || ''));
}

/** @param {number} status @param {Buffer|null} raw @param {string|null} retryAfter @param {number} now
 * @returns {{reason: BillingHold['reason'], until: number}|null} */
export function grokBillingHold(status, raw, retryAfter, now) {
  if (!isGrokExhaustion(status, raw)) return null;
  const reason = status === 402 || /credits|balance/i.test(raw.toString('utf8')) ? 'no-credits' : 'exhausted';
  const seconds = Number(retryAfter) || (reason === 'no-credits' ? BILLING_RECHECK_SECONDS : GROK_EXHAUSTED_SECONDS);
  return { reason, until: now + Math.min(Math.max(seconds, 1), BILLING_RECHECK_SECONDS) * 1000 };
}

/** @param {Record<string, any>[]} accounts @param {number} now
 * @returns {{all: boolean, held: Array<{account: Record<string, any>, hold: BillingHold}>, soonestUntil: number|null}} */
export function billingBlockers(accounts, now) {
  const eligible = accounts.filter(account => !account.disabled);
  const held = eligible.map(account => ({ account, hold: account.quota?.billingHold }))
    .filter(({ hold }) => !!hold && hold.until > now)
    .sort((a, b) => a.hold.until - b.hold.until);
  return { all: eligible.length > 0 && held.length === eligible.length, held, soonestUntil: held[0]?.hold.until ?? null };
}

/** No trailing period: exhaustedMessage embeds it in a longer sentence.
 * @param {string} provider @param {ReturnType<typeof billingBlockers>} blockers @param {{names: boolean}} options */
export function noPaidAccountMessage(provider, blockers, { names }) {
  const label = { codex: 'Codex', anthropic: 'Claude', grok: 'Grok' }[provider] || provider;
  const detail = ({ account, hold }, plural) => hold.reason === 'no-credits'
    ? `${plural ? 'have' : 'has'} no credits`
    : `${plural ? 'are' : 'is'} ${planLabel(account)?.toLowerCase() === 'free' ? 'on a free plan, limit reached' : 'exhausted'}, resets ${new Date(hold.until).toISOString().slice(0, 10)}`;
  const count = blockers.held.length;
  if (!names) return `${label} pool: no paid account available; ${count} ${count === 1 ? 'account' : 'accounts'} ${detail(blockers.held[0], count > 1)}`;
  const shown = blockers.held.slice(0, 3).map(item => `"${safeLine(item.account.name, 64)}" ${detail(item, false)}`).join('; ');
  return `${label} pool: no paid account available; ${shown}${count > 3 ? `; ${count - 3} more accounts` : ''}`;
}

/** @param {string} provider @param {string} message @param {ReturnType<typeof billingBlockers>} billing */
export function providerErrorBody(provider, message, billing) {
  if (provider !== 'codex') return { type: 'error', error: { type: 'rate_limit_error', message } };
  return { error: { type: 'usage_limit_reached', message,
    plan_type: billing.held[0]?.account.quota?.planType ?? null,
    resets_at: billing.soonestUntil === null ? null : Math.floor(billing.soonestUntil / 1000) } };
}
