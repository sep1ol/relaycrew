# Operate the RelayCrew dashboard

Start the gateway, then open `/dashboard` on its origin. For a local installation the default address is `http://localhost:3456/dashboard`. `relaycrew dashboard` opens it in your browser. Use HTTPS or an SSH tunnel when connecting to a VPS.

The page itself is public and contains no account data. Requests for data and controls use the gateway's authentication rules. In team mode, sign in with your member key for your own accounts or the administrator key for fleet management. Team management and usage history always require the administrator key, including on localhost. Member keys cannot inspect the fleet or manage another member.

## Workspace views

- Overview shows the current fleet, account availability and operational problems.
- Accounts retains quota windows, resets, account eligibility, credits and usage details. Switch accounts, change priorities and enable or disable them.
- Team lists members, explicit account grants, concurrency and usage. Add members, edit grants and limits, revoke access, reactivate a member or rotate a key.
- Usage combines existing cumulative/windowed counters with historical distribution by member or configured usage dimension.
- Sessions retains conversation details, filters, sorting and account pins.
- Settings provides threshold controls, configuration reload, quota probes and routing information.

The dashboard updates the existing status snapshot every five seconds. Team and history data are fetched when their views need them. Errors remain visible rather than replacing missing data with a healthy status.

## Language and chart preferences

English is the default dashboard language. The language selector also offers Portuguese (Brazil) and Spanish. The browser remembers the selected language for this gateway. Dates and numbers follow the selected language; account names, model identifiers, and provider error messages retain their original values.

Chart series use distinct default colors. Select a color in the legend to customize it, or use its reset control to restore the default. The same member or group keeps its color across the overview chart, Usage timeline, and distribution bars. Color preferences are stored in this browser for the current gateway, independently for each grouping. Custom colors apply to light and dark themes. Clearing browser storage removes these preferences. If storage is unavailable, the current page can still use the selection.

The workspace frame fits inside the viewport with padding on every side. The main content pane owns vertical scrolling, while wide tables can scroll horizontally inside their wrappers. The page around the frame stays still.

## Manage team access

Enable team mode with `relaycrew team init` before adding members. Operators can connect provider accounts on the gateway through `relaycrew login`; members can use the self-service flow below.

Choose explicit stable account IDs or deliberately grant all current and future accounts. Member names identify usage and stay immutable. With no account grants, a member can use only their own accounts.

A created or rotated key appears only in its mutation response and the one-time reveal dialog. Copy it before closing the dialog and distribute it privately. Normal listings never return the key. Revocation, rotation and grant removal refresh the live access policy and cancel affected in-flight requests.

Changes use an optimistic revision and the shared configuration lock. If someone else changes the team, refresh and review the latest policy before saving your draft again. A stale whole-configuration save cannot restore older team keys or grants. A busy live writer causes the write to fail instead of proceeding without its lock.

A successful response distinguishes `saved` from `applied`. If the configuration was saved but a runtime reload failed, the response retains any newly issued key and explains that a reload is required. Do not retry key issuance just because the reload failed.

## Member self-service

Sign in with your member key to open **My accounts**, which lists only accounts you own. Choose **Add my account**, a provider (Claude, ChatGPT/Codex, or Grok), and sharing: **Private** allows only your key; **Pool** follows the team's account grants. For Claude, paste the code shown after sign-in. For ChatGPT/Codex, paste the full address of the final localhost page, even though that page does not load. For Grok, open the link and confirm the displayed code; the dialog waits until confirmation. Cancel stops a pending sign-in. Grok requires a gateway version that supports it.

## Pool

Below **My accounts** (members) and above the fleet cards in **Accounts** (administrators), the Pool shows the remaining quota of the accounts shared with the team: operator accounts and member accounts set to **Pool**, plus your own private accounts marked as yours. Other members' private accounts are not shown or counted.

