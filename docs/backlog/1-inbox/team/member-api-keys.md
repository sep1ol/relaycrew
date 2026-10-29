---
title: Members add API keys
origin: agent
layers: gateway, dashboard, cli
created: 2026-10-29
destination:
---

# Members add API keys

## Idea
Let a member contribute an Anthropic or OpenAI API key, with the same private/pool choice as subscription accounts.

## Today
Only the admin adds keys (`relaycrew login --claude-api|--openai-api`). ADR-001 covers member-owned Claude and Codex subscription sign-ins only.

## Why it helps
A member with a company key could share it without handing it to the admin.

## Questions and risks
- A key is metered: whoever owns it pays for every pooled token. Needs a clear warning and probably a spend cap.
- API keys have no identity to dedup on; the same key can be added twice.

## Agent opinion
Maybe. Add only after members ask for it.
