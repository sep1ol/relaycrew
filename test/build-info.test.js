import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBuildInfo } from '../src/build-info.js';

const inputs = { version: '1.2.0-team.1', startedAt: Date.parse('2026-10-29T12:00:00Z'), node: 'v22.0.0' };

test('public payloads have only build identity, capabilities and integer liveness uptime', () => {
  const info = createBuildInfo({ ...inputs, revision: 'abcdef0123456789', label: 'v1.2.0-team.1' });
  assert.deepEqual(info.health(inputs.startedAt + 2999), {
    status: 'ok', version: inputs.version, revision: 'abcdef0', uptimeSeconds: 2,
  });
  assert.deepEqual(info.version, {
    name: 'relaycrew', version: inputs.version, revision: 'abcdef0', label: 'v1.2.0-team.1',
    node: inputs.node, startedAt: '2026-10-29T12:00:00.000Z', features: ['member-accounts', 'grok'],
  });
});

test('revision prefers the environment, then the checkout SHA, then null; unknown stays null', () => {
  for (const [options, revision, label] of [
    [{ revision: '1234567890', gitRevision: 'abcdef0' }, '1234567', '1234567'],
    [{ gitRevision: 'abcdef0' }, 'abcdef0', 'abcdef0'],
    [{ revision: '', gitRevision: 'abcdef0' }, 'abcdef0', 'abcdef0'],
    [{}, null, inputs.version],
    [{ revision: 'unknown', gitRevision: 'abcdef0' }, null, inputs.version],
  ]) {
    const info = createBuildInfo({ ...inputs, ...options });
    assert.equal(info.version.revision, revision);
    assert.equal(info.health(inputs.startedAt).revision, revision);
    assert.equal(info.version.label, label);
  }
});
