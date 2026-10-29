import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountView, accountViews, applyAccountAction, manageableRow, validateSharing } from '../src/owned-accounts.js';

test('account actions and views enforce ownership and redact credentials', () => {
  const config = { accounts: [
    { id: 'operator', name: 'Operator', type: 'apikey', apiKey: 'secret' },
    { id: 'alice', name: 'Alice', provider: 'codex', owner: { name: 'alice', sharing: 'private' }, refreshToken: 'secret' },
  ] };
  const alice = { kind: 'member', name: 'alice' };
  const admin = { kind: 'admin' };
  const before = JSON.parse(JSON.stringify(config));
  for (const id of ['unknown', 'operator']) assert.throws(() => manageableRow(config, alice, id), { status: 403, message: 'That account is not yours.' });
  assert.throws(() => applyAccountAction(config, admin, { action: 'update', id: 'operator', sharing: 'pool', disabled: true }), { status: 400 });
  assert.deepEqual(config, before);
  assert.equal(validateSharing('pool'), 'pool');
  assert.throws(() => validateSharing('operator'), { status: 400 });
  assert.deepEqual(accountViews(config, alice), [{ id: 'alice', name: 'Alice', provider: 'codex', owner: 'alice', sharing: 'private', disabled: false }]);
  assert.equal(accountViews(config, admin).length, 2);
  assert.throws(() => applyAccountAction(config, admin, { action: 'update', id: 'alice', sharing: 'pool' }), { status: 403 });
  applyAccountAction(config, admin, { action: 'update', id: 'alice', disabled: true });
  assert.equal(accountView(config.accounts[1]).disabled, true);
  applyAccountAction(config, alice, { action: 'update', id: 'alice', sharing: 'pool' });
  assert.equal(accountView(config.accounts[1]).sharing, 'pool');
  applyAccountAction(config, alice, { action: 'update', id: 'alice', disabled: false });
  assert.equal(Object.hasOwn(config.accounts[1], 'disabled'), false);
  assert.deepEqual(applyAccountAction(config, alice, { action: 'remove', id: 'alice' }), { removed: 'alice' });
  assert.equal(config.accounts.length, 1);
});
