import { providerOf } from './provider.js';

/** @typedef {'private'|'pool'} Sharing */
/** @typedef {{name: string, sharing: Sharing}} AccountOwner */
/** @typedef {{kind: 'admin'}|{kind: 'member', name: string}} Actor */
/** @typedef {{id: string, name: string, provider: string, owner: string|null, sharing: Sharing|'operator', disabled: boolean, disabledBy?: 'admin'}} AccountView */
/** @typedef {{action: 'update', id: string, disabled?: boolean, sharing?: Sharing}|{action: 'remove', id: string}} AccountAction */

export class AccountActionError extends Error {
  /** @param {string} message @param {number} [status] */
  constructor(message, status = 400) { super(message); this.status = status; }
}

/** @param {unknown} value @returns {Sharing} */
export function validateSharing(value) {
  if (value !== 'private' && value !== 'pool') throw new AccountActionError('Sharing must be private or pool.');
  return value;
}

/** @param {Record<string, any>} row @param {AccountOwner|null|undefined} owner */
export function assertAccountOwner(row, owner) {
  if ((row.owner?.name ?? null) !== (owner?.name ?? null)) throw new AccountActionError('This provider account is already in the gateway.', 409);
}

/** @param {Record<string, any>} row @returns {AccountView} */
export function accountView(row) {
  return {
    id: row.id, name: row.name ?? '', provider: providerOf(row),
    owner: row.owner?.name ?? null, sharing: row.owner?.sharing ?? 'operator',
    disabled: row.disabled === true,
    ...(row.disabledBy === 'admin' ? { disabledBy: /** @type {const} */ ('admin') } : {}),
  };
}

/** @param {Record<string, any>} row @param {Record<string, any>} current */
export function pinAccountPolicy(row, current) {
  const pinned = { ...row };
  if (current.owner) pinned.owner = { ...current.owner }; else delete pinned.owner;
  if (current.disabledBy) pinned.disabledBy = current.disabledBy; else delete pinned.disabledBy;
  return pinned;
}

/** @param {{accounts?: Array<Parameters<typeof accountView>[0]>}} config @param {Actor} actor */
export function accountViews(config, actor) {
  return (config.accounts ?? []).filter(row => actor.kind === 'admin' || row.owner?.name === actor.name).map(accountView);
}

/** @param {{accounts?: Array<Parameters<typeof accountView>[0]>}} config @param {Actor} actor @param {string} id @returns {Record<string, any>} */
export function manageableRow(config, actor, id) {
  const row = (config.accounts ?? []).find(row => row.id === id);
  if (actor.kind === 'member' && (!row?.owner || row.owner.name !== actor.name)) throw new AccountActionError('That account is not yours.', 403);
  if (!row) throw new AccountActionError('No account with that id.', 404);
  return row;
}

/** @param {{accounts?: Array<Parameters<typeof accountView>[0]>}} config @param {Actor} actor @param {AccountAction} action
 * @returns {{account: AccountView}|{removed: string}} */
export function applyAccountAction(config, actor, action) {
  const row = manageableRow(config, actor, action.id);
  if (action.action === 'remove') {
    if (!row.owner) throw new AccountActionError('Remove operator accounts with relaycrew remove.');
    const accounts = config.accounts ?? [];
    accounts.splice(accounts.indexOf(row), 1);
    return { removed: row.id };
  }
  if (action.sharing !== undefined && !row.owner) throw new AccountActionError('Operator accounts do not have a sharing setting.');
  if (action.sharing !== undefined && actor.kind !== 'member') throw new AccountActionError('Only the owner changes sharing.', 403);
  if (action.disabled !== undefined) {
    if (!action.disabled && actor.kind === 'member' && row.disabledBy === 'admin') throw new AccountActionError('An administrator disabled this account.', 403);
    if (action.disabled) {
      row.disabled = true;
      if (actor.kind === 'admin' && row.owner) row.disabledBy = 'admin';
    } else {
      delete row.disabled;
      delete row.disabledBy;
    }
  }
  if (action.sharing !== undefined) row.owner = { ...row.owner, sharing: action.sharing };
  return { account: accountView(row) };
}
