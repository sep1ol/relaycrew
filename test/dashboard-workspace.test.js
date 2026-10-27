import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORKSPACE_SCRIPT, workspaceDistribution, historyDistribution, validHistory, workspaceAdmin, historyPath, createSeriesColors } from '../src/dashboard-workspace.js';
import { I18N_SCRIPT } from '../src/dashboard-translations.js';
import { makeDashboardDom } from './helpers/dashboard-dom.js';
import { WORKSPACE_HTML } from '../src/dashboard-shell.js';
import { renderDashboardHtml, inlineScripts, dashboardCsp } from '../src/dashboard.js';

const history = () => ({ buckets: ['2026-10-26T10:00:00Z', '2026-10-26T10:15:00Z'], series: [{ key: '<script>hostile</script>', values: [2, 3] }, { key: '(remaining)', values: [1, 0] }], total: [3, 3] });

test('distribution keeps scopes and windows separate, including WebSocket counters', () => {
  const status = { clients: { alpha: { requests: 90, connections: 3, windows: { '5h': { requests: 7 } } }, beta: { requests: 10 } }, usageDimensions: { project: { app: { requests: 100 } } } };
  assert.deepEqual(workspaceDistribution(status, 'clients', '5h', 'requests'), [{ key: 'alpha', value: 7 }, { key: 'beta', value: 0 }]);
  assert.deepEqual(workspaceDistribution(status, 'dimension:project', 'total', 'requests'), [{ key: 'app', value: 100 }]);
  assert.equal(workspaceDistribution(status, 'clients', 'total', 'connections')[0].value, 3);
  assert.deepEqual(workspaceDistribution({}, 'clients', 'total', 'requests'), []);
});

test('history distribution conserves the remainder and supports a single selected interval', () => {
  assert.deepEqual(historyDistribution(history()), [{ key: '<script>hostile</script>', value: 5 }, { key: '(remaining)', value: 1 }]);
  assert.equal(historyDistribution(history(), 0).reduce((sum, row) => sum + row.value, 0), 3);
  assert.equal(historyDistribution(history(), 1).reduce((sum, row) => sum + row.value, 0), 3);
});

test('history boundary rejects inconsistent, unbounded or invalid chart values', () => {
  assert.equal(validHistory(history()), true);
  for (const mutate of [data => { data.total[0] = 4; }, data => { data.series[0].values[0] = NaN; }, data => { data.series[0].values.pop(); }, data => { data.buckets[0] = 'invalid'; }, data => { data.series = Array(14).fill(data.series[0]); }, data => { data.buckets = Array(98).fill(data.buckets[0]); }]) {
    const data = history(); mutate(data); assert.equal(validHistory(data), false);
  }
});

test('admin UI requires an actual key and refuses legacy clients and members', () => {
  assert.equal(workspaceAdmin({ kind: 'operator', refused: [] }, null), false);
  assert.equal(workspaceAdmin({ kind: 'member' }, 'member-key'), false);
  assert.equal(workspaceAdmin({ kind: 'client' }, 'legacy-key'), false);
  assert.equal(workspaceAdmin({ kind: 'operator', refused: ['/relaycrew/team'] }, 'key'), false);
  assert.equal(workspaceAdmin({ kind: 'operator', refused: [] }, 'admin-key'), true);
});

test('history queries encode dimensions and refuse unsupported cumulative timelines', () => {
  const path = historyPath('dimension:project & team', '5h', '1h', 'outputTokens');
  const url = new URL(path, 'https://gateway.test');
  assert.equal(url.searchParams.get('dimension'), 'project & team');
  assert.equal(url.searchParams.get('scope'), 'dimension');
  assert.equal(historyPath('clients', 'total', '15m', 'requests'), null);
  assert.equal(historyPath('clients', '24h', '15m', 'connections'), null);
});

test('assembled workspace remains static and every script is admitted by CSP', () => {
  const html = renderDashboardHtml();
  assert.ok(html.includes('lang="en"'));
  for (const view of ['overview', 'accounts', 'team', 'usage', 'sessions', 'settings']) assert.ok(html.includes('data-panel="' + view + '"'));
  assert.ok(inlineScripts(html).includes(WORKSPACE_SCRIPT));
  assert.equal((dashboardCsp(html).match(/sha256-/g) || []).length, inlineScripts(html).length);
  assert.doesNotMatch(WORKSPACE_SCRIPT, /\.innerHTML|insertAdjacentHTML/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=/);
});

