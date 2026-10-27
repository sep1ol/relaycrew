import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DASHBOARD_TRANSLATIONS, I18N_SCRIPT } from '../src/dashboard-translations.js';
import { WORKSPACE_HTML } from '../src/dashboard-shell.js';
import { createDashboardI18n } from '../src/dashboard-i18n.js';
import { outsideSpendText, forecastText } from '../src/status-renderer.js';
import { makeDashboardDom } from './helpers/dashboard-dom.js';

const literal = /\bt\(\s*((?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'))/g;
const decode = value => value.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
function sourceMessages() {
  const messages = new Set();
  for (const file of ['dashboard.js', 'dashboard-workspace.js', 'status-renderer.js']) {
    const source = readFileSync(new URL('../src/' + file, import.meta.url), 'utf8');
    const calls = [...source.matchAll(/\bt\(\s*/g)];
    const literals = [...source.matchAll(literal)];
    assert.equal(literals.length, calls.length, file + ' must use explicit literal source-English messages');
    for (const match of literals) messages.add(new Function('return ' + match[1])());
  }
  for (const match of WORKSPACE_HTML.matchAll(/data-i18n(?:-placeholder|-title|-aria-label)?="([^"]+)"/g)) messages.add(decode(match[1]));
  return [...messages].sort();
}
const placeholders = text => [...text.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(match => match[1]).sort();

test('every dashboard message has complete Portuguese and Spanish catalogs with matching placeholders', () => {
  const messages = sourceMessages();
  assert.ok(messages.length > 300);
  for (const [locale, catalog] of Object.entries(DASHBOARD_TRANSLATIONS)) {
    assert.deepEqual(Object.keys(catalog).sort(), messages, locale + ' catalog must match actual UI messages exactly');
    for (const message of messages) {
      assert.ok(catalog[message]?.trim(), locale + ' missing ' + message);
      assert.deepEqual(placeholders(catalog[message]), placeholders(message), locale + ': ' + message);
      if (/\s/.test(message) && message !== 'via {routing}') assert.notEqual(catalog[message], message, locale + ' has an untranslated phrase: ' + message);
    }
  }
});

test('serialized bootstrap starts in English and synchronizes selectors and leaf attributes without touching controls', async () => {
  const { document, $ } = makeDashboardDom(WORKSPACE_HTML);
  const store = new Map();
  const storage = { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
  const window = { localStorage: storage, navigator: { language: 'pt-BR' } };
  $('key').value = 'draft-access-key';
  new Function('document', 'window', I18N_SCRIPT)(document, window);
  assert.equal(window.RelayI18n.locale(), 'en');
  assert.equal(document.documentElement.lang, 'en');
  assert.equal($('loginLanguage').value, 'en');
  assert.equal($('go').textContent, 'Connect');
  $('language').value = 'es'; await $('language').fire('change');
  assert.equal($('loginLanguage').value, 'es');
  assert.equal($('go').textContent, 'Conectar');
  assert.equal($('key').getAttribute('placeholder'), 'Tu clave de acceso');
  assert.equal($('key').value, 'draft-access-key');
  assert.equal(store.get('relaycrew-dashboard-locale'), 'es');
  assert.ok($('memberName'), 'leaf translation preserves form controls');
});

test('blocked browser storage keeps localization and session storage usable', () => {
  const { document } = makeDashboardDom(WORKSPACE_HTML);
  const window = { get localStorage() { throw new Error('blocked'); } };
  new Function('document', 'window', I18N_SCRIPT)(document, window);
  window.RelayI18n.setLocale('pt-BR');
  assert.equal(window.RelayI18n.t('Change key'), 'Trocar chave');
  window.RelayStorage.setItem('relaycrew-dashboard-key', 'session-only');
  assert.equal(window.RelayStorage.getItem('relaycrew-dashboard-key'), 'session-only');
  window.RelayStorage.removeItem('relaycrew-dashboard-key');
  assert.equal(window.RelayStorage.getItem('relaycrew-dashboard-key'), null);
});

test('shared quota descriptions localize surrounding text while retaining model names and CLI defaults', () => {
  const i18n = createDashboardI18n(DASHBOARD_TRANSLATIONS);
  i18n.setLocale('es');
  const outside = { 'scoped:custom-model': { state: 'measured', share: 0.125, since: null } };
  assert.equal(outsideSpendText(outside), '12.5% of the Custom-model week went elsewhere');
  assert.match(outsideSpendText(outside, i18n), /12,5.*semana Custom-model.*fuera del proxy/);
  assert.match(forecastText({ unified7d: { threshold: 0.98, reachesThresholdAt: 3600000, resetAt: 7200000 } }, 0, i18n), /semana alcanza.*se restablece/);
});
