# 05 · Daily operations

Keep RelayCrew running under systemd or Docker Compose. The service runs without an open administrator terminal and can restart after a crash.

## Check the gateway

Open Overview and Accounts to inspect availability and operational alerts. Review Team and Usage when a developer reports a failed request or a concurrency limit.

For a native installation:

```bash
sudo systemctl status relaycrew.service
sudo journalctl -u relaycrew.service --since '30 minutes ago'
```

For Docker Compose, run these commands from `/opt/relaycrew`:

```bash
sudo docker compose ps
sudo docker compose logs --tail 50 gateway
```

## Maintain access and accounts

Use Team to change grants, limits, and enabled state. Rotate a key when replacing a developer credential. Revoke access when the developer leaves.

RelayCrew refreshes subscription tokens when supported. If a provider rejects the login, reconnect the account using its provider-specific CLI command. API keys and subscriptions retain their provider limits. When no permitted account is available, check account status and the member's grants before changing concurrency.

A configuration change can be saved but fail to reload. Read that result carefully. Retry the reload or restart the service; repeating key creation or rotation would issue another key.

## Spread work across accounts

New configurations enable load-based conversation distribution. Existing configurations keep their setting, including quota-driven rotation when the field is absent. To enable load-based distribution on an existing native VPS installation, run:

```bash
rc distribute load
rc distribute
```

Expect `Session distribution: load`. These commands use the service-user helper from the [VPS tutorial](../teams.md). For Docker Compose, run `sudo docker compose run --rm gateway distribute load` from `/opt/relaycrew`. If the command reports a reload failure, reload from Settings or restart the gateway.

Grant each member every account in their shared pool. Use the dashboard's Team view or explicit IDs from `rc team accounts`:

```bash
rc team add alice --accounts '<account-a-id>,<account-b-id>' --max-concurrent 4
```

For an existing member, edit their grants in Team. A grant to only one account prevents failover to another account. An explicit `'*'` includes all current and future accounts.

Keep pool accounts at equal priority. Lower numbers are preferred, so accounts in a later priority tier act as fallbacks. Use Accounts in the dashboard or `rc priority '<account-name>' 0` for each subscription in the pool. Leave metered API keys at their default priority 100 if they should remain paid fallbacks.

New conversations go to eligible accounts with the fewest forwarded requests over the last ten minutes. On an idle pool, ties use active conversations and requests in flight. A conversation keeps its account for cache reuse, so existing traffic does not immediately rebalance. If its account becomes ineligible, RelayCrew selects another permitted account. With the default quota threshold, an account at 98% of a relevant quota window leaves rotation when that utilization is known to the gateway.

The unit is a conversation rather than a developer. Twenty independent conversations can spread across four accounts, but twenty developers need not produce five conversations per account. Request count is not token cost or developer productivity. Subscription prices do not set placement weights.

The dashboard threshold controls quota-driven rotation; it does not change the distribution mode. `rc distribute on` selects active-conversation balancing, and `rc distribute off` returns new conversations to quota-driven rotation while existing pins drain. Adaptive mode favors spending down windows with less remaining credit. Review [session-aware routing](../routing.md#session-aware-routing), [load distribution](../routing.md#load-distribution), and [adaptive distribution](../routing.md#adaptive-distribution) for details.

## Back up and upgrade

Follow the [private-data backup instructions](../teams.md#back-up-private-data), then the [upgrade and recovery procedure](../teams.md#upgrade-and-recover). Back up persistent data, not only the source checkout. Restoring older data can also restore older access policy.

Use [installation troubleshooting](../teams.md#troubleshoot-an-installation) for connection failures, authentication errors, unavailable accounts, and lock recovery. Detailed quota and selection behavior lives in [quota](../quota.md) and [routing](../routing.md).

---

[Previous · Dashboard](../04-dashboard/README.md) · [Documentation index](../README.md) · [Next · Contributing](../06-contributing/README.md)
