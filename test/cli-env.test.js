import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// `relaycrew env` as a subprocess against a throwaway config: the mode it
// emits is decided by `defaultClientMode` unless a flag says otherwise. The
// harness is adapted from #384.

const cliPath = fileURLToPath(new URL('../src/index.js', import.meta.url));

async function runEnv(args = [], { config = {}, env = {} } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'relaycrew-env-'));
  const configPath = join(dir, 'config.json');
  await writeFile(configPath, JSON.stringify({
    proxy: { port: 3456, apiKey: 'test' },
    upstream: 'https://api.anthropic.com',
    accounts: [{ name: 'a', type: 'apikey', apiKey: 'secret' }],
    ...config,
  }));
  try {
    const child = spawn(process.execPath, [cliPath, 'env', ...args], {
      env: { ...process.env, ...env, RELAYCREW_CONFIG: configPath, RELAYCREW_DISABLE_AUTOUPDATE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('env command did not exit')); }, 15_000);
      child.on('error', reject);
      child.on('exit', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('env defaults to MITM and exports the forward proxy', async () => {
  const result = await runEnv();
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^export HTTPS_PROXY=http:\/\/127\.0\.0\.1:3456$/m);
  assert.match(result.stderr, /default mode is MITM/);
});

test('defaultClientMode: base-url makes env emit the base URL only', async () => {
  const result = await runEnv([], { config: { defaultClientMode: 'base-url' } });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^export ANTHROPIC_BASE_URL=http:\/\/localhost:3456$/m);
  assert.doesNotMatch(result.stdout, /^export (?:HTTP|HTTPS|ALL)_PROXY|NODE_EXTRA_CA_CERTS/m);
  assert.match(result.stderr, /default mode is base-URL/);
});

test('in base-URL mode a stale MITM export pointing at this proxy is unset, a foreign proxy is kept', async () => {
  const result = await runEnv([], {
    config: { defaultClientMode: 'base-url' },
    env: { HTTPS_PROXY: 'http://127.0.0.1:3456', https_proxy: 'http://127.0.0.1:3456', HTTP_PROXY: 'http://proxy.corp.example:8080' },
  });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^unset HTTPS_PROXY$/m);
  assert.match(result.stdout, /^unset https_proxy$/m);
  assert.doesNotMatch(result.stdout, /unset HTTP_PROXY/);
});

test('--mitm overrides a base-url default, and the hint names the flag', async () => {
  const result = await runEnv(['--mitm'], { config: { defaultClientMode: 'base-url' } });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^export HTTPS_PROXY=http:\/\/127\.0\.0\.1:3456$/m);
  assert.match(result.stderr, /relaycrew env --mitm/);
});

test('env rejects contradictory mode flags without writing to stdout', async () => {
  const result = await runEnv(['--mitm', '--no-mitm']);
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /either --mitm or --no-mitm/);
});

test('team env selects AUTH_TOKEN and clears the old API-key credential', async () => {
  const result = await runEnv(['--no-mitm'], {
    config: { proxy: { port: 3456, apiKey: 'team-gateway-key', teamMode: true, clientKeys: [] } },
    env: { ANTHROPIC_API_KEY: 'inherited-api-key', ANTHROPIC_AUTH_TOKEN: 'inherited-token' },
  });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^unset ANTHROPIC_API_KEY$/m);
  assert.match(result.stdout, /^export ANTHROPIC_AUTH_TOKEN='team-gateway-key'$/m);
  assert.match(result.stderr, /ANTHROPIC_AUTH_TOKEN=<gateway-key>/);
});

test('run passes the team bearer to Claude and suppresses the local-login hint', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'relaycrew-run-auth-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const server = (await import('node:net')).createServer(socket => socket.end());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const port = server.address().port;
  const configPath = join(dir, 'config.json');
  const stubPath = join(dir, 'claude');
  await writeFile(stubPath, `#!${process.execPath}\nprocess.stdout.write(JSON.stringify({token: process.env.ANTHROPIC_AUTH_TOKEN, apiKey: process.env.ANTHROPIC_API_KEY ?? null, base: process.env.ANTHROPIC_BASE_URL}));\nprocess.exit(1);\n`, { mode: 0o700 });
  await writeFile(configPath, JSON.stringify({
    proxy: { port, apiKey: 'fixture-team-key', teamMode: true, clientKeys: [] },
    accounts: [{ id: 'fixture-account', name: 'fixture', type: 'apikey', apiKey: 'fixture-upstream-key' }], autoUpdate: false,
  }));
  const child = spawn(process.execPath, [cliPath, 'run', '--no-mitm'], {
    env: { ...process.env, HOME: dir, XDG_CONFIG_HOME: dir, CLAUDE_CONFIG_DIR: dir,
      PATH: `${dir}:${process.env.PATH}`, RELAYCREW_CONFIG: configPath, RELAYCREW_DISABLE_AUTOUPDATE: '1',
      ANTHROPIC_API_KEY: 'inherited-api-key', ANTHROPIC_AUTH_TOKEN: 'inherited-token', CLAUDE_CODE_OAUTH_TOKEN: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('run command did not exit')); }, 15_000);
    child.once('error', reject);
    child.once('close', code => { clearTimeout(timer); resolve(code); });
  });
  assert.equal(code, 1, stderr);
  assert.deepEqual(JSON.parse(stdout), { token: 'fixture-team-key', apiKey: null, base: `http://localhost:${port}` });
  assert.doesNotMatch(stderr, /no login of its own|claude auth login|expired OAuth session/);
});
