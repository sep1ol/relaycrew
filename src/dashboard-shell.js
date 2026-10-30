export const WORKSPACE_HTML = `
<a class="skip" href="#workspaceMain" data-i18n="Skip to content">Skip to content</a>
<main id="workspaceFrame">
  <div id="keybox" class="login-panel">
    <div class="brandmark" aria-hidden="true">↗</div><h1>RelayCrew</h1>
    <p class="sub" data-i18n="Connect your team. Track every account.">Connect your team. Track every account.</p>
    <label for="key" data-i18n="Proxy key">Proxy key</label><input id="key" type="password" placeholder="Your access key" autocomplete="off" data-i18n-placeholder="Your access key">
    <label class="language-control"><span data-i18n="Language">Language</span><select id="loginLanguage" data-locale-picker aria-label="Language" data-i18n-aria-label="Language"><option value="en">English</option><option value="pt-BR">Português (Brasil)</option><option value="es">Español</option></select></label>
    <button id="go" type="button" data-i18n="Connect">Connect</button>
    <p class="muted" data-i18n="The key stays in this browser. Use an administrator key to manage the team.">The key stays in this browser. Use an administrator key to manage the team.</p>
  </div>
  <div id="app" style="display:none">
    <aside class="sidebar">
      <a class="brand" href="#overview"><span class="brandmark" aria-hidden="true">↗</span><span>RelayCrew<small data-i18n="WORKSPACE">WORKSPACE</small></span></a>
      <div class="nav-caption" data-i18n="Your gateway at a glance">Your gateway at a glance</div>
      <label class="language-control"><span data-i18n="Language">Language</span><select id="language" data-locale-picker aria-label="Language" data-i18n-aria-label="Language"><option value="en">English</option><option value="pt-BR">Português (Brasil)</option><option value="es">Español</option></select></label>
      <nav aria-label="Main navigation" data-i18n-aria-label="Main navigation">
        <a href="#my-accounts" data-view="my-accounts" hidden><span data-i18n="My accounts">My accounts</span></a>
        <a href="#overview" data-view="overview"><span aria-hidden="true">◫</span><span data-i18n="Overview">Overview</span></a>
        <a href="#accounts" data-view="accounts"><span aria-hidden="true">▤</span><span data-i18n="Accounts">Accounts</span></a>
        <a href="#team" data-view="team"><span aria-hidden="true">♧</span><span data-i18n="Team">Team</span></a>
        <a href="#usage" data-view="usage"><span aria-hidden="true">▥</span><span data-i18n="Usage">Usage</span></a>
        <a href="#sessions" data-view="sessions"><span aria-hidden="true">⇄</span><span data-i18n="Sessions">Sessions</span></a>
        <a href="#settings" data-view="settings"><span aria-hidden="true">⚙</span><span data-i18n="Settings">Settings</span></a>
      </nav>
      <div class="sidebar-note"><span class="status-dot"></span><span data-i18n="Your team&#x27;s infrastructure">Your team's infrastructure</span><p><span data-i18n="One entry point.">One entry point.</span><br><span data-i18n="Accounts under your control.">Accounts under your control.</span></p></div>
    </aside>
    <div class="workspace-body" id="workspaceMain" tabindex="-1">
      <header class="workspace-header"><div class="breadcrumb"><span data-i18n="Workspace">Workspace</span><span class="crumb-separator">/</span> <b id="viewCrumb" data-i18n="Overview">Overview</b></div><div class="header-actions"><span id="connection" role="status" data-i18n="Connecting…">Connecting…</span><button id="theme" type="button" title="Cycle between system, light, and dark themes" data-i18n-title="Cycle between system, light, and dark themes"></button><button id="changeKey" type="button" data-i18n="Change key">Change key</button></div></header>
      <div class="page-heading"><div><p class="eyebrow" id="viewEyebrow" data-i18n="GATEWAY CONTROL">GATEWAY CONTROL</p><h1 id="viewTitle" data-i18n="Overview">Overview</h1><p id="viewDescription" class="muted" data-i18n="Accounts, conversations, and usage in one place.">Accounts, conversations, and usage in one place.</p></div><span class="gateway-pill"><span class="status-dot"></span><span data-i18n="RelayCrew gateway">RelayCrew gateway</span></span></div>
      <p id="previewLabel" class="notice" hidden data-i18n="Local demo environment. Accounts, members, and history use synthetic data.">Local demo environment. Accounts, members, and history use synthetic data.</p><p class="sub" id="summary"></p>
      <div id="err" role="alert"></div><div id="note" role="status"></div>
      <div id="caller" style="display:none"><span id="callerText"></span></div>
      <p id="accountMessage" class="notice" role="status" hidden></p>
      <section data-panel="my-accounts" hidden aria-label="My accounts" data-i18n-aria-label="My accounts"><section class="surface"><div class="section-heading"><h2 data-i18n="Your provider accounts">Your provider accounts</h2><div class="button-row"><button id="myAccountsRefresh" type="button" data-i18n="Refresh">Refresh</button><button id="accountAdd" class="primary" type="button" data-i18n="Add my account">Add my account</button></div></div><div id="myAccountsContent" class="table-scroll"></div></section></section>
      <section data-panel="overview" aria-label="Overview" data-i18n-aria-label="Overview">
        <div class="overview-wash"><div class="overview-intro"><p class="eyebrow" data-i18n="TEAM OPERATIONS">TEAM OPERATIONS</p><h2><span data-i18n="Control access.">Control access.</span><br><span data-i18n="Track usage.">Track usage.</span></h2><p id="overviewLead" data-i18n="Waiting for the first gateway status.">Waiting for the first gateway status.</p><a class="text-link" href="#accounts" data-i18n="View accounts and availability ↗">View accounts and availability ↗</a></div><div id="overviewStats" class="overview-stats"></div></div>
        <div class="overview-grid"><section class="surface"><div class="section-heading"><h2 data-i18n="Availability by provider">Availability by provider</h2><a href="#accounts" data-i18n="View accounts ↗">View accounts ↗</a></div><div id="providerSummary"></div></section><section class="surface"><div class="section-heading"><h2 data-i18n="Needs attention">Needs attention</h2><span class="muted" data-i18n="Now">Now</span></div><div id="problems"></div><div id="overviewAttention"></div></section></div>
        <section class="surface history-preview"><div class="section-heading"><div><p class="eyebrow" data-i18n="RECORDED ACTIVITY">RECORDED ACTIVITY</p><h2 data-i18n="The last 24 hours">The last 24 hours</h2></div><a href="#usage" data-i18n="Explore usage ↗">Explore usage ↗</a></div><div id="overviewHistory"></div></section>
      </section>
      <section data-panel="accounts" hidden aria-label="Accounts" data-i18n-aria-label="Accounts"><div class="section-heading"><p class="muted" data-i18n="Quotas, credits, and routing for each account. Changes apply to the gateway.">Quotas, credits, and routing for each account. Changes apply to the gateway.</p><div class="button-row"><span id="accountCount" class="count-pill"></span><button id="accountsRefresh" type="button" data-i18n="Refresh">Refresh</button><button id="accountsAdd" class="primary" type="button" data-i18n="Add account" hidden>Add account</button></div></div><div id="accounts"></div><div id="accountsEmpty" class="empty" hidden><h2 data-i18n="No accounts configured">No accounts configured</h2><p data-i18n="Add an account with the RelayCrew CLI and reload the configuration.">Add an account with the RelayCrew CLI and reload the configuration.</p><a href="#settings" data-i18n="Open settings ↗">Open settings ↗</a></div></section>
      <section data-panel="team" hidden aria-label="Team" data-i18n-aria-label="Team"><section class="surface"><div class="section-heading"><div><h2 data-i18n="Individual access">Individual access</h2><p class="muted" data-i18n="One key per person. Control accounts and concurrency.">One key per person. Control accounts and concurrency.</p></div><div class="button-row"><button id="teamRefresh" type="button" data-i18n="Refresh">Refresh</button><button id="teamAdd" class="primary" type="button" disabled data-i18n="Add member">Add member</button></div></div><p id="teamMessage" role="status" class="notice" data-i18n="Open this area with an administrator key.">Open this area with an administrator key.</p><div id="teamContent" class="table-scroll"></div></section></section>
      <section data-panel="usage" hidden aria-label="Usage" data-i18n-aria-label="Usage"><section class="surface"><div class="section-heading"><div><p class="eyebrow" data-i18n="ATTRIBUTED USAGE">ATTRIBUTED USAGE</p><h2 data-i18n="Where usage happens">Where usage happens</h2></div><span class="count-pill" data-i18n="No cost estimate">No cost estimate</span></div><div class="usage-controls"><label><span data-i18n="Period">Period</span><select id="historyWindow"><option value="24h" data-i18n="24 hours">24 hours</option><option value="5h" data-i18n="5 hours">5 hours</option><option value="total" data-i18n="Cumulative total">Cumulative total</option></select></label><label><span data-i18n="Group by">Group by</span><select id="historyScope"><option value="clients" data-i18n="Clients">Clients</option></select></label><label><span data-i18n="Metric">Metric</span><select id="historyMetric"><option value="requests" data-i18n="Requests">Requests</option><option value="inputTokens" data-i18n="Input tokens">Input tokens</option><option value="outputTokens" data-i18n="Output tokens">Output tokens</option><option value="connections" data-i18n="WebSocket connections (cumulative)">WebSocket connections (cumulative)</option></select></label><label id="stepLabel"><span data-i18n="Interval">Interval</span><select id="historyStep"><option value="15m" data-i18n="15 minutes">15 minutes</option><option value="1h" data-i18n="1 hour">1 hour</option></select></label><button id="historyRefresh" type="button" data-i18n="Refresh">Refresh</button></div><p id="historyMessage" class="notice" role="status"></p><div id="historyChart"></div><div class="section-heading distribution-heading"><h3 id="distributionTitle" data-i18n="Distribution in period">Distribution in period</h3><button id="clearBucket" type="button" hidden data-i18n="View entire period">View entire period</button></div><div id="historyDistribution"></div><details id="historyDetails"><summary data-i18n="Interval table · same values as the chart">Interval table · same values as the chart</summary><div id="historyTable" class="table-scroll"></div></details><p class="coverage-note" data-i18n="Recorded activity only. An interval without usage does not prove availability. The first and last intervals may be incomplete; abrupt restarts may lose unsaved records. History is limited to the last 24 hours.">Recorded activity only. An interval without usage does not prove availability. The first and last intervals may be incomplete; abrupt restarts may lose unsaved records. History is limited to the last 24 hours.</p></section>
        <details class="surface legacy-usage"><summary data-i18n="Complete counters by client and dimension">Complete counters by client and dimension</summary><p class="muted" data-i18n="Each dimension is an independent view of the same traffic. Do not add dimensions together.">Each dimension is an independent view of the same traffic. Do not add dimensions together.</p><div id="usageViewWrap" class="actions" style="display:none"></div><div id="clientsWrap" style="display:none"><h2 id="clientsHeading" data-i18n="Clients">Clients</h2><div class="card table-scroll"><table id="clients"></table></div></div><div id="dimensionsWrap"></div></details></section>
      <section data-panel="sessions" hidden aria-label="Sessions" data-i18n-aria-label="Sessions"><section class="surface"><div class="section-heading"><h2 data-i18n="Accounts pinned by session">Accounts pinned by session</h2><span class="muted" data-i18n="Until the session expires or the gateway restarts">Until the session expires or the gateway restarts</span></div><div id="sessionPinsList"></div><form id="sessionPinForm" class="usage-controls"><label><span data-i18n="Full session ID">Full session ID</span><input id="pinSession" required autocomplete="off" placeholder="Session identifier" data-i18n-placeholder="Session identifier"></label><label><span data-i18n="Account">Account</span><select id="pinAccount" required></select></label><button id="pinSave" type="submit" data-i18n="Pin account">Pin account</button></form><p id="sessionPinMessage" class="notice" role="status"></p></section><div id="sessionsEmpty" class="empty"><h2 data-i18n="Session details disabled">Session details disabled</h2><p data-i18n="Enable proxy.sessionDetail in the configuration to track conversations, context, cache, and session pins.">Enable proxy.sessionDetail in the configuration to track conversations, context, cache, and session pins.</p><a href="#settings" data-i18n="View settings ↗">View settings ↗</a></div><div id="sessionsWrap" style="display:none"><div class="section-heading"><h2 data-i18n="Ongoing conversations">Ongoing conversations</h2><p class="muted" data-i18n="Each agent appears as a conversation.">Each agent appears as a conversation.</p></div><div class="card"><div class="filters"><label><span data-i18n="Project">Project</span><select id="fProject"></select></label><label><span data-i18n="Client">Client</span><select id="fClient"></select></label><span class="hint" id="sessionCount"></span></div><div class="table-scroll"><table id="sessions"></table></div></div></div></section>
      <section data-panel="settings" hidden aria-label="Settings" data-i18n-aria-label="Settings"><section class="surface"><p class="eyebrow" data-i18n="OPERATIONS">OPERATIONS</p><h2 data-i18n="Gateway configuration">Gateway configuration</h2><p class="muted" data-i18n="Reload the configuration file or probe provider quotas.">Reload the configuration file or probe provider quotas.</p><div class="actions settings-actions"><button id="reload" type="button" data-i18n="Reload configuration">Reload configuration</button><button id="probe" type="button" data-i18n="Probe quotas">Probe quotas</button><span class="thr"><label for="thrVal" data-i18n="Switch account at">Switch account at</label><input id="thrVal" type="number" min="1" max="100" step="0.1" inputmode="decimal"><span>%</span><button id="thrSet" type="button" data-i18n="Save threshold">Save threshold</button></span></div><p id="settingsProbe" class="muted"></p></section><div id="routesWrap" style="display:none"><div class="section-heading"><h2 data-i18n="Current routing">Current routing</h2><span class="muted" data-i18n="Read only">Read only</span></div><div class="card table-scroll"><table id="routes"></table></div></div><section class="surface"><h2 data-i18n="Advanced changes">Advanced changes</h2><p class="muted" data-i18n="Providers, routes, team mode, and usage dimensions are defined in the RelayCrew configuration file. After editing, use &quot;Reload configuration&quot;.">Providers, routes, team mode, and usage dimensions are defined in the RelayCrew configuration file. After editing, use "Reload configuration".</p></section></section>
      <footer><span>RelayCrew <span class="footer-dot">·</span><span data-i18n="Your gateway. Your team.">Your gateway. Your team.</span></span><span id="foot"></span></footer>
    </div>
  </div>
</main>
<dialog id="accountLoginDialog" aria-labelledby="accountLoginTitle"><form id="accountLoginForm"><div class="dialog-heading"><h2 id="accountLoginTitle"></h2><button id="accountLoginClose" type="button" aria-label="Close" data-i18n-aria-label="Close">×</button></div>
  <div id="accountLoginChoices"><label class="form-field"><span data-i18n="Provider">Provider</span><select id="accountLoginProvider"><option value="claude">Claude</option><option value="codex">ChatGPT/Codex</option><option value="grok">Grok</option></select></label><label id="accountLoginSharingField" class="form-field"><span data-i18n="Sharing">Sharing</span><select id="accountLoginSharing" aria-describedby="accountLoginSharingHelp"><option value="private" data-i18n="Private: only my key">Private: only my key</option><option value="pool" data-i18n="Pool: shared with the team">Pool: shared with the team</option></select><small id="accountLoginSharingHelp"></small></label><p id="accountLoginOperatorHelp" class="notice" data-i18n="Operator account. Grant it to members in Team." hidden>Operator account. Grant it to members in Team.</p></div>
  <div id="accountLoginSteps" hidden><p><a id="accountLoginLink" data-i18n="Open provider sign-in">Open provider sign-in</a></p><p id="accountLoginHelp" class="notice"></p><p id="accountLoginDevice" hidden><span data-i18n="Code to confirm">Code to confirm</span>: <code id="accountLoginUserCode"></code></p><label id="accountLoginPaste" class="form-field" hidden><span id="accountLoginLabel"></span><input id="accountLoginCode" autocomplete="off" spellcheck="false" aria-describedby="accountLoginHelp"></label></div>
  <p id="accountLoginMessage" class="notice" role="status"></p><p id="accountLoginError" class="notice error" role="alert"></p><div class="dialog-actions"><button id="accountLoginCancel" type="button" data-i18n="Cancel">Cancel</button><button id="accountLoginSubmit" type="submit" class="primary"></button></div></form></dialog>
<dialog id="accountRemoveDialog" aria-labelledby="accountRemoveTitle"><div class="dialog-heading"><h2 id="accountRemoveTitle"></h2><button type="button" data-close="accountRemoveDialog" aria-label="Close" data-i18n-aria-label="Close">×</button></div><p data-i18n="Removing this account stops its traffic and deletes its credentials from the gateway.">Removing this account stops its traffic and deletes its credentials from the gateway.</p><p id="accountRemoveError" role="alert" class="notice"></p><div class="dialog-actions"><button type="button" data-close="accountRemoveDialog" data-i18n="Cancel">Cancel</button><button id="accountRemoveConfirm" class="danger" type="button" data-i18n="Remove">Remove</button></div></dialog>
<dialog id="memberDialog" aria-labelledby="memberTitle"><form id="memberForm"><div class="dialog-heading"><div><p class="eyebrow" data-i18n="TEAM ACCESS">TEAM ACCESS</p><h2 id="memberTitle" data-i18n="Add member">Add member</h2></div><button type="button" data-close="memberDialog" aria-label="Close" data-i18n-aria-label="Close">×</button></div><label class="form-field"><span data-i18n="Name">Name</span><input id="memberName" required maxlength="64" autocomplete="off"><small data-i18n="The name identifies the member and cannot be changed.">The name identifies the member and cannot be changed.</small></label><label class="form-field"><span data-i18n="Concurrent request limit">Concurrent request limit</span><input id="memberLimit" type="number" min="1" max="1024" step="1" required value="4"></label><fieldset><legend data-i18n="Allowed accounts">Allowed accounts</legend><label class="check-line"><input id="memberAll" type="checkbox"><span data-i18n="All current and future accounts">All current and future accounts</span></label><div id="memberAccounts"></div></fieldset><label class="check-line" id="memberDisabledWrap"><input id="memberDisabled" type="checkbox"><span data-i18n="Access disabled">Access disabled</span></label><p id="memberError" role="alert" class="notice"></p><div class="dialog-actions"><button type="button" data-close="memberDialog" data-i18n="Cancel">Cancel</button><button id="memberSave" type="submit" class="primary" data-i18n="Create member and key">Create member and key</button></div></form></dialog>
<dialog id="confirmDialog" aria-labelledby="confirmTitle"><div class="dialog-heading"><h2 id="confirmTitle"></h2><button type="button" data-close="confirmDialog" aria-label="Close" data-i18n-aria-label="Close">×</button></div><p id="confirmText"></p><p id="confirmError" role="alert" class="notice"></p><div class="dialog-actions"><button type="button" data-close="confirmDialog" data-i18n="Cancel">Cancel</button><button id="confirmAction" class="danger" type="button"></button></div></dialog>
<dialog id="issuedDialog" aria-labelledby="issuedTitle"><div class="dialog-heading"><h2 id="issuedTitle" data-i18n="Save the key now">Save the key now</h2><button type="button" data-close="issuedDialog" aria-label="Close and erase key" data-i18n-aria-label="Close and erase key">×</button></div><p data-i18n="This key is shown only once. Share it with the member through a secure channel. Closing erases it from this screen.">This key is shown only once. Share it with the member through a secure channel. Closing erases it from this screen.</p><label class="form-field"><span data-i18n="Member key">Member key</span><textarea id="issuedKey" readonly rows="3" spellcheck="false" autocomplete="off"></textarea></label><p id="issuedMessage" role="status" class="notice"></p><div class="dialog-actions"><button id="copyKey" type="button" data-i18n="Copy key">Copy key</button><button type="button" data-close="issuedDialog" class="primary" data-i18n="I saved the key">I saved the key</button></div></dialog>`;

