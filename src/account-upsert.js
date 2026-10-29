import { atomicConfigUpdate, getConfigPath } from './config.js';
import { mintAccountId } from './account-id.js';
import { parseRoutingUrl, routingToUrl, describeRouting } from './account-routing.js';
import { findUpsertTarget, updateAccountEntry, sameIdentity, canUpsertOAuthAccount, isTokenRejection, oauthIdentityFields } from './identity.js';
import { profileForCredentials, refreshAccessToken } from './oauth.js';
import { CredentialSync, refreshOutsideProxy } from './credential-sync.js';
import { AccountActionError, assertAccountOwner } from './owned-accounts.js';
import { sanitizeText } from './safe-text.js';

/** @typedef {{name?: string, source?: 'login'|'import', routing?: import('./account-routing.js').RoutingProxy|null,
 * storeRouting?: boolean, owner?: import('./owned-accounts.js').AccountOwner|null, log?: (line: string) => void}} UpsertOptions */
/** @typedef {{action: 'added'|'updated', id: string, name: string}} UpsertResult */

/** @param {Record<string, any>} row */
function orgLabel(row) { return row.orgName || (row.orgUuid ? row.orgUuid.slice(0, 8) : 'org'); }

/** @param {Record<string, any>} entry @param {(line: string) => void} log */
async function recordSignInWithCallback(entry, log) {
  const sync = new CredentialSync({ accountManager: /** @type {any} */ ({ accounts: [] }), addAccount: () => null, log });
  try {
    if (await sync.storeSignIn(entry)) log('Stored on callback.net for your other installs.');
  } catch (error) {
    log(`Could not store the sign-in on callback.net (${sanitizeText(/** @type {Error|null|undefined} */ (error)?.message || error)}); its next renewal will.`);
  }
}

/** @param {Record<string, any>} account @param {UpsertOptions} opts @returns {Promise<UpsertResult>} */
export async function persistAccount(account, { owner = null, routing = null, storeRouting = false, name, log = () => {} }) {
  /** @type {UpsertResult|undefined} */
  let outcome;
  /** @type {Parameters<typeof recordSignInWithCallback>[0]|undefined} */
  let signedIn;
  await atomicConfigUpdate((/** @type {{accounts: Array<Parameters<typeof updateAccountEntry>[0]>}} */ config) => {
    account.name ||= account.provider === 'codex' || account.provider === 'grok'
      ? `${account.provider}-${config.accounts.filter(row => row.provider === account.provider).length + 1}`
      : `account-${config.accounts.filter(row => row.name.startsWith('account-')).length + 1}`;
    if (owner) account.owner = { ...owner };
    if (routing && storeRouting) account.routing = routingToUrl(routing);
    const index = findUpsertTarget(config.accounts, account);
    if (index >= 0) {
      const previous = config.accounts[index];
      assertAccountOwner(previous, owner);
      // Keep ownership, sharing and disabled state from the locked disk row.
      delete account.owner;
      const updated = config.accounts[index] = updateAccountEntry(previous, account);
      signedIn = updated;
      if (storeRouting && !routing) delete updated.routing;
      outcome = { action: 'updated', id: updated.id, name: updated.name };
      if (!storeRouting && !routing) {
        let own = null;
        try { own = parseRoutingUrl(previous.routing); }
        catch (error) { log(`Note: ignoring routing for "${previous.name}" — ${sanitizeText(/** @type {Error} */ (error).message)}`); }
        if (own) {
          log(`Note: "${previous.name}" has its own routing (${describeRouting(own)}), and this sign-in did not use it:`);
          log('      the account was only identified after signing in. Its requests are still routed.');
          log(`      To route the sign-in too, pass: --name "${previous.name}"`);
        }
      }
    } else {
      if (owner && config.accounts.some(row => row.name === account.name)) {
        account.name += ` (${owner.name})`;
      } else if (!owner && !name && account.accountUuid) {
        const collisions = config.accounts.filter(row => !row.owner && row.accountUuid === account.accountUuid && !sameIdentity(row, account));
        if (collisions.length) {
          for (const row of collisions) if (!row.name.includes(' (')) row.name += ` (${orgLabel(row)})`;
          account.name += ` (${orgLabel(account)})`;
        }
      }
      account.id = mintAccountId();
      config.accounts.push(account);
      signedIn = account;
      outcome = { action: 'added', id: account.id, name: account.name };
    }
  });
  // The locked updater assigns both values on every successful path.
  const result = /** @type {UpsertResult} */ (outcome);
  const entry = /** @type {Parameters<typeof recordSignInWithCallback>[0]} */ (signedIn);
  log(`${result.action === 'added' ? 'Added' : 'Updated'} account "${result.name}"`);
  log(`Saved to ${getConfigPath()}`);
  if (!entry.owner) await recordSignInWithCallback(entry, log);
  return result;
}