function boot({ key = 'admin-key', caller = { kind: 'operator', refused: [] }, locale = 'pt-BR', stored = [] } = {}) {
  const { document, $ } = makeDashboardDom(WORKSPACE_HTML);
  const events = {}, requests = [], store = new Map([...(key ? [['relaycrew-dashboard-key', key]] : []), ...(locale ? [['relaycrew-dashboard-locale', locale]] : []), ...stored]);
  const localStorage = { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
  const window = { localStorage, location: { hash: '#team' }, navigator: {}, getComputedStyle: () => ({ backgroundColor: 'rgb(37, 99, 235)' }), addEventListener(type, handler) { events[type] = handler; } };
  new Function('document', 'window', I18N_SCRIPT)(document, window);
  const fetch = (url, init) => new Promise(resolve => requests.push({ url, init, resolve }));
  new Function('document', 'window', 'fetch', WORKSPACE_SCRIPT)(document, window, fetch);
  const status = { caller, accounts: [], sessions: {}, clients: {}, usageDimensions: {}, configuredUsageDimensions: ['project'] };
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const answer = async (status, body) => { const req = requests.shift(); assert.ok(req, 'request expected'); req.resolve({ status, ok: status >= 200 && status < 300, json: async () => body }); await flush(); return req; };
  window.RelayWorkspace.update(status);
  return { $, document, requests, window, status, store, flush, answer, navigate: async view => { window.location.hash = '#' + view; events.hashchange(); await flush(); } };
}
const team = () => ({ ok: true, enabled: true, revision: 'rev-1', accounts: [{ id: 'account-id', name: '<img src=x onerror=alert(1)>', provider: 'anthropic' }], members: [{ name: 'marina', accounts: ['account-id'], maxConcurrent: 4, active: 1, disabled: false, usage: { requests: 5 } }] });

test('browser refuses admin-only APIs for keyless loopback and member/legacy credentials', async () => {
  for (const options of [{ key: null }, { caller: { kind: 'member' } }, { caller: { kind: 'client' } }]) {
    const page = boot(options);
    assert.equal(page.requests.length, 0);
    assert.match(page.$('teamMessage').textContent, /administrador/);
    assert.equal(page.$('teamAdd').disabled, true);
  }
});

test('browser team conflict refreshes revision without losing the edit draft', async () => {
  const page = boot(); await page.answer(200, team());
  const edit = page.$('teamContent').querySelectorAll('button').find(button => button.textContent === 'Editar'); await edit.fire('click');
  page.$('memberLimit').value = '7';
  const submit = page.$('memberForm').fire('submit'); await page.flush();
  const sent = JSON.parse(page.requests[0].init.body);
  assert.equal(sent.revision, 'rev-1'); assert.deepEqual(sent.accounts, ['account-id']); assert.equal(sent.maxConcurrent, 7);
  await page.answer(409, { ok: false, error: 'stale revision' });
  await page.answer(200, { ...team(), revision: 'rev-2', members: [{ ...team().members[0], accounts: '*', maxConcurrent: 10, disabled: true }] }); await submit;
  assert.equal(page.$('memberLimit').value, '7'); assert.equal(page.$('memberDialog').open, true);
  assert.match(page.$('memberError').textContent, /rascunho foi mantido/);
  assert.match(page.$('memberError').textContent, /Política atual no servidor.*todas as contas atuais e futuras; limite 10; desativado/);
  assert.equal(page.requests.length, 0, 'a conflict only refreshes; it never retries the mutation');
  const retry = page.$('memberForm').fire('submit'); await page.flush();
  assert.equal(JSON.parse(page.requests[0].init.body).revision, 'rev-2');
  await page.answer(200, { ok: true, saved: true, applied: true, revision: 'rev-3' }); await page.answer(200, team()); await retry;
});

test('browser mutation never retries issuance and clears one-time key on close', async () => {
  const page = boot(); await page.answer(200, team());
  await page.$('teamAdd').fire('click'); page.$('memberName').value = 'new-member'; page.$('memberLimit').value = '2'; page.$('memberAll').checked = true;
  const submit = page.$('memberForm').fire('submit'); await page.flush();
  assert.equal(page.requests.length, 1); assert.equal(page.requests[0].url, '/relaycrew/team/add');
  const response = { ok: true, saved: true, applied: false, revision: 'rev-2', issuedKey: 'one-time-secret' };
  await page.answer(201, response); await page.answer(200, team()); await submit;
  assert.equal(page.$('issuedDialog').open, true); assert.equal(page.$('issuedKey').value, 'one-time-secret');
  assert.equal(response.issuedKey, undefined); assert.match(page.$('issuedMessage').textContent, /salva/);
  await page.$('copyKey').fire('click'); assert.equal(page.$('issuedKey').selected, true);
  page.$('issuedDialog').close(); assert.equal(page.$('issuedKey').value, '');
  assert.equal(page.requests.length, 0);
  assert.doesNotMatch(page.$('teamContent').textContent, /one-time-secret/);
});

test('browser history keeps chart/table totals equal and rejects stale filter responses', async () => {
  const page = boot(); await page.answer(200, team()); await page.navigate('usage');
  const first = page.requests.shift();
  page.$('historyMetric').value = 'outputTokens'; await page.$('historyMetric').fire('change');
  await page.answer(200, history());
  const rendered = page.$('historyTable').textContent;
  assert.match(rendered, /Tokens de saída/); assert.match(rendered, /<script>hostile<\/script>/);
  assert.equal(page.$('historyChart').querySelectorAll('svg').length, 1);
  assert.equal(page.$('historyTable').querySelectorAll('tr').length, 3);
  first.resolve({ status: 200, ok: true, json: async () => ({ ...history(), total: [500, 500] }) }); await page.flush();
  assert.equal(page.$('historyTable').textContent, rendered);
  const bars = page.$('historyChart').querySelectorAll('g'); await bars[0].fire('click');
  assert.match(page.$('distributionTitle').textContent, /Distribuição ·/);
  assert.match(page.$('historyDistribution').textContent, /Total: 3/);
});


test('browser creates and edits members with empty grants and explains inference is unavailable', async () => {
  for (const editing of [false, true]) {
    const page = boot(); await page.answer(200, { ...team(), members: [{ ...team().members[0], accounts: [] }] });
    assert.match(page.$('teamContent').textContent, /Sem acesso à inferência/);
    if (editing) await page.$('teamContent').querySelectorAll('button').find(button => button.textContent === 'Editar').fire('click');
    else { await page.$('teamAdd').fire('click'); page.$('memberName').value = 'no-grants'; }
    page.$('memberLimit').value = '2';
    assert.match(page.$('memberError').textContent, /Sem acesso à inferência/);
    const save = page.$('memberForm').fire('submit'); await page.flush();
    assert.equal(page.requests[0].url, '/relaycrew/team/' + (editing ? 'update' : 'add'));
    assert.deepEqual(JSON.parse(page.requests[0].init.body).accounts, []);
    await page.answer(200, { ok: true, revision: 'rev-2' }); await page.answer(200, team()); await save;
    assert.equal(page.$('memberDialog').open, false);
  }
});

test('browser team refresh never upgrades an open create or edit draft revision', async () => {
  for (const editing of [false, true]) {
    const page = boot(); await page.answer(200, team());
    if (editing) await page.$('teamContent').querySelectorAll('button').find(button => button.textContent === 'Editar').fire('click');
    else { await page.$('teamAdd').fire('click'); page.$('memberName').value = 'new-member'; }
    page.$('memberLimit').value = '7';
    const refresh = page.$('teamRefresh').fire('click');
    await page.answer(200, { ...team(), revision: 'rev-2', members: [{ ...team().members[0], accounts: '*', maxConcurrent: 10 }] }); await refresh;
    const save = page.$('memberForm').fire('submit'); await page.flush();
    const sent = JSON.parse(page.requests[0].init.body);
    assert.equal(sent.revision, 'rev-1'); assert.equal(sent.maxConcurrent, 7);
    assert.deepEqual(sent.accounts, editing ? ['account-id'] : []);
    await page.answer(409, { ok: false, error: 'stale revision' });
    await page.answer(200, { ...team(), revision: 'rev-3' }); await save;
    assert.equal(page.$('memberLimit').value, '7'); assert.equal(page.requests.length, 0);
  }
});

test('browser rotation and revocation keep confirmation revisions until a reviewed conflict retry', async () => {
  for (const [label, action] of [['Girar chave', 'rotate'], ['Revogar', 'revoke']]) {
    const page = boot(); await page.answer(200, team());
    await page.$('teamContent').querySelectorAll('button').find(button => button.textContent === label).fire('click');
    if (action === 'revoke') {
      assert.match(page.$('confirmText').textContent, /desativa o acesso.*registro será mantido.*reativado/);
      assert.doesNotMatch(page.$('confirmText').textContent, /removido/);
    }
    const refresh = page.$('teamRefresh').fire('click'); await page.answer(200, { ...team(), revision: 'rev-2' }); await refresh;
    const confirm = page.$('confirmAction').fire('click'); await page.flush();
    assert.equal(page.requests[0].url, '/relaycrew/team/' + action);
    assert.equal(JSON.parse(page.requests[0].init.body).revision, 'rev-1');
    await page.answer(409, { ok: false, error: 'stale revision' });
    await page.answer(200, { ...team(), revision: 'rev-3', members: [{ ...team().members[0], accounts: [], maxConcurrent: 9 }] }); await confirm;
    assert.equal(page.$('confirmDialog').open, true);
    assert.match(page.$('confirmError').textContent, /Política atual no servidor.*sem acesso à inferência; limite 9; ativo/);
    assert.equal(page.requests.length, 0);
    const retry = page.$('confirmAction').fire('click'); await page.flush();
    assert.equal(JSON.parse(page.requests[0].init.body).revision, 'rev-3');
    await page.answer(200, { ok: true, revision: 'rev-4' }); await page.answer(200, team()); await retry;
    assert.equal(page.$('confirmDialog').open, false);
  }
});

test('browser ignores old team responses and their errors after sign-out into a new authentication context', async () => {
  for (const responseStatus of [200, 403]) {
    const page = boot(), oldRequest = page.requests.shift();
    page.window.RelayWorkspace.signedOut();
    page.store.set('relaycrew-dashboard-key', 'new-admin'); page.window.RelayWorkspace.update(page.status);
    assert.equal(page.requests.length, 1, 'sign-out releases the old team loading flag');
    await page.answer(200, { ...team(), revision: 'new-auth-revision', members: [{ ...team().members[0], name: 'new-auth-member' }] });
    const content = page.$('teamContent').textContent, message = page.$('teamMessage').textContent;
    oldRequest.resolve({ status: responseStatus, ok: responseStatus === 200, json: async () => team() }); await page.flush();
    assert.equal(page.$('teamContent').textContent, content); assert.equal(page.$('teamMessage').textContent, message);
    assert.equal(page.$('teamAdd').disabled, false);
    await page.$('teamAdd').fire('click'); page.$('memberName').value = 'new-member'; page.$('memberLimit').value = '2';
    const save = page.$('memberForm').fire('submit'); await page.flush();
    assert.equal(JSON.parse(page.requests[0].init.body).revision, 'new-auth-revision');
    await page.answer(200, { ok: true }); await page.answer(200, team()); await save;
  }
});

test('browser discards old issuance and mutation errors without changing a new pending form or its revision', async () => {
  for (const responseStatus of [201, 409, 403]) {
    const page = boot(); await page.answer(200, team());
    await page.$('teamAdd').fire('click'); page.$('memberName').value = 'old-member'; page.$('memberLimit').value = '2';
    const oldSave = page.$('memberForm').fire('submit'); await page.flush(); const oldRequest = page.requests.shift();
    page.window.RelayWorkspace.signedOut();
    assert.equal(page.$('memberName').value, ''); assert.equal(page.$('memberDialog').open, false);
    assert.equal(page.$('memberSave').disabled, false); assert.equal(page.$('issuedKey').value, '');
    page.store.set('relaycrew-dashboard-key', 'new-admin'); page.window.RelayWorkspace.update(page.status);
    await page.answer(200, { ...team(), revision: 'new-auth-revision' });
    await page.$('teamAdd').fire('click'); page.$('memberName').value = 'new-member'; page.$('memberLimit').value = '3';
    const newSave = page.$('memberForm').fire('submit'); await page.flush();
    oldRequest.resolve({ status: responseStatus, ok: responseStatus === 201, json: async () => ({ ok: responseStatus === 201, issuedKey: 'old-context-secret', revision: 'old-auth-revision', error: 'old-context-error' }) });
    await oldSave;
    assert.equal(page.$('issuedDialog').open, false); assert.equal(page.$('issuedKey').value, '');
    assert.equal(page.$('memberDialog').open, true); assert.equal(page.$('memberSave').disabled, true);
    assert.equal(page.$('memberError').textContent, 'Salvando…'); assert.equal(page.$('memberName').value, 'new-member');
    assert.equal(page.requests.length, 1, 'stale responses never trigger refreshes or retries');
    assert.equal(JSON.parse(page.requests[0].init.body).revision, 'new-auth-revision');
    await page.answer(200, { ok: true }); await page.answer(200, { ...team(), revision: 'still-new-auth' }); await newSave;
    await page.$('teamAdd').fire('click'); page.$('memberName').value = 'another-member'; page.$('memberLimit').value = '2';
    const anotherSave = page.$('memberForm').fire('submit'); await page.flush();
    assert.equal(JSON.parse(page.requests[0].init.body).revision, 'still-new-auth');
    await page.answer(200, { ok: true }); await page.answer(200, team()); await anotherSave;
  }
});

test('browser discards a mutation whose response body completes after authentication changes', async () => {
  const page = boot(); await page.answer(200, team());
  await page.$('teamAdd').fire('click'); page.$('memberName').value = 'old-member'; page.$('memberLimit').value = '2';
  const save = page.$('memberForm').fire('submit'); await page.flush(); const oldRequest = page.requests.shift();
  let finishBody;
  oldRequest.resolve({ status: 201, ok: true, json: () => new Promise(resolve => { finishBody = resolve; }) }); await page.flush();
  page.window.RelayWorkspace.signedOut(); page.window.RelayWorkspace.update(page.status);
  await page.answer(200, { ...team(), revision: 'new-context' });
  finishBody({ ok: true, revision: 'old-context', issuedKey: 'never-show' }); await save;
  assert.equal(page.$('issuedDialog').open, false); assert.equal(page.$('issuedKey').value, '');
  assert.equal(page.requests.length, 0);
});

test('browser clipboard completions cannot alter a new authentication context', async () => {
  for (const rejectCopy of [false, true]) {
    const page = boot(); await page.answer(200, team());
    await page.$('teamAdd').fire('click'); page.$('memberName').value = 'member'; page.$('memberLimit').value = '2';
    const save = page.$('memberForm').fire('submit'); await page.flush();
    await page.answer(201, { ok: true, issuedKey: 'old-secret' }); await page.answer(200, team()); await save;
    let finishCopy;
    page.window.navigator.clipboard = { writeText: value => { assert.equal(value, 'old-secret'); return new Promise((resolve, reject) => { finishCopy = () => rejectCopy ? reject(new Error('Clipboard refused')) : resolve(); }); } };
    const copy = page.$('copyKey').fire('click'); await page.flush();
    page.window.RelayWorkspace.signedOut(); page.window.RelayWorkspace.update(page.status); await page.answer(200, team());
    finishCopy(); await copy;
    assert.equal(page.$('issuedDialog').open, false); assert.equal(page.$('issuedKey').value, '');
    assert.equal(page.$('issuedMessage').textContent, ''); assert.equal(page.$('issuedKey').selected, undefined);
    assert.equal(page.$('issuedKey').focused, undefined);
  }
});


test('browser history distribution retains chart series colors after bucket selection and sorting', async () => {
  const page = boot(); await page.answer(200, team()); await page.navigate('usage');
  await page.answer(200, { ...history(), series: [{ key: 'alpha', values: [1, 5] }, { key: 'beta', values: [3, 0] }], total: [4, 5] });
  const swatches = page.$('historyChart').querySelectorAll('i').map(element => element.style.background);
  const expected = { alpha: swatches[0], beta: swatches[1] };
  assert.notEqual(expected.alpha, expected.beta);
  function checkColors() {
    const rows = page.$('historyDistribution').querySelectorAll('div').filter(element => element.className === 'distribution-line');
    assert.equal(rows.length, 2);
    for (const row of rows) assert.equal(row.children[1].children[0].style.background, expected[row.children[0].textContent]);
  }
  assert.deepEqual(page.$('historyChart').querySelectorAll('i').map(element => element.style.background), Object.values(expected));
  checkColors();
  await page.$('historyChart').querySelectorAll('g')[0].fire('click');
  assert.equal(page.$('historyDistribution').querySelectorAll('strong')[0].textContent, '3'); checkColors();
  await page.$('historyDistribution').querySelectorAll('button').find(button => button.textContent.startsWith('Nome')).fire('click'); checkColors();
  await page.$('historyDistribution').querySelectorAll('button').find(button => button.textContent.startsWith('Nome')).fire('click'); checkColors();
});

test('browser old confirmation responses cannot close or unlock a new pending confirmation', async () => {
  for (const label of ['Girar chave', 'Revogar']) {
    const page = boot(); await page.answer(200, team());
    await page.$('teamContent').querySelectorAll('button').find(button => button.textContent === label).fire('click');
    const oldConfirm = page.$('confirmAction').fire('click'); await page.flush(); const oldRequest = page.requests.shift();
    page.window.RelayWorkspace.signedOut();
    assert.equal(page.$('confirmDialog').open, false); assert.equal(page.$('confirmAction').disabled, false);
    await page.$('confirmAction').fire('click'); assert.equal(page.requests.length, 0, 'sign-out clears the pending action');
    page.window.RelayWorkspace.update(page.status); await page.answer(200, { ...team(), revision: 'new-auth-revision' });
    await page.$('teamContent').querySelectorAll('button').find(button => button.textContent === label).fire('click');
    const newConfirm = page.$('confirmAction').fire('click'); await page.flush();
    oldRequest.resolve({ status: 200, ok: true, json: async () => ({ ok: true, revision: 'old-auth-revision', issuedKey: 'old-confirm-secret' }) }); await oldConfirm;
    assert.equal(page.$('confirmDialog').open, true); assert.equal(page.$('confirmAction').disabled, true);
    assert.equal(page.$('confirmError').textContent, 'Aplicando alteração…');
    assert.equal(page.$('issuedDialog').open, false); assert.equal(page.$('issuedKey').value, '');
    assert.equal(page.requests.length, 1);
    assert.equal(JSON.parse(page.requests[0].init.body).revision, 'new-auth-revision');
    await page.answer(200, { ok: true }); await page.answer(200, team()); await newConfirm;
  }
});

test('series colors allocate distinct defaults by scope and identity and retain them across reloads', () => {
  const store = new Map();
  const storage = { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) };
  const colors = createSeriesColors(storage);
  const keys = ['alpha', 'beta', '__proto__', ...Array.from({ length: 10 }, (_, index) => 'client-' + index)];
  const first = keys.map(key => colors.css('clients', key));
  assert.equal(new Set(first.slice(0, 12)).size, 12);
  assert.equal(first[0], 'var(--series-1)');
  assert.equal(first[1], 'var(--series-2)');
  assert.equal(first[12], first[0], 'the finite twelve-color palette reuses slots without moving existing identities');
  assert.equal(colors.css('clients', '(remaining)'), 'var(--series-13)');
  assert.equal(colors.css('dimension:project', 'beta'), 'var(--series-1)');
  colors.set('clients', 'beta', '#AB12EF');
  assert.equal(colors.css('clients', 'beta'), '#ab12ef');
  assert.equal(colors.css('dimension:project', 'beta'), 'var(--series-1)');
  const reloaded = createSeriesColors(storage);
  assert.deepEqual(keys.toReversed().map(key => reloaded.css('clients', key)), first.toReversed().map((value, index) => index === keys.length - 2 ? '#ab12ef' : value));
  reloaded.set('clients', 'beta', null);
  assert.equal(reloaded.css('clients', 'beta'), 'var(--series-2)');
  assert.equal(createSeriesColors(storage).css('clients', 'beta'), 'var(--series-2)');
});

