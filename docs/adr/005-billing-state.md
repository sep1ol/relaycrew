# ADR-005: Billing state per account

- **Status:** accepted
- **Date:** 2026-11-03
- **Deciders:** sep1ol (owner)
- **Layers:** gateway / dashboard

## Context

On 2026-11-03 a team gateway with one Codex account hung in production. The account had dropped to the free plan. Every request on it, for any model, waited 30 to 120 seconds and timed out on the client, while a direct call to upstream answered at once.

The cause is a misclassification, reproduced by `test/billing-hold.test.js`. Upstream answers `429` with body `{error: {type: 'usage_limit_reached', plan_type: 'free', resets_at}}` and `x-codex-*` headers. The 429 handler in `src/server.js:3665-3950` knows three classes. The headers rule out request-scoped (`:3685`). A quota rejection needs a spent 5-hour or 7-day window, and `windowBucket` (`src/codex-quota.js:38-42`) drops the free plan's 30-day window on purpose, so the account is never "spent". What is left is the throttle class: `pauseAccount` for 60 seconds (`:3785`, `src/account-manager.js:996`) plus an inline 60-second `waitForRetry` (`:3932`). Every later request on that account sits in `admit()` (`src/account-manager.js:944-961`) with no headers written and no bound until the pause ends, and each new 429 re-arms it. The account stays `active` and selectable.

The gateway stores no billing fact. `normalizeCodexUsagePayload` (`src/codex-usage.js:126-165`) drops `rate_limit.allowed`, `limit_reached` and `credits` from `wham/usage`, and the probe runs only when `quotaProbeSeconds` is set. The Claude profile (`src/oauth.js:338-361`) is applied once (`src/prober.js:186-190`) and nothing maps its flags to "free". Grok has no plan endpoint; its only signal is an inference refusal matched by `isGrokExhaustion` (`src/provider.js:263-266`, handled at `src/server.js:3635-3655`), which calls `markRateLimited` as if it were a throttle. Every "no account can serve" answer is Anthropic-shaped, even on `/backend-api/codex/*` (`teamError`, `src/team-access.js:94-98`; `src/server.js:3393-3403`).

## Decision

1. **One stored fact per account.** `account.quota.billingHold = { reason: 'exhausted' | 'no-credits', until, seenAt } | null`, listed in `PERSISTED_QUOTA_FIELDS` (`src/account-manager.js:131`) with `quota.planType` so both survive a restart. `AccountManager.holdBilling(index, {reason, until, plan})` writes the hold and, when a plan is given, `quota.planType`; `clearBillingHold(index)` nulls the hold. The plan is not copied into the hold: `quota.planType` is the one plan source. The latest reading wins, not the maximum: a reset date is a fact, not a backoff. A hold with no `until` lasts `BILLING_RECHECK_SECONDS` (3600).
2. **One derive everywhere else.** `billingStatus(account, now)` in `src/billing.js` returns `{kind, plan, until, reason}`, `kind` one of `paid`, `free`, `exhausted`, `no-credits`, `unknown`. An active hold gives its reason; otherwise the plan decides, and no plan gives `unknown`. `unavailableReason` (`src/account-manager.js:2650`) returns `'billing'` for a held account, after `'credential'` and before the throttle check. Selection reads nothing else.
3. **A free-plan Codex `usage_limit_reached` 429 is a billing hold, not a throttle.** Every 429 body is read once, for every provider. `error.type === 'usage_limit_reached'` with `plan_type === 'free'` holds the account until `resets_at`, adds it to `ctx.tried` and rotates. It never calls `pauseAccount` and never waits inline. The body is the signal: `error.type` is the string the Codex CLI keys on, and filing a monthly window as weekly is what `windowBucket` forbids. A paid plan's `usage_limit_reached` that no spent-window header caught is a spent window, not a billing fact: it gets `markRateLimited(min(resets_at - now, 3600s))`, joins `ctx.tried` and rotates, with no pause and no inline wait. A named-family refusal (`codexFamilyRejected`) never takes either branch, so a model-scoped bucket cannot hold the whole account. From `wham/usage`, `rate_limit.allowed === false` or `limit_reached` holds a free account; a paid account's spent window stays with the quota path; `allowed === true` clears the hold on any plan. The monthly window stays out of the quota windows.
4. **Claude and Grok use the same hold.** Claude profile flags `hasClaudePro === false` and `hasClaudeMax === false` on a non-team, non-enterprise organization read as `free`. An Anthropic `400` whose parsed `error.message` matches `credit balance is too low` holds the account as `no-credits` for 3600 seconds and rotates; other 400s relay untouched. A Grok refusal matched by `isGrokExhaustion` holds the account instead of calling `markRateLimited`: `402` or a credits or balance message gives `no-credits` (3600 seconds without `retry-after`), otherwise `exhausted` (60 seconds without `retry-after`, as before this change). `retry-after` is honoured up to 3600 seconds.
5. **Recovery.** Any response below 400 clears the hold. When every account is unavailable, the all-unavailable probe (`_selectProbe`, `src/account-manager.js:2480`) sends one real request per hour to a held account; a 2xx clears it, a 429 re-arms it. A wham probe saying `allowed: true` clears it. A re-login or a credential sync (`src/sync-accounts.js`, beside `clearCredentialRejected`) clears it. In a mixed pool with the quota probe off, a held account is never selected, so it recovers only on re-login, on sync, or at its reset date.
6. **Fast fail when every candidate is billing-held and the hold outlasts any wait.** The no-account branch answers at once when `soonestUntil - now > max(holdSeconds, INLINE_RETRY_AFTER_MAX_SECONDS)`, before the reset-credit redeem (`src/server.js:3318`), the `holdSeconds` loop (`:3372`) and the inline wait (`:3384`). Nothing is going to free up in time. A shorter hold, such as a Grok 60-second one, falls through to those waits as any other block does. With a mix of held and throttled accounts, `exhaustedMessage` (`:2848`) lists the held ones with their reset dates.
7. **Members never see account names** ([ADR-004](004-pool-view.md)). A member gets a count: "Codex pool: no paid account available; 1 account is on a free plan, limit reached, resets 2026-11-30." The administrator key and non-member keys get the account named.
8. **`retry-after` is capped at 3600 seconds on both paths.** The message keeps the real date. The fast-fail caps its own header. `blockingResets` (`src/server.js:4851`) pushes `min(billingHold.until, now + 3600s)`, so the mixed-pool answer through `computeRetryAfter` (`:4954`) is capped too.
9. **A free plan with headroom is only reported.** It gets a badge. It is not deprioritized.
10. **Dashboard.** The status payload carries `billing: billingStatus(a, now)` beside `unavailable` (`src/account-manager.js:5481`). `accountBadges` (`src/dashboard.js:313`) adds one badge after the status badge: the plan name, "free plan", "{plan} · limit reached · resets {date}", or "no credits". The pool view already returns `limited` for any `unavailable` reason (`accountState`, `src/pool-view.js:53`), so a held account shows "Limited" and its Plan column "Free".

