import { setTimeout as delay } from 'node:timers/promises';
import { proxyFetch } from './upstream-fetch.js';
import { tokenPairFromResponse } from './oauth.js';
import { envVar } from './brand.js';
import { openBrowser } from './login-flow.js';

const CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828';
const DEVICE_ENDPOINT = 'https://auth.x.ai/oauth2/device/code';
const TOKEN_ENDPOINT = 'https://auth.x.ai/oauth2/token';
const USERINFO_ENDPOINT = 'https://auth.x.ai/oauth2/userinfo';
const SCOPES = 'openid profile email offline_access grok-cli:access api:access';
export const GROK_LOGIN_TIMEOUT_MS = 15 * 60_000;

/** @typedef {{accessToken: string, refreshToken?: string, expiresAt: number, userId: string, teamId?: string, email?: string}} GrokCredentials */
/** @typedef {{routing?: import('./account-routing.js').RoutingProxy|null, signal?: AbortSignal,
 * fetchImpl?: typeof proxyFetch}} RequestOptions */

/** These provider-issued claims label the account; they do not authenticate a caller.
 * @param {unknown} token @returns {Record<string, any>} */
function claims(token) {
  if (typeof token !== 'string') return {};
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) || {}; }
  catch { return {}; }
}

/** @param {unknown} value @returns {string|undefined} */
function textClaim(value) { return typeof value === 'string' && value ? value : undefined; }

/** @param {string} endpoint @param {Record<string, string>} form @param {RequestOptions} options */
async function postForm(endpoint, form, { routing = null, signal, fetchImpl = proxyFetch }) {
  return fetchImpl(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...form }).toString(), routing, signal,
  });
}

/** @param {string} operation @param {number} status @param {Record<string, any>} data */
function oauthError(operation, status, data) {
  const code = typeof data.error === 'string' && /^[a-z_]+$/.test(data.error) ? `: ${data.error}` : '';
  return Object.assign(new Error(`Grok ${operation} failed (${status})${code}`), { status });
}

/** @param {Record<string, any>} data @param {RequestOptions & {previousRefreshToken?: string, lookupEmail?: boolean}} [options]
 * @returns {Promise<GrokCredentials>} */
export async function grokCredentialsFromResponse(data, { previousRefreshToken, lookupEmail = true, ...options } = {}) {
  const access = claims(data.access_token);
  const id = claims(data.id_token);
  const userId = textClaim(access.principal_id) || textClaim(access.sub);
  if (!userId) throw new Error('Grok token response carried no user identity');
  const tokens = tokenPairFromResponse(data, { previousRefreshToken });
  if (!data.expires_in && !data.expires_at && Number.isFinite(access.exp) && access.exp > 0) tokens.expiresAt = access.exp * 1000;
  let email = textClaim(id.email);
  if (!email && lookupEmail) {
    const { fetchImpl = proxyFetch, routing = null, signal } = options;
    const response = await fetchImpl(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: 'application/json' }, routing, signal,
    });
    if (response.ok) email = textClaim((await response.json()).email);
    else await response.body?.cancel();
  }
  return { ...tokens, userId, teamId: textClaim(access.team_id), email };
}

/** @param {string} refreshToken @param {string} [endpoint]
 * @param {import('./account-routing.js').RoutingProxy|null} [routing]
 * @param {{budgetMs?: number, fetchImpl?: typeof proxyFetch}} [opts] */
export async function refreshGrokToken(refreshToken, endpoint = TOKEN_ENDPOINT, routing = null, { budgetMs = Infinity, fetchImpl = proxyFetch } = {}) {
  const timeoutMs = Math.min(Number(envVar('REFRESH_TIMEOUT_MS')) || 30_000, budgetMs);
  if (!(timeoutMs > 0)) throw new Error('Grok token refresh ran out of time');
  const options = { routing, fetchImpl, signal: AbortSignal.timeout(timeoutMs) };
  const response = await postForm(endpoint, { grant_type: 'refresh_token', refresh_token: refreshToken }, options);
  const data = await response.json();
  if (!response.ok) throw oauthError('token refresh', response.status, data);
  return grokCredentialsFromResponse(data, { ...options, previousRefreshToken: refreshToken, lookupEmail: false });
}

/** Start the device flow without opening a browser or binding a listener.
 * @param {RequestOptions & {timeoutMs?: number, now?: () => number,
 * sleep?: (ms: number, signal: AbortSignal) => Promise<void>}} [opts] */
export async function startGrokLogin({ routing = null, signal, fetchImpl = proxyFetch, timeoutMs = GROK_LOGIN_TIMEOUT_MS, now = Date.now, sleep = async (ms, abort) => { await delay(ms, undefined, { signal: abort }); } } = {}) {
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('Grok device login expired')), timeoutMs);
  const options = { routing, fetchImpl, signal: controller.signal };
  const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); };
  try {
    const response = await postForm(DEVICE_ENDPOINT, { scope: SCOPES }, options);
    const device = await response.json();
    if (!response.ok) throw oauthError('device login', response.status, device);
    const url = textClaim(device.verification_uri_complete) || textClaim(device.verification_uri);
    const userCode = textClaim(device.user_code);
    if (!url || !userCode || !textClaim(device.device_code) || !(Number(device.expires_in) > 0)) throw new Error('Invalid Grok device-code response');
    const expiresAt = now() + Math.min(timeoutMs, Number(device.expires_in) * 1000);
    let intervalMs = Math.max(1, Number(device.interval) || 5) * 1000;
    const credentials = (async () => {
      while (now() < expiresAt) {
        await sleep(Math.min(intervalMs, expiresAt - now()), controller.signal);
        controller.signal.throwIfAborted();
        if (now() >= expiresAt) break;
        const token = await postForm(TOKEN_ENDPOINT, {
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: device.device_code,
        }, options);
        const data = await token.json();
        if (token.ok) return grokCredentialsFromResponse(data, options);
        if (data.error === 'authorization_pending') continue;
        if (data.error === 'slow_down') { intervalMs += 5000; continue; }
        if (data.error === 'expired_token') throw new Error('Grok device login expired. Start a new login.');
        if (data.error === 'access_denied') throw new Error('Grok device login was denied.');
        throw oauthError('device authorization', token.status, data);
      }
      throw new Error('Grok device login expired. Start a new login.');
    })().finally(cleanup);
    credentials.catch(() => {});
    return { url, userCode, expiresAt, credentials };
  } catch (error) {
    cleanup();
    throw error;
  }
}

/** @param {{noBrowser?: boolean, routing?: import('./account-routing.js').RoutingProxy|null}} [opts] */
export async function loginGrok({ noBrowser = false, routing = null } = {}) {
  const flow = await startGrokLogin({ routing });
  console.log(`Open this URL to sign in (on any device):\n${flow.url}`);
  console.log(`Confirm this code: ${flow.userCode}\nWaiting for authorization...`);
  if (!noBrowser) openBrowser(flow.url);
  return flow.credentials;
}
