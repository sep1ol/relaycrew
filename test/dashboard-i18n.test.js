import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { createDashboardI18n } from '../src/dashboard-i18n.js';

const STORAGE_KEY = 'relaycrew-dashboard-locale';
const catalogs = {
  'pt-BR': { Accounts: 'Contas', 'Hello {name}': 'Olá {name}', '{count} requests for {name}': '{count} requisições de {name}', Empty: '' },
  es: { Accounts: 'Cuentas', 'Hello {name}': 'Hola {name}', '{count} requests for {name}': '{count} solicitudes de {name}' },
};

function preference(initial = null) {
  const entries = new Map(initial === null ? [] : [[STORAGE_KEY, initial]]);
  return {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
  };
}

test('fresh dashboards use English source messages and do not require an English catalog', () => {
  for (const storage of [null, preference()]) {
    const i18n = createDashboardI18n(catalogs, storage);
    assert.equal(i18n.locale(), 'en');
    assert.equal(i18n.t('Accounts'), 'Accounts');
    assert.equal(i18n.t('Hello {name}', { name: 'Marina' }), 'Hello Marina');
    assert.equal(i18n.t('Untranslated text'), 'Untranslated text');
  }
});

test('exact supported preferences survive recreation and English can be selected explicitly', () => {
  const storage = preference();
  const i18n = createDashboardI18n(catalogs, storage);
  for (const [locale, label] of [['pt-BR', 'Contas'], ['es', 'Cuentas'], ['en', 'Accounts']]) {
    i18n.setLocale(locale);
    assert.equal(storage.getItem(STORAGE_KEY), locale);
    assert.equal(i18n.locale(), locale);
    const reloaded = createDashboardI18n(catalogs, storage);
    assert.equal(reloaded.locale(), locale);
    assert.equal(reloaded.t('Accounts'), label);
  }
  const fresh = preference();
  createDashboardI18n(catalogs, fresh).setLocale('en');
  assert.equal(fresh.getItem(STORAGE_KEY), 'en');
});

test('malformed stored preferences and unsupported locale changes are ignored without coercion', () => {
  const invalid = [undefined, null, '', 'pt', 'pt-br', 'es-MX', 'EN', ' en', 'es ', '"es"', '__proto__', 'constructor', 'toString', 0, true, {}, ['es'], new String('es')];
  for (const value of invalid) {
    const i18n = createDashboardI18n(catalogs, { getItem: () => value });
    assert.equal(i18n.locale(), 'en');
    i18n.setLocale('pt-BR');
    i18n.setLocale(value);
    assert.equal(i18n.locale(), 'pt-BR');
    assert.equal(i18n.t('Accounts'), 'Contas');
  }
  const storage = preference('es');
  const i18n = createDashboardI18n(catalogs, storage);
  i18n.setLocale('fr');
  assert.equal(storage.getItem(STORAGE_KEY), 'es');
});

test('unavailable, malformed, or throwing storage leaves in-memory selection usable', () => {
  const failure = () => { throw new Error('Storage unavailable'); };
  for (const storage of [{}, { getItem: 3, setItem: false }, { getItem: failure, setItem: failure }, { get getItem() { return failure(); }, get setItem() { return failure(); } }]) {
    const i18n = createDashboardI18n(catalogs, storage);
    assert.equal(i18n.locale(), 'en');
    const changes = [];
    i18n.onChange(locale => changes.push(locale));
    i18n.setLocale('es');
    assert.equal(i18n.locale(), 'es');
    assert.equal(i18n.t('Accounts'), 'Cuentas');
    assert.deepEqual(changes, ['es']);
  }
  const i18n = createDashboardI18n(catalogs, { getItem: () => 'pt-BR', setItem: failure });
  assert.equal(i18n.t('Accounts'), 'Contas');
  i18n.setLocale('en');
  assert.equal(i18n.t('Accounts'), 'Accounts');
});

test('message lookup uses own catalog entries, allows empty translations, and falls back to English', () => {
  const inherited = Object.create({ Inherited: 'must not appear', constructor: 'must not appear' });
  Object.assign(inherited, catalogs['pt-BR'], { Invalid: 42 });
  Object.defineProperty(inherited, '__proto__', { value: 'literal prototype label', enumerable: true });
  const i18n = createDashboardI18n({ 'pt-BR': inherited, es: catalogs.es });
  i18n.setLocale('pt-BR');
  assert.equal(i18n.t('Accounts'), 'Contas');
  assert.equal(i18n.t('Empty'), '');
  for (const id of ['Inherited', 'constructor', 'toString', 'valueOf', 'Invalid', 'Unknown {name}']) {
    assert.equal(i18n.t(id), id);
  }
  assert.equal(i18n.t('__proto__'), 'literal prototype label');
  i18n.setLocale('es');
  assert.equal(i18n.t('__proto__'), '__proto__');
  i18n.setLocale('en');
  assert.equal(i18n.t('__proto__'), '__proto__');
  const inheritedCatalog = createDashboardI18n(Object.create({ es: catalogs.es }));
  inheritedCatalog.setLocale('es');
  assert.equal(inheritedCatalog.t('Accounts'), 'Accounts');
});

