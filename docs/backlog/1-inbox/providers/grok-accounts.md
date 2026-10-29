---
title: Grok accounts
origin: owner
layers: gateway, dashboard, cli
created: 2026-10-29
destination:
---

# Grok accounts

## Idea
Pool xAI/Grok accounts the same way Claude and Codex accounts are pooled, so a member can sign in with Grok and contribute it, privately or to the pool.

## Today
There is no Grok provider. `src/provider.js` knows Anthropic, Codex and OpenAI. The closest path is a third-party backend account (`upstream` + `accessToken`, docs/accounts.md "Third-party backend accounts"), which only works if the backend speaks the Anthropic Messages API.

## Why it helps
More providers in one gateway, one member key for all of them.

## Questions and risks
- Does xAI offer a subscription sign-in usable by a third-party client, or only API keys? Verify in xAI's current docs before designing.
- Which wire protocol would members' clients use against it (Anthropic-compatible, OpenAI Responses, Chat Completions)?
- Provider terms for pooled use.
- Touches ADR-001 (member-owned accounts) only by adding a provider.

## Agent opinion
Maybe. Worth it once the API shape and the terms are verified.
