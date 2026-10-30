# ADR-003: Public health and version routes

- **Status:** accepted
- **Date:** 2026-10-29
- **Deciders:** sep1ol (owner)
- **Layers:** gateway / cli / config

## Context

Operators, uptime monitors, Docker HEALTHCHECK, and member clients need to identify a running gateway without an administrator or member key. `/relaycrew/status` in `src/server.js` contains account and quota information and must remain authenticated. Requests outside the control namespace can be forwarded upstream.

## Decision

Serve two exact public routes beside the dashboard, before authentication in `src/server.js`, in team and legacy modes. `src/build-info.js` builds the public payloads from injected build metadata and timestamps. It never receives gateway configuration.

Public by design means these payloads never include account names or IDs, member names or IDs, credentials, grants, quota or usage data, or configuration. `features` is a static list of capabilities this build serves, allowing member CLIs and setup tools to check compatibility without inspecting private state or interpreting prerelease versions.

Resolve metadata once at server creation. Revision comes from `envVar('REVISION')` (including legacy prefixes), otherwise the checkout's short SHA from `resolveVersionLabel` in `src/updater.js`, otherwise null. The container's `unknown` placeholder maps to null. Labels prefer a checkout tag or SHA, then an injected revision, then the package version.

## Contract

- `GET /relaycrew/health`: 200 `{status: "ok", version, revision, uptimeSeconds}`. Uptime is an integer number of seconds since server creation. This reports HTTP server liveness only; it does not probe accounts, providers, or quotas.
- `GET /relaycrew/version`: 200 `{name: "relaycrew", version, revision, label, node, startedAt, features: ["member-accounts", "grok"]}`. Version comes from `package.json`, node from `process.version`, and startedAt is ISO formatted.
- Both routes allow HEAD with the same status and no body. Other methods return 405 with `Allow: GET, HEAD`. All responses use `Cache-Control: no-store` and `Content-Type: application/json`.
- Existing `canonicalControlUrl` handling provides `/teamclaude/...` and `/teamrouter/...` aliases. No other control route becomes public; `/relaycrew/status` without a key remains 401 in team mode.
- Docker HEALTHCHECK reads the configured port and calls `/relaycrew/health` without a key. Images carry `RELAYCREW_REVISION` from `VCS_REF`; Compose builds pass that argument and CI already supplies the commit SHA.

## Consequences

Monitoring no longer needs credentials or exposes account state. Clients can identify a build and its supported capabilities before authentication. Build version, revision, Node version and start time are intentionally public. A healthy reply does not promise inference readiness. Packaged installs without revision metadata report null; Compose operators should supply the checkout revision when building.

## Alternatives considered

- **Reuse keyed `/relaycrew/status`.** Rejected: distributes credentials to monitors and reveals private fleet information unrelated to liveness.
- **Root `/health`.** Rejected: collides with paths forwarded to upstream providers. The RelayCrew control namespace belongs to the gateway.
