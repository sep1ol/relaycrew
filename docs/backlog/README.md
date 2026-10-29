# Idea backlog

Ideas worth remembering. An idea here is **not a decision**. Over time each one becomes one of these, or goes to the trash:

- a new **ADR** or an ADR note in `docs/adr/`, when it changes an access rule, a contract between layers, or personal data;
- an **implementation** (issue, PR);
- a new **doc** in `docs/`.

## Layout

Two folder levels: **state / category / idea**, for example `1-inbox/providers/grok-accounts.md`. One idea is one file. When its state changes, move it to the new state folder and **keep the category** (`git mv 1-inbox/team/x.md 2-discussing/team/x.md`). A category folder is created only when the first idea reaches that state.

| Folder | State | Who moves it |
|---|---|---|
| `1-inbox/` | written down, nobody evaluated it yet | anyone (owner or agent) creates here |
| `2-discussing/` | the owner wants to think; open questions | owner |
| `3-approved/` | the owner wants it; still needs an ADR or issue | owner |
| `4-promoted/` | became an ADR, PR or doc (`destination` filled in) | whoever promoted it |
| `trash/` | discarded, **with the reason** | owner |

The trash is never deleted. Recording why an idea fell keeps it from being proposed again three months later.

State and category come only from the folders. Origin and layers live in the header.

[SUMMARY.md](SUMMARY.md) lists every idea by category, with state and one line. **Created, moved or discarded an idea → update the summary in the same commit.**

## Template

Path: `<state>/<category>/short-title.md` (no number).

```markdown
---
title: Short title
origin: owner | agent | user X
layers: gateway, dashboard, cli
created: YYYY-MM-DD
destination:            # fill in when promoted: ADR-0NN, PR #NN, docs/...
---

# Short title

## Idea
What it is, in 2-3 sentences, with a concrete example.

## Today
What the system already does that is close (verified in code, with path).

## Why it helps
For whom, which pain it removes.

## Questions and risks
ADRs it touches, provider terms, cost.

## Agent opinion
do / maybe / discard, and why, in one line.
```
