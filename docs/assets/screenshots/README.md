# Dashboard screenshots

These PNGs show the actual dashboard with synthetic data. They contain no real provider credentials, member keys, or private request data. The demo banner remains visible in every image.

The images were captured on 2026-10-27 using Orca's embedded browser and the English dashboard from [75a6917](https://github.com/sep1ol/relaycrew/commit/75a6917). The fixture represents four fictional Claude and Codex accounts and six team members. `usage.png` is also the README hero image for both GitHub themes.

| Image | Theme | Viewport | Content zoom |
| --- | --- | --- | --- |
| `overview-light.png` | Light | 1600 × 1030 | 115% |
| `overview-dark.png` | Dark | 1600 × 1030 | 115% |
| `accounts.png` | Light | 1600 × 1060 | 115% |
| `team.png` | Light | 1600 × 990 | 115% |
| `usage.png` | Light | 1600 × 950 | 115% |

## Refresh the images

1. Run `npm run preview` from a source checkout. This creates an isolated temporary configuration with synthetic accounts, members, and history.
2. Open the printed dashboard URL in a browser. Use Orca's embedded browser when available.
3. Sign in with the administrator key from the protected temporary configuration printed by the preview command. Do not include the key or its reveal dialog in a screenshot.
4. Choose English with the language selector. Reset any customized chart colors so the images show the default palette.
5. Set the viewport and content zoom from the table. With CSS content zoom, keep the body height at `innerHeight / zoom` CSS pixels so the frame stays inside the viewport. Use a normal viewport capture rather than a full-page capture.
6. Capture Overview in both themes and Accounts, Team, and Usage in light mode. Scroll the main content pane to the top before each capture. The frame and sidebar should stay inside the viewport with padding on every side.
7. Check the images for English labels, fictional names, visible demo banners, clipping, repeated sections, and accidentally exposed credentials. Long views continue inside the scrollable pane.
8. Update this provenance and the [visual tour](../../04-dashboard/README.md) when a control or workflow changes. Stop the preview after capture.

The preview generates fresh synthetic activity, so its exact counts can differ from these images. Use fictional quota fixtures when demonstrating quota bars; a missing quota reading is not a zero-usage reading. Keep screenshots as browser captures rather than mockups.