Accounts are grouped by provider (Claude, ChatGPT/Codex, Grok, API keys, Other). Each group header carries the group totals per window as bars of remaining quota, for example "5h · 62% left · resets in 1h 20m" or "Week · Opus · 15% left"; the table below lists each account by owner (`team` for operator accounts), plan, sharing, one bar per window, and state. A full bar means plenty left; low remaining turns amber, then red; "?" means no reading yet; a reading older than 30 minutes says so. "Not in your access" marks accounts your grant does not include. Grok reports no usage signal. Accounts that are out of quota still count toward totals, so a spent pool reads as spent. Disabled accounts, accounts in error and accounts stopped by an operator cap stay listed but do not count.

The Pool never shows account names, emails, IDs, routing, spend or usage. It refreshes every 15 seconds while its view is open. See [ADR-004](adr/004-pool-view.md).

You can enable, disable, change sharing, or remove your accounts. An account disabled by an administrator can only be re-enabled by an administrator. Administrators see Owner and Sharing in Accounts and Team and can enable, disable, or remove member-owned accounts; only the owner can change sharing. Private accounts owned by other members are excluded from the Team editor's account picker. Removing an account requires confirmation and interrupts its traffic. Before pooling a Grok subscription, check its Auto Top-up setting: shared usage may spend your prepaid credits.

## Read historical distributions

History projects the existing persisted 15-minute usage slots. Select the last five or 24 hours, 15-minute or hourly buckets, and requests, input tokens or output tokens. Compare members or one configured usage dimension. The largest 12 series appear separately; the remaining series are combined while preserving totals. Charts and their accessible tables use the same values.

The first and current buckets may be partial. Missing samples mean no recorded activity; they do not prove that the server was online and idle. Old state without slots cannot be backfilled. Normal restarts restore saved slots, while an abrupt shutdown may lose usage since the latest state save. Retention is bounded to the existing 24-hour window plus its boundary slot. There is no weekly historical series or reconstructed bill.

Member history accounts for requests attributed to named keys. Administrator or unattributed traffic does not become a member series. Dimension totals describe the same traffic from another perspective and must not be added to member totals.

## Administrative API

All responses below use `Cache-Control: no-store`. Send the administrator key in `x-api-key`. Mutations use POST and must satisfy the same-origin browser checks.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/relaycrew/team` | Member/account choices and current revision, without credentials |
| POST | `/relaycrew/team/add` | Create a member and issue a key |
| POST | `/relaycrew/team/update` | Update grants, concurrency and enabled state |
| POST | `/relaycrew/team/rotate` | Replace a member key |
| POST | `/relaycrew/team/revoke` | Disable a member |
| GET | `/relaycrew/usage/history` | Bounded historical counters |
| GET | `/relaycrew/accounts/pool` | Remaining quota of shared accounts for the caller (member or administrator key) |

Every mutation includes `revision` and `name`. Add/update include `accounts` and `maxConcurrent`; update also includes `disabled`. Creation and rotation alone return `issuedKey`. Conflicts return 409 and lock contention returns 503.

History requires `scope=clients` or `scope=dimension&dimension=<configured-name>`, `window=5h|24h`, `step=15m|1h`, and `metric=requests|inputTokens|outputTokens`. Unknown or repeated parameters are refused. The response contains aligned `buckets`, bounded `series`, and conserved `total` values plus coverage metadata.

## Preview without provider credentials

Run `npm run preview` from a source checkout. It starts an isolated loopback-only gateway at `http://localhost:43190/dashboard` with clearly labeled synthetic accounts, members and 24-hour history. It prints the temporary protected configuration path; read its administrator key there to sign into the local demonstration. `RELAYCREW_PREVIEW_PORT` selects another unprivileged port. Stop with Ctrl+C to stop the gateway and remove its temporary configuration. The preview never imports your provider accounts and uses a local synthetic upstream.

## Recover an interrupted configuration lock

A live holder is never bypassed. Normal dead-PID lock recovery is serialized by a separate `.lock.recovery` guard. If a process crashes while holding that recovery guard, stale-lock recovery fails closed. Stop the gateway and all other configuration writers before manually removing the abandoned `.lock` and `.lock.recovery` files beside the configuration. Restart only after cleanup. Never delete a lock while a writer may still be running.
