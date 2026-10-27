import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AccountManager } from '../src/account-manager.js';
import { createProxyServer } from '../src/server.js';
import { providerOf, providerForPath, upstreamFor, applyAuthHeaders, canServeProvider, rewritesBody } from '../src/provider.js';

const platform = { id: 'platform-id', name: 'platform', type: 'apikey', provider: 'openai', apiKey: 'sk-platform-test', priority: 100 };

test('OpenAI platform accounts use their own upstream and Bearer credentials', () => {
  assert.equal(providerOf(platform), 'openai');
  assert.equal(upstreamFor(platform, 'https://api.anthropic.com'), 'https://api.openai.com');
  assert.equal(rewritesBody(platform), false);
  const headers = { 'chatgpt-account-id': 'client-account' };
  applyAuthHeaders(headers, { ...platform, credential: platform.apiKey });
  assert.deepEqual(headers, { authorization: 'Bearer sk-platform-test' });
});

test('Responses paths select OpenAI without capturing Anthropic model discovery', () => {
  for (const path of ['/v1/responses', '/v1/responses?stream=true', '/v1/responses/compact', '/v1%2fresponses', '/v1\\responses']) {
    assert.equal(providerForPath(path), 'openai', path);
  }
  for (const path of ['/v1/models', '/v1/messages', '/v1/responses-extra']) {
    assert.equal(providerForPath(path), 'anthropic', path);
  }
  assert.equal(providerForPath('/backend-api/codex/responses'), 'codex');
});

test('native OpenAI keys stay in their pool while legacy translation backends remain shared', () => {
  assert.equal(canServeProvider(platform, 'openai'), true);
  assert.equal(canServeProvider(platform, 'anthropic'), false);
  assert.equal(canServeProvider(platform, 'codex'), false);
  assert.equal(canServeProvider({ type: 'oauth', provider: 'codex' }, 'openai'), false);
  assert.equal(canServeProvider({ type: 'oauth' }, 'openai'), false);
  assert.equal(canServeProvider({ type: 'apikey', upstream: 'https://translator.example.com' }, 'openai'), true);
});

async function setup(t) {
  const seen = [];
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    seen.push({ path: req.url, headers: req.headers, body });
    const response = { id: 'resp-test', usage: { input_tokens: 12, output_tokens: 4 } };
    if (JSON.parse(body).stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end('event: response.completed\ndata: ' + JSON.stringify({ type: 'response.completed', response }) + '\n\n');
    } else {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(response));
    }
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${upstream.address().port}`;
  const am = new AccountManager([
    { id: 'claude', name: 'claude', type: 'oauth', accessToken: 'claude-token', expiresAt: Date.now() + 3600_000 },
    { id: 'codex', name: 'codex', type: 'oauth', provider: 'codex', accessToken: 'codex-token', expiresAt: Date.now() + 3600_000 },
    { ...platform, upstream: origin },
  ], 0.98);
  const proxy = createProxyServer(am, {
    proxy: { apiKey: 'admin-test', teamMode: true, trustLoopback: false,
      clientKeys: [{ name: 'alice', key: 'member-test', accounts: ['platform-id'], maxConcurrent: 2 }],
    },
    upstream: origin,
  });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await Promise.all([proxy, upstream].map(server => new Promise(resolve => {
      server.closeAllConnections(); server.close(resolve);
    })));
  });
  const post = (path, body) => fetch(`http://127.0.0.1:${proxy.address().port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': 'member-test', 'chatgpt-account-id': 'client-account' },
    body: JSON.stringify(body),
  });
  return { seen, post };
}

test('member Responses requests reach only their granted OpenAI account with unchanged bodies', async t => {
  const { seen, post } = await setup(t);
  for (const stream of [false, true]) {
    const body = { model: 'gpt-test', input: 'local test', instructions: 'Preserve this body.', stream };
    const res = await post('/v1/responses', body);
    const text = await res.text();
    assert.equal(res.status, 200, text);
    assert.match(text, /resp-test/);
    const request = seen.at(-1);
    assert.equal(request.path, '/v1/responses');
    assert.equal(request.body, JSON.stringify(body));
    assert.equal(request.headers.authorization, 'Bearer sk-platform-test');
    assert.equal(request.headers['x-api-key'], undefined);
    assert.equal(request.headers['chatgpt-account-id'], undefined);
  }
  assert.equal(seen.length, 2);
});

test('a pin cannot send Claude or Codex requests through a native OpenAI API key', async t => {
  const { seen, post } = await setup(t);
  for (const path of ['/v1/messages', '/backend-api/codex/responses']) {
    const res = await post('/tc-acct/platform' + path, { model: 'gpt-test', input: 'local test' });
    const text = await res.text();
    assert.equal(res.status, 400, text);
    assert.match(text, /cannot serve/);
  }
  assert.deepEqual(seen, []);
});

test('unavailable member pools do not borrow native OpenAI API keys', async t => {
  const { seen, post } = await setup(t);
  for (const path of ['/v1/messages', '/backend-api/codex/responses']) {
    const res = await post(path, { model: 'gpt-test', input: 'local test' });
    const text = await res.text();
    assert.equal(res.status, 429, text);
  }
  assert.deepEqual(seen, []);
});