test('color preferences reject malformed storage and nonopaque colors and remain usable with blocked storage', () => {
  for (const raw of ['bad json', 'null', '[]', '{"version":2,"entries":{}}', '{"version":1,"entries":[]}', '{"version":1,"entries":{"bad":null}}']) {
    const colors = createSeriesColors({ getItem: () => raw, setItem() {} });
    assert.equal(colors.css('clients', 'alpha'), 'var(--series-1)');
  }
  const colors = new Function('return (' + createSeriesColors.toString() + ')')()({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
  for (const value of ['red', '#fff', '#12345678', 'transparent', 'url(javascript:alert(1))']) colors.set('clients', 'alpha', value);
  assert.equal(colors.css('clients', 'alpha'), 'var(--series-1)');
  colors.set('clients', 'alpha', '#123abc');
  assert.equal(colors.css('clients', 'alpha'), '#123abc');
  colors.set('clients', 'alpha', null);
  assert.equal(colors.css('clients', 'alpha'), 'var(--series-1)');
});

test('legend color edits repaint existing nodes across overview, history, sorting, totals, and locale changes without requests', async () => {
  const page = boot({ locale: null }); await page.answer(200, team());
  await page.navigate('overview'); await page.answer(200, history());
  await page.navigate('usage'); await page.answer(200, { ...history(), series: history().series.toReversed() });
  const identity = JSON.stringify(['clients', '<script>hostile</script>']);
  const input = page.document.querySelectorAll('[data-color-control]').find(element => element.getAttribute('data-color-control') === identity);
  input.focus(); input.value = '#12abef'; await input.fire('input');
  assert.equal(page.document.activeElement, input);
  assert.ok(page.document.querySelectorAll('[data-color-control]').includes(input), 'editing preserves the native picker node');
  const assertPaint = () => {
    const bindings = page.document.querySelectorAll('[data-series-color]').filter(element => element.getAttribute('data-series-color') === identity);
    assert.ok(bindings.length >= 3);
    for (const binding of bindings) assert.equal(binding.getAttribute('data-series-paint') === 'fill' ? binding.getAttribute('fill') : binding.style.background, '#12abef');
  };
  assertPaint();
  await page.$('historyDistribution').querySelectorAll('button').find(element => element.getAttribute('aria-label') === 'Sort by name').fire('click');
  assertPaint();
  page.window.RelayI18n.setLocale('es'); assertPaint();
  assert.equal(page.requests.length, 0);
  page.status.clients = { '<script>hostile</script>': { requests: 22 } };
  page.$('historyWindow').value = 'total'; await page.$('historyWindow').fire('change');
  assertPaint(); assert.equal(page.requests.length, 0);
  const reloaded = createSeriesColors({ getItem: key => page.store.get(key), setItem() {} });
  assert.equal(reloaded.css('clients', '<script>hostile</script>'), '#12abef');
});

test('locale changes preserve member drafts, checkbox nodes, busy saves, issued keys, selected buckets, and focus', async () => {
  const page = boot({ locale: null }); await page.answer(200, team());
  await page.$('teamAdd').fire('click');
  page.$('memberName').value = 'draft-name'; page.$('memberLimit').value = '7';
  const checkbox = page.$('memberAccounts').querySelectorAll('input')[0]; checkbox.checked = true; checkbox.focus();
  page.window.RelayI18n.setLocale('es');
  assert.equal(page.$('memberName').value, 'draft-name'); assert.equal(page.$('memberLimit').value, '7');
  assert.equal(page.$('memberAccounts').querySelectorAll('input')[0], checkbox); assert.equal(checkbox.checked, true);
  assert.equal(page.document.activeElement, checkbox); assert.equal(page.$('memberDialog').open, true);
  const save = page.$('memberForm').fire('submit'); await page.flush();
  page.window.RelayI18n.setLocale('pt-BR');
  assert.equal(page.$('memberSave').disabled, true); assert.match(page.$('memberError').textContent, /Salvando/);
  assert.equal(page.requests.length, 1, 'changing language never submits or reloads');
  await page.answer(200, { ok: true, applied: true, revision: 'rev-2', issuedKey: 'one-time-key' }); await page.answer(200, team()); await save;
  page.$('issuedKey').focus(); page.window.RelayI18n.setLocale('es');
  assert.equal(page.$('issuedKey').value, 'one-time-key'); assert.equal(page.$('issuedDialog').open, true); assert.equal(page.document.activeElement, page.$('issuedKey'));
  page.$('issuedDialog').close(); await page.navigate('usage'); await page.answer(200, history());
  const bucket = page.$('historyChart').querySelectorAll('g')[0]; await bucket.fire('click');
  const selected = page.$('historyChart').querySelectorAll('g')[0]; selected.focus();
  page.window.RelayI18n.setLocale('en');
  assert.equal(page.$('historyChart').querySelectorAll('g')[0].getAttribute('aria-pressed'), 'true');
  assert.equal(page.document.activeElement, page.$('historyChart').querySelectorAll('g')[0]);
  assert.equal(page.$('historyScope').querySelectorAll('option')[0].textContent, 'Clients');
  assert.equal(page.requests.length, 0);
});
