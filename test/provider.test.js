import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  providerOf, providerForPath, applyAuthHeaders, upstreamFor, rewritesBody,
  defaultHeadersTimeoutFor, isKnownProvider, DEFAULT_PROVIDER,
  upstreamPathFor, stripGrokModelBaseUrls, canServeProvider, isGrokExhaustion,
} from '../src/provider.js';
import { teamInferencePath } from '../src/team-access.js';
import { httpClientKey } from '../src/http-client-auth.js';
import { clientSessionId } from '../src/server.js';
import { AccountManager } from '../src/account-manager.js';
import { sameIdentity, findUpsertTarget } from '../src/identity.js';

// An account written before providers existed carries no `provider` field. It
// must keep behaving as Anthropic, or every existing config breaks on upgrade.
test('an account with no provider is Anthropic', () => {
  assert.equal(providerOf({ name: 'legacy', type: 'oauth' }), 'anthropic');
  assert.equal(providerOf({}), 'anthropic');
  assert.equal(providerOf(undefined), 'anthropic');
  assert.equal(DEFAULT_PROVIDER, 'anthropic');
});

test('an unknown provider falls back rather than routing nowhere', () => {
  assert.equal(providerOf({ provider: 'not-a-provider' }), 'anthropic');
  assert.equal(isKnownProvider('codex'), true);
  assert.equal(isKnownProvider('nope'), false);
});

// One port serves both CLIs; the request path is what says which pool of
// accounts is eligible.
test('the request path selects the provider', () => {
  assert.equal(providerForPath('/v1/messages'), 'anthropic');
  assert.equal(providerForPath('/v1/messages/count_tokens'), 'anthropic');
  assert.equal(providerForPath('/backend-api/codex/responses'), 'codex');
  assert.equal(providerForPath('/backend-api/codex/models'), 'codex');
  // Codex appends a client_version query on its catalog fetch.
  assert.equal(providerForPath('/backend-api/codex/models?client_version=0.150.1'), 'codex');
  // The OpenAI *API platform* paths are not Codex's: a ChatGPT token is
  // rejected there, so they must not be routed to a Codex account.
  assert.equal(providerForPath('/v1/responses'), 'openai');
  // Anything unrecognised stays Anthropic's, so a config with no Codex
  // accounts routes exactly as it did before.
  assert.equal(providerForPath('/v1/complete'), 'anthropic');
  assert.equal(providerForPath(''), 'anthropic');
  assert.equal(providerForPath(undefined), 'anthropic');
});

// The path goes upstream verbatim, so this prefix test has to read it the way
// the server that resolves it will. Otherwise the two disagree about which pool
// of accounts is eligible, and therefore about which credential is attached.
test('the provider is selected on the decoded path', () => {
  assert.equal(providerForPath('/backend-api%2fcodex/responses'), 'codex');
  assert.equal(providerForPath('/backend-api/codex%2fresponses'), 'codex');
  assert.equal(providerForPath('/backend-api/codex%2Fmodels?client_version=0.150.1'), 'codex');
  assert.equal(providerForPath('/%62ackend-api/codex/responses'), 'codex');
});

// A backslash is a separator to the URL parser, so `new URL()` folds it while
// building the outgoing target. The prefix test has to fold it too, or the
// request goes out as a Codex path having been classified as an Anthropic one.
test('the provider is selected on the separator-folded path', () => {
  assert.equal(providerForPath('/backend-api\\codex/responses'), 'codex');
  assert.equal(providerForPath('/backend-api/codex\\responses'), 'codex');
  assert.equal(providerForPath('/backend-api\\codex'), 'codex');
  assert.equal(providerForPath('/backend-api%5ccodex/responses'), 'codex');
});

