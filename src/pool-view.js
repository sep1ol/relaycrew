import { providerOf, PROVIDERS } from './provider.js';
import { quotaTier } from './quota-summary.js';
import { showWeeklyRow } from './status-renderer.js';
import { teamAllowsAccount } from './team-access.js';

/**
 * The member-facing projection. None of its keys identify configured accounts.
 * @typedef {'anthropic'|'codex'|'grok'|'apikey'|'backend'} PoolProvider
 * @typedef {'fiveHour'|'weekly'|`weekly:${string}`|'tokens'|'requests'|'monthly'|'plan'} PoolWindowKey
 * @typedef {{key: PoolWindowKey, label: string, remaining: number|null, resetAt: number|null, seenAt: number|null}} PoolWindow
 * @typedef {{key: string, owner: string, ownerIsViewer: boolean, plan: string|null, sharing: 'team'|'pool'|'private', usable: boolean, state: 'ok'|'disabled'|'limited'|'error', windows: PoolWindow[]}} PoolAccount
 * @typedef {{key: PoolWindowKey, label: string, remaining: number|null, accounts: number, nextResetAt: number|null}} PoolTotal
 * @typedef {{provider: PoolProvider, label: string, accounts: PoolAccount[], totals: PoolTotal[]}} PoolGroup
 * @typedef {{generatedAt: number, groups: PoolGroup[]}} PoolView
 * @typedef {Record<string, any>} LiveAccount
 */

/** @param {unknown} value @returns {number|null} */
function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** @param {number} remaining */
function clamp(remaining) { return Math.max(0, Math.min(1, remaining)); }

/** @param {LiveAccount} account @returns {PoolProvider} */
function groupProvider(account) {
  const provider = providerOf(account);
  if (account.type === 'oauth' && provider !== 'openai') return provider;
  const upstream = typeof account.upstream === 'string' ? account.upstream.replace(/\/+$/, '') : null;
  if (account.quota?.backend || (upstream && upstream !== PROVIDERS[provider].upstream)) return 'backend';
  return 'apikey';
}

/** @param {LiveAccount} account @param {PoolProvider} provider @returns {string|null} */
function planLabel(account, provider) {
  if (provider === 'codex') {
    const plan = account.quota?.planType;
    return typeof plan === 'string' && plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : null;
  }
  if (provider !== 'anthropic') return null;
  const tier = [account.rateLimitTier, account.seatTier, account.organizationType].join(' ').toLowerCase();
  if (tier.includes('enterprise')) return 'Enterprise';
  if (tier.includes('team') || tier.includes('raven')) return 'Team';
  const weight = quotaTier(account).weight;
  if (weight === 20) return 'Max 20x';
  if (weight === 5) return 'Max 5x';
  if (account.hasClaudeMax === true) return 'Max';
  if (weight === 1 || account.hasClaudePro === true) return 'Pro';
  return null;
}

/** @param {LiveAccount} account @param {number} now @returns {PoolAccount['state']} */
function accountState(account, now) {
  if (account.disabled) return 'disabled';
  if (account.status === 'error' || ['error', 'credential', 'entitlement', 'routing'].includes(account.unavailable)
    || ['credentialRejectedUntil', 'entitlementDeniedUntil', 'routingFailedUntil'].some(key => account[key] > now)) return 'error';
  if (account.unavailable || account.status === 'exhausted'
    || (account.status === 'throttled' && (!account.rateLimitedUntil || account.rateLimitedUntil > now))
    || account.pausedUntil > now || account.quota?.unifiedStatus === 'rejected') return 'limited';
  return 'ok';
}

