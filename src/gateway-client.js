import { envVar } from './brand.js';
import { safeLine } from './safe-text.js';

export class GatewayError extends Error {
  /** @param {string} message @param {number} status */
  constructor(message, status) { super(message); this.status = status; }
}

export class RetryablePaste extends GatewayError {}

/** @param {string[]} args @param {NodeJS.ProcessEnv} [env] */
export function resolveGateway(args, env = process.env) {
  const flag = name => {
    const index = args.indexOf(name);
    if (index < 0) return undefined;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}.`);
    return value;
  };
  return {
    baseUrl: flag('--gateway') ?? envVar('GATEWAY', env) ?? env.ANTHROPIC_BASE_URL,
    key: flag('--key') ?? envVar('KEY', env) ?? env.TEAM_GATEWAY_KEY ?? env.ANTHROPIC_AUTH_TOKEN,
  };
}

export class GatewayClient {
  /** @param {{baseUrl: string, key: string, fetchImpl?: typeof fetch, timeoutMs?: number}} opts */
  constructor({ baseUrl, key, fetchImpl = fetch, timeoutMs = 30_000 }) {
    let url;
    try { url = new URL(baseUrl); } catch { throw new Error('A gateway URL is required (--gateway or RELAYCREW_GATEWAY).'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('The gateway must be an http or https URL without credentials, a query or a fragment.');
    if (!key?.trim()) throw new Error('A member key is required (--key or RELAYCREW_KEY).');
    this.baseUrl = url.href.replace(/\/+$/, '');
    this.key = key;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  /** @param {string} path @param {Record<string, any>} [body] @param {number} [timeoutMs] */
  async call(path, body, timeoutMs = this.timeoutMs) {
    const response = await this.fetch(`${this.baseUrl}/relaycrew/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'x-api-key': this.key, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new GatewayError('Gateway redirects are refused. Use its final URL.', response.status);
    }
    let data;
    try { data = await response.json(); }
    catch { throw new GatewayError('The gateway did not return JSON.', response.status); }
    if (!response.ok || data?.ok === false) {
      const message = safeLine(typeof data?.error === 'string' ? data.error : data?.error?.message || `Gateway request failed (${response.status}).`, 500);
      if (path === 'accounts/login/complete' && response.status === 400) throw new RetryablePaste(message, 400);
      throw new GatewayError(message, response.status);
    }
    return data;
  }

  me() { return this.call('me'); }
  accounts() { return this.call('accounts'); }
  /** @param {import('./member-logins.js').LoginProvider} provider @param {import('./owned-accounts.js').Sharing} sharing */
  startLogin(provider, sharing) { return this.call('accounts/login', { provider, sharing }); }
  /** @param {string} id @param {string} text */
  completeLogin(id, text) { return this.call('accounts/login/complete', { id, code: text }, 15 * 60_000); }
  /** @param {string} id */
  cancelLogin(id) { return this.call('accounts/login/cancel', { id }); }
  /** @param {string} id @param {{disabled?: boolean, sharing?: import('./owned-accounts.js').Sharing}} patch */
  update(id, patch) { return this.call('accounts/update', { id, ...patch }); }
  /** @param {string} id */
  remove(id) { return this.call('accounts/remove', { id }); }
}
