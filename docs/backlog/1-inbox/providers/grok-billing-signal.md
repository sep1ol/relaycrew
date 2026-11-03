---
title: Grok billing signal before a request fails
origin: agent
layers: gateway, dashboard
created: 2026-11-03
destination:
---

# Grok billing signal before a request fails

## Idea

Find out whether xAI exposes a subscription, plan, or usage endpoint that a Grok CLI account token can call. If one exists, probe it the way the Codex `wham/usage` and Claude profile probes work, and show the billing state of a Grok account in the dashboard and the pool view before a request fails. Example: a member opens the pool view and sees "Grok, free plan, limit reached, resets Friday" instead of "No usage signal from this provider".

## Today

Grok has no probe. `probeApplicable` (`src/prober.js:41-43`) covers Anthropic OAuth, Codex OAuth, and backends only, and `src/grok-auth.js` has no plan or usage code. The only billing signal is an inference refusal: for status 429, 402, or 403, `isGrokExhaustion` (`src/provider.js:263-266`) matches `usage limit reached`, `out of credits`, `usage balance exhausted`, or `spending limit` in the body. [ADR-005](../../../adr/005-billing-state.md) turns that match into a billing hold, so the account stops being selected after the first failure. The pool view shows the Grok group with "No usage signal from this provider" and no windows ([ADR-004](../../../adr/004-pool-view.md)).

## Why it helps

A member picking a provider for a long task sees whether the Grok accounts in the pool can spend before the first request burns one failure and a hold. The administrator sees a free or exhausted Grok account on the fleet card without waiting for a member to hit it. The Grok group in the pool view gets a plan column and a state like the other providers.

## Questions and risks

- Does xAI expose any account-level endpoint (plan, credits, rate windows) that accepts the token Grok CLI stores? Candidates to check: the endpoints the Grok CLI calls at startup, the xAI console API, and the headers on a successful inference response.
- If an endpoint exists, is calling it from a gateway allowed by xAI's terms, as discussed for subscription accounts in [ADR-002](../../../adr/002-grok-accounts.md)?
- Which fields map to `billingStatus` kinds (`paid`, `free`, `exhausted`, `no-credits`)? Is there a reset date, or only a boolean?
- Does the response carry windows that fit the pool view's `remaining` fraction, or only a plan name?
- Cost: one probe per account per `quotaProbeSeconds`, same as Codex. Is the endpoint itself rate-limited?
- If nothing exists, close this idea to the trash with that finding so it is not proposed again.

## Agent opinion

Maybe. Worth one afternoon of research with a real Grok CLI token. Implement only if an endpoint exists and the terms allow it.