const LIGHT_PALETTE = `
  --bg:#e9edf2;
  --frame:#f5f7fa;
  --panel:#ffffff;
  --sidebar:#eff3f8;
  --field:#f8fafc;
  --text:#182338;
  --dim:#526176;
  --line:#d7dfea;
  --control-line:#7d8ca2;
  --accent:#245dc8;
  --primary:#245dc8;
  --on-primary:#ffffff;
  --ok:#187147;
  --warn:#8a5707;
  --bad:#b12f38;
  --soft:#e6edfb;
  --hero-start:#edf3fd;
  --hero-end:#dfeaf9;
  --hero-text:#182e4c;
  --hero-muted:#435c7a;
  --hero-link:#154aab;
  --hero-line:#c4d4eb;
  --stat-bg:#f8fbff;
  --stat-line:#c0d1e8;
  --series-1:#2563eb;
  --series-2:#c55a11;
  --series-3:#087f8c;
  --series-4:#7c3aed;
  --series-5:#be185d;
  --series-6:#35822e;
  --series-7:#c43832;
  --series-8:#087cad;
  --series-9:#996700;
  --series-10:#5750ba;
  --series-11:#a83e76;
  --series-12:#806044;
  --series-13:#64748b;
`;
const DARK_PALETTE = `
  --bg:#0b1018;
  --frame:#111925;
  --panel:#182333;
  --sidebar:#0f1825;
  --field:#121e2d;
  --text:#e7edf6;
  --dim:#a6b5c9;
  --line:#2c3b50;
  --control-line:#607692;
  --accent:#8fb7ff;
  --primary:#386fe0;
  --on-primary:#ffffff;
  --ok:#83d5aa;
  --warn:#f0c16f;
  --bad:#ffa2a9;
  --soft:#203451;
  --hero-start:#16283f;
  --hero-end:#1c3855;
  --hero-text:#edf4ff;
  --hero-muted:#b6c9df;
  --hero-link:#a8c9ff;
  --hero-line:#36516e;
  --stat-bg:#13253a;
  --stat-line:#395775;
  --series-1:#8fb7ff;
  --series-2:#f5a15d;
  --series-3:#6fd1cc;
  --series-4:#b8a0fa;
  --series-5:#f291c2;
  --series-6:#a0d58e;
  --series-7:#ff9c94;
  --series-8:#71cbef;
  --series-9:#e6c36e;
  --series-10:#aaa9f3;
  --series-11:#e8a1c9;
  --series-12:#d8b092;
  --series-13:#a1b1c6;
`;

