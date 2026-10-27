# 02 · Provider accounts

Connect provider accounts on the machine running RelayCrew. Each account becomes capacity that you can grant to members.

## Choose a login method

| Command | What you connect |
| --- | --- |
| `relaycrew login --claude` | Claude subscription account |
| `relaycrew login --codex` | ChatGPT/Codex subscription account |
| `relaycrew login --claude-api` | Anthropic API key |
| `relaycrew login --openai-api` | OpenAI API key for Responses |

On a VPS, use the `rc` helper from the [deployment tutorial](../teams.md). It selects the service's user and configuration. For example, `rc login --claude` updates the gateway's configuration.

## Complete subscription authorization

1. Run the command for the provider.
2. Open the printed authorization URL in your laptop's browser.
3. Sign in with the intended provider account.
4. Submit the returned code or callback URL when the CLI prompts for it.
5. Check Accounts in the dashboard, then assign the account to members in Team.

`--claude --token` explicitly uses Claude's copy-and-paste flow. A Codex sign-in can return to `http://localhost:1455/auth/callback`. If that page cannot load on your laptop, paste its complete address into the VPS prompt.

API-key methods prompt for the provider key directly. New API-key accounts use priority 100 unless you specify another priority.

## Check the connected account

Run `rc team accounts` to list stable account IDs. Use these IDs for explicit grants. Login commands notify the running gateway after saving. If saving succeeds but reload fails, reload from Settings or restart the service.

Existing scripts can keep using `--oauth`, `--token`, and `--api`. See [account management](../accounts.md) for aliases, imports, priorities, token refresh, and reconnection. See [OpenAI API accounts](../accounts.md#openai-api-key) for the supported HTTP paths.

Provider onboarding through the web dashboard remains [planned in issue #3](https://github.com/sep1ol/relaycrew/issues/3).

---

[Previous · Installation](../01-installation/README.md) · [Documentation index](../README.md) · [Next · Developer Setup](../03-developer-setup/README.md)
