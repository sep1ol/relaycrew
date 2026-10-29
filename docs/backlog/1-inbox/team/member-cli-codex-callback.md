---
title: Codex callback capture in the member CLI
origin: agent
layers: cli
created: 2026-10-29
destination:
---

# Codex callback capture in the member CLI

## Idea
When a member adds a Codex account from their laptop, listen on `localhost:1455` there and forward the captured callback to the gateway, so the member does not copy the broken page's address by hand.

## Today
OpenAI fixes the Codex redirect to `http://localhost:1455/auth/callback`. ADR-001 v1 asks the member to paste the full callback address.

## Why it helps
Removes the most confusing step of the Codex sign-in for members.

## Questions and risks
- Port 1455 may be held by a local Codex CLI login.
- The paste path must stay as a fallback.

## Agent opinion
Do, after v1 ships.
