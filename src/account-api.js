import { atomicConfigUpdate, loadConfigPersistingIds } from './config.js';
import { classificationPath } from './classification-path.js';
import { canonicalControlUrl } from './brand.js';
import { teamAccessFor, teamIdentityValid } from './team-access.js';
import { serializeMutation, teamJson } from './team-api.js';
import { AccountActionError, accountView, accountViews, applyAccountAction, validateSharing } from './owned-accounts.js';
import { upsertOAuthAccount, upsertCodexAccount } from './account-upsert.js';

/** @param {any} req @param {(req: any) => Promise<string|Buffer>} readBody @param {string[]} fields */
async function accountBody(req, readBody, fields) {
  let body;
  try {
    const raw = await readBody(req);
    if (Buffer.byteLength(raw) > 64 * 1024) throw new Error('oversized');
    body = JSON.parse(String(raw));
  } catch {
    throw new AccountActionError('A valid JSON body no larger than 64 KiB is required.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AccountActionError('Expected a JSON object.');
  if (Object.keys(body).some(key => !fields.includes(key))) throw new AccountActionError('Unknown account field.');
  return body;
}

/** @param {unknown} value @param {string} field @returns {string} */
function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new AccountActionError(`A nonempty ${field} is required.`);
  return value;
}

/** Authorization and CSRF gates in server.js run first.
 * @param {any} req @param {any} res
 * @param {{config: Record<string, any>, hooks?: {reload?: () => Promise<any>}, logins: import('./member-logins.js').MemberLogins,
 * readBody: (req: any) => Promise<string|Buffer>}} options @returns {Promise<boolean>} */
export async function handleAccountRequest(req, res, { config, hooks = {}, logins, readBody }) {
  const classified = classificationPath(req.url);
  const path = canonicalControlUrl(classified) ?? classified;
  const match = /^\/relaycrew\/accounts\/(login(?:\/(?:complete|cancel))?|update|remove)$/.exec(path);
  if (path !== '/relaycrew/accounts' && !match) return false;
  if (config.proxy?.teamMode !== true) {
    teamJson(res, 404, { ok: false, error: 'Not found.' });
    return true;
  }
  const identity = req.tcTeamIdentity;
  if (!identity || !teamIdentityValid(config.proxy, identity)) {
    teamJson(res, 401, { ok: false, error: 'Team authentication required.' });
    return true;
  }
  try {
    if (req.method === 'GET' && !match) {
      const disk = await loadConfigPersistingIds() ?? config;
      teamJson(res, 200, { ok: true, accounts: accountViews(disk, identity) });
      return true;
    }
    if (req.method !== 'POST' || !match) {
      teamJson(res, 405, { ok: false, error: 'Method not allowed.' });
      return true;
    }
    const action = match[1];
    const fields = action === 'login' ? ['provider', 'sharing'] : action === 'login/complete' ? ['id', 'code'] : action === 'update' ? ['id', 'disabled', 'sharing'] : ['id'];
    const body = await accountBody(req, readBody, fields);
    if (action === 'login') {
      if (body.provider !== 'claude' && body.provider !== 'codex') throw new AccountActionError('Provider must be claude or codex.');
      const sharing = identity.kind === 'member' ? validateSharing(body.sharing) : 'private';
      let login;
      try { login = await logins.start(identity, { provider: body.provider, sharing }); }
      catch (error) {
        if (error instanceof AccountActionError) throw error;
        throw new AccountActionError('Unable to start the provider sign-in. Try again.', 502);
      }
      teamJson(res, 201, { ok: true, login });
      return true;
    }
    const id = requiredText(body.id, 'id');
    if (action === 'login/cancel') {
      logins.cancel(identity, id);
      teamJson(res, 200, { ok: true });
      return true;
    }
    /** @type {() => Promise<Record<string, any>>} */
    let change;
    if (action === 'login/complete') {
      const code = requiredText(body.code, 'code');
      const pending = logins.require(identity, id);
      let accepted;
      try { accepted = logins.submit(identity, id, code); }
      catch (error) { throw new AccountActionError(error.message); }
      if (!accepted) throw new AccountActionError('This login has already completed.', 409);
      let creds;
      try { creds = await logins.result(identity, id); }
      catch (error) {
        if (error instanceof AccountActionError) throw error;
        throw new AccountActionError('The provider refused the code. Start a new login.', 502);
      }
      change = async () => {
        const upsert = pending.provider === 'claude' ? upsertOAuthAccount : upsertCodexAccount;
        const outcome = await upsert(creds, { owner: pending.owner, source: 'login' });
        const disk = await loadConfigPersistingIds();
        return { action: outcome.action, account: accountView(disk.accounts.find(row => row.id === outcome.id)) };
      };
    } else {
      if (action === 'update') {
        if (body.disabled !== undefined && typeof body.disabled !== 'boolean') throw new AccountActionError('Disabled must be true or false.');
        if (body.sharing !== undefined) validateSharing(body.sharing);
        if (body.disabled === undefined && body.sharing === undefined) throw new AccountActionError('Specify disabled or sharing.');
      }
      change = async () => {
        let result;
        await atomicConfigUpdate(disk => {
          result = applyAccountAction(disk, identity, { ...body, id, action });
        });
        return result;
      };
    }
    const result = await serializeMutation(async () => {
      if (!teamIdentityValid(config.proxy, identity)) throw new AccountActionError('Team credential has been revoked or rotated.', 401);
      const saved = await change();
      let applied = false;
      try {
        if (typeof hooks.reload === 'function') {
          await hooks.reload();
          teamAccessFor(config).refresh();
          applied = true;
        }
      } catch { /* The saved account survives a failed runtime reload. */ }
      return { ok: true, applied, ...saved, ...(applied ? {} : { warning: 'Changes saved. Runtime reload failed or is unavailable; reload the server to apply them.' }) };
    });
    teamJson(res, 200, result);
  } catch (error) {
    const status = error instanceof AccountActionError ? error.status : error.code === 'CONFIG_LOCK_BUSY' ? 503 : 500;
    teamJson(res, status, { ok: false, error: error instanceof AccountActionError ? error.message : status === 503 ? 'Config is busy. Try again shortly.' : 'Unable to read or save account configuration.' });
  }
  return true;
}