export const WORKSPACE_CSS = `
:root,:root[data-theme="light"]{${LIGHT_PALETTE}
color-scheme:light}

:root[data-theme="dark"]{${DARK_PALETTE}
color-scheme:dark}

@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){${DARK_PALETTE}
color-scheme:dark}
}

html,body{height:100dvh;box-sizing:border-box;overflow:hidden}

body{padding:16px;background:var(--bg);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
button,input,select,textarea{font:inherit}
button,a,summary,input,select,textarea{outline-offset:4px}
:focus-visible{outline:2px solid var(--accent)}
[hidden]{display:none!important}
button{cursor:pointer}
button:disabled{cursor:not-allowed;opacity:.5}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
button{color:var(--text);background:var(--panel);border:1px solid var(--control-line);border-radius:9px;padding:8px 12px;white-space:normal}
button:hover:not(:disabled){border-color:var(--accent)}
button.primary{background:var(--primary);color:var(--on-primary);border-color:var(--primary)}
button.danger{background:var(--bad);color:var(--panel);border-color:var(--bad)}
input,select,textarea{color:var(--text);background:var(--field);border:1px solid var(--control-line);border-radius:8px;padding:8px 10px;min-width:0}
small,.muted{color:var(--dim)}
.eyebrow{font-size:10px;font-weight:700;letter-spacing:.13em;color:var(--dim);margin-bottom:10px}
#workspaceFrame{max-width:1680px;margin:auto;height:100%;min-height:0;background:var(--frame);border-radius:28px;border:1px solid color-mix(in srgb,var(--panel) 65%,transparent);box-shadow:0 20px 70px -55px #0e1a2b80;overflow:hidden}
#app{display:grid;grid-template-columns:215px minmax(0,1fr);height:100%;min-height:0;overflow:hidden;grid-template-rows:minmax(0,1fr)}
.sidebar{min-width:0;min-height:0;overflow:auto;background:var(--sidebar);padding:28px 16px;display:flex;flex-direction:column;border-right:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:10px;color:var(--text);font-size:19px;font-weight:750;letter-spacing:-.7px;padding:0 6px 34px}
.brand:hover{text-decoration:none}
.brand small{display:block;font-size:8px;letter-spacing:2.6px;font-weight:600;margin-top:1px}
.brandmark{display:inline-grid;place-items:center;width:36px;height:38px;border-radius:12px;background:var(--primary);color:var(--on-primary);font-size:27px;font-weight:500}
.nav-caption{font-size:10px;color:var(--dim);padding:0 12px 14px}
.sidebar nav{display:grid;gap:7px}
.sidebar nav a{display:flex;align-items:center;gap:13px;color:var(--dim);font-size:13px;font-weight:550;padding:11px 14px;border-radius:11px}
.sidebar nav a>span[aria-hidden]{width:18px;font-size:19px;font-weight:400}
.sidebar nav a:hover{background:var(--panel);text-decoration:none}
.sidebar nav a[aria-current="page"]{color:var(--accent);background:var(--soft);box-shadow:0 3px 10px -7px #0e1a2b40}
.sidebar-note{margin-top:auto;padding:60px 12px 5px;font-size:10px;font-weight:600;color:var(--dim)}
.sidebar-note p{font-weight:400;margin-top:8px;line-height:1.7}
.status-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--ok);margin-right:6px}
.workspace-body{min-width:0;min-height:0;overflow:auto;scrollbar-gutter:stable;padding:0 34px 22px}
.workspace-header{min-height:85px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:15px}
.breadcrumb{font-size:11px;color:var(--dim)}
.breadcrumb .crumb-separator{margin:0 11px;color:var(--line)}
.breadcrumb b{color:var(--text);font-weight:500}
.header-actions{display:flex;align-items:center;gap:9px;font-size:10px}
.header-actions button{font-size:10px;border-radius:99px;padding:6px 10px;background:transparent}
#connection{color:var(--dim);font-variant-numeric:tabular-nums}
.page-heading{display:flex;justify-content:space-between;gap:15px;align-items:center;padding:30px 0 20px}
.page-heading h1{font-size:30px;letter-spacing:-1px;font-weight:650;line-height:1.15;margin-bottom:9px}
.page-heading .eyebrow{font-size:9px;margin-bottom:8px}
.page-heading .muted{font-size:12px}
.gateway-pill,.count-pill{font-size:10px;background:var(--panel);border:1px solid var(--line);border-radius:99px;padding:6px 10px;white-space:nowrap}
.sub#summary{font-size:11px;color:var(--dim);margin:0 0 17px}
.sub#summary b{font-weight:550}
h2{font-size:15px;color:var(--text);font-weight:600;letter-spacing:-.25px;text-transform:none;margin:0}
h3{font-size:13px;font-weight:600}
.section-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px}
.section-heading>a{font-size:11px;white-space:nowrap}
.surface,.card{border-radius:19px;background:var(--panel);border:1px solid var(--line);padding:22px;box-shadow:0 4px 14px -12px #0e1a2b40;margin-bottom:18px}
.surface>.muted{margin-top:8px;font-size:12px}
.overview-wash{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,.95fr);gap:30px;padding:30px;border-radius:22px;background:linear-gradient(125deg,var(--hero-start),var(--hero-end));border:1px solid var(--hero-line);margin:0 0 22px;color:var(--hero-text);overflow:hidden}
.overview-intro .eyebrow{color:var(--hero-muted);font-size:9px}
.overview-intro h2{color:var(--hero-text);font-size:33px;line-height:1.2;letter-spacing:-1.15px;margin:16px 0}
.overview-intro>p:not(.eyebrow){color:var(--hero-muted);font-size:12px;max-width:350px;margin:0 0 18px}
.text-link{font-size:11px;font-weight:600;color:var(--hero-link)}
.overview-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-content:center}
.stat{padding:16px;background:var(--stat-bg);border:1px solid var(--stat-line);border-radius:15px;color:var(--hero-text);min-width:0}
.stat strong{display:block;font-size:30px;letter-spacing:-1px;line-height:1.1;font-weight:650;font-variant-numeric:tabular-nums;margin:9px 0 5px}
.stat span{font-size:10px;color:var(--hero-muted)}
.stat small{font-size:9px;color:var(--hero-muted)}
.overview-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.overview-grid .surface{padding:20px;min-width:0}
.provider-line{display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--line);padding:14px 0;gap:12px}
.provider-line:first-child{border-top:0;padding-top:0}
.provider-line:last-child{padding-bottom:0}
.provider-name{font-size:12px;font-weight:600}
.provider-line small{font-size:10px;display:block;margin-top:3px}
.provider-count{font-size:11px;font-variant-numeric:tabular-nums}
.notice{font-size:12px;color:var(--dim);margin:12px 0;white-space:pre-wrap}
.notice.error{color:var(--bad)}
.notice.warn{color:var(--warn)}
.notice.ok{color:var(--ok)}
.empty{padding:35px 20px;text-align:center;color:var(--dim);font-size:12px;border:1px dashed var(--line);border-radius:14px;margin:10px 0}
.empty h2{font-size:16px;margin-bottom:8px}
.empty a{display:inline-block;margin-top:14px}
.empty p{max-width:460px;margin:auto}
.attention-clear{padding:18px 0;color:var(--dim);font-size:12px}
.attention-clear b{display:block;color:var(--text);font-weight:550;font-size:13px;margin-bottom:4px}
#problems{margin:0}
#problems div{font-size:11px;margin-bottom:8px}
#err{padding:13px 16px;background:color-mix(in srgb,var(--bad) 7%,var(--panel));border:1px solid var(--bad);border-radius:12px;font-size:12px}
#caller{padding:12px 15px;border:1px solid var(--line);border-radius:12px;font-size:11px;margin-bottom:18px}
.card .row{gap:7px}
.card .name{font-size:15px;letter-spacing:-.3px;margin-right:5px}
.badge{font-size:10px;padding:2px 7px}
.act{padding:4px 9px;font-size:10px}
.row .act+.act{margin-left:0}
.quota{grid-template-columns:76px 1fr 185px;margin-top:12px;gap:14px}
.quota .lbl,.quota .val{font-size:11px}
.bar{height:6px}
.usage,.blocked{font-size:11px;margin-top:10px}
.cardnote{padding:9px 13px;background:var(--panel);border-radius:9px;margin:10px 0}
.usage-controls{display:flex;flex-wrap:wrap;gap:12px;padding:15px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.usage-controls label{font-size:10px;color:var(--dim);display:grid;gap:5px;flex:1;min-width:125px}
.usage-controls select{font-size:11px}
.usage-controls button{align-self:end;font-size:11px}
.coverage-note{font-size:10px;color:var(--dim);margin-top:20px;line-height:1.6}
.chart-area{min-height:180px}
.history-svg{width:100%;height:190px;display:block;overflow:visible}
.chart-labels{display:flex;justify-content:space-between;color:var(--dim);font-size:9px;margin-top:4px}
.chart-caption{font-size:11px;color:var(--dim);margin:10px 0}
.legend{display:flex;flex-wrap:wrap;gap:8px 16px;font-size:10px;color:var(--dim);margin-top:16px}
.legend i{display:inline-block;width:12px;height:12px;border-radius:2px;margin-right:5px}
.history-svg [role="button"]{cursor:pointer}
.history-svg [role="button"]:focus{outline:2px solid var(--accent)}
.distribution-heading{margin-top:25px;margin-bottom:13px}
.distribution{display:grid;gap:13px}
.distribution-line{display:grid;grid-template-columns:minmax(80px,1fr) 2fr 75px;align-items:center;gap:15px;font-size:11px}
.distribution-line .bar{height:5px}
.distribution-line strong{text-align:right;font-weight:550;font-variant-numeric:tabular-nums}
.distribution-label{overflow-wrap:anywhere}
.table-scroll{overflow:auto;max-width:100%;scrollbar-width:thin}
table{font-size:11px;min-width:580px}
th,td{padding:12px 10px;white-space:nowrap}
th{font-size:10px;font-weight:550}
td{border-bottom-color:color-mix(in srgb,var(--line) 70%,transparent)}
td:first-child{font-weight:500}
td .button-row{flex-wrap:nowrap}
.owned-accounts td:first-child{white-space:normal;overflow-wrap:anywhere;min-width:140px;max-width:260px}
.button-row{display:flex;gap:7px;flex-wrap:wrap}
.button-row button{font-size:10px;padding:6px 8px}
details>summary{font-size:12px;font-weight:550;cursor:pointer;color:var(--dim);padding:4px 0}
details[open]>summary{margin-bottom:16px}
.legacy-usage .card{overflow:auto}
.legacy-usage h2{margin:24px 0 10px}
.legacy-usage>p{font-size:11px;margin-bottom:10px}
.actions{flex-wrap:wrap;gap:8px}
.actions button{font-size:11px;border-radius:9px;color:var(--text);padding:7px 11px}
.actions button.sel{background:var(--soft);color:var(--accent)}
.actions .thr{margin-left:0;flex-wrap:wrap}
.actions .thr input{border-radius:7px}
.settings-actions{margin-top:24px}
.settings-actions .thr{flex-basis:100%;padding-top:18px;border-top:1px solid var(--line)}
.filters{padding:16px}
.filters select{background:var(--panel)}
footer{display:flex;justify-content:space-between;gap:10px;border-top:1px solid var(--line);padding-top:20px;margin-top:28px;font-size:9px}
.footer-dot{margin:0 6px}
dialog{color:var(--text);background:var(--panel);border:1px solid var(--line);border-radius:22px;padding:26px;max-width:520px;width:calc(100% - 32px);max-height:90dvh;margin:auto;box-shadow:0 25px 90px #0e1a2b40;overflow:auto}
dialog::backdrop{background:#0e1a2b70;backdrop-filter:blur(3px)}
.dialog-heading{display:flex;justify-content:space-between;align-items:center;gap:15px;margin-bottom:20px}
.dialog-heading h2{font-size:21px}
.dialog-heading>button{font-size:22px;line-height:1;padding:4px 9px}
.form-field{display:grid;gap:7px;font-size:12px;margin:18px 0}
.form-field small{font-size:10px}
fieldset{border:1px solid var(--line);border-radius:12px;padding:12px 15px;margin:18px 0}
legend{font-size:11px;color:var(--dim);padding:0 6px}
.check-line{display:flex;align-items:center;gap:10px;font-size:12px;padding:6px 0}
.check-line input{width:15px;height:15px;flex-shrink:0}
#memberAccounts{max-height:200px;overflow:auto;padding-top:8px;border-top:1px solid var(--line);margin-top:8px}
#issuedKey{font:13px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere}
dialog>p{font-size:12px;color:var(--dim)}
.dialog-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:24px}
dialog:has(button:disabled) [data-close]{opacity:.7}
.login-panel{max-height:100%;overflow:auto;padding:32px!important;text-align:left!important;max-width:440px!important;margin:0 auto!important}
.login-panel .brandmark{margin-bottom:24px}
.login-panel h1{font-size:29px}
.login-panel label{font-size:11px}
.login-panel .muted{font-size:11px;margin-top:18px}
.login-panel#keybox button{background:var(--primary);color:var(--on-primary);width:100%;border-radius:10px;padding:11px}
.login-panel#keybox input{border-radius:10px;padding:12px}
.skip{position:absolute;top:-80px;left:30px;z-index:20;background:var(--panel);padding:12px;border-radius:8px}
.skip:focus{top:20px}

@media(min-width:1450px){.workspace-body{padding-left:45px;padding-right:45px}
.overview-wash{padding:38px}
.overview-intro h2{font-size:39px}
}

@media(max-width:1100px){#app{grid-template-columns:180px minmax(0,1fr)}
.workspace-body{padding:0 22px 20px}
.sidebar{padding:25px 10px}
.brand{font-size:17px}
.header-actions{gap:5px}
.breadcrumb{display:none}
.workspace-header{justify-content:flex-end}
.overview-wash{gap:20px;padding:24px}
.overview-intro h2{font-size:28px}
.stat{padding:13px}
.overview-grid{gap:15px}
.overview-grid .surface{padding:17px}
.gateway-pill{display:none}
}

@media(max-width:780px){#workspaceFrame{border-radius:18px}
#app{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}
.sidebar{padding:14px 17px 0;border-right:0;border-bottom:1px solid var(--line)}
.brand{padding:0 0 16px;font-size:19px}
.brandmark{height:32px;width:32px;font-size:24px}
.brand small{display:none}
.nav-caption,.sidebar-note{display:none}
.sidebar nav{display:flex;gap:2px;overflow:auto;padding-bottom:9px;scrollbar-width:thin}
.sidebar nav a{padding:8px 10px;white-space:nowrap;font-size:11px}
.sidebar nav a>span[aria-hidden]{font-size:16px}
.workspace-body{padding:0 18px 20px}
.workspace-header{min-height:60px}
.header-actions{flex-wrap:wrap;justify-content:flex-end;width:100%;gap:8px}
.header-actions #connection{margin-right:auto}
.page-heading{padding:24px 0 17px}
.page-heading h1{font-size:27px}
.overview-wash{grid-template-columns:1fr;padding:23px;gap:23px}
.overview-intro h2{font-size:32px}
.overview-intro>p:not(.eyebrow){max-width:unset}
.overview-stats{grid-template-columns:repeat(4,1fr);gap:7px}
.stat{padding:12px 9px}
.stat strong{font-size:25px}
.stat span{font-size:9px}
.stat small{display:none}
.overview-grid{grid-template-columns:1fr;gap:0}
.surface,.card{padding:18px;border-radius:16px}
.section-heading{align-items:flex-start}
.quota{grid-template-columns:60px 1fr 130px;gap:8px}
.quota .val{font-size:10px}
.row .act{margin-left:0}
.row{row-gap:10px}
.history-svg{height:165px}
footer{flex-direction:column;gap:5px}
.distribution-line{grid-template-columns:minmax(70px,1fr) 1.3fr 58px;gap:10px}
.usage-controls label{min-width:120px}
.filters{gap:12px}
.hint{flex-basis:100%;margin-left:0}
.settings-actions{gap:10px}
.section-heading .button-row{justify-content:flex-end}
.table-scroll{margin:0 -2px}
.gateway-pill{display:none}
}

@media(max-width:520px){.workspace-body{padding:0 12px 18px}
.overview-stats{grid-template-columns:1fr 1fr}
.quota{grid-template-columns:53px 1fr 105px}
.quota .val{font-size:9px}
.header-actions button{font-size:9px;padding:5px 8px}
}


.language-control{display:grid;gap:5px;font-size:10px;color:var(--dim);margin:0 6px 18px;min-width:0}

.language-control select{width:100%;font-size:11px}

.login-panel .language-control{margin:12px 0}

.legend-entry{display:inline-flex;align-items:center;gap:4px;min-width:0}

.series-picker{display:inline-flex;position:relative;align-items:center;gap:4px;cursor:pointer;padding:3px;border-radius:5px;min-width:0}

.series-picker:focus-within{outline:2px solid var(--accent);outline-offset:2px}

.series-picker input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer;padding:0;border:0}

.series-picker i{flex-shrink:0;margin:0}

.series-reset{font-size:11px;padding:1px 5px;border-color:var(--line);border-radius:5px}

@media(max-width:780px){.sidebar .language-control{max-width:180px;margin:0 0 10px}
.sidebar{max-height:40dvh}
.brand{padding-bottom:10px}
.workspace-header{min-width:0}
.page-heading{min-width:0}
.login-panel{padding:24px!important}
.legend{gap:8px}
}


@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important;scroll-behavior:auto!important}
}

`;
