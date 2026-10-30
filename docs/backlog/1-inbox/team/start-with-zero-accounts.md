---
title: Start a team gateway with zero accounts
origin: owner
layers: gateway, dashboard, cli
created: 2026-10-29
destination:
---

# Start a team gateway with zero accounts

## Idea

Allow a fresh team gateway to start with an empty account pool. An administrator could initialize the team and issue member keys, then members could add their own provider accounts after the gateway is running.

## Today

`src/index.js` refuses startup when no accounts are configured or resolved, except when callback.net credential sync may populate the pool. Member-owned accounts from ADR-001 are added through a running gateway, so a new team otherwise needs an administrator-provided account to bootstrap.

## Why it helps

Teams can bootstrap using member-owned accounts without asking the administrator to contribute a provider account. Public health and version checks can identify the running gateway while it awaits its first account.

## Questions and risks

- Keep the exception limited to team mode and preserve authentication and member grants.
- Define the empty-pool inference response and dashboard guidance; HTTP liveness should still succeed.
- Check reload and account-manager behavior when the first account arrives, consistent with ADR-001.

## Agent opinion

Do. It removes a bootstrap dependency for member-owned accounts; empty-pool readiness needs an explicit contract.