test('interpolation preserves literal user text, falsy values, and unresolved placeholders', () => {
  const i18n = createDashboardI18n(catalogs);
  const hostile = '<img src=x onerror="alert(1)"> & </script> $& $1 $$ {count}';
  for (const [locale, prefix] of [['en', 'Hello '], ['pt-BR', 'Olá '], ['es', 'Hola ']]) {
    i18n.setLocale(locale);
    assert.equal(i18n.t('Hello {name}', { name: hostile }), prefix + hostile);
  }
  i18n.setLocale('en');
  assert.equal(i18n.t('{count} requests for {name}', { count: 0, name: '' }), '0 requests for ');
  assert.equal(i18n.t('{flag} {name} {missing}', { flag: false, name: 'Marina' }), 'false Marina {missing}');
  assert.equal(i18n.t('{name} / {name}', { name: '$&' }), '$& / $&');
  assert.equal(i18n.t('Hello {name}', Object.create({ name: 'inherited' })), 'Hello {name}');
  assert.equal(i18n.t('{constructor} {toString} {__proto__}', {}), '{constructor} {toString} {__proto__}');
  assert.equal(i18n.t(hostile), hostile);
});

test('number formatting follows the selected locale and caller formatting options', () => {
  const i18n = createDashboardI18n(catalogs);
  for (const [locale, expected] of [['en', '1,234,567.5'], ['pt-BR', '1.234.567,5'], ['es', '1.234.567,5']]) {
    i18n.setLocale(locale);
    assert.equal(i18n.number(1234567.5), expected);
  }
  i18n.setLocale('en');
  assert.equal(i18n.number(0.125, { style: 'percent', maximumFractionDigits: 1 }), '12.5%');
  assert.equal(i18n.number(5, { minimumFractionDigits: 2 }), '5.00');
  i18n.setLocale('pt-BR');
  assert.equal(i18n.number(5, { minimumFractionDigits: 2 }), '5,00');
});

test('date formatting accepts Date, timestamp, and string inputs with selected locale and timezone', () => {
  const i18n = createDashboardI18n(catalogs);
  const stamp = Date.UTC(2026, 2, 5, 12, 30);
  const options = { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' };
  for (const [locale, expected] of [['en', 'March 5, 2026'], ['pt-BR', '5 de março de 2026'], ['es', '5 de marzo de 2026']]) {
    i18n.setLocale(locale);
    for (const value of [new Date(stamp), stamp, '2026-03-05T12:30:00Z']) assert.equal(i18n.date(value, options), expected);
    for (const value of ['invalid date', NaN, new Date(NaN)]) assert.equal(i18n.date(value, options), '');
  }
  i18n.setLocale('en');
  assert.equal(i18n.date(0, { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }), 'January 1, 1970');
});

test('relative formatting follows the selected locale for past and future values', () => {
  const i18n = createDashboardI18n(catalogs);
  for (const [locale, past, future] of [['en', '1 day ago', 'in 2 hours'], ['pt-BR', 'há 1 dia', 'em 2 horas'], ['es', 'hace 1 día', 'dentro de 2 horas']]) {
    i18n.setLocale(locale);
    assert.equal(i18n.relative(-1, 'day'), past);
    assert.equal(i18n.relative(2, 'hour'), future);
  }
});

test('change callbacks observe committed locale and can unsubscribe without duplicate notifications', () => {
  const i18n = createDashboardI18n(catalogs);
  const labels = [], locales = [];
  const unsubscribe = i18n.onChange(locale => { locales.push(locale); labels.push(i18n.t('Accounts')); });
  const other = [];
  i18n.onChange(locale => other.push(locale));
  assert.deepEqual(locales, []);
  i18n.setLocale('en');
  i18n.setLocale('pt-BR');
  i18n.setLocale('pt-BR');
  i18n.setLocale('fr');
  i18n.setLocale('es');
  assert.deepEqual(locales, ['pt-BR', 'es']);
  assert.deepEqual(labels, ['Contas', 'Cuentas']);
  unsubscribe();
  unsubscribe();
  i18n.setLocale('en');
  assert.deepEqual(locales, ['pt-BR', 'es']);
  assert.deepEqual(other, ['pt-BR', 'es', 'en']);
});

test('factory instances keep independent locale state and subscriptions', () => {
  const first = createDashboardI18n(catalogs);
  const second = createDashboardI18n(catalogs);
  let changes = 0;
  second.onChange(() => { changes++; });
  first.setLocale('es');
  assert.equal(first.t('Accounts'), 'Cuentas');
  assert.equal(second.t('Accounts'), 'Accounts');
  assert.equal(changes, 0);
});

test('a failing change callback is reported and does not block other controllers', () => {
  const failures = [];
  const factory = runInNewContext('(' + createDashboardI18n.toString() + ')', { console: { error: (...args) => failures.push(args) } });
  const i18n = factory(catalogs);
  const failure = new Error('Controller failed');
  i18n.onChange(() => { throw failure; });
  const labels = [];
  i18n.onChange(() => labels.push(i18n.t('Accounts')));
  assert.doesNotThrow(() => i18n.setLocale('pt-BR'));
  assert.deepEqual(labels, ['Contas']);
  assert.equal(i18n.locale(), 'pt-BR');
  assert.equal(failures.length, 1);
  assert.equal(failures[0][1], failure);
});

test('serialized factory runs without module closures and ignores navigator preferences', () => {
  const factory = runInNewContext('(' + createDashboardI18n.toString() + ')', { navigator: { language: 'pt-BR', languages: ['pt-BR', 'es'] } });
  const storage = preference();
  const i18n = factory(catalogs, storage);
  assert.equal(i18n.locale(), 'en');
  i18n.setLocale('es');
  assert.equal(i18n.t('Hello {name}', { name: '<script>$&</script>' }), 'Hola <script>$&</script>');
  assert.equal(i18n.number(1234567.5), '1.234.567,5');
  assert.equal(i18n.date(new Date('2026-03-05T00:00:00Z'), { timeZone: 'UTC', year: 'numeric' }), '2026');
  assert.equal(i18n.relative(-1, 'day'), 'hace 1 día');
  assert.equal(factory(catalogs, storage).locale(), 'es');
});
