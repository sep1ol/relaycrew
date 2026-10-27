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

Grant members the accounts that belong in their shared pool and keep those accounts at the same priority. Enable conversation distribution with `rc distribute on`. New conversations go to eligible accounts with fewer active conversations, and a conversation stays on its account for cache reuse until it needs to move.

Use `rc distribute load` instead to place new conversations according to requests served over the last ten minutes. The unit is a conversation rather than a developer. Existing conversations stay where they are, so changes in an established workload drain gradually.

The dashboard threshold controls quota-driven rotation; it does not enable distribution. The default distribution mode is off. The existing adaptive mode favors spending down windows with less remaining credit and is not an even capacity-weighted assignment of developers. Review [session-aware routing](../routing.md#session-aware-routing), [load distribution](../routing.md#load-distribution), and [adaptive distribution](../routing.md#adaptive-distribution) before choosing a mode.

## Back up and upgrade

Follow the [private-data backup instructions](../teams.md#back-up-private-data), then the [upgrade and recovery procedure](../teams.md#upgrade-and-recover). Back up persistent data, not only the source checkout. Restoring older data can also restore older access policy.

Use [installation troubleshooting](../teams.md#troubleshoot-an-installation) for connection failures, authentication errors, unavailable accounts, and lock recovery. Detailed quota and selection behavior lives in [quota](../quota.md) and [routing](../routing.md).

---

[Previous · Dashboard](../04-dashboard/README.md) · [Documentation index](../README.md) · [Next · Contributing](../06-contributing/README.md)
