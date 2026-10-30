# ADR-002: Grok subscription accounts

- **Status:** accepted
- **Date:** 2026-10-29
- **Deciders:** sep1ol (owner)
- **Layers:** gateway / cli / config

## Context

The owner wants Grok capacity in the pool, added by members themselves as in [ADR-001](001-member-owned-accounts.md). RelayCrew had no Grok provider.

Verified on 2026-10-29 against the official Grok CLI (`grok` 1.0.62), `https://auth.x.ai/.well-known/openid-configuration` and docs.x.ai:

- The Grok CLI signs in with xAI OAuth at `auth.x.ai`, public client `b1a00492-073a-47ea-816f-4c329264a828`, PKCE S256, and also supports the device-code grant (`POST /oauth2/device/code`, then poll `POST /oauth2/token`). No client secret. Access tokens are ES256 JWTs that last 6 hours; a refresh token renews them.
- Subscription inference goes to `https://cli-chat-proxy.grok.com/v1`: `POST /responses` (OpenAI Responses wire format, SSE) plus `GET settings`, `models`, `user`, `bundle/archive`, `subagents/bundle`, `feedback/config`. Requests carry `Authorization: Bearer <token>` and `x-xai-token-auth: xai-grok-cli`. The proxy routes on `x-grok-model-override`.
- The CLI can be pointed elsewhere: `GROK_CLI_CHAT_PROXY_BASE_URL` (or `[endpoints] cli_chat_proxy_base_url`) for the base, and `GROK_AUTH_PROVIDER_COMMAND` (or `[auth] auth_provider_command`) for the bearer. `models_base_url` is a different mode that switches the CLI to `/chat/completions`; it is not used.
- Model entries returned by `/models` can carry a `base_url` that the CLI then sends inference to, bypassing a gateway.
- The subscription is a weekly pool per seat. When it runs out, usage can continue as paid "Additional Usage" if the owner enabled Auto Top-up.

## Decision

1. New provider `grok`: subscription OAuth accounts (`type: "oauth"`, `provider: "grok"`), upstream `https://cli-chat-proxy.grok.com`. xAI API keys are out of scope.
2. Sign-in uses the **device-code flow** everywhere (`relaycrew login --grok` for the administrator, `relaycrew member login --grok` and the member account HTTP API for dashboard clients). The member opens a link on any device and confirms a short code. Nothing loads on localhost.
3. Clients reach Grok through the gateway under `/grok/v1/*`. The gateway strips `/grok`, authenticates the caller (member key as Bearer), picks a Grok account the caller may use (ADR-001 rules), and swaps in that account's token and identity headers. Bare `/v1/responses` stays the OpenAI API-key route.
4. The gateway removes `base_url` from model entries in `/grok/v1/models` responses so the CLI never bypasses it.
5. A conversation stays on one account (`x-grok-conv-id`), because encrypted reasoning and caches are account-bound.
6. Exhaustion is detected from error responses (usage limit, out of credits, spending limit, 429). There are no quota bars for Grok in v1.
7. Member and private/pool rules are exactly ADR-001's.

## Contract

- Config row: `{ type: "oauth", provider: "grok", accessToken, refreshToken, expiresAt, userId, teamId?, email?, owner? }`. Identity = `userId`, plus `teamId` when both records have it. Equal display names alone never identify a Grok account.
- Member login: `POST /relaycrew/accounts/login {provider: "grok", sharing}` returns `{login: {id, provider: "grok", paste: "none", url, userCode, expiresAt}}`. `POST /relaycrew/accounts/login/complete {id}` (no `code`) returns 202 `{ok: true, pending: true}` while the member has not confirmed yet; the client calls again. It returns 200 with the account when done.
- Member Grok CLI setup (`~/.grok/config.toml`):

```toml
[endpoints]
cli_chat_proxy_base_url = "https://<gateway>/grok/v1"

[auth]
auth_provider_command = "printenv RELAYCREW_KEY"
```

## Consequences

- Members contribute Grok capacity and use pooled Grok capacity from the official Grok CLI.
- **Terms risk.** xAI's consumer terms say "You may not share your account credentials or make your account available to anyone else", and the acceptable use policy forbids "circumventing any rate limits". A pooled Grok account does exactly that, and xAI can suspend the account. A private account (only its owner's requests use it) is lower risk. The owner chose to offer both; members decide for their own account.
- **Money risk.** A pooled account with Auto Top-up enabled may spend its owner's prepaid credits after the weekly pool runs out. The docs tell members to check this before choosing pool.
- The gateway presents requests as the Grok CLI (`x-xai-token-auth: xai-grok-cli`), as the CLI itself does.

## Alternatives considered

- **Authorization code + PKCE with a pasted loopback URL.** Rejected: the device flow needs no paste, and redirect-URI acceptance for this client could not be verified.
- **xAI API keys on `api.x.ai`.** Rejected for v1: billed to console credits, not to the subscription the owner wants pooled.
- **Serving Grok to Claude Code or Codex.** Rejected: the only Anthropic-compatible xAI endpoint is the deprecated public API, and Codex's tool types are not known to work against xAI's Responses implementation.
- **MITM on `cli-chat-proxy.grok.com`.** Rejected: the CLI's base URL and auth command settings are enough and simpler.

## Implementation notes

- Grok pending logins live for **15 minutes**, overriding ADR-001's five-minute default for this provider only. The provider's device code can last 30 minutes; RelayCrew uses the shorter lifetime. Claude and Codex remain at five minutes. Completion waits at most 20 seconds before returning 202. A result authorized between polls is retained until consumed or expired.
- The account manager refreshes about five minutes before expiry and after a 401, using the account's routing proxy and existing refresh coalescing and atomic config persistence. A returned refresh token replaces the previous one; an omitted refresh token preserves it.
- Only Grok OAuth accounts serve `/grok/v1/*`; legacy API-key fallback accounts are excluded. Recognized exhaustion phrases on 429/402/403 use the existing timed account cooldown (Retry-After, or 60 seconds without one), then fail over. Other errors keep the normal forwarding behavior.
- Conversation affinity applies to Grok even when session distribution is off. An eligible conversation account stays selected across model changes; revocation, disable, exhaustion or another availability failure still permits failover under the normal access rules. Pins use the existing in-memory session tracker: they expire after one hour idle and are lost on restart.
- `printenv RELAYCREW_KEY` follows the **documented contract verified in Grok CLI 1.0.62's bundled authentication guide and README**: commands run through `sh -c` on Linux/macOS (`cmd /C` on Windows), and surrounding stdout whitespace is trimmed. Its trailing newline is therefore accepted; shell variable expansion also works. The earlier stub findings directly verified literal `printf %s <dummy>`; they did not separately test newline trimming or environment expansion. This PR checked `printenv` with a fake environment value without contacting xAI. Windows users need a platform-appropriate environment-printing command.
- The member HTTP API exposes the login view for dashboard clients; this provider change does not add a dashboard member-login screen.