## Contract

Status payload (`GET /relaycrew/status`), per account, additive: `billing: {kind, plan, until, reason}` and `quota.billingHold`.

Fast-fail answer on `/backend-api/codex/*`: `429`, `retry-after` per rule 8, body `{error: {type: 'usage_limit_reached', message, plan_type, resets_at}}`. On every other path: `429`, same `retry-after`, body `{type: 'error', error: {type: 'rate_limit_error', message}}`. A `no-credits` hold with no reset date answers `retry-after: 3600`. Only the fast-fail site builds its body with `providerErrorBody`. The mixed-pool no-account 429 stays Anthropic-shaped on every path, as before; the other literal sites are unchanged.

Pool view (`GET /relaycrew/accounts/pool`): no new field. `plan` may read `Free`; `state` reads `limited` for a held account.

New dashboard strings go in both the `pt` and `es` catalogs in `src/dashboard-translations.js`.

## Consequences

- A member on a dry free pool gets a 429 in under a second with the pool's reset date, instead of a 30-second client timeout.
- `admit()` stays unbounded. No pause is armed for this 429 any more, and a real rate-limit pause is still at most 60 seconds (`RATE_LIMIT_ABSORB_MAX_SECONDS`, `src/server.js:80`). Bounding `admit()` would have hidden the bug 30 seconds at a time.
- A paid plan is never billing-held. Its `usage_limit_reached` is a rate-limit hold of at most an hour, so the reset-credit redeem and the `holdSeconds` wait still apply to it.
- Every 429 body is read once, for every provider, bounded by `ERROR_BODY_INSPECTION_LIMIT` (`src/server.js:121`). A read error inside the peek is swallowed like `readErrorBody` does: nothing is classified and the error replays to the normal handling.
- Known gaps. wham `credits.has_credits` and `balance` are not used: `allowed` is the verdict, credits are a hint with no evidence of how upstream applies them. The Claude profile is still fetched once; a plan change is learned from the 400 or 429 path. Grok has no plan signal before a request fails (see [grok-billing-signal](../backlog/1-inbox/providers/grok-billing-signal.md)). A Claude account with no profile reads `unknown`, never `free`.
- The Codex CLI's rendering of our synthetic `usage_limit_reached` body was checked against the upstream shape, not a live CLI.

## Alternatives considered

- **`markRateLimited(min(resets_in, 3600))` plus a display-only billing record, for the free plan.** Two clocks for one fact: `retry-after` says one hour, the message says November 30, the badge says active after an hour. Rejected for that contradiction. The hold itself is what a paid plan's `usage_limit_reached` gets (decision 3): there it is a spent window with a reset inside the week, and the badge keeps the plan name.
- **Teach `windowBucket` a `monthly` class and let the spent-window path hold the account.** Touches every consumer of the bucket enum (quota rows, TUI, pool totals) for one verdict, and says nothing about Claude credits or Grok.
- **A new `account.status = 'billing'`.** `status` is overwritten by `markRateLimited` and `clearRateLimited` (`src/account-manager.js:4935-4960`), so every writer would need a precedence rule. A reason in `unavailable` needs none, as `'entitlement'` shows today.
- **Replay upstream's 429 body verbatim on the Codex path.** It names one account's reset, not the pool's, and leaks the account to members.
- **Bound `admit()` to 30 seconds.** A timer on the symptom. The request still waits 30 seconds for a reset 27 days out.