/** @param {Record<string, any>} creds @param {UpsertOptions} [opts] @returns {Promise<UpsertResult>} */
export async function upsertCodexAccount(creds, opts = {}) {
  return persistAccount({
    name: opts.name || creds.email, type: 'oauth', provider: 'codex', source: opts.source ?? 'login',
    accountId: creds.accountId, userId: creds.userId,
    accessToken: creds.accessToken, refreshToken: creds.refreshToken, expiresAt: creds.expiresAt,
  }, opts);
}

/** @param {Record<string, any>} creds @param {UpsertOptions} [opts] @returns {Promise<UpsertResult>} */
export async function upsertGrokAccount(creds, opts = {}) {
  if (!creds.userId || !creds.accessToken || !creds.refreshToken) throw new AccountActionError('Grok sign-in returned incomplete credentials.', 502);
  return persistAccount({
    name: opts.name || creds.email, type: 'oauth', provider: 'grok', source: opts.source ?? 'login',
    userId: creds.userId, ...(creds.teamId ? { teamId: creds.teamId } : {}), ...(creds.email ? { email: creds.email } : {}),
    accessToken: creds.accessToken, refreshToken: creds.refreshToken, expiresAt: creds.expiresAt,
  }, opts);
}

/** @param {Record<string, any>} creds @param {UpsertOptions} [opts] @returns {Promise<UpsertResult>} */
export async function upsertOAuthAccount(creds, opts = {}) {
  return persistAccount(await identifyOAuthAccount(creds, opts), opts);
}

/** @param {Record<string, any>} creds @param {UpsertOptions} [opts] @returns {Promise<Record<string, any>>} */
export async function identifyOAuthAccount(creds, opts = {}) {
  const { name, owner = null, routing = null, log = () => {} } = opts;
  const identified = await profileForCredentials(creds, routing, {
    renew: c => refreshOutsideProxy({
      name: name || 'imported account', type: 'oauth', owner,
      accessToken: c.accessToken, refreshToken: c.refreshToken, expiresAt: c.expiresAt,
    }, o => /** @type {Promise<import('./credential-sync.js').Tokens>} */ (refreshAccessToken(c.refreshToken, undefined, routing, o)), { force: true, log })
      .then(tokens => tokens ?? Promise.reject(new Error('token not renewed'))),
  });
  creds = identified.creds;
  const profile = identified.profile;
  if (!canUpsertOAuthAccount(profile, Boolean(name))) {
    const why = `Could not identify OAuth account — ${profile?.error ? sanitizeText(profile.error) : 'profile unavailable'}`;
    const advice = isTokenRejection(profile)
      ? 'The upstream rejected this token and it could not be refreshed. Run `relaycrew login` to get a fresh one.'
      : 'Retry with valid credentials, or pass --name to add the account without profile detection.';
    throw new AccountActionError(`${why}. ${advice}`, 502);
  }
  if (!profile || profile.error) log(`Warning: importing named account without profile detection — ${profile?.error ? sanitizeText(profile.error) : 'profile unavailable'}`);
  if (!name && profile?.email) {
    const tier = profile.hasClaudeMax ? 'Max' : profile.hasClaudePro ? 'Pro' : null;
    if (tier) log(`Detected Claude ${tier} account: ${profile.email}`);
  }
  return {
    name: name || profile?.email, type: 'oauth', source: opts.source ?? 'login',
    ...oauthIdentityFields(profile),
    organizationType: profile?.organizationType || null,
    rateLimitTier: profile?.rateLimitTier || creds.rateLimitTier || null,
    seatTier: profile?.seatTier || null,
    hasClaudeMax: profile?.hasClaudeMax ?? null, hasClaudePro: profile?.hasClaudePro ?? null,
    accessToken: creds.accessToken, refreshToken: creds.refreshToken, expiresAt: creds.expiresAt,
  };
}