/** @param {LiveAccount} account @param {PoolProvider} provider @param {number} now @returns {PoolWindow[]} */
function accountWindows(account, provider, now) {
  const quota = account.quota || {};
  /** @type {PoolWindow[]} */
  const windows = [];
  /** @param {PoolWindowKey} key @param {string} label @param {unknown} used @param {unknown} reset @param {unknown} seen */
  function add(key, label, used, reset, seen) {
    const utilization = finite(used), resetAt = finite(reset);
    const expired = resetAt !== null && resetAt <= now;
    windows.push({ key, label, remaining: expired || utilization === null ? null : clamp(1 - utilization),
      resetAt: expired ? null : resetAt, seenAt: expired ? null : finite(seen) });
  }
  if (provider === 'anthropic' || provider === 'codex') {
    if (quota.sessionWindowStated !== false) add('fiveHour', '5h', quota.unified5h, quota.unified5hReset, quota.unified5hSeenAt);
    if (showWeeklyRow(quota)) add('weekly', 'Week', quota.unified7d, quota.unified7dReset, quota.unified7dSeenAt);
    if (provider === 'codex') {
      for (const [slug, bucket] of Object.entries(/** @type {Record<string, any>} */ (quota.codexModelBuckets || {}))) {
        if (bucket) add(`weekly:${slug}`, bucket.name || slug, bucket.utilization, bucket.resetAt, bucket.seenAt);
      }
    } else {
      // The dedicated fields carry seenAt; scopedWeekly holds the same value without one.
      /** @type {Map<string, [unknown, unknown, unknown]>} */
      const families = new Map();
      for (const [family, field] of [['sonnet', 'unified7dSonnet'], ['fable', 'unified7dFable']]) {
        if (finite(quota[field]) !== null) families.set(family, [quota[field], quota[field + 'Reset'], quota[field + 'SeenAt']]);
      }
      for (const [family, bucket] of Object.entries(/** @type {Record<string, any>} */ (quota.scopedWeekly || {}))) {
        if (!families.has(family) && finite(bucket?.utilization) !== null) families.set(family, [bucket.utilization, bucket.resetAt, null]);
      }
      for (const [family, reading] of [...families].sort(([a], [b]) => a.localeCompare(b))) {
        add(`weekly:${family}`, family.charAt(0).toUpperCase() + family.slice(1), ...reading);
      }
    }
  } else if (provider === 'backend') {
    for (const [key, label] of /** @type {[PoolWindowKey, string][]} */ ([['fiveHour', '5h'], ['weekly', 'Week'], ['monthly', 'Month']])) {
      const bucket = quota.backend?.windows?.[key];
      if (bucket) add(key, label, bucket.utilization, bucket.resetAt, quota.backend.at);
    }
    if (!windows.length && finite(quota.backend?.utilization) !== null) add('plan', 'Plan', quota.backend.utilization, null, quota.backend.at);
  } else if (provider === 'apikey') {
    for (const [key, label] of /** @type {['tokens'|'requests', string][]} */ ([['tokens', 'Tokens'], ['requests', 'Requests']])) {
      const limit = finite(quota[key + 'Limit']), remaining = finite(quota[key + 'Remaining']);
      if (limit === null && remaining === null) continue;
      const resetAt = typeof quota.resetsAt === 'string' ? Date.parse(quota.resetsAt) : quota.resetsAt;
      add(key, label, limit !== null && limit > 0 && remaining !== null ? 1 - remaining / limit : null, resetAt, null);
    }
  }
  return windows;
}

/** Pure projection of live quota and team visibility; never reads or refreshes upstream.
 * @param {{accounts: LiveAccount[], proxy: import('./team-access.js').TeamProxy|undefined, identity: import('./team-access.js').TeamIdentity|null|undefined, now: number}} input
 * @returns {PoolView}
 */
export function buildPoolView({ accounts, proxy, identity, now }) {
  /** @type {Map<PoolProvider, PoolGroup>} */
  const groups = new Map();
  /** @type {Map<PoolAccount, number>} */
  const weights = new Map();
  // Totals count accounts limited by quota (their readings are the capacity) and
  // skip only those whose windows say nothing: disabled, in error, or operator-capped.
  /** @type {Set<PoolAccount>} */
  const counted = new Set();
  let index = 0;
  for (const account of accounts) {
    const ownerIsViewer = !!account.owner && identity?.kind === 'member' && account.owner.name === identity.name;
    if (account.owner && account.owner.sharing !== 'pool' && !ownerIsViewer) continue;
    const provider = groupProvider(account);
    let group = groups.get(provider);
    if (!group) {
      group = { provider, label: { anthropic: 'Claude', codex: 'ChatGPT/Codex', grok: 'Grok', apikey: 'API keys', backend: 'Other' }[provider], accounts: [], totals: [] };
      groups.set(provider, group);
    }
    /** @type {PoolAccount} */
    const row = { key: String(index++), owner: account.owner?.name || 'team', ownerIsViewer,
      plan: planLabel(account, provider), sharing: account.owner ? account.owner.sharing : 'team',
      usable: teamAllowsAccount(proxy, identity, account), state: accountState(account, now), windows: accountWindows(account, provider, now) };
    group.accounts.push(row);
    weights.set(row, provider === 'anthropic' ? quotaTier(account).weight ?? 1 : 1);
    if (row.state !== 'disabled' && row.state !== 'error' && !['capped', 'spend-capped'].includes(account.unavailable)) counted.add(row);
  }
  for (const group of groups.values()) {
    const windows = new Map(group.accounts.flatMap(account => account.windows.map(window => [window.key, window])));
    for (const [key, window] of windows) {
      let sum = 0, capacity = 0, count = 0;
      /** @type {number|null} */
      let nextResetAt = null;
      for (const account of group.accounts) {
        if (!counted.has(account)) continue;
        const reading = account.windows.find(window => window.key === key);
        if (reading?.remaining == null) continue;
        const weight = weights.get(account) ?? 1;
        sum += reading.remaining * weight; capacity += weight; count++;
        if (reading.resetAt !== null) nextResetAt = nextResetAt === null ? reading.resetAt : Math.min(nextResetAt, reading.resetAt);
      }
      group.totals.push({ key, label: window.label, remaining: capacity ? sum / capacity : null, accounts: count, nextResetAt });
    }
  }
  const order = ['anthropic', 'codex', 'grok', 'apikey', 'backend'];
  return { generatedAt: now, groups: [...groups.values()].sort((a, b) => order.indexOf(a.provider) - order.indexOf(b.provider)) };
}
