# ADR-006: Pool capacity in the accounts header

- **Status:** accepted
- **Date:** 2026-11-12
- **Deciders:** sep1ol (owner)
- **Layers:** dashboard
- **Replaces:** ADR-004 decision 6 only

## Context

The full-width Pool sections compete with account management. A compact capacity summary belongs beside the accounts controls, with detail available on demand.

## Decision

1. Put a Pool pill first in the accounts header controls for each role. Show each provider's brand icon and minimum known remaining total, with warning at 30% and danger at 10%; unknown capacity shows only the icon.
2. Open a compact popover on hover, keyboard focus, or click/tap. It lists provider totals, ready counts, owners, plans, access tags, and stale readings. Escape and outside presses close it. Polling updates content without replacing the focused button or open popover.
3. Keep the existing 15-second polling while the accounts view is visible, forced reloads, and hidden state on HTTP 404.

## Contract

The route, permissions, projection, and data contract in [ADR-004](004-pool-view.md) remain unchanged. This supersedes only its dashboard placement and presentation decision.

## Consequences

Accounts retain the main space; pool detail requires opening the pill. Claude, OpenAI, and Grok SVG icons come from [@lobehub/icons-static-svg 1.102.0](https://www.npmjs.com/package/@lobehub/icons-static-svg/v/1.102.0), MIT; API keys and other backends use neutral monograms.

## Alternatives considered

- Keep the full-width tables: too much space for a secondary capacity check.
- Show one combined percentage: providers have separate capacity, and the tightest window is the useful constraint within each provider.
