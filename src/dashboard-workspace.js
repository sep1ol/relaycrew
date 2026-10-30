/**
 * @typedef {{key: string, values: number[]}} HistorySeries
 * @typedef {{buckets: string[], total: number[], series: HistorySeries[]}} HistoryPayload
 * @typedef {{key: string, value: number}} DistributionRow
 * @typedef {{requests?: number, connections?: number, inputTokens?: number, outputTokens?: number}} UsageCounters
 * @typedef {UsageCounters & {windows?: Record<string, UsageCounters>}} UsageEntry
 * @typedef {{kind?: string, refused?: string[]}} WorkspaceCaller
 * @typedef {{id?: string|null, name: string, provider?: string, disabled?: boolean, unavailable?: boolean}} WorkspaceAccount
 * @typedef {{id?: string, session: string, account: string}} SessionPin
 * @typedef {Object} WorkspaceStatus
 * @property {boolean} [dashboardPreview]
 * @property {WorkspaceCaller} [caller]
 * @property {WorkspaceAccount[]} [accounts]
 * @property {{active?: number, known?: number, items?: unknown[]}} [sessions]
 * @property {Record<string, string|null>} [currentAccounts]
 * @property {string|null} [currentAccount]
 * @property {Record<string, UsageEntry>} [clients]
 * @property {Record<string, Record<string, UsageEntry>>} [usageDimensions]
 * @property {string[]} [configuredUsageDimensions]
 * @property {{running?: boolean}} [probe]
 * @property {SessionPin[]} [sessionPins]
 *
 * @typedef {{id: string, name: string, provider: string, disabled?: boolean, owner?: string|null, sharing?: string, disabledBy?: string}} TeamAccount
 * @typedef {{id: string, provider: string, paste: 'code'|'callback-url'|'none', url: string, userCode?: string}} AccountLogin
 * @typedef {UsageCounters & {lastUsed?: string|number|null}} MemberUsage
 * @typedef {{name: string, accounts: '*'|string[], maxConcurrent: number, active?: number, disabled?: boolean, usage?: MemberUsage}} TeamMember
 * @typedef {{enabled: boolean, revision: string, accounts: TeamAccount[], members: TeamMember[]}} TeamPayload
 * @typedef {{name: string, accounts?: '*'|string[], maxConcurrent?: number, disabled?: boolean}} MemberPayload
 * @typedef {{revision?: string, issuedKey?: string, applied?: boolean, warning?: string}} MutationPayload
 * @typedef {{epoch: number, key: string|null}} AuthContext
 * @typedef {'rotate'|'revoke'} MemberAction
 * @typedef {Object} WorkspaceState
 * @property {WorkspaceStatus|null} status
 * @property {string} view
 * @property {TeamPayload|null} team
 * @property {string|null} editing
 * @property {string|null} editRevision
 * @property {number} authEpoch
 * @property {HistoryPayload|null} history
 * @property {HistoryPayload|null} preview
 * @property {number|null} selected
 * @property {number} historyAt
 * @property {number} previewAt
 * @property {number} historySeq
 * @property {number} previewSeq
 * @property {string} distributionSort
 * @property {number} distributionDir
 * @property {number} teamAt
 * @property {{name: string, action: MemberAction, revision: string|null}|null} action
 * @property {boolean} submitting
 * @property {number} lastGood
 * @property {TeamAccount[]|null} accountRows
 * @property {number} accountsAt
 * @property {boolean} accountBusy
 * @property {TeamAccount|null} removing
 * @property {AccountLogin|null} login
 * @property {boolean} loginBusy
 * @property {number} loginEpoch
 *
 * @typedef {{getElementById: (id: string) => any, querySelectorAll: (selector: string) => any[], createElement: (tag: string) => any, createElementNS: (namespace: string, tag: string) => any, title: string, documentElement?: any, activeElement?: any}} WorkspaceDocument
 * @typedef {{preventDefault: () => void, key?: string, currentTarget: any}} WorkspaceEvent
 * @typedef {{update: (status: WorkspaceStatus) => void, failed: (text: string) => void, signedOut: () => void, accountControls: (account: WorkspaceAccount, target: any) => boolean, renderAccounts?: () => void, refresh?: () => void}} WorkspaceController
 * @typedef {{location: {hash: string}, navigator: {clipboard?: {writeText: (text: string) => Promise<void>}}, addEventListener: (name: string, listener: () => void) => void, setTimeout: (callback: () => void, delay: number) => number, clearTimeout: (timer: number) => void, getComputedStyle?: (element: any) => {backgroundColor: string, getPropertyValue?: (key: string) => string}, RelayWorkspace: WorkspaceController}} WorkspaceWindow
 * @typedef {{workspaceDistribution: typeof workspaceDistribution, historyDistribution: typeof historyDistribution, validHistory: typeof validHistory, workspaceAdmin: typeof workspaceAdmin, historyPath: typeof historyPath, createSeriesColors: typeof createSeriesColors}} WorkspaceHelpers
 * @typedef {{getItem: (key: string) => string|null, setItem: (key: string, value: string) => void}} ColorStorage
 * @typedef {{slot: number, custom?: string}} SeriesColorEntry
 */

/** @param {WorkspaceStatus|null} status @param {string} scope @param {string} windowKey @param {string} metric */
export function workspaceDistribution(status, scope, windowKey, metric) {
  const entries = scope === 'clients' ? status?.clients : status?.usageDimensions?.[scope.slice(10)];
  return Object.entries(entries || {}).map(([key, entry]) => {
    const counters = windowKey === 'total' ? entry : entry.windows?.[windowKey];
    const amount = Number(/** @type {Record<string, unknown>|undefined} */ (counters)?.[metric]);
    return { key, value: Number.isFinite(amount) && amount >= 0 ? amount : 0 };
  }).sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
}

/** @param {HistoryPayload|null} data @param {number|null} [bucket] */
export function historyDistribution(data, bucket = null) {
  return (data?.series || []).map(series => ({
    key: String(series.key),
    value: bucket === null ? series.values.reduce((sum, value) => sum + value, 0) : (series.values[bucket] || 0),
  })).sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
}

/** @param {unknown} data @returns {data is HistoryPayload} */
export function validHistory(data) {
  if (!data || typeof data !== 'object') return false;
  const candidate = /** @type {Partial<HistoryPayload>} */ (data);
  const { buckets, total, series } = candidate;
  return Array.isArray(buckets) && buckets.length <= 97
    && buckets.every(at => typeof at === 'string' && Number.isFinite(Date.parse(at)))
    && Array.isArray(total) && total.length === buckets.length
    && Array.isArray(series) && series.length <= 13
    && series.every(entry => typeof entry.key === 'string' && Array.isArray(entry.values)
      && entry.values.length === buckets.length && entry.values.every(value => Number.isFinite(value) && value >= 0))
    && total.every((value, i) => Number.isFinite(value) && value >= 0
      && value === series.reduce((sum, entry) => sum + entry.values[i], 0));
}

/** @param {WorkspaceCaller|null|undefined} caller @param {string|null} key */
export function workspaceAdmin(caller, key) {
  return !!key && caller?.kind !== 'client' && caller?.kind !== 'member'
    && !caller?.refused?.length;
}

/** @param {string} scope @param {string} windowKey @param {string} step @param {string} metric */
export function historyPath(scope, windowKey, step, metric) {
  if (!['5h', '24h'].includes(windowKey) || !['15m', '1h'].includes(step)
    || !['requests', 'inputTokens', 'outputTokens'].includes(metric)) return null;
  const query = new URLSearchParams({ scope: scope === 'clients' ? 'clients' : 'dimension', window: windowKey, step, metric });
  if (scope !== 'clients') {
    if (!scope.startsWith('dimension:') || !scope.slice(10)) return null;
    query.set('dimension', scope.slice(10));
  }
  return '/relaycrew/usage/history?' + query;
}

/** @param {ColorStorage|null} storage */
export function createSeriesColors(storage) {
  var storageKey = 'relaycrew-dashboard-series-colors';
  /** @type {Record<string, SeriesColorEntry>} */
  var entries = Object.create(null);
  var opaqueHex = /^#[0-9a-f]{6}$/i;
  try {
    var saved = JSON.parse(storage?.getItem(storageKey) || 'null');
    if (saved && saved.version === 1 && saved.entries && typeof saved.entries === 'object' && !Array.isArray(saved.entries)) {
      Object.keys(saved.entries).forEach(function (identity) {
        var pair;
        try { pair = JSON.parse(identity); } catch { return; }
        if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(value => typeof value === 'string')) return;
        var entry = saved.entries[identity];
        if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !Number.isInteger(entry.slot)
          || entry.slot < 1 || entry.slot > 13 || (pair[1] === '(remaining)' ? entry.slot !== 13 : entry.slot === 13)
          || (Object.hasOwn(entry, 'custom') && (typeof entry.custom !== 'string' || !opaqueHex.test(entry.custom)))) return;
        entries[identity] = { slot: entry.slot };
        if (entry.custom) entries[identity].custom = entry.custom.toLowerCase();
      });
    }
  } catch {}
  function persist() {
    try { storage?.setItem(storageKey, JSON.stringify({ version: 1, entries: entries })); } catch {}
  }
  /** @param {string} scope @param {string} key */
  function ensure(scope, key) {
    var identity = JSON.stringify([scope, key]);
    if (!Object.hasOwn(entries, identity)) {
      var used = new Set(), count = 0;
      Object.keys(entries).forEach(function (other) {
        if (JSON.parse(other)[0] === scope && entries[other].slot !== 13) { used.add(entries[other].slot); count++; }
      });
      var slot = 1;
      while (slot <= 12 && used.has(slot)) slot++;
      entries[identity] = { slot: key === '(remaining)' ? 13 : slot <= 12 ? slot : count % 12 + 1 };
      persist();
    }
    return entries[identity];
  }
  return {
    /** @param {string} scope @param {string} key */
    css: function (scope, key) { var entry = ensure(scope, key); return entry.custom || 'var(--series-' + entry.slot + ')'; },
    /** @param {string} scope @param {string} key */
    slot: function (scope, key) { return ensure(scope, key).slot; },
    /** @param {string} scope @param {string} key @param {string|null} color */
    set: function (scope, key, color) {
      if (color !== null && !opaqueHex.test(color)) return;
      var entry = ensure(scope, key);
      if (color === null) { if (!entry.custom) return; delete entry.custom; }
      else { if (entry.custom === color.toLowerCase()) return; entry.custom = color.toLowerCase(); }
      persist();
    }
  };
}

