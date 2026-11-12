# ADR-007: Pool pill shows used quota

- **Status:** accepted
- **Date:** 2026-11-12
- **Deciders:** sep1ol (owner)
- **Layers:** dashboard
- **Replaces:** ADR-006 decision 1's remaining percentage and thresholds only

## Context

The owner reads quota as used, as on claude.ai. The Pool pill's remaining percentage reads backwards to them.

## Decision

1. Show each provider's maximum used share across known total windows, with warning at 70% and danger at 90%. This supersedes ADR-006 decision 1's minimum known remaining total, warning at 30% and danger at 10%. Unknown capacity keeps the icon without a percentage.
2. Convert `used = 1 - remaining` at render time in `src/dashboard-workspace.js`. Popover totals, bar fills, meter values and accessible labels show used quota; account lines show the maximum used share across known windows. Keep reset durations and unknown readings unchanged.

## Contract

`GET /relaycrew/accounts/pool`, its `remaining` fields, permissions and projection in [ADR-004](004-pool-view.md) remain unchanged. Placement, interactions and polling in [ADR-006](006-pool-pill.md) remain unchanged.

## Consequences

The pill and popover match the owner's quota reading: higher percentages and fuller bars mean more quota used. No API migration is needed.

## Alternatives considered

- Keep remaining percentages: conflicts with the owner's expected reading.
- Change the API to used quota: unnecessary contract change for a dashboard presentation choice.
