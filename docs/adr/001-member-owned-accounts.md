# ADR-001: Members add their own provider accounts

- **Status:** accepted
- **Date:** 2026-10-29
- **Deciders:** sep1ol (owner)
- **Layers:** gateway / dashboard / cli / config

## Context

In team mode only the administrator adds provider accounts, by running `relaycrew login` or `relaycrew import` on the gateway host. A member holds a member key (`proxy.clientKeys[]`) whose `accounts` grant is `"*"` (all current and future accounts) or a list of account IDs. The member key reaches inference routes and `GET /relaycrew/me` only (`src/server.js` member gate). No HTTP route adds an account.

Members (people or bots) want to contribute their own Claude or ChatGPT/Codex subscription. Some want to keep it for themselves and some want to share it with the team.

Three facts in the code shape the decision:

- `teamAllowsAccount` (`src/team-access.js`) is the single evaluator behind selection exclusions, hard pins, post-admission checks, the upstream `authorize` callback and `TeamAccess.refresh()`. `"*"` is evaluated live, so any new row is immediately usable by every `"*"` member.
- Identity dedup (`src/identity.js`) is global. A second sign-in to the same provider account updates the existing row.
- The PKCE verifier lives in the closure returned by `startOAuthLogin` / `startCodexLogin`. No server-side pending-login state exists.

## Decision

1. **Any member may add** a Claude subscription or a Codex/ChatGPT subscription account. There is no per-member permission flag.
2. **Ownership is a field on the account row:** `owner: { name, sharing }`. `name` is the member name, which is permanent (revoke keeps it). Rows without `owner` are operator rows and behave exactly as before.
3. **Sharing:**
   - `private`: only the owner's key routes to it. Other members never do, whatever their grant says, and the administrator key does not route to it either. The administrator still manages it.
   - `pool`: normal grants apply. Members with `"*"` use it immediately. Members with an ID list use it only after the administrator adds its ID.
   - The owner always routes to their own account, even when their grant is an ID list that omits it.
4. **Management:** the owner and the administrator may disable, enable or remove an owned account. Only the owner switches `private` and `pool`, so nobody else can share a member's personal subscription. Operator rows have no sharing setting. A member can never see or touch rows they do not own.
5. **One row per provider account.** A sign-in that matches a row owned by someone else (another member, or the operator) is refused with 409 and changes nothing. A sign-in that matches the same owner's row refreshes its tokens and keeps its ID, name, sharing and disabled state.
6. **Disabling, removing or making private revokes live traffic:** the change is saved, the gateway reloads, and `TeamAccess.refresh()` aborts requests that are no longer allowed, including requests on a disabled account. Reload marks a removed live account disabled before dropping it, so active requests retaining that object are also aborted.
7. **Owned credentials stay on the gateway.** They are never pushed to callback.net credential sync.
8. **Two entry points share one HTTP contract:** the dashboard (member signs in with their key) and `relaycrew member ...` on the member's laptop, pointed at the gateway URL. The gateway never binds the Codex callback port 1455 for a member login; the member pastes the full callback address.
9. Pending logins live in gateway memory for 5 minutes, one per member, and are lost on restart. The single-replica limit in [team-architecture.md](../team-architecture.md) already covers this.

## Contract

All routes are team-mode only, authenticated with the member or administrator key, `Cache-Control: no-store`, JSON bodies up to 64 KiB with a strict field allowlist. POSTs pass the existing same-origin control gate.

| Route | Who | Body | Result |
|---|---|---|---|
| `GET /relaycrew/accounts` | member, admin | | member: own rows; admin: all rows. Each `{id, name, provider, owner, sharing, disabled}` |
| `POST /relaycrew/accounts/login` | member, admin | `{provider: "claude"\|"codex", sharing: "private"\|"pool"}` | 201 `{login: {id, provider, paste, url, expiresAt}}` |
| `POST /relaycrew/accounts/login/complete` | the member or admin who started it | `{id, code}` | 200 `{action, account}`; 400 unusable paste (login stays open); 404 unknown or expired; 409 owned by someone else; 502 provider refused |
| `POST /relaycrew/accounts/login/cancel` | the member or admin who started it | `{id}` | 200 |
| `POST /relaycrew/accounts/update` | owner, admin | `{id, disabled?, sharing?}` | 200 `{account}`; 403 not yours; `sharing` only by the owner (403 for the administrator, 400 on operator rows) |
| `POST /relaycrew/accounts/remove` | owner, admin | `{id}` | 200 `{removed}`; 403 not yours |

A member gets 403 for an unknown ID too, so IDs cannot be probed. An administrator completing a login creates an operator row.

Config: `accounts[].owner = { name: string, sharing: "private" | "pool" }`, additive. `GET /relaycrew/team` account entries gain `owner` and `sharing`.

CLI on the member's laptop (no local config):

```bash
export RELAYCREW_GATEWAY=https://gateway.example.com
export RELAYCREW_KEY=<member key>
relaycrew member login --claude --private
relaycrew member login --codex --pool
relaycrew member accounts
relaycrew member disable|enable|remove <account-id>
relaycrew member share <account-id> --private|--pool
```

## Consequences

- Members contribute capacity without handing credentials to the administrator.
- A pooled member account joins every `"*"` grant at once. The administrator controls exposure through explicit grants, disable and remove.
- A member action changes the team revision, so an administrator editing the Team view at the same moment gets a 409 and refreshes.
- The token exchange and profile lookup run from the gateway's network, as the administrator's remote `login --token` already does.
- Fleet-wide components (prober, keep-warm, status for the administrator) still see private rows. Members never see fleet status.
- Pooling personal subscriptions may conflict with a provider's terms. The administrator remains responsible, as [team-architecture.md](../team-architecture.md) already states.

## Alternatives considered

- **Grant-side ownership** (`clientKeys[].owned`, `clientKeys[].private` lists). Rejected: the evaluator would scan every member to learn whether a row is private, and ownership would have two sources of truth.
- **Reinterpreting `"*"` as "all pool accounts"** with an exclusion list elsewhere. Rejected: every evaluator call site would need the list; one owner clause in the single evaluator covers all of them.
- **Owner as part of identity, allowing duplicate rows for one subscription.** Rejected: two rows double-count one quota and compete as separate accounts. A 409 is simpler and explicit.
- **A new stable member UUID as the owner key.** Rejected for now: member names are already permanent and unique, and revoke keeps them. Hand-deleting a member and re-adding the same name would hand over their rows; the docs say to revoke, not delete.
- **The member's CLI runs OAuth locally and uploads finished tokens.** Rejected: the dashboard would have no path, and the gateway would accept arbitrary credentials over HTTP.
- **Restartable pending logins stored on disk.** Rejected: it would put PKCE secrets on disk to save a member one retry after a restart.
