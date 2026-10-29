import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { GatewayClient } from '../src/gateway-client.js';
import { memberCommand } from '../src/member-command.js';

function fixture(input = '') {
  let text = '';
  const calls = [];
  const opened = [];
  const output = new Writable({ write(chunk, _encoding, done) { text += chunk; done(); } });
  const client = new GatewayClient({ baseUrl: 'https://gateway.invalid/team', key: 'secret-key', fetchImpl: async (url, options) => {
    const path = new URL(url).pathname;
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path, body });
    const account = { id: 'stable-id', name: 'alice@example.com', provider: 'anthropic', owner: 'alice', sharing: 'private', disabled: false };
    let status = 200;
    let data = { ok: true };
    if (path.endsWith('/accounts/login')) data = { ok: true, login: { id: 'login-id', url: 'https://claude.ai/oauth/authorize', paste: 'code' } };
    else if (path.endsWith('/complete')) {
      if (body.code === 'wrong') { status = 400; data = { ok: false, error: 'Paste the displayed code.' }; }
      else data = { ok: true, action: 'added', applied: true, account };
    } else if (path.endsWith('/accounts')) data = { ok: true, accounts: [account] };
    return { status, ok: status < 300, json: async () => data };
  } });
  return { options: { client, input: Readable.from([input]), output, open: url => opened.push(url), env: { RELAYCREW_REMOTE: '1' } }, calls, opened, text: () => text };
}

test('member CLI retries an unusable paste and lists accounts through fake fetch', async () => {
  const f = fixture('wrong\ngood\n');
  await memberCommand(['login', '--claude', '--private'], f.options);
  assert.match(f.text(), /Paste the displayed code/);
  assert.match(f.text(), /Added "alice@example.com".*stable-id/);
  assert.deepEqual(f.calls.map(call => call.body?.code).filter(Boolean), ['wrong', 'good']);
  assert.deepEqual(f.opened, []);
  assert.equal(f.calls.some(call => call.path.endsWith('/cancel')), false);
  await memberCommand(['accounts'], f.options);
  assert.match(f.text(), /ID\tPROVIDER\tNAME\tSHARING\tSTATE/);
  assert.match(f.text(), /stable-id\tanthropic\talice@example.com\tprivate\tactive/);
  assert.equal(f.text().includes('secret-key'), false);
});

test('member CLI cancels on EOF and rejects ambiguous or unsupported login flags', async () => {
  const f = fixture('');
  await memberCommand(['login', '--codex', '--pool'], f.options);
  assert.equal(f.calls.at(-1).path.endsWith('/cancel'), true);
  for (const args of [
    ['login', '--claude'], ['login', '--private'], ['login', '--claude', '--codex', '--private'],
    ['login', '--claude', '--private', '--pool'], ['login', '--claude', '--private', '--name', 'alice'],
  ]) await assert.rejects(memberCommand(args, f.options), /Usage: relaycrew member/);
});
