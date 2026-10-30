# Backlog summary

Every idea, by category. State = the folder the file is in (see [README](README.md)). Opinion = the agent's recommendation, not a decision. Created, moved or discarded → update this file.

## Categories

| Category | Covers |
|---|---|
| [providers](#providers) | Which provider accounts the gateway can pool and how they sign in |
| [team](#team) | Team mode: members, keys, grants, member self-service |

## providers

| Idea | State | Summary | Opinion |
|---|---|---|---|
| [Grok accounts](4-promoted/providers/grok-accounts.md) | promoted → ADR-002 | Pool xAI/Grok subscription accounts with member ownership | accepted |

## team

| Idea | State | Summary | Opinion |
|---|---|---|---|
| [Members add API keys](1-inbox/team/member-api-keys.md) | inbox | Let members contribute Anthropic or OpenAI API keys, not only subscriptions | maybe |
| [Codex callback capture in the member CLI](1-inbox/team/member-cli-codex-callback.md) | inbox | Catch the localhost:1455 redirect on the member's laptop instead of a manual paste | do |
| [Start with zero accounts](1-inbox/team/start-with-zero-accounts.md) | inbox | Start a team gateway before members contribute their provider accounts | do |
