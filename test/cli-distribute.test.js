import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Same shape as cli-threshold.test.js: the real CLI against a throwaway
// RELAYCREW_CONFIG, on a port nothing listens on so the post-write reload
// notification is a no-op.

const cliPath = fileURLToPath(new URL('../src/index.js', import.meta.url));

async function writeConfig(distributeSessions) {
  const dir = await mkdtemp(join(tmpdir(), 'relaycrew-distribute-'));
  const path = join(dir, 'config.json');
  const config = {
    proxy: { port: 3, apiKey: 'tc-test' },
    upstream: 'https://api.anthropic.com',
    upstreamProxy: false,
    accounts: [{ name: 'a@example.com', type: 'apikey', apiKey: 'k1' }],
  };
  if (distributeSessions !== undefined) config.distributeSessions = distributeSessions;
  await writeFile(path, JSON.stringify(config));
  return path;
}

function runCli(configPath, cliArgs) {
  const child = spawn(process.execPath, [cliPath, ...cliArgs], {
    env: { ...process.env, RELAYCREW_CONFIG: configPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', c => { stdout += c; });
  child.stderr.on('data', c => { stderr += c; });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('CLI did not exit')); }, 10_000);
    child.on('error', err => { clearTimeout(timer); reject(err); });
    child.on('exit', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

async function readDistribute(configPath) {
  return JSON.parse(await readFile(configPath, 'utf8')).distributeSessions;
}

test('distribute with no argument reports the current state', async () => {
  const configPath = await writeConfig();
  const before = await readFile(configPath, 'utf8');
  const res = await runCli(configPath, ['distribute']);
  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stdout, /Session distribution: off/);
  assert.match(res.stdout, /relaycrew distribute <on\|off\|adaptive\|load>/);
  assert.match(res.stdout, /On \(even\):/);
  assert.match(res.stdout, /Adaptive:/);
  assert.match(res.stdout, /Load:/);
  assert.doesNotMatch(res.stdout + res.stderr, /ReferenceError/);
  assert.equal(await readFile(configPath, 'utf8'), before);
});

test('distribute without a config creates and reports load distribution', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'relaycrew-distribute-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const configPath = join(dir, 'config.json');
  const result = await runCli(configPath, ['distribute']);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Session distribution: load/);
  assert.equal(await readDistribute(configPath), 'load');
});

test('distribute on writes the setting', async () => {
  const configPath = await writeConfig();
  const res = await runCli(configPath, ['distribute', 'on']);
  assert.equal(res.code, 0, res.stderr);
  assert.equal(await readDistribute(configPath), true);
  assert.match(res.stdout, /Session distribution on/);
});

test('distribute adaptive writes and reports the third mode', async () => {
  const configPath = await writeConfig();
  const set = await runCli(configPath, ['distribute', 'adaptive']);
  assert.equal(set.code, 0, set.stderr);
  assert.equal(await readDistribute(configPath), 'adaptive');
  assert.match(set.stdout, /Session distribution adaptive/);

  const read = await runCli(configPath, ['distribute']);
  assert.equal(read.code, 0, read.stderr);
  assert.match(read.stdout, /Session distribution: adaptive/);
});

test('distribute off says the running sessions drain', async () => {
  const configPath = await writeConfig(true);
  const res = await runCli(configPath, ['distribute', 'off']);
  assert.equal(res.code, 0, res.stderr);
  assert.equal(await readDistribute(configPath), false);
  assert.match(res.stdout, /drain/);
});

test('distribute load writes and reports the mode', async () => {
  const configPath = await writeConfig();
  const set = await runCli(configPath, ['distribute', 'load']);
  assert.equal(set.code, 0, set.stderr);
  assert.equal(await readDistribute(configPath), 'load');
  assert.match(set.stdout, /Session distribution by load/);

  const read = await runCli(configPath, ['distribute']);
  assert.equal(read.code, 0, read.stderr);
  assert.match(read.stdout, /Session distribution: load/);
});

test('general help advertises load distribution for new configs', async () => {
  const configPath = await writeConfig();
  const result = await runCli(configPath, ['--help']);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /distribute \[on\|off\|adaptive\|load\]/);
  assert.match(result.stdout, /load for new configs/);
});

test('setting what is already set does not rewrite the config', async () => {
  for (const [mode, arg] of [[true, 'on'], ['load', 'load']]) {
    const configPath = await writeConfig(mode);
    const before = await readFile(configPath, 'utf8');
    const res = await runCli(configPath, ['distribute', arg]);
    assert.equal(res.code, 0, res.stderr);
    assert.equal(await readFile(configPath, 'utf8'), before);
  }
});

test('an unknown argument is refused without touching the config', async () => {
  const configPath = await writeConfig();
  const before = await readFile(configPath, 'utf8');
  const res = await runCli(configPath, ['distribute', 'maybe']);
  assert.equal(res.code, 1, res.stderr);
  assert.match(res.stderr, /Usage: relaycrew distribute/);
  assert.equal(await readFile(configPath, 'utf8'), before);
});
