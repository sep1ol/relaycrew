/**
 * @param {Record<string, Record<string, string>>} catalogs
 * @param {{getItem: (key: string) => string|null, setItem: (key: string, value: string) => void}|null} [storage]
 */
export function createDashboardI18n(catalogs, storage = null) {
  const storageKey = 'relaycrew-dashboard-locale';
  const intlLocales = new Map([['en', 'en-US'], ['pt-BR', 'pt-BR'], ['es', 'es']]);
  /** @type {Set<(locale: string) => void>} */
  const listeners = new Set();
  let currentLocale = 'en';

  try {
    const saved = storage && storage.getItem(storageKey);
    if (typeof saved === 'string' && intlLocales.has(saved)) currentLocale = saved;
  } catch {}

  return {
    locale() { return currentLocale; },
    /** @param {string} id @param {Record<string, unknown>} [values] */
    t(id, values = {}) {
      const catalog = currentLocale !== 'en' && Object.hasOwn(catalogs, currentLocale) ? catalogs[currentLocale] : null;
      const message = catalog && Object.hasOwn(catalog, id) && typeof catalog[id] === 'string' ? catalog[id] : id;
      return message.replace(/\{([a-zA-Z0-9_]+)\}/g, (placeholder, name) => Object.hasOwn(values, name) ? String(values[name]) : placeholder);
    },
    /** @param {unknown} locale */
    setLocale(locale) {
      if (typeof locale !== 'string' || !intlLocales.has(locale)) return;
      const changed = currentLocale !== locale;
      currentLocale = locale;
      try { if (storage) storage.setItem(storageKey, locale); } catch {}
      if (!changed) return;
      for (const callback of listeners) {
        try { callback(currentLocale); }
        catch (error) { console.error('Dashboard language change listener failed', error); }
      }
    },
    /** @param {(locale: string) => void} callback */
    onChange(callback) {
      listeners.add(callback);
      return () => { listeners.delete(callback); };
    },
    /** @param {number} value @param {Intl.NumberFormatOptions} [options] */
    number(value, options) {
      return new Intl.NumberFormat(intlLocales.get(currentLocale), options).format(value);
    },
    /** @param {Date|string|number} value @param {Intl.DateTimeFormatOptions} [options] */
    date(value, options) {
      const date = new Date(value instanceof Date ? value.getTime() : value);
      return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(intlLocales.get(currentLocale), options).format(date);
    },
    /** @param {number} value @param {Intl.RelativeTimeFormatUnit} unit */
    relative(value, unit) {
      return new Intl.RelativeTimeFormat(intlLocales.get(currentLocale)).format(value, unit);
    },
  };
}
