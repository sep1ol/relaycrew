import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDefaultConfig, loadConfig, resolveQuotaProbeSeconds } from '../src/config.js';

test('new configs probe quotas every minute', () => {
  assert.equal(createDefaultConfig().quotaProbeSeconds, 60);
});

test('loading defaults only an absent or null quota probe interval', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'relaycrew-probe-config-'));
  const previous = process.env.RELAYCREW_CONFIG;
  process.env.RELAYCREW_CONFIG = join(directory, 'config.json');
  try {
    for (const [value, expected] of [[undefined, 60], [null, 60], [0, 0], [120, 120]]) {
      await writeFile(process.env.RELAYCREW_CONFIG, JSON.stringify({ quotaProbeSeconds: value, accounts: [] }));
      const config = await loadConfig();
      assert.equal(resolveQuotaProbeSeconds(config), expected);
      assert.equal(config.quotaProbeSeconds, value);
    }
  } finally {
    if (previous === undefined) delete process.env.RELAYCREW_CONFIG;
    else process.env.RELAYCREW_CONFIG = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
