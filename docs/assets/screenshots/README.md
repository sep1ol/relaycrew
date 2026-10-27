# Dashboard screenshots

These PNGs show the local synthetic preview. They contain no real provider credentials, member keys, or private request data. The preview banner remains visible so the source of the data is clear.

The documentation tour images were captured on 2026-10-27 using Orca’s embedded browser. Their dashboard UI is from [6824367](https://github.com/sep1ol/relaycrew/commit/6824367), with a synthetic preview fixture representing separate Claude, Codex, and OpenAI API pools.

`readme-accounts-light.png` is the README image for both GitHub themes. It was captured on the same date from [9733195](https://github.com/sep1ol/relaycrew/commit/9733195), using the real Accounts view with fictional account names, quotas, and activity. The light-mode capture is 1600 × 1063 pixels at 135% zoom. The larger content makes Claude and Codex pools easier to read in the README.

## Refresh the images

1. Run `npm run preview` from a source checkout.
2. Open the printed dashboard URL in a browser. Use Orca's embedded browser when available.
3. Sign in with the administrator key from the protected temporary configuration printed by the preview command.
4. Use a desktop viewport of 1600 × 1250 CSS pixels. Wait for the data to load, then capture a normal viewport screenshot near the top of each view. Check that the image has no horizontal clipping or repeated sections. Avoid oversized viewport captures on a client-hosted browser.
5. Capture Overview in light and dark themes as `overview-light.png` and `overview-dark.png`.
6. Capture Accounts, Team, and Usage in the light theme as `accounts.png`, `team.png`, and `usage.png`.
7. Check every image for stale content and accidentally exposed credentials before committing. Keep the synthetic-data banner visible and never capture a one-time key reveal.
8. For `readme-accounts-light.png`, capture Accounts in light mode at 135% zoom with a 1600 × 1063 viewport. Use fictional quota readings and keep the demo label visible.
9. Update the [visual tour](../../04-dashboard/README.md) if a control or workflow changed.

Browser device scale can affect the PNG's pixel dimensions. The CSS viewport defines the layout. The documentation tour captures use 1600 × 1250 PNGs. Longer views continue below the captured viewport. Keep the screenshots as actual captures rather than mockups. Stop the preview after capture when it is no longer needed.