/** @param {WorkspaceDocument} document @param {WorkspaceWindow} window @param {typeof globalThis.fetch} fetch @param {ColorStorage|null} localStorage @param {WorkspaceHelpers} helpers @param {import('./dashboard-translations.js').DashboardI18n} i18n */
function bootWorkspace(document, window, fetch, localStorage, helpers, i18n) {
  'use strict';
  var t = i18n.t;
  /** @param {string} id */
  var $ = function (id) { return document.getElementById(id); };
  /** @type {WorkspaceState} */
  var state = { status: null, view: '', team: null, editing: null, editRevision: null, authEpoch: 0,
    history: null, preview: null, selected: null, historyAt: 0, previewAt: 0,
    historySeq: 0, previewSeq: 0, distributionSort: 'value', distributionDir: -1,
    teamAt: 0, action: null, submitting: false, lastGood: 0,
    accountRows: null, accountsAt: 0, accountBusy: false, removing: null, login: null, loginBusy: false, loginEpoch: 0 };
  /** @type {Promise<void>|null} */
  var teamRequest = null;
  /** @type {Promise<void>|null} */
  var accountsRequest = null;
  /** @type {number|null} */
  var loginTimer = null;
  /** @type {AuthContext|null} */
  var loginContext = null;
  var accountApiAvailable = true;
  /** @type {string|null} */
  var connectionFailure = null;
  /** @type {(() => void)|null} */
  var previewNotice = null;
  /** @type {{element: any, render: () => string}[]} */
  var memberLabels = [];
  /** @type {Record<string, () => string[]>} */
  var titles = {
    'my-accounts': function () { return [t('My accounts'), t('Connect your subscriptions and choose who can use them.'), '']; },
    overview: function () { return [t("Overview"), t("Accounts, conversations, and usage in one place."), t("GATEWAY CONTROL")]; },
    accounts: function () { return [t("Accounts"), t("Each provider, its quota, and the next path for traffic."), t("CAPACITY AND ROUTING")]; },
    team: function () { return [t("Team"), t("Individual access, explicit permissions, and clear limits."), t("WHO CAN USE IT")]; },
    usage: function () { return [t("Usage"), t("Understand usage without losing the source of each request."), t("ACTIVITY AND DISTRIBUTION")]; },
    sessions: function () { return [t("Sessions"), t("Track conversations, context, and pinned accounts."), t("WORK IN PROGRESS")]; },
    settings: function () { return [t("Settings"), t("Gateway settings and operational actions."), t("YOUR ENVIRONMENT")]; }
  };
  var seriesColors = helpers.createSeriesColors(localStorage);
  /** @param {number|null|undefined} n */
  var number = function (n) { return i18n.number(Number(n || 0)); };
  /** @param {any} element @param {string} scope @param {string} key @param {'fill'|'background'} paint */
  function bindSeriesColor(element, scope, key, paint) {
    element.setAttribute('data-series-color', JSON.stringify([scope, key]));
    element.setAttribute('data-series-paint', paint);
    if (paint === 'fill') element.setAttribute('fill', seriesColors.css(scope, key));
    else element.style.background = seriesColors.css(scope, key);
  }
  function repaintSeriesColors() {
    document.querySelectorAll('[data-series-color]').forEach(function (element) {
      var pair = JSON.parse(element.getAttribute('data-series-color'));
      bindSeriesColor(element, pair[0], pair[1], element.getAttribute('data-series-paint'));
    });
  }
  /** @param {string} scope @param {HistorySeries} series */
  function legendEntry(scope, series) {
    var name = series.key === '(remaining)' ? t('Remaining') : series.key;
    var entry = node('span', 'legend-entry'), label = node('label', 'series-picker'), swatch = node('i');
    bindSeriesColor(swatch, scope, series.key, 'background');
    swatch.setAttribute('aria-hidden', 'true'); label.appendChild(swatch); label.appendChild(node('span', '', name));
    var input = node('input'); input.type = 'color'; input.value = '#2563eb';
    input.setAttribute('aria-label', t('Change color for {name}', { name: name }));
    input.setAttribute('data-color-control', JSON.stringify([scope, series.key]));
    input.setAttribute('data-workspace-focus', JSON.stringify(['color', scope, series.key]));
    function syncPicker() {
      var css = seriesColors.css(scope, series.key);
      if (/^#[0-9a-f]{6}$/i.test(css)) { input.value = css; return; }
      var fallback = window.getComputedStyle?.(document.documentElement).getPropertyValue?.('--series-' + seriesColors.slot(scope, series.key)).trim();
      if (fallback && /^#[0-9a-f]{6}$/i.test(fallback)) { input.value = fallback.toLowerCase(); return; }
      var rgb = window.getComputedStyle?.(swatch).backgroundColor.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (rgb) input.value = '#' + rgb.slice(1, 4).map(function (value) { return Number(value).toString(16).padStart(2, '0'); }).join('');
    }
    input.addEventListener('focus', syncPicker); input.addEventListener('pointerdown', syncPicker);
    input.addEventListener('input', function () { seriesColors.set(scope, series.key, input.value); repaintSeriesColors(); });
    label.appendChild(input); entry.appendChild(label);
    var reset = button('↺', function () { seriesColors.set(scope, series.key, null); repaintSeriesColors(); syncPicker(); }, 'series-reset');
    reset.setAttribute('aria-label', t('Reset color for {name}', { name: name }));
    reset.setAttribute('data-workspace-focus', JSON.stringify(['reset', scope, series.key]));
    reset.title = t('Reset color'); entry.appendChild(reset); syncPicker();
    return entry;
  }
  /** @param {string} tag @param {string} [cls] @param {string|number} [text] @returns {any} */
  function node(tag, cls, text) {
    var element = document.createElement(tag);
    if (cls) element.className = cls;
    if (text != null) element.textContent = text;
    return element;
  }
  /** @param {string} text @param {(event: WorkspaceEvent) => void|Promise<void>} action @param {string} [cls] @returns {any} */
  function button(text, action, cls) {
    var element = node('button', cls || '', text);
    element.type = 'button';
    element.addEventListener('click', action);
    return element;
  }
  /** @type {Record<string, () => string>} */
  var notices = Object.create(null);
  /** @param {string} id @param {() => string} render @param {string} [kind] */
  function message(id, render, kind) { notices[id] = render; $(id).textContent = render(); $(id).className = 'notice ' + (kind || ''); }
  function key() { try { return localStorage?.getItem('relaycrew-dashboard-key') || null; } catch { return null; } }
  function authContext() { return { epoch: state.authEpoch, key: key() }; }
  /** @param {AuthContext} context */
  function currentAuth(context) { return context.epoch === state.authEpoch && context.key === key(); }
  /** @param {AuthContext} context */
  function requireCurrentAuth(context) { if (!currentAuth(context)) throw new Error('Authentication context changed'); }
  function admin() { return state.status && helpers.workspaceAdmin(state.status.caller, key()); }
  function memberMode() { return state.status?.caller?.kind === 'member'; }
  function adminMessage() { return t("Use \"Change key\" and enter an administrator key to access team management and history. Client and member keys do not allow this operation."); }
  /** @param {any} target @param {string} title @param {string} text */
  function empty(target, title, text) {
    target.textContent = '';
    var box = node('div', 'empty');
    box.appendChild(node('h2', '', title)); box.appendChild(node('p', '', text)); target.appendChild(box);
  }
  /** @param {unknown} error @returns {string} */
  function errorText(error) {
    if (error && typeof error === 'object') {
      if (!memberMode() && 'status' in error && (error.status === 401 || error.status === 403)) return adminMessage();
      if ('displayText' in error && typeof error.displayText === 'function') return error.displayText();
      if ('message' in error && typeof error.message === 'string' && error.message) return error.message;
    }
    return t("Could not complete the operation.");
  }
  /** @param {() => string} render */
  function presentationError(render) { return Object.assign(new Error(render()), { displayText: render }); }
  /** @template T @param {string|null} path @param {object} [body] @param {AuthContext} [context] @param {{status?: number}} [metadata] @returns {Promise<T>} */
  async function request(path, body, context = authContext(), metadata) {
    requireCurrentAuth(context);
    if (path === null) throw presentationError(function () { return t("Invalid gateway query."); });
    /** @type {RequestInit & {headers: Record<string, string>}} */
    var init = { headers: { 'x-api-key': context.key || '' }, cache: 'no-store' };
    if (body !== undefined) {
      init.method = 'POST'; init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body);
    }
    var response = await fetch(path, init);
    requireCurrentAuth(context);
    var data;
    try { data = await response.json(); } catch { requireCurrentAuth(context); throw presentationError(function () { return t('Invalid gateway response (HTTP {status}).', { status: response.status }); }); }
    requireCurrentAuth(context);
    if (metadata) metadata.status = response.status;
    if (!response.ok || data.ok === false) {
      var error = Object.assign(new Error(typeof data.error === 'string' ? data.error : t('Operation refused (HTTP {status}).', { status: response.status })), { status: response.status });
      throw error;
    }
    return data;
  }
  function navigate() {
    var view = window.location.hash.slice(1);
    if (memberMode()) view = 'my-accounts';
    else if (!Object.prototype.hasOwnProperty.call(titles, view) || view === 'my-accounts') view = 'overview';
    var changed = state.view !== view;
    state.view = view;
    document.querySelectorAll('[data-panel]').forEach(function (panel) { panel.hidden = panel.getAttribute('data-panel') !== view; });
    document.querySelectorAll('[data-view]').forEach(function (link) {
      link.hidden = memberMode() ? link.getAttribute('data-view') !== 'my-accounts' : link.getAttribute('data-view') === 'my-accounts';
      if (link.getAttribute('data-view') === view) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    renderViewTitle();
    $('accountMessage').hidden = ['my-accounts', 'accounts', 'team'].indexOf(view) < 0;
    if (changed && state.status) {
      if (view === 'my-accounts' || view === 'accounts') loadAccounts();
      if (view === 'team') loadTeam();
      if (view === 'usage') loadHistory(true);
      if (view === 'overview') loadPreview();
    }
  }
  function renderViewTitle() {
    var title = titles[state.view]();
    $('viewTitle').textContent = title[0]; $('viewCrumb').textContent = title[0];
    $('viewDescription').textContent = title[1]; $('viewEyebrow').textContent = title[2];
    $('viewEyebrow').hidden = !title[2];
    document.title = title[0] + ' · RelayCrew';
  }
  /** @param {string} label @param {string} amount @param {string} caption */
  function stat(label, amount, caption) {
    var card = node('div', 'stat'); card.appendChild(node('span', '', label));
    card.appendChild(node('strong', '', amount)); card.appendChild(node('small', '', caption)); return card;
  }
  /** @param {WorkspaceStatus} status */
  function updateOverview(status) {
    var accounts = status.accounts || [], sessions = status.sessions || {};
    var ready = accounts.filter(function (account) { return !account.disabled && !account.unavailable; });
    var disabled = accounts.filter(function (account) { return account.disabled; }).length;
    var blocked = accounts.length - ready.length - disabled;
    var stats = $('overviewStats'); stats.textContent = '';
    stats.appendChild(stat(t("Available accounts"), number(ready.length), t('of {count} configured', { count: number(accounts.length) })));
    stats.appendChild(stat(t("Active conversations"), number(sessions.active), t('{count} known', { count: number(sessions.known) })));
    stats.appendChild(stat(t("Blocked accounts"), number(blocked), t("unavailable for traffic")));
    stats.appendChild(stat(t("Disabled accounts"), number(disabled), t("out of rotation")));
    $('overviewLead').textContent = !accounts.length ? t("Configure your first account to start routing team traffic.")
      : ready.length ? (ready.length === 1 ? t('{count} account available for traffic.', { count: number(ready.length) }) : t('{count} accounts available for traffic.', { count: number(ready.length) }))
        : t("No accounts available now. Check the details before sending new requests.");
    var providers = $('providerSummary'); providers.textContent = '';
    /** @type {Record<string, WorkspaceAccount[]>} */
    var groups = Object.create(null);
    accounts.forEach(function (account) { var provider = account.provider || 'anthropic'; (groups[provider] || (groups[provider] = [])).push(account); });
    Object.keys(groups).sort().forEach(function (provider) {
      var list = groups[provider], available = list.filter(function (account) { return !account.disabled && !account.unavailable; });
      var row = node('div', 'provider-line'), info = node('div');
      info.appendChild(node('div', 'provider-name', provider === 'anthropic' ? 'Anthropic' : provider === 'codex' ? 'Codex / OpenAI' : provider === 'openai' ? 'OpenAI API' : provider));
      var current = status.currentAccounts ? status.currentAccounts[provider] : status.currentAccount;
      info.appendChild(node('small', '', current ? t('In use: {name}', { name: current }) : t("No active account")));
      row.appendChild(info); row.appendChild(node('span', 'provider-count', t('{available} / {total} available', { available: number(available.length), total: number(list.length) }))); providers.appendChild(row);
    });
    if (!accounts.length) providers.appendChild(node('p', 'attention-clear', t("No providers configured. Add your first account with the CLI.")));
    var attention = $('overviewAttention'); attention.textContent = '';
    if (!$('problems').children.length) {
      var line = node('p', 'attention-clear');
      line.appendChild(node('b', '', accounts.length ? t("No alerts in the current status") : t("Let's connect the first account")));
      line.appendChild(node('span', '', accounts.length ? t("Account quotas and blocks are in Accounts.") : t("Add an account with the CLI and reload the configuration.")));
      attention.appendChild(line);
    }
    $('accountsEmpty').hidden = !!accounts.length; $('accountCount').textContent = t('{count} accounts', { count: number(accounts.length) });
    var detailed = sessions.items;
    $('sessionsEmpty').hidden = !!detailed;
    if (detailed && !detailed.length) {
      $('sessionsEmpty').hidden = false;
      $('sessionsEmpty').querySelector('h2').textContent = t("No conversations recorded");
      $('sessionsEmpty').querySelector('p').textContent = t("Conversations will appear here when clients send traffic through the gateway.");
    } else if (!detailed) {
      $('sessionsEmpty').querySelector('h2').textContent = t("Session details disabled");
      $('sessionsEmpty').querySelector('p').textContent = t("Enable proxy.sessionDetail in the configuration to track conversations, context, cache, and session pins.");
    }
    $('settingsProbe').textContent = status.probe?.running ? t("Quota probe in progress. Status will update automatically.") : t("The quota probe is not running.");
  }
  /** @param {WorkspaceStatus} status */
  function renderPins(status) {
    var target = $('sessionPinsList'); target.textContent = '';
    var allowed = admin(), pins = status.sessionPins || [];
    pins.forEach(function (pin) {
      var line = node('div', 'provider-line'); line.appendChild(node('span', '', pin.session + ' → ' + pin.account));
      const pinId = pin.id;
      if (allowed && pinId) line.appendChild(button(t("Unpin"), /** @param {WorkspaceEvent} event */ async function (event) {
        var context = authContext(), control = event.currentTarget; control.disabled = true;
        await savePin(pinId, null); if (currentAuth(context)) control.disabled = false;
      })); line.querySelectorAll('button').forEach(/** @param {any} control */ function (control) { control.setAttribute('data-i18n', 'Unpin'); }); target.appendChild(line);
    });
    if (!pins.length) target.appendChild(node('p', 'muted', t("No sessions pinned manually.")));
    var select = $('pinAccount'), chosen = select.value; select.textContent = '';
    (status.accounts || []).forEach(function (account) { var option = node('option', '', account.name); option.value = account.name; select.appendChild(option); });
    if ((status.accounts || []).some(function (account) { return account.name === chosen; })) select.value = chosen;
    $('pinSave').disabled = !allowed || !(status.accounts || []).length;
    $('pinSession').disabled = !allowed; select.disabled = !allowed;
    if (!allowed) message('sessionPinMessage', function () { return t("Use an administrator key to change pins."); });
    else if (pins.some(function (pin) { return !pin.id; })) message('sessionPinMessage', function () { return t("Enable proxy.sessionDetail to unpin existing sessions in the dashboard. New pins require the full identifier."); });
  }
  /** @param {string} sessionId @param {string|null} account */
  async function savePin(sessionId, account) {
    if (!admin()) return;
    var context = authContext();
    try {
      /** @type {{eligible?: boolean, seen?: boolean}} */
      var data = await request('/relaycrew/session-pin', { sessionId: sessionId, account: account }, context);
      if (!currentAuth(context)) return;
      message('sessionPinMessage', function () { return account === null ? t("Pin removed. The session returns to normal rotation.") : data.eligible === false ? t("Account pinned but unavailable for traffic. Check its quota and blocks in Accounts.") : t('Account pinned for this session.') + (data.seen === false ? ' ' + t('The gateway has not observed this identifier yet.') : ''); }, data.eligible === false ? 'warn' : 'ok');
      if (window.RelayWorkspace.refresh) window.RelayWorkspace.refresh();
    } catch (error) { if (!currentAuth(context)) return; message('sessionPinMessage', function () { return t('{error} The change was not retried automatically.', { error: errorText(error) }); }, 'error'); }
  }
  /** @param {WorkspaceStatus} status */
  function updateScopes(status) {
    var select = $('historyScope'), current = select.value;
    var names = Array.from(new Set(Object.keys(status.usageDimensions || {}).concat(status.configuredUsageDimensions || []))).sort();
    if (current.indexOf('dimension:') === 0 && names.indexOf(current.slice(10)) < 0) names.push(current.slice(10));
    var signature = names.join('\n');
    if (select.getAttribute('data-options') === signature) return;
    select.textContent = ''; var clients = node('option', '', t("Clients")); clients.value = 'clients'; select.appendChild(clients);
    names.forEach(function (name) { var option = node('option', '', name); option.value = 'dimension:' + name; select.appendChild(option); });
    select.value = current || 'clients'; select.setAttribute('data-options', signature);
  }
  /** @param {WorkspaceStatus} status */
  function update(status) {
    state.status = status; state.lastGood = Date.now(); connectionFailure = null;
    navigate();
    $('summary').hidden = memberMode();
    $('accountsRefresh').hidden = !admin() || !accountApiAvailable;
    $('accountsAdd').hidden = !admin() || !accountApiAvailable;
    ['.gateway-pill', '.sidebar-note', '.nav-caption'].forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (element) { element.hidden = memberMode(); });
    });
    if ($('previewLabel')) $('previewLabel').hidden = !status.dashboardPreview;
    $('connection').textContent = t('Updated at {time}', { time: i18n.date(state.lastGood, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) });
    if (memberMode()) { if (Date.now() - state.accountsAt >= 5000) loadAccounts(); return; }
    updateOverview(status); updateScopes(status); renderPins(status);
    document.querySelectorAll('th.sortable').forEach(function (header) {
      header.tabIndex = 0; header.setAttribute('role', 'columnheader');
      header.addEventListener('keydown', /** @param {WorkspaceEvent} event */ function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); header.click(); } });
    });
    if (state.view === 'overview' && Date.now() - state.previewAt > 30000) loadPreview();
    if (state.view === 'usage' && Date.now() - state.historyAt > 30000) loadHistory();
    if (state.view === 'team' && Date.now() - state.teamAt > 30000) loadTeam();
    if (state.view === 'accounts' && Date.now() - state.accountsAt >= 5000) loadAccounts();
  }
  /** @param {string} text */
  function failed(text) {
    connectionFailure = text;
    $('connection').textContent = state.lastGood ? t("Not updating · showing the last status") : t("No connection to the gateway");
    $('connection').title = text;
  }
  function signedOut() {
    cancelAccountLogin();
    state.team = null; state.history = null; state.preview = null; state.status = null; previewNotice = null; memberLabels = [];
    state.authEpoch++; state.historySeq++; state.previewSeq++;
    teamRequest = null; state.submitting = false; state.editing = null; state.editRevision = null; state.action = null;
    state.teamAt = 0; state.historyAt = 0; state.previewAt = 0; state.lastGood = 0; connectionFailure = null;
    state.accountRows = null; state.accountsAt = 0; accountsRequest = null; accountApiAvailable = true;
    state.accountBusy = false; state.removing = null;
    $('myAccountsContent').textContent = ''; $('myAccountsRefresh').disabled = false; $('accountRemoveConfirm').disabled = false;
    ['accounts', 'summary', 'problems', 'overviewStats', 'providerSummary', 'overviewAttention', 'routes', 'clients', 'dimensionsWrap', 'sessions', 'sessionPinsList', 'foot'].forEach(function (id) { $(id).textContent = ''; });
    $('teamAdd').disabled = true; $('teamRefresh').disabled = false; $('memberSave').disabled = false; $('confirmAction').disabled = false; $('historyRefresh').disabled = false;
    $('pinSave').disabled = true;
    $('memberForm').reset(); $('memberName').value = ''; $('memberLimit').value = ''; $('memberAll').checked = false; $('memberDisabled').checked = false; $('memberAccounts').textContent = '';
    $('issuedKey').value = ''; $('issuedKey').textContent = '';
    ['teamMessage', 'memberError', 'confirmError', 'issuedMessage', 'sessionPinMessage', 'accountMessage', 'accountRemoveError'].forEach(function (id) { message(id, function () { return ''; }); });
    $('teamContent').textContent = ''; $('historyChart').textContent = ''; $('historyDistribution').textContent = ''; $('historyTable').textContent = ''; $('overviewHistory').textContent = '';
    ['memberDialog', 'confirmDialog', 'issuedDialog', 'accountRemoveDialog'].forEach(function (id) { if ($(id).open) $(id).close(); });
  }
  function repaintAccounts() {
    var focusKey = document.activeElement?.getAttribute?.('data-workspace-focus');
    renderMyAccounts();
    if (window.RelayWorkspace.renderAccounts) window.RelayWorkspace.renderAccounts();
    renderTeam();
    if (focusKey) document.querySelectorAll('[data-workspace-focus]').forEach(function (element) { if (element.getAttribute('data-workspace-focus') === focusKey) element.focus(); });
  }
  /** @returns {Promise<void>} */
  function loadAccounts() {
    if (accountsRequest) return accountsRequest;
    if ((!memberMode() && !admin()) || !accountApiAvailable) return Promise.resolve();
    var context = authContext();
    state.accountsAt = Date.now(); $('myAccountsRefresh').disabled = true; $('accountsRefresh').disabled = true;
    if (window.RelayWorkspace.renderAccounts) window.RelayWorkspace.renderAccounts();
    message('accountMessage', function () { return t('Updating accounts…'); });
    accountsRequest = (async function () {
      try {
        /** @type {{accounts: TeamAccount[]}} */
        var data = await request('/relaycrew/accounts', undefined, context);
        if (!Array.isArray(data.accounts)) throw presentationError(function () { return t('Invalid accounts response.'); });
        state.accountRows = data.accounts; repaintAccounts();
        message('accountMessage', function () { return ''; });
      } catch (error) {
        if (!currentAuth(context)) return;
        if (admin() && error && typeof error === 'object' && 'status' in error && error.status === 404) {
          accountApiAvailable = false; $('accountsRefresh').hidden = true; $('accountsAdd').hidden = true; state.accountRows = []; repaintAccounts(); message('accountMessage', function () { return ''; });
        } else message('accountMessage', function () { return t('Could not refresh accounts. {error} Use "Refresh" to try again.', { error: errorText(error) }); }, 'error');
      } finally { if (currentAuth(context)) { accountsRequest = null; $('myAccountsRefresh').disabled = false; $('accountsRefresh').disabled = false; } }
    })();
    return accountsRequest;
  }
  /** @param {TeamAccount} account */
  function sharingLabel(account) { return account.sharing === 'private' ? t('Private') : t('Pool'); }
  /** @param {TeamAccount} account */
  function accountActions(account) {
    var actions = node('div', 'button-row');
    var toggle = button(account.disabled ? t('Enable') : t('Disable'), function () { return changeAccount(account, { disabled: !account.disabled }); });
    toggle.setAttribute('aria-label', account.disabled ? t('Enable {account}', { account: account.name }) : t('Disable {account}', { account: account.name }));
    toggle.disabled = state.accountBusy || (memberMode() && account.disabledBy === 'admin');
    if (memberMode() && account.disabledBy === 'admin') toggle.title = t('Disabled by an administrator');
    actions.appendChild(toggle);
    if (memberMode()) {
      var share = button(account.sharing === 'private' ? t('Share with the pool') : t('Make private'), function () { return changeAccount(account, { sharing: account.sharing === 'private' ? 'pool' : 'private' }); });
      share.disabled = state.accountBusy; actions.appendChild(share);
    }
    var remove = button(t('Remove'), function () {
      if (state.accountBusy) return;
      state.removing = account; renderAccountRemoval(); message('accountRemoveError', function () { return ''; }); $('accountRemoveDialog').showModal();
    });
    remove.setAttribute('aria-label', t('Remove {account}', { account: account.name }));
    remove.disabled = state.accountBusy; actions.appendChild(remove);
    actions.querySelectorAll('button').forEach(/** @param {any} control @param {number} index */ function (control, index) { control.setAttribute('data-workspace-focus', JSON.stringify(['account', account.id, index])); });
    return actions;
  }
  /** @param {TeamAccount[]} accounts @param {boolean} owner */
  function accountTable(accounts, owner) {
    var table = node('table', 'owned-accounts'), head = node('thead'), headers = node('tr');
    var labels = [t('Name'), t('Provider')]; if (owner) labels.push(t('Owner'));
    labels.concat([t('Sharing'), t('State'), t('Actions')]).forEach(function (label) { var th = node('th', '', label); th.scope = 'col'; headers.appendChild(th); });
    head.appendChild(headers); table.appendChild(head);
    var body = node('tbody');
    accounts.forEach(function (account) {
      var row = node('tr');
      var values = [account.name, account.provider === 'anthropic' || account.provider === 'claude' ? 'Claude' : account.provider === 'codex' ? 'ChatGPT/Codex' : account.provider === 'grok' ? 'Grok' : account.provider];
      if (owner) values.push(account.owner || '');
      values.push(sharingLabel(account), account.disabledBy === 'admin' ? t('Disabled by an administrator') : account.disabled ? t('Disabled') : t('Enabled'));
      values.forEach(function (value) { row.appendChild(node('td', '', value)); });
      var controls = node('td'); controls.appendChild(accountActions(account)); row.appendChild(controls); body.appendChild(row);
    }); table.appendChild(body); return table;
  }
  function renderMyAccounts() {
    var target = $('myAccountsContent'); target.textContent = '';
    if (!memberMode() || !state.accountRows) return;
    if (!state.accountRows.length) { empty(target, t('No accounts of your own yet'), t('Choose "Add my account" to connect a subscription. You decide whether to keep it private or share it with the pool.')); return; }
    target.appendChild(accountTable(state.accountRows, false));
  }
  /** Called by the fleet card renderer; ownership metadata comes from the account API. @param {WorkspaceAccount} account @param {any} target */
  function accountControls(account, target) {
    if (!admin()) return false;
    if (!state.accountRows) return state.view === 'accounts';
    var matches = state.accountRows.filter(function (entry) { return account.id ? entry.id === account.id : entry.name === account.name && entry.provider === (account.provider || 'anthropic'); });
    if (matches.length > 1) return true;
    var row = matches[0];
    if (!row?.owner) return false;
    target.appendChild(node('span', 'muted', t('Owner: {owner}', { owner: row.owner })));
    target.appendChild(node('span', 'muted', t('Sharing: {sharing}', { sharing: sharingLabel(row) })));
    target.appendChild(accountActions(row)); return true;
  }
  /** @param {TeamAccount} account @param {{disabled?: boolean, sharing?: string}} change */
  async function changeAccount(account, change) {
    if (state.accountBusy || (!memberMode() && !admin())) return;
    var context = authContext(); state.accountBusy = true; repaintAccounts();
    try {
      /** @type {MutationPayload} */
      var data = await request('/relaycrew/accounts/update', Object.assign({ id: account.id }, change), context);
      await refreshAccountChange(data, context);
    } catch (error) { if (currentAuth(context)) message('accountMessage', function () { return errorText(error); }, 'error'); }
    finally { if (currentAuth(context)) { state.accountBusy = false; repaintAccounts(); } }
  }
  /** @param {MutationPayload} data @param {AuthContext} context */
  async function refreshAccountChange(data, context) {
    if (accountsRequest) await accountsRequest;
    requireCurrentAuth(context); await loadAccounts(); requireCurrentAuth(context);
    if (state.view === 'team') await loadTeam();
    requireCurrentAuth(context);
    message('accountMessage', function () { return data.applied === false ? t('Change saved; applying it to the gateway is pending. Reload the configuration. {warning}', { warning: data.warning || '' }) : t('Change applied to the gateway.'); }, data.applied === false ? 'warn' : 'ok');
    if (!memberMode() && window.RelayWorkspace.refresh) window.RelayWorkspace.refresh();
  }
  function renderAccountRemoval() {
    if (state.removing) $('accountRemoveTitle').textContent = t('Remove {account}?', { account: state.removing.name });
  }
  $('accountRemoveConfirm').addEventListener('click', async function () {
    if (!state.removing || state.accountBusy || (!memberMode() && !admin())) return;
    var context = authContext(), account = state.removing;
    state.accountBusy = true; $('accountRemoveConfirm').disabled = true;
    try {
      /** @type {MutationPayload} */
      var data = await request('/relaycrew/accounts/remove', { id: account.id }, context);
      $('accountRemoveDialog').close(); await refreshAccountChange(data, context);
    } catch (error) { if (currentAuth(context)) message('accountRemoveError', function () { return errorText(error); }, 'error'); }
    finally { if (currentAuth(context)) { state.accountBusy = false; $('accountRemoveConfirm').disabled = false; repaintAccounts(); } }
  });
  function resetAccountLogin() {
    state.loginEpoch++; state.login = null; state.loginBusy = false; loginContext = null;
    if (loginTimer !== null) window.clearTimeout(loginTimer); loginTimer = null;
    $('accountLoginCode').value = ''; $('accountLoginUserCode').textContent = ''; $('accountLoginLink').removeAttribute('href');
    message('accountLoginMessage', function () { return ''; }); message('accountLoginError', function () { return ''; });
    renderAccountLogin();
  }
  /** @param {AccountLogin} login @param {AuthContext} context */
  function cancelPendingLogin(login, context) {
    // Cleanup must use the initiating key even when the user is changing keys.
    return fetch('/relaycrew/accounts/login/cancel', { method: 'POST', headers: { 'x-api-key': context.key || '', 'Content-Type': 'application/json' }, cache: 'no-store', body: JSON.stringify({ id: login.id }) }).catch(function () {});
  }
  function cancelAccountLogin() {
    var login = state.login, context = loginContext || authContext();
    resetAccountLogin(); if ($('accountLoginDialog').open) $('accountLoginDialog').close();
    if (login) cancelPendingLogin(login, context);
  }
  function renderAccountLogin() {
    var login = state.login;
    $('accountLoginTitle').textContent = memberMode() ? t('Add my account') : t('Add account');
    $('accountLoginChoices').hidden = !!login; $('accountLoginSteps').hidden = !login;
    $('accountLoginSharingField').hidden = !memberMode(); $('accountLoginOperatorHelp').hidden = memberMode();
    $('accountLoginProvider').disabled = state.loginBusy; $('accountLoginSharing').disabled = state.loginBusy;
    $('accountLoginSharingHelp').textContent = $('accountLoginSharing').value === 'pool' ? t('Team members can use this account when their account permissions allow it.') : t('Only your key can use this account.');
    $('accountLoginSubmit').textContent = login ? t('Connect account') : t('Continue to sign-in');
    $('accountLoginSubmit').disabled = state.loginBusy; $('accountLoginSubmit').hidden = login?.paste === 'none';
    $('accountLoginPaste').hidden = !login || login.paste === 'none'; $('accountLoginCode').required = !!login && login.paste !== 'none';
    $('accountLoginDevice').hidden = login?.paste !== 'none';
    if (!login) return;
    $('accountLoginLink').setAttribute('href', login.url); $('accountLoginLink').setAttribute('target', '_blank'); $('accountLoginLink').setAttribute('rel', 'noopener noreferrer');
    $('accountLoginHelp').textContent = login.paste === 'callback-url' ? t('After sign-in, your browser ends on a localhost page that does not load. Copy its address from the address bar.') : login.paste === 'none' ? t('Open the link and confirm this code on the provider page.') : t('Open the link, sign in, and copy the code shown on the page.');
    $('accountLoginLabel').textContent = login.paste === 'callback-url' ? t('Paste the full address from the address bar') : t('Paste the code the page shows');
    $('accountLoginUserCode').textContent = login.userCode || '';
  }
  /** @param {AccountLogin} login @param {AuthContext} context @param {number} epoch */
  async function completeAccountLogin(login, context, epoch) {
    if (epoch !== state.loginEpoch || !currentAuth(context) || state.loginBusy) return;
    state.loginBusy = true; renderAccountLogin(); message('accountLoginError', function () { return ''; });
    message('accountLoginMessage', function () { return login.paste === 'none' ? t('Waiting for you to confirm the code… You can cancel at any time.') : t('Connecting account…'); });
    try {
      /** @type {{status?: number}} */
      var response = {};
      /** @type {MutationPayload} */
      var data = await request('/relaycrew/accounts/login/complete', login.paste === 'none' ? { id: login.id } : { id: login.id, code: $('accountLoginCode').value.trim() }, context, response);
      if (epoch !== state.loginEpoch) return;
      if (response.status === 202 && login.paste === 'none') {
        loginTimer = window.setTimeout(function () { loginTimer = null; completeAccountLogin(login, context, epoch); }, 2000);
        return;
      }
      resetAccountLogin(); $('accountLoginDialog').close(); await refreshAccountChange(data, context);
    } catch (error) {
      if (!currentAuth(context) || epoch !== state.loginEpoch) return;
      message('accountLoginMessage', function () { return ''; });
      message('accountLoginError', function () { return error && typeof error === 'object' && 'status' in error && error.status === 409 ? t('This account is already in the gateway.') : errorText(error); }, 'error');
    } finally { if (currentAuth(context) && epoch === state.loginEpoch) { state.loginBusy = false; renderAccountLogin(); } }
  }
  $('accountLoginForm').addEventListener('submit', /** @param {WorkspaceEvent} event */ async function (event) {
    event.preventDefault(); if ((!memberMode() && !admin()) || state.loginBusy) return;
    var context = authContext(), epoch = state.loginEpoch;
    if (state.login) { await completeAccountLogin(state.login, context, epoch); return; }
    state.loginBusy = true; renderAccountLogin(); message('accountLoginError', function () { return ''; }); message('accountLoginMessage', function () { return t('Starting sign-in…'); });
    try {
      /** @type {{login: AccountLogin}} */
      var data = await request('/relaycrew/accounts/login', { provider: $('accountLoginProvider').value, sharing: $('accountLoginSharing').value }, context);
      if (epoch !== state.loginEpoch) { cancelPendingLogin(data.login, context); return; }
      state.login = data.login; loginContext = context; state.loginBusy = false; renderAccountLogin(); message('accountLoginMessage', function () { return ''; });
      if (data.login.paste !== 'none') $('accountLoginCode').focus();
    } catch (error) {
      if (!currentAuth(context) || epoch !== state.loginEpoch) return;
      message('accountLoginMessage', function () { return ''; }); message('accountLoginError', function () { return errorText(error); }, 'error');
    } finally { if (currentAuth(context) && epoch === state.loginEpoch) { state.loginBusy = false; renderAccountLogin(); } }
    if (currentAuth(context) && epoch === state.loginEpoch && state.login?.paste === 'none') completeAccountLogin(state.login, context, epoch);
  });
  ['accountAdd', 'accountsAdd'].forEach(function (id) { $(id).addEventListener('click', function () {
    if (!memberMode() && !admin()) return;
    resetAccountLogin(); $('accountLoginProvider').value = 'claude'; $('accountLoginSharing').value = 'private'; renderAccountLogin(); $('accountLoginDialog').showModal();
  }); });
  $('myAccountsRefresh').addEventListener('click', loadAccounts);
  $('accountsRefresh').addEventListener('click', loadAccounts);
  $('accountLoginSharing').addEventListener('change', renderAccountLogin);
  ['accountLoginCancel', 'accountLoginClose'].forEach(function (id) { $(id).addEventListener('click', cancelAccountLogin); });
  $('accountLoginDialog').addEventListener('cancel', /** @param {WorkspaceEvent} event */ function (event) { event.preventDefault(); cancelAccountLogin(); });
  $('accountRemoveDialog').addEventListener('cancel', /** @param {WorkspaceEvent} event */ function (event) { if (state.accountBusy) event.preventDefault(); });
  $('accountRemoveDialog').addEventListener('close', function () { state.removing = null; });
  /** @param {string} tag @param {Record<string, string|number>} attrs @returns {any} */
  function svgElement(tag, attrs) {
    var element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (key) { element.setAttribute(key, String(attrs[key])); }); return element;
  }
  /** @param {string|number} at @param {boolean} date */
  function timeLabel(at, date) {
    return i18n.date(at, date ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit' });
  }
  /** @param {any} target @param {HistoryPayload} data @param {boolean} interactive @param {string} scope */
  function chart(target, data, interactive, scope) {
    target.textContent = '';
    if (!data.total.some(function (value) { return value > 0; })) {
      empty(target, t("No usage recorded in this period"), t("History starts with observed activity. Old totals are not converted into samples.")); return;
    }
    var plot = svgElement('svg', { viewBox: '0 0 1000 180', class: 'history-svg', role: interactive ? 'group' : 'img', 'aria-label': interactive ? t("Activity by interval. The table below contains the same values.") : t("Requests by interval. Explore Usage to see all values.") });
    var max = Math.max.apply(null, data.total.concat([1]));
    [0, 0.5, 1].forEach(function (fraction) {
      var y = 160 - fraction * 145;
      plot.appendChild(svgElement('line', { x1: 45, x2: 995, y1: y, y2: y, stroke: 'var(--line)', 'stroke-width': 1 }));
      var label = svgElement('text', { x: 0, y: y + 4, fill: 'var(--dim)', 'font-size': 10 }); label.textContent = number(Math.round(max * fraction)); plot.appendChild(label);
    });
    data.buckets.forEach(function (at, index) {
      var width = 950 / data.buckets.length, x = 45 + width * index, y = 160;
      var group = svgElement('g', interactive ? { 'data-workspace-focus': JSON.stringify(['bucket', scope, at]), role: 'button', tabindex: 0, 'aria-label': t('{time}: {count}. Filter distribution.', { time: timeLabel(at, true), count: number(data.total[index]) }), 'aria-pressed': state.selected === index ? 'true' : 'false' } : {});
      group.appendChild(svgElement('rect', { x: x, y: 10, width: Math.max(width - 1, 1), height: 151, fill: 'transparent' }));
      data.series.forEach(function (series) {
        var height = series.values[index] / max * 145; y -= height;
        var rect = svgElement('rect', { x: x + 1, y: y, width: Math.max(width - 2, 1), height: height, rx: 1 });
        bindSeriesColor(rect, scope, series.key, 'fill'); group.appendChild(rect);
      });
      var title = svgElement('title', {}); title.textContent = timeLabel(at, true) + ' · ' + number(data.total[index]); group.appendChild(title);
      if (interactive) {
        var select = function () { state.selected = state.selected === index ? null : index; renderHistory(); };
        group.addEventListener('click', select);
        group.addEventListener('keydown', /** @param {WorkspaceEvent} event */ function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } });
      }
      plot.appendChild(group);
    });
    target.appendChild(plot);
    var labels = node('div', 'chart-labels');
    [data.buckets[0], data.buckets[Math.floor(data.buckets.length / 2)], data.buckets[data.buckets.length - 1]].forEach(function (at) { if (at) labels.appendChild(node('span', '', timeLabel(at, true))); });
    target.appendChild(labels);
    var legend = node('div', 'legend'); data.series.forEach(function (series) { legend.appendChild(legendEntry(scope, series)); }); target.appendChild(legend);
    if (interactive) target.appendChild(node('p', 'chart-caption', t("Select an interval to see its distribution. Times use this browser's time zone.")));
  }
  async function loadPreview() {
    if (!admin()) { previewNotice = function () { empty($('overviewHistory'), t("History available to administrators"), adminMessage()); }; renderPreview(); return; }
    state.previewAt = Date.now(); var seq = ++state.previewSeq, context = authContext();
    if (!state.preview) { previewNotice = function () { $('overviewHistory').textContent = t("Loading recorded activity…"); }; renderPreview(); }
    try {
      var data = await request(helpers.historyPath('clients', '24h', '1h', 'requests'), undefined, context);
      if (!currentAuth(context) || seq !== state.previewSeq) return;
      if (!helpers.validHistory(data)) throw presentationError(function () { return t("History returned inconsistent values."); });
      state.preview = data; previewNotice = null; renderPreview();
    } catch (error) {
      if (currentAuth(context) && seq === state.previewSeq) {
        previewNotice = function () { empty($('overviewHistory'), t("Could not update history"), t('{error} Open Usage to try again.', { error: errorText(error) })); }; renderPreview();
      }
    }
  }
  function renderPreview() {
    if (previewNotice) { previewNotice(); return; }
    if (!state.preview) return;
    chart($('overviewHistory'), state.preview, false, 'clients');
    $('overviewHistory').appendChild(node('p', 'coverage-note', t("Requests by client · recorded activity only · edge intervals may be incomplete. Explore Usage to see the table and metrics.")));
  }
  function selection() { return { scope: $('historyScope').value, window: $('historyWindow').value, metric: $('historyMetric').value, step: $('historyStep').value }; }
  /** @param {boolean} [force] */
  async function loadHistory(force) {
    var choice = selection();
    $('historyRefresh').disabled = false;
    $('stepLabel').hidden = choice.window === 'total'; $('historyDetails').hidden = choice.window === 'total';
    if (choice.window === 'total') {
      state.historySeq++; state.historyAt = Date.now(); state.history = null; state.selected = null;
      $('historyChart').textContent = ''; $('historyTable').textContent = '';
      message('historyMessage', function () { return t("Cumulative total from available records. This view has no timeline."); }); renderHistory(); return;
    }
    if (choice.metric === 'connections') {
      state.historySeq++; state.history = null; state.historyAt = Date.now();
      $('historyChart').textContent = ''; $('historyTable').textContent = ''; $('historyDistribution').textContent = '';
      message('historyMessage', function () { return t("History does not record WebSocket connections by interval. Select \"Cumulative total\" to see this counter."); }, 'warn'); return;
    }
    if (!admin()) {
      state.historySeq++; state.history = null; state.historyAt = Date.now();
      $('historyChart').textContent = ''; $('historyTable').textContent = ''; $('historyDistribution').textContent = '';
      message('historyMessage', function () { return adminMessage(); }, 'warn'); return;
    }
    var seq = ++state.historySeq, context = authContext(); state.historyAt = Date.now();
    if (force) { state.selected = null; state.history = null; $('historyChart').textContent = ''; $('historyDistribution').textContent = ''; $('historyTable').textContent = ''; }
    message('historyMessage', function () { return t("Updating recorded activity…"); }); $('historyRefresh').disabled = true;
    try {
      const data = await request(helpers.historyPath(choice.scope, choice.window, choice.step, choice.metric), undefined, context);
      if (!currentAuth(context) || seq !== state.historySeq) return;
      if (!helpers.validHistory(data)) throw presentationError(function () { return t("History returned inconsistent values."); });
      state.history = data;
      message('historyMessage', function () { return t('{count} {metric} in the period · updated at {time}', { count: number(data.total.reduce(function (sum, value) { return sum + value; }, 0)), metric: $('historyMetric').selectedOptions[0].textContent.toLocaleLowerCase(i18n.locale()), time: i18n.date(state.historyAt, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }); });
      renderHistory();
    } catch (error) {
      if (!currentAuth(context) || seq !== state.historySeq) return;
      message('historyMessage', function () { return t('Update failed. {error}{stale} Use "Refresh" to try again.', { error: errorText(error), stale: state.history ? ' ' + t('The chart shows the last response received.') : '' }); }, 'error');
    } finally { if (currentAuth(context) && seq === state.historySeq) $('historyRefresh').disabled = false; }
  }
  function renderHistory() {
    var choice = selection(), data = state.history;
    var rows = choice.window === 'total' ? helpers.workspaceDistribution(state.status, choice.scope, 'total', choice.metric) : helpers.historyDistribution(data, state.selected);
    $('clearBucket').hidden = state.selected === null;
    $('distributionTitle').textContent = state.selected !== null && data ? t('Distribution · {time}', { time: timeLabel(data.buckets[state.selected], true) }) : choice.window === 'total' ? t("Cumulative distribution") : t("Distribution in period");
    if (data) { chart($('historyChart'), data, true, choice.scope); renderHistoryTable(data); }
    renderDistribution(rows);
  }
  /** @param {DistributionRow[]} rows */
  function renderDistribution(rows) {
    var target = $('historyDistribution'); target.textContent = '';
    if (!rows.length) { empty(target, t("No attributed usage"), t("Usage will appear when clients send identified traffic to the gateway.")); return; }
    rows = rows.slice().sort(function (a, b) { return state.distributionDir * (state.distributionSort === 'key' ? a.key.localeCompare(b.key) : a.value - b.value); });
    var total = rows.reduce(function (sum, row) { return sum + row.value; }, 0), max = Math.max.apply(null, rows.map(function (row) { return row.value; }).concat([1]));
    var controls = node('div', 'section-heading');
    ['key', 'value'].forEach(function (sort) {
      var control = button((sort === 'key' ? t("Name") : t('Usage')) + (state.distributionSort === sort ? state.distributionDir < 0 ? ' ↓' : ' ↑' : ' ↕'), function () {
        state.distributionDir = state.distributionSort === sort ? -state.distributionDir : sort === 'key' ? 1 : -1; state.distributionSort = sort; renderDistribution(rows);
      }); control.setAttribute('data-workspace-focus', 'distribution-' + sort); control.setAttribute('aria-label', sort === 'key' ? t('Sort by name') : t('Sort by usage')); controls.appendChild(control);
    }); target.appendChild(controls);
    var list = node('div', 'distribution');
    var scope = selection().scope;
    rows.forEach(function (row) {
      var line = node('div', 'distribution-line');
      line.appendChild(node('span', 'distribution-label', row.key === '(remaining)' ? t("Remaining") : row.key));
      var bar = node('div', 'bar'), fill = node('i'); fill.style.width = (row.value / max * 100) + '%'; bindSeriesColor(fill, scope, row.key, 'background'); bar.appendChild(fill); bar.setAttribute('aria-hidden', 'true'); line.appendChild(bar);
      var amount = node('strong', '', number(row.value)); amount.title = total ? t('{percent} of the period', { percent: i18n.number(row.value / total, { style: 'percent', maximumFractionDigits: 1 }) }) : t("No usage recorded"); line.appendChild(amount); list.appendChild(line);
    }); target.appendChild(list);
    target.appendChild(node('p', 'chart-caption', t('Total: {count} · {groups} groups · each dimension represents the same traffic by another criterion.', { count: number(total), groups: number(rows.length) })));
  }
  /** @param {HistoryPayload} data */
  function renderHistoryTable(data) {
    var target = $('historyTable'); target.textContent = '';
    var table = node('table'), caption = node('caption', 'chart-caption', t('Recorded activity by interval · {metric}', { metric: $('historyMetric').selectedOptions[0].textContent })); table.appendChild(caption);
    var head = node('thead'), headers = node('tr');
    [t("Interval"), t("Total")].concat(data.series.map(function (series) { return series.key === '(remaining)' ? t('Remaining') : series.key; })).forEach(function (title) { var th = node('th', '', title); th.scope = 'col'; headers.appendChild(th); }); head.appendChild(headers); table.appendChild(head);
    var body = node('tbody'); data.buckets.forEach(function (at, index) {
      var row = node('tr'); var label = node('th', '', timeLabel(at, true)); label.scope = 'row'; row.appendChild(label);
      [data.total[index]].concat(data.series.map(function (series) { return series.values[index]; })).forEach(function (value) { row.appendChild(node('td', 'num', number(value))); }); body.appendChild(row);
    }); table.appendChild(body); target.appendChild(table);
  }
  /** @returns {Promise<void>} */
  function loadTeam() {
    if (teamRequest) return teamRequest;
    $('teamAdd').disabled = true;
    if (!admin()) { state.team = null; $('teamContent').textContent = ''; message('teamMessage', function () { return adminMessage(); }, 'warn'); return Promise.resolve(); }
    var context = authContext();
    state.teamAt = Date.now(); $('teamRefresh').disabled = true;
    message('teamMessage', function () { return t("Updating members…"); });
    teamRequest = (async function () {
      try {
        /** @type {TeamPayload} */
        var data = await request('/relaycrew/team', undefined, context);
        if (!currentAuth(context) || !admin()) return;
        if (!Array.isArray(data.members) || !Array.isArray(data.accounts) || typeof data.revision !== 'string') throw presentationError(function () { return t("Invalid team response."); });
        state.team = data; renderTeam();
        message('teamMessage', function () { return data.enabled ? t("Permissions apply to the accounts identified below. Member names are permanent.") : t("Team mode is disabled. Enable it in the configuration file and reload the gateway."); }, data.enabled ? '' : 'warn');
        $('teamAdd').disabled = !data.enabled;
      } catch (error) {
        if (!currentAuth(context)) return;
        message('teamMessage', function () { return t('Update failed. {error}{stale}', { error: errorText(error), stale: state.team ? ' ' + t('The list may be outdated; changes are unavailable until you refresh.') : '' }); }, 'error'); state.team = null; renderTeam();
      } finally { if (currentAuth(context)) { teamRequest = null; $('teamRefresh').disabled = false; } }
    })();
    return teamRequest;
  }
  function renderTeam() {
    var target = $('teamContent'); target.textContent = '';
    const team = state.team;
    if (!team) return;
    if (!team.members.length) empty(target, t("A team starts with its first access"), t("Add a member, choose their accounts, and share the individual key securely."));
    /** @type {Record<string, string>} */
    var accounts = Object.create(null); team.accounts.forEach(function (account) { accounts[account.id] = account.name; });
    var table = node('table'), head = node('thead'), hr = node('tr');
    [t("Member"), t("Allowed accounts"), t("Concurrency"), t("Requests"), t("Input / output tokens"), t("Last used"), t("Access"), t("Actions")].forEach(function (label) { var th = node('th', '', label); th.scope = 'col'; hr.appendChild(th); }); head.appendChild(hr); table.appendChild(head);
    var body = node('tbody'); team.members.forEach(function (member) {
      var row = node('tr'), usage = member.usage || {};
      [member.name, member.accounts === '*' ? t("All · current and future") : member.accounts.length ? member.accounts.map(function (id) { return accounts[id] || id; }).join(', ') : ownsAccounts(member.name) ? t('Own accounts only') : t("No inference access"), number(member.active) + ' / ' + number(member.maxConcurrent), number(usage.requests), number(usage.inputTokens) + ' / ' + number(usage.outputTokens), usage.lastUsed ? timeLabel(usage.lastUsed, true) : t("Not used yet"), member.disabled ? t("Disabled") : t("Active")].forEach(function (value) { row.appendChild(node('td', '', value)); });
      var actions = node('td'), buttons = node('div', 'button-row');
      buttons.appendChild(button(t("Edit"), function () { openMember(member); }));
      buttons.appendChild(button(t("Rotate key"), function () { confirmMember(member, 'rotate'); }));
      buttons.appendChild(button(t("Revoke"), function () { confirmMember(member, 'revoke'); }));
      buttons.querySelectorAll('button').forEach(/** @param {any} control @param {number} index */ function (control, index) { control.setAttribute('data-workspace-focus', JSON.stringify(['member', member.name, index])); });
      if (!team.enabled) buttons.querySelectorAll('button').forEach(/** @param {any} control */ function (control) { control.disabled = true; });
      actions.appendChild(buttons); row.appendChild(actions); body.appendChild(row);
    }); table.appendChild(body); if (team.members.length) target.appendChild(table);
    var owned = team.accounts.filter(function (account) { return !!account.owner; });
    if (owned.length) { target.appendChild(node('h3', 'distribution-heading', t('Member-owned accounts'))); target.appendChild(accountTable(owned, true)); }
  }
  /** @param {TeamMember|null} member */
  function openMember(member) {
    const team = state.team;
    if (!team?.enabled || !admin()) return;
    state.editing = member ? member.name : null; state.editRevision = team.revision;
    $('memberForm').reset(); $('memberName').value = member ? member.name : ''; $('memberName').readOnly = !!member;
    $('memberLimit').value = member ? member.maxConcurrent : 4; $('memberAll').checked = !!member && member.accounts === '*';
    $('memberDisabled').checked = !!member?.disabled; $('memberDisabledWrap').hidden = !member;
    $('memberTitle').textContent = member ? t('Edit {name}', { name: member.name }) : t("Add member"); $('memberSave').textContent = member ? t("Save permissions") : t("Create member and key");
    var choices = $('memberAccounts'); choices.textContent = ''; memberLabels = [];
    team.accounts.forEach(function (account) {
      if (account.owner && account.sharing === 'private' && account.owner !== member?.name) return;
      var label = node('label', 'check-line'), input = node('input'); input.type = 'checkbox'; input.value = account.id; input.addEventListener('change', toggleAccounts);
      input.checked = !!member && Array.isArray(member.accounts) && member.accounts.indexOf(account.id) >= 0;
      label.appendChild(input); label.appendChild(memberLabel(function () { return account.disabled ? t('{account} · {provider} · disabled', { account: account.name, provider: account.provider }) : account.name + ' · ' + account.provider; })); choices.appendChild(label);
    });
    if (member && Array.isArray(member.accounts)) member.accounts.forEach(function (id) {
      if (team.accounts.some(function (account) { return account.id === id; })) return;
      var label = node('label', 'check-line'), input = node('input'); input.type = 'checkbox'; input.value = id; input.checked = true; input.addEventListener('change', toggleAccounts);
      label.appendChild(input); label.appendChild(memberLabel(function () { return t('{account} · missing account', { account: id }); })); choices.appendChild(label);
    });
    if (!choices.children.length) choices.appendChild(node('p', 'muted', t("No accounts configured. Add accounts with the CLI or explicitly choose all future accounts.")));
    toggleAccounts(); $('memberDialog').showModal();
  }
  /** @param {() => string} render */
  function memberLabel(render) { var element = node('span', '', render()); memberLabels.push({ element: element, render: render }); return element; }
  /** @param {string|null} name @param {TeamPayload|null} [team] */
  function ownsAccounts(name, team = state.team) { return !!name && !!team?.accounts.some(function (account) { return account.owner === name; }); }
  function renderMemberLabels() {
    $('memberTitle').textContent = state.editing ? t('Edit {name}', { name: state.editing }) : t('Add member');
    $('memberSave').textContent = state.editing ? t('Save permissions') : t('Create member and key');
    memberLabels.forEach(function (label) { label.element.textContent = label.render(); });
  }
  function toggleAccounts() {
    $('memberAccounts').querySelectorAll('input').forEach(/** @param {any} input */ function (input) { input.disabled = $('memberAll').checked; });
    message('memberError', function () { return !$('memberAll').checked && !$('memberAccounts').querySelectorAll('input:checked').length ? ownsAccounts(state.editing) ? t('No additional accounts selected. This member can still use their own accounts.') : t("No inference access: this member cannot send requests until assigned an account.") : ''; }, 'warn');
  }
  /** @param {MutationPayload} data @param {AuthContext} context */
  function revealKey(data, context) {
    if (!currentAuth(context) || !data.issuedKey) return;
    $('issuedKey').value = data.issuedKey;
    message('issuedMessage', function () { return data.applied === false ? t('The key was saved, but applying it to the gateway failed. Save the key and reload the configuration. {warning}', { warning: data.warning || '' }) : t("The key is ready to use."); });
    delete data.issuedKey; $('issuedDialog').showModal();
  }
  /** @param {'add'|'update'|MemberAction} action @param {MemberPayload} payload @param {string|null} revision @param {AuthContext} context @returns {Promise<MutationPayload>} */
  async function mutate(action, payload, revision, context) {
    requireCurrentAuth(context);
    if (!admin() || !state.team?.enabled) throw presentationError(function () { return adminMessage(); });
    if (!revision) throw presentationError(function () { return t("Refresh the team and reopen the action to review permissions."); });
    /** @type {MutationPayload} */
    var data = await request('/relaycrew/team/' + action, Object.assign({ revision: revision }, payload), context);
    requireCurrentAuth(context);
    if (state.team && typeof data.revision === 'string') state.team.revision = data.revision;
    return data;
  }
  /** @param {string} name @param {TeamPayload|null} [team] */
  function serverPolicy(name, team = state.team) {
    if (!team) return t("Could not read the current policy. Refresh the team before trying again.");
    var member = team.members.find(function (entry) { return entry.name === name; });
    if (!member) return t('Current server policy: member "{name}" does not exist.', { name: name });
    var grants = member.accounts === '*' ? t("all current and future accounts") : !member.accounts.length ? ownsAccounts(member.name, team) ? t('Own accounts only') : t("no inference access") : member.accounts.map(function (id) {
      var account = team.accounts.find(function (entry) { return entry.id === id; }); return account ? account.name + ' (' + id + ')' : t('{account} (missing account)', { account: id });
    }).join(', ');
    return t('Current server policy for "{name}": {grants}; limit {limit}; {status}.', { name: name, grants: grants, limit: number(member.maxConcurrent), status: member.disabled ? t('disabled') : t('active') });
  }
  /** @param {unknown} error @param {string} target @param {string} name @param {AuthContext} context */
  async function conflictMessage(error, target, name, context) {
    if (!currentAuth(context)) return;
    if (error && typeof error === 'object' && 'status' in error && error.status === 409) {
      if (teamRequest) await teamRequest;
      if (!currentAuth(context)) return;
      await loadTeam();
      if (!currentAuth(context)) return;
      if (target === 'memberError') state.editRevision = state.team?.revision || null;
      else if (state.action) state.action.revision = state.team?.revision || null;
      var reviewedTeam = state.team;
      message(target, function () { return t('Configuration changed. Your draft was kept. {policy} Review permissions and save again to use the current revision.', { policy: serverPolicy(name, reviewedTeam) }); }, 'warn');
    } else message(target, function () { return t('{error} The operation is not retried automatically. If the connection dropped, check the list before trying again.', { error: errorText(error) }); }, 'error');
  }
  $('memberForm').addEventListener('submit', /** @param {WorkspaceEvent} event */ async function (event) {
    event.preventDefault(); if (state.submitting) return;
    /** @type {'*'|string[]} */
    var accounts = $('memberAll').checked ? '*' : Array.from($('memberAccounts').querySelectorAll('input:checked')).map(/** @param {any} input */ function (input) { return input.value; });
    var limit = Number($('memberLimit').value);
    if (!Number.isInteger(limit) || limit < 1) { message('memberError', function () { return t("Choose an integer limit greater than zero."); }, 'error'); return; }
    /** @type {MemberPayload} */
    var payload = { name: state.editing || $('memberName').value.trim(), accounts: accounts, maxConcurrent: limit };
    if (state.editing) payload.disabled = $('memberDisabled').checked;
    if (!payload.name) { message('memberError', function () { return t("Enter the member's name."); }, 'error'); return; }
    var context = authContext();
    state.submitting = true; $('memberSave').disabled = true; message('memberError', function () { return t("Saving…"); });
    try {
      var data = await mutate(state.editing ? 'update' : 'add', payload, state.editRevision, context);
      if (!currentAuth(context)) return;
      $('memberDialog').close(); revealKey(data, context); await loadTeam();
      if (!currentAuth(context)) return;
      message('teamMessage', function () { return data.applied === false ? t('Change saved; applying it to the gateway is pending. Reload the configuration. {warning}', { warning: data.warning || '' }) : t("Access saved and applied to the gateway."); }, data.applied === false ? 'warn' : 'ok');
    } catch (error) { await conflictMessage(error, 'memberError', payload.name, context); }
    finally { if (currentAuth(context)) { state.submitting = false; $('memberSave').disabled = false; } }
  });
  /** @param {TeamMember} member @param {MemberAction} action */
  function confirmMember(member, action) {
    if (!state.team?.enabled || !admin()) return;
    state.action = { name: member.name, action: action, revision: state.team.revision };
    renderConfirmation(); message('confirmError', function () { return ''; }); $('confirmDialog').showModal();
  }
  function renderConfirmation() {
    if (!state.action) return;
    var action = state.action.action, member = { name: state.action.name };
    $('confirmTitle').textContent = action === 'rotate' ? t('Rotate key for {name}?', { name: member.name }) : t('Revoke access for {name}?', { name: member.name });
    $('confirmText').textContent = action === 'rotate' ? t("The previous key stops working and affected traffic will be interrupted. A new key will be shown only once.") : t("This disables the member's access. Their key stops working and affected traffic will be interrupted. The record is kept and can be reactivated in Edit.");
    $('confirmAction').textContent = action === 'rotate' ? t("Rotate key now") : t("Revoke access now");
  }
  $('confirmAction').addEventListener('click', async function () {
    if (!state.action || state.submitting) return;
    var context = authContext(), action = state.action;
    state.submitting = true; $('confirmAction').disabled = true; message('confirmError', function () { return t("Applying change…"); });
    try {
      var data = await mutate(action.action, { name: action.name }, action.revision, context);
      if (!currentAuth(context)) return;
      $('confirmDialog').close(); revealKey(data, context); await loadTeam();
      if (!currentAuth(context)) return;
      message('teamMessage', function () { return data.applied === false ? t('Change saved; applying it to the gateway is pending. Reload the configuration. {warning}', { warning: data.warning || '' }) : t("Change applied to the gateway."); }, data.applied === false ? 'warn' : 'ok');
    } catch (error) { await conflictMessage(error, 'confirmError', action.name, context); }
    finally { if (currentAuth(context)) { state.submitting = false; $('confirmAction').disabled = false; } }
  });
  $('copyKey').addEventListener('click', async function () {
    var context = authContext(), secret = $('issuedKey').value;
    if (!secret || !$('issuedDialog').open) return;
    try {
      if (!window.navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await window.navigator.clipboard.writeText(secret);
      if (!currentAuth(context) || !$('issuedDialog').open || $('issuedKey').value !== secret) return;
      message('issuedMessage', function () { return t("Key copied. Save it before closing."); }, 'ok');
    } catch { if (!currentAuth(context) || !$('issuedDialog').open || $('issuedKey').value !== secret) return; $('issuedKey').focus(); $('issuedKey').select(); message('issuedMessage', function () { return t("Automatic copy unavailable. The key is selected: use Ctrl+C or ⌘C."); }); }
  });
  document.querySelectorAll('[data-close]').forEach(function (control) {
    control.addEventListener('click', function () { if (!state.submitting && !(control.getAttribute('data-close') === 'accountRemoveDialog' && state.accountBusy)) $(control.getAttribute('data-close')).close(); });
  });
  ['memberDialog', 'confirmDialog'].forEach(function (id) { $(id).addEventListener('cancel', /** @param {WorkspaceEvent} event */ function (event) { if (state.submitting) event.preventDefault(); }); });
  $('issuedDialog').addEventListener('close', function () { $('issuedKey').value = ''; $('issuedKey').textContent = ''; message('issuedMessage', function () { return ''; }); });
  $('memberDialog').addEventListener('close', function () { $('memberForm').reset(); $('memberAccounts').textContent = ''; state.editing = null; state.editRevision = null; });
  $('confirmDialog').addEventListener('close', function () { state.action = null; });
  $('sessionPinForm').addEventListener('submit', /** @param {WorkspaceEvent} event */ async function (event) {
    event.preventDefault(); if ($('pinSave').disabled) return;
    var session = $('pinSession').value.trim(), account = $('pinAccount').value;
    if (!session || !account) return;
    var context = authContext();
    $('pinSave').disabled = true; await savePin(session, account); if (currentAuth(context)) $('pinSave').disabled = !admin();
  });
  $('memberAll').addEventListener('change', toggleAccounts);
  $('teamAdd').addEventListener('click', function () { openMember(null); }); $('teamRefresh').addEventListener('click', loadTeam);
  ['historyWindow', 'historyScope', 'historyMetric', 'historyStep'].forEach(function (id) { $(id).addEventListener('change', function () { loadHistory(true); }); });
  $('historyRefresh').addEventListener('click', function () { loadHistory(); });
  $('clearBucket').addEventListener('click', function () { state.selected = null; renderHistory(); });
  function refreshPresentation() {
    var active = document.activeElement;
    var focusKey = active?.getAttribute?.('data-workspace-focus');
    renderViewTitle();
    if (state.status && !memberMode()) updateOverview(state.status);
    if (connectionFailure !== null) {
      $('connection').textContent = state.lastGood ? t('Not updating · showing the last status') : t('No connection to the gateway');
    } else if (state.lastGood) {
      $('connection').textContent = t('Updated at {time}', { time: i18n.date(state.lastGood, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) });
    }
    $('historyScope').querySelectorAll('option').forEach(/** @param {any} option */ function (option) { if (option.value === 'clients') option.textContent = t('Clients'); });
    renderPreview(); renderHistory(); renderTeam(); renderMemberLabels(); renderConfirmation(); renderMyAccounts(); renderAccountLogin(); renderAccountRemoval();
    Object.keys(notices).forEach(function (id) { $(id).textContent = notices[id](); });
    if (focusKey) document.querySelectorAll('[data-workspace-focus]').forEach(function (element) { if (element.getAttribute('data-workspace-focus') === focusKey) element.focus(); });
  }
  i18n.onChange(refreshPresentation);
  window.addEventListener('hashchange', navigate);
  window.RelayWorkspace = { update: update, failed: failed, signedOut: signedOut, accountControls: accountControls };
  navigate();
}

export const WORKSPACE_SCRIPT = '(' + bootWorkspace.toString() + ')(document,window,fetch,window.RelayStorage,{' +
  [workspaceDistribution, historyDistribution, validHistory, workspaceAdmin, historyPath, createSeriesColors].map(fn => fn.name + ':' + fn.toString()).join(',') + '},window.RelayI18n);';
