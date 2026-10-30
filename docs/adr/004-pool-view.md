# ADR-004: Members see the pool's remaining quota

- **Status:** accepted
- **Date:** 2026-10-30
- **Deciders:** sep1ol (owner)
- **Layers:** gateway / dashboard

## Context

[ADR-001](001-member-owned-accounts.md) lets members contribute accounts and decides that members never see fleet status. A member therefore has no way to tell whether the team's shared capacity is nearly spent before starting work, and the administrator's only quota view is the per-account fleet card, which is keyed by account name (usually an email) and carries routing, spend and usage.

Quota lives only in memory, in `account.quota` on the live `AccountManager` accounts (`src/account-manager.js`): Claude and Codex share the `unified5h` / `unified7d` fields (used fractions, 0-1), Claude per-model weekly windows live in `scopedWeekly` and the dedicated `unified7dSonnet` / `unified7dFable` fields, Codex per-model windows in `codexModelBuckets`, API keys expose `tokensRemaining` / `tokensLimit`, third-party backends expose `quota.backend.windows` with an observation time `backend.at`, and Grok reports nothing. `teamAllowsAccount` (`src/team-access.js`) is the single evaluator for who may route to an account.

## Decision

1. **One read-only projection for everyone in the team.** `GET /relaycrew/accounts/pool` returns, for the caller, the SHARED accounts: operator accounts (no `owner`) and member accounts with `owner.sharing === 'pool'`, plus the caller's OWN private accounts marked as private and theirs. Other members' private accounts are absent, not counted, and leave no gap in the response (row keys are dense per response). The administrator gets the same list; private rows of members stay out of it, as `teamAllowsAccount` already decides.
2. **Rows are labelled by owner, provider and plan, never by account.** Operator accounts show owner `team`; member accounts show the member name; the plan is the Claude tier (`Max 20x`, `Max 5x`, `Pro`, `Team`, `Enterprise`), the Codex `planType`, or nothing. Member names are already visible inside a team (Team view for the administrator, `owner` on the member's own rows) and are the only identifier that lets a teammate ask "whose account is this?"; emails and account names are not needed for that.
3. **Everything is normalized to REMAINING fraction** (`clamp(1 - used, 0, 1)`), with `resetAt` and `seenAt` when the source has them, so the dashboard draws one kind of bar. A window past its reset reads as unknown. Claude model windows appear only when a dedicated value exists; the shared-weekly fallback used by `relaycrew status` is never shown as a model reading.
4. **Totals per provider group and window** are tier-weighted for Claude (`quotaTier` weight, unknown tier = 1) and an unweighted mean otherwise. Accounts limited by quota (near or past a window, throttled, exhausted) stay counted: their readings are the capacity the total describes, so a spent pool reads as spent rather than unknown. Only accounts whose windows say nothing about capacity are listed with their coarse state but excluded from totals: disabled, in error, or stopped by an operator cap (`capped`, `spend-capped`).
5. **The projection is pure** (`buildPoolView` in `src/pool-view.js`); the HTTP route in `src/server.js` only sweeps expired windows (`sweepExpiredQuotas`, read-safe) and serializes. `refreshExpiredQuotas` is not used because it can move the routing cursor.
6. **The dashboard renders it in both roles** (`src/dashboard-workspace.js`): below "Your provider accounts" for members, above the fleet cards in Accounts for the administrator, polled every 15 seconds only while that view is visible.

## Contract

`GET /relaycrew/accounts/pool` (also `/teamclaude/...`, `/teamrouter/...`): team mode only (404 otherwise), member or administrator key (401 without a valid team identity), `Cache-Control: no-store`. It is the second GET in the member allowlist (`teamMemberPath`).

```
{ generatedAt, groups: [{ provider: 'anthropic'|'codex'|'grok'|'apikey'|'backend', label,
    accounts: [{ key, owner, ownerIsViewer, plan, sharing: 'team'|'pool'|'private', usable, state: 'ok'|'disabled'|'limited'|'error',
      windows: [{ key: 'fiveHour'|'weekly'|'weekly:<model>'|'tokens'|'requests'|'monthly', label, remaining, resetAt, seenAt }] }],
    totals: [{ key, label, remaining, accounts, nextResetAt }] }] }
```

`key` is an index within the response, not the account ID. `usable` is `teamAllowsAccount` for the caller. Empty groups are omitted; a Grok group has no windows.

What the payload never contains: account names or emails, account IDs, organization names, routing (egress proxy), spend or money balances, `backend.text`, sessions or usage, forecasts, error reasons beyond the four states.

## Consequences

- Members can see how much shared capacity is left, per window and per model, before they start.
- A member learns which teammates pool an account and roughly how spent it is. This is accepted inside a team; a member who wants to stay out of that view keeps the account private.
- Totals mix plans of one provider. The Claude weighting reuses `quotaTier`; Codex plans are not weighted.
- Readings older than 30 minutes are shown as such; `scopedWeekly` entries carry no age and are shown without one; Sonnet and Fable read from the dedicated fields first, which do.
- This amends the ADR-001 consequence "Members never see fleet status": members now see this projection and nothing else of the fleet. `/relaycrew/status` stays administrator-only.

## Alternatives considered

- **Open `/relaycrew/status` to members, filtered.** Rejected: that payload is built for the operator (routing, spend, sessions, usage, error reasons) and would need a denylist that drifts.
- **Anonymous labels ("Claude 1").** Rejected: a member cannot act on "Claude 3 is spent"; the owner name is what lets them ask the right teammate, and it is already visible elsewhere in the team.
- **Show every pool and operator account to each member, including those outside their grant.** Kept, with `usable` marking the ones outside the grant: hiding them would make the team's capacity look smaller than it is, and the grant is the administrator's to change.
- **Reuse `buildQuotaSummary`.** Rejected: it falls back to the shared weekly for missing model windows, ignores `scopedWeekly` and `codexModelBuckets`, skips every Codex and API-key account in totals, and does not drop disabled accounts.
