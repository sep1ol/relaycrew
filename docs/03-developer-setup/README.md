# 03 · Developer setup

Give each developer a gateway URL and an individual member key. With a public HTTPS endpoint, developers do not need SSH access to the VPS. An SSH tunnel is the alternative for a private endpoint.

## Create member access

As an administrator, open Team (**Equipe**) in the dashboard. Add a member, select the permitted accounts, and set the concurrent request limit. Copy the member key when it appears and deliver it privately. The key is shown once.

The same operation is available through the service-user CLI:

```bash
rc team accounts
rc team add alice --accounts '<account-id>' --max-concurrent 4
```

An explicit `'*'` grant includes all current and future accounts. Select stable IDs when a member should use only specific accounts.

To share a pool dynamically, grant each developer all account IDs in that pool rather than a single account. Keep the accounts at equal priority. New configurations use load-based placement; existing installations can enable it with `rc distribute load`. See [sharing accounts](../05-operations/README.md#spread-work-across-accounts) for failover and placement limits.

## Connect Claude Code

In a Bash terminal on the developer's laptop, enter the member key:

```bash
read -r -s -p 'RelayCrew member key: ' TEAM_GATEWAY_KEY
export TEAM_GATEWAY_KEY
printf '\n'
export ANTHROPIC_BASE_URL=https://gateway.example.com
unset ANTHROPIC_API_KEY
export ANTHROPIC_AUTH_TOKEN="$TEAM_GATEWAY_KEY"
printf 'Authorization: Bearer %s\n' "$ANTHROPIC_AUTH_TOKEN" | \
	curl --fail-with-body --silent --show-error --header @- \
		"$ANTHROPIC_BASE_URL/relaycrew/me"
```

Replace the hostname with your gateway. For an SSH tunnel, use the local tunnel address instead. The member token overrides a saved Claude login without the API-key approval prompt. Your personal login remains saved.

After the check returns your member details, start `claude`. Run `/status` and confirm the gateway URL and `ANTHROPIC_AUTH_TOKEN` credential source. See [Claude Code configuration](../teams.md#configure-claude-code) for the token check, persistent settings, troubleshooting, and subscription-preserving MITM mode. Shell exports apply only to that terminal and its children. Restart existing Claude sessions after changing the configuration.

## Connect Codex

Choose the configuration matching the provider account granted to this developer:

- [ChatGPT/Codex subscription](../teams.md#configure-codex) uses a base URL ending in `/backend-api/codex` and retains the client's own subscription authentication.
- [OpenAI API key](../teams.md#configure-codex-with-an-openai-api-key) uses a base URL ending in `/v1`. The client uses the member key; the platform key stays on the VPS.

Keep the member key exported in the environment that launches Codex. The VPS tutorial contains the complete user-level TOML configurations and current compatibility limits.

## Verify the connection

Send a short prompt. Confirm that it completes and that the member's counters increase in Team or Usage. This request consumes provider capacity. Use the [member access checks](../teams.md#check-the-members-access) to verify identity and administrator boundaries without an inference request.

Developers continue running `claude` and `codex` on their laptops. The gateway handles account selection and authentication. Rotate or revoke their member key when access changes.

---

[Previous · Provider Accounts](../02-provider-accounts/README.md) · [Documentation index](../README.md) · [Next · Dashboard](../04-dashboard/README.md)