// One decode deep: `%252f` resolves to a literal `%2f` inside a segment, so
// `/backend-api%252fcodex/…` is a path under `/backend-api%2fcodex`, not a Codex
// one. A malformed escape has no decoded form and is read as sent.
test('a double-encoded or undecodable path is classified as it resolves', () => {
  assert.equal(providerForPath('/backend-api%252fcodex/responses'), 'anthropic');
  assert.equal(providerForPath('/backend-api/codex%252fresponses'), 'anthropic');
  assert.equal(providerForPath('/backend-api/%/responses'), 'anthropic');
  assert.equal(providerForPath('/backend-api/codex/%/responses'), 'codex');
  assert.equal(providerForPath('/backend-api%255ccodex/responses'), 'anthropic');
});

test('Anthropic OAuth sends a bearer token, an API key sends x-api-key', () => {
  const oauth = {};
  applyAuthHeaders(oauth, { type: 'oauth', credential: 'tok' });
  assert.deepEqual(oauth, { authorization: 'Bearer tok' });

  const apikey = {};
  applyAuthHeaders(apikey, { type: 'apikey', credential: 'sk-ant' });
  assert.deepEqual(apikey, { 'x-api-key': 'sk-ant' });
});

// ChatGPT-Account-Id is OpenAI's counterpart to the account_uuid the Anthropic
// path patches into the request body — a header, so no body rewrite is needed.
test('Codex sends a bearer token plus the ChatGPT account header', () => {
  const headers = {};
  applyAuthHeaders(headers, { provider: 'codex', type: 'oauth', credential: 'tok', accountId: 'acct-1' });
  assert.deepEqual(headers, { authorization: 'Bearer tok', 'chatgpt-account-id': 'acct-1' });
});

test('Codex without an account id still authenticates', () => {
  const headers = {};
  applyAuthHeaders(headers, { provider: 'codex', type: 'oauth', credential: 'tok' });
  assert.deepEqual(headers, { authorization: 'Bearer tok' });
  assert.ok(!('chatgpt-account-id' in headers));
});

test('an account upstream overrides the provider default', () => {
  assert.equal(upstreamFor({ upstream: 'https://glm.example' }, 'https://api.anthropic.com'), 'https://glm.example');
});

// The configured `upstream` predates providers and means "where Anthropic
// lives", so it must not capture Codex traffic.
test('the configured upstream applies to Anthropic only', () => {
  const configured = 'https://anthropic.internal';
  assert.equal(upstreamFor({ name: 'a' }, configured), configured);
  assert.equal(upstreamFor({ provider: 'codex' }, configured), 'https://chatgpt.com');
});

test('body rewrites are Anthropic-only', () => {
  assert.equal(rewritesBody({ type: 'oauth' }), true);
  assert.equal(rewritesBody({ provider: 'codex' }), false);
});

// Codex holds the response head open while the model reasons, so a large turn
// passes two minutes before its first byte while the socket is perfectly
// healthy. Anthropic streams within seconds and keeps the fleet default —
// `null` says the provider has no opinion, so nothing else has to know what
// that default is.
test('Codex waits longer for the response head than the fleet default', () => {
  assert.equal(defaultHeadersTimeoutFor({ provider: 'codex' }), 300_000);
  assert.equal(defaultHeadersTimeoutFor({ provider: 'anthropic' }), null);
  assert.equal(defaultHeadersTimeoutFor({ type: 'oauth' }), null);
  assert.equal(defaultHeadersTimeoutFor(undefined), null);
});

