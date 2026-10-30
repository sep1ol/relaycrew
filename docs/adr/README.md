# Architecture decisions (ADR)

An ADR records **one** decision that changes how the gateway works, **why** it was made, and what was rejected. The code says *what* it does. The ADR says *why*, and which rules cannot be broken without a new decision.

## When to write one

Write (or add a note to) an ADR when a change:

- changes **who may use, add, or manage** a provider account, or how that is decided (grants, ownership, team access);
- changes a **contract** between layers (HTTP control API, dashboard, member CLI, config file shape);
- touches **credentials or personal data** (tokens, emails, where they are stored or sent);
- chooses between real alternatives and rejects some for a reason;
- reverts or replaces an earlier decision.

Not needed: a bug fix with no rule change, visual tweaks, internal refactors.

## How

- File `NNN-short-title.md`, three-digit sequential numbers, in English.
- An ADR is **immutable in substance**. To change a decision, write a new ADR with `Replaces: ADR-NNN` and mark the old one `replaced by ADR-MMM`. Text fixes and "Implementation notes" at the end may be appended.
- The ADR is written **before or with** the code and ships in the **same commit or PR**.
- Cite real code paths and routes. An ADR that points to the wrong place misleads.
- Decisions made before this folder existed live in [team-architecture.md](../team-architecture.md) and [team-decisions.tsv](../team-decisions.tsv).

## Template

```markdown
# ADR-NNN: Title

- **Status:** proposed | accepted | replaced by ADR-MMM | discarded
- **Date:** YYYY-MM-DD
- **Deciders:** ...
- **Layers:** gateway / dashboard / cli / config

## Context
The real problem and how the system works today (verified in code).

## Decision
What now holds, in short rules. Who may do what, and with what record.

## Contract
Routes, permissions, response codes, new fields (always additive).

## Consequences
What gets better, what stays limited, what it requires (migration, configuration).

## Alternatives considered
Each with the reason it was rejected.
```

## Index

| ADR | Area | Title | Status |
|---|---|---|---|
| [001](001-member-owned-accounts.md) | Team | Members add their own provider accounts | accepted |
| [002](002-grok-accounts.md) | Providers / Team | Grok subscription accounts | accepted |
| [003](003-health-and-version-routes.md) | Gateway / Operations | Public health and version routes | accepted |
| [004](004-pool-view.md) | Team / Dashboard | Members see the pool's remaining quota | accepted |
