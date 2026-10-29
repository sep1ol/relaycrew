import { randomBytes } from 'node:crypto';
import { startOAuthLogin } from './oauth.js';
import { startCodexLogin } from './codex-auth.js';
import { PANEL_LOGIN_TIMEOUT_MS } from './login-flow.js';
import { AccountActionError } from './owned-accounts.js';

/** @typedef {'claude'|'codex'} LoginProvider */
/** @typedef {{url: string, submit: (text: string) => boolean, tokens: Promise<Record<string, any>>}} ClaudeFlow */
/** @typedef {{url: string, submit: (text: string) => boolean, credentials: Promise<Record<string, any>>}} CodexFlow */
/** @typedef {{id: string, provider: LoginProvider, paste: 'code'|'callback-url', url: string, expiresAt: number}} LoginView */
/** @typedef {LoginView & {identity: string, fingerprint: string, owner: import('./owned-accounts.js').AccountOwner|null,
 * submit: (text: string) => boolean, result: Promise<Record<string, any>>, abort: AbortController}} PendingLogin */
/** @typedef {{now?: () => number, timeoutMs?: number, max?: number,
 * startClaude?: (opts: {loopback: boolean, signal: AbortSignal, timeoutMs: number}) => Promise<ClaudeFlow>,
 * startCodex?: (opts: {listen: boolean, signal: AbortSignal, timeoutMs: number}) => Promise<CodexFlow>}} LoginOptions */

/** @param {import('./team-access.js').TeamIdentity} identity */
function identityName(identity) { return identity.kind === 'member' ? `member:${identity.name}` : 'admin'; }

export class MemberLogins {
  /** @param {LoginOptions} [opts] */
  constructor({ now = Date.now, timeoutMs = PANEL_LOGIN_TIMEOUT_MS, max = 32, startClaude = startOAuthLogin, startCodex = startCodexLogin } = {}) {
    this.now = now;
    this.timeoutMs = timeoutMs;
    this.max = max;
    this.startClaude = startClaude;
    this.startCodex = startCodex;
    /** @type {Map<string, PendingLogin>} */
    this.pending = new Map();
  }

  sweep() {
    for (const pending of this.pending.values()) if (pending.expiresAt <= this.now()) this.drop(pending);
  }

  /** @param {PendingLogin} pending */
  drop(pending) {
    this.pending.delete(pending.id);
    pending.abort.abort();
  }

  /** @param {import('./team-access.js').TeamIdentity} identity
   * @param {{provider: LoginProvider, sharing: import('./owned-accounts.js').Sharing}} options
   * @returns {Promise<LoginView>} */
  async start(identity, { provider, sharing }) {
    this.sweep();
    const name = identityName(identity);
    for (const pending of this.pending.values()) if (pending.identity === name) this.drop(pending);
    if (this.pending.size >= this.max) throw new AccountActionError('Too many pending logins. Try again shortly.', 429);
    const abort = new AbortController();
    /** @type {ClaudeFlow|CodexFlow|null} */
    let flow = null;
    const started = Promise.resolve().then(/** @returns {Promise<ClaudeFlow|CodexFlow>} */ async () => provider === 'claude'
      ? this.startClaude({ loopback: false, signal: abort.signal, timeoutMs: this.timeoutMs })
      : this.startCodex({ listen: false, signal: abort.signal, timeoutMs: this.timeoutMs }));
    /** @type {() => void} */
    let onAbort;
    /** @type {Promise<Record<string, any>>} */
    const cancelled = new Promise((_resolve, reject) => {
      onAbort = () => reject(new AccountActionError('No pending login with that id.', 404));
      abort.signal.addEventListener('abort', onAbort, { once: true });
    });
    /** @type {PendingLogin} */
    const pending = {
      id: randomBytes(24).toString('base64url'), identity: name, fingerprint: identity.fingerprint,
      owner: identity.kind === 'member' ? { name: identity.name, sharing } : null,
      provider, paste: provider === 'claude' ? 'code' : 'callback-url', url: '', expiresAt: this.now() + this.timeoutMs,
      abort, submit: text => flow?.submit(text) ?? false,
      result: Promise.race([started.then(value => 'tokens' in value ? value.tokens : value.credentials), cancelled]),
    };
    this.pending.set(pending.id, pending);
    // Provider paste timers stop at submission; expiry also covers an exchange in flight.
    const timer = setTimeout(() => this.drop(pending), this.timeoutMs);
    timer.unref();
    const cleanup = () => {
      clearTimeout(timer);
      abort.signal.removeEventListener('abort', onAbort);
      if (this.pending.get(pending.id) === pending) this.pending.delete(pending.id);
    };
    pending.result.then(cleanup, cleanup);
    flow = await started;
    if (abort.signal.aborted) throw new AccountActionError('No pending login with that id.', 404);
    pending.url = flow.url;
    return { id: pending.id, provider, paste: pending.paste, url: pending.url, expiresAt: pending.expiresAt };
  }

  /** @param {import('./team-access.js').TeamIdentity} identity @param {string} id */
  find(identity, id) {
    this.sweep();
    const pending = this.pending.get(id);
    return pending?.identity === identityName(identity) && pending.fingerprint === identity.fingerprint ? pending : null;
  }

  /** @param {import('./team-access.js').TeamIdentity} identity @param {string} id */
  require(identity, id) {
    const pending = this.find(identity, id);
    if (!pending) throw new AccountActionError('No pending login with that id.', 404);
    return pending;
  }

  /** @param {import('./team-access.js').TeamIdentity} identity @param {string} id @param {string} text */
  submit(identity, id, text) { return this.require(identity, id).submit(text); }

  /** @param {import('./team-access.js').TeamIdentity} identity @param {string} id */
  async result(identity, id) { return this.require(identity, id).result; }

  /** @param {import('./team-access.js').TeamIdentity} identity @param {string} id */
  cancel(identity, id) { this.drop(this.require(identity, id)); }
}