test('Grok has a separate subscription route, selected identity headers and a safe model catalog', () => {
  const account = { provider: 'grok', type: 'oauth', credential: 'account-token', userId: 'selected-user', teamId: 'team', email: 'selected@example.invalid' };
  for (const route of ['settings', 'models', 'user', 'bundle/archive', 'subagents/bundle', 'feedback/config']) {
    const path = `/grok/v1/${route}?version=1`;
    assert.equal(providerForPath(path), 'grok');
    assert.equal(upstreamPathFor(path), `/v1/${route}?version=1`);
    assert.equal(teamInferencePath('GET', path), true);
  }
  assert.equal(teamInferencePath('POST', '/grok/v1/responses'), true);
  assert.equal(teamInferencePath('POST', '/grok/v1/settings'), false);
  assert.equal(teamInferencePath('GET', '/grok/v1/billing'), false);
  assert.equal(providerForPath('/grok/v1/responses'), 'grok');
  assert.equal(providerForPath('/v1/responses'), 'openai');
  assert.equal(upstreamPathFor('/v1/responses'), '/v1/responses');
  assert.equal(upstreamPathFor('/%67rok%2fv1/models'), '/v1/models');
  assert.equal(providerForPath('/grok/v10/models'), 'anthropic');
  assert.equal(upstreamFor(account), 'https://cli-chat-proxy.grok.com');
  assert.equal(rewritesBody(account), false);
  assert.equal(canServeProvider(account, 'grok'), true);
  assert.equal(canServeProvider(account, 'openai'), false);
  assert.equal(canServeProvider({ type: 'apikey' }, 'grok'), false);
  const headers = { authorization: 'Bearer member-key', 'chatgpt-account-id': 'wrong', 'x-userid': 'wrong', 'x-email': 'wrong', 'x-grok-user-id': 'wrong' };
  applyAuthHeaders(headers, account, 'grok-model');
  assert.deepEqual(headers, { authorization: 'Bearer account-token', 'x-xai-token-auth': 'xai-grok-cli', 'x-userid': 'selected-user', 'x-grok-user-id': 'selected-user', 'x-email': 'selected@example.invalid', 'x-grok-model-override': 'grok-model' });
  applyAuthHeaders(headers, { ...account, email: undefined, userId: undefined }, 'other-model');
  assert.equal(headers['x-userid'], undefined);
  assert.equal(headers['x-email'], undefined);
  assert.equal(headers['x-grok-user-id'], undefined);
  assert.equal(headers['x-grok-model-override'], 'grok-model');
  const catalog = { data: [{ id: 'grok-model', base_url: 'https://cli-chat-proxy.grok.com/v1', api_backend: 'responses' }], models: [{ id: 'other', base_url: 'https://elsewhere.invalid' }] };
  assert.deepEqual(JSON.parse(stripGrokModelBaseUrls(Buffer.from(JSON.stringify(catalog)))), { data: [{ id: 'grok-model', api_backend: 'responses' }], models: [{ id: 'other' }] });
  for (const status of [429, 402, 403]) for (const phrase of ['Usage limit reached', 'out of credits', 'usage balance exhausted', 'spending limit']) assert.equal(isGrokExhaustion(status, Buffer.from(JSON.stringify({ error: phrase }))), true);
  assert.equal(isGrokExhaustion(400, Buffer.from('out of credits')), false);
  assert.equal(isGrokExhaustion(403, Buffer.from('permission denied')), false);
  assert.equal(httpClientKey({ headers: { authorization: 'Bearer member-key' } }), 'member-key');
  assert.equal(clientSessionId({ 'x-grok-conv-id': 'conversation-1', 'session-id': 'session-1' }), 'conversation-1');
  assert.equal(sameIdentity(account, { ...account, teamId: 'other-team' }), false);
  assert.equal(sameIdentity(account, { ...account, teamId: undefined }), true);
  assert.equal(sameIdentity(account, { ...account, userId: 'other-user' }), false);
  assert.equal(sameIdentity({ provider: 'grok', name: 'same' }, { provider: 'grok', name: 'same' }), false);
  assert.equal(findUpsertTarget([{ ...account, teamId: undefined }, account], account), 1);
  const manager = new AccountManager([
    { ...account, name: 'first' }, { ...account, name: 'second', userId: 'other-user' },
  ]);
  manager.recordSession('conversation-1', 0, 'grok-model');
  manager.currentIndex = 1;
  assert.equal(manager.getActiveAccount(null, 'other-model', null, 'conversation-1', 'grok').index, 0);
  assert.equal(manager.getActiveAccount(new Set([0]), 'other-model', null, 'conversation-1', 'grok').index, 1);
  assert.equal(manager.exportQuotaState()[0].teamId, 'team');
});
