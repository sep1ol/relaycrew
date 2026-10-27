# Dashboard screenshots

These PNGs show the local synthetic preview. They contain no real provider credentials, member keys, or private request data. The preview banner remains visible so the source of the data is clear.

Captured on 2026-10-27 using Orca’s embedded browser. The dashboard UI is from [6824367](https://github.com/sep1ol/relaycrew/commit/6824367), with the synthetic preview fixture updated in this documentation change to represent separate Claude, Codex, and OpenAI API pools.

## Refresh the images

1. Run `npm run preview` from a source checkout.
2. Open the printed dashboard URL in a browser. Use Orca's embedded browser when available.
3. Sign in with the administrator key from the protected temporary configuration printed by the preview command.
4. Use a desktop viewport of 1600 × 1250 CSS pixels. Wait for the data to load, then capture a normal viewport screenshot near the top of each view. Check that the image has no horizontal clipping or repeated sections. Avoid oversized viewport captures on a client-hosted browser.
5. Capture Overview in light and dark themes as `overview-light.png` and `overview-dark.png`.
6. Capture Accounts, Team, and Usage in the light theme as `accounts.png`, `team.png`, and `usage.png`.
7. Check every image for stale content and accidentally exposed credentials before committing. Keep the synthetic-data banner visible and never capture a one-time key reveal.
8. Update the [visual tour](../../04-dashboard/README.md) if a control or workflow changed.

Browser device scale can affect the PNG's pixel dimensions. The CSS viewport defines the layout. These captures use 1600 × 1250 PNGs. Longer views continue below the captured viewport. Keep the screenshots as actual captures rather than mockups. Stop the preview after capture when it is no longer needed.
