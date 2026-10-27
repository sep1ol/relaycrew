# 06 · Contribute

Start with [CONTRIBUTING.md](../../CONTRIBUTING.md). It covers development setup, checks, commit scope, and pull requests.

## Choose a contribution

- Report a reproducible bug through the [issue forms](https://github.com/sep1ol/relaycrew/issues/new/choose).
- Improve a confusing guide or refresh an outdated screenshot.
- Add a compatibility report for a client, provider, or deployment configuration.
- Pick an issue labeled [good first issue](https://github.com/sep1ol/relaycrew/labels/good%20first%20issue) or [help wanted](https://github.com/sep1ol/relaycrew/labels/help%20wanted).
- Discuss a new feature in [Discussions](https://github.com/sep1ol/relaycrew/discussions) before committing to a large implementation.

Keep credentials and private request data out of examples, screenshots, and bug reports. Use the synthetic local preview for documentation images.

## Verify a code change

From a source checkout:

```bash
npm install --ignore-scripts
npm test
npm run lint
npm run typecheck
git fetch upstream
npm run typecheck:strict -- --base upstream/main
```

The strict check compares diagnostics with the selected base. Focused tests can supplement the suite for the area you changed. Include the commands and results in your pull request.

## Translate the dashboard

The dashboard uses English source messages with Portuguese (Brazil) and Spanish catalogs in `src/dashboard-translations.js`. Add each new interface message to both catalogs and preserve every named `{placeholder}`. Keep account names, member names, model identifiers, and provider error text as data.

Use the shared translator for dynamic copy and explicit translation attributes on static labels. Do not replace arbitrary DOM text or overwrite a container that contains a form control. Check the dashboard in all three languages, including dialogs, notices, chart legends, dates, numbers, and narrow screens. Language changes must preserve drafts and current selections.

Run the localization and dashboard tests before submitting a translation change:

```sh
node --test test/dashboard-i18n.test.js test/dashboard-workspace.test.js test/dashboard.test.js
```

## Follow the project policies

Read the [code of conduct](../../CODE_OF_CONDUCT.md), [security reporting policy](../../SECURITY.md), [support guide](../../SUPPORT.md), and [maintainer process](../../MAINTAINERS.md). RelayCrew keeps the upstream MIT license and attribution. See [LICENSE](../../LICENSE) and [UPSTREAM.md](../../UPSTREAM.md).

---

[Previous · Operations](../05-operations/README.md) · [Documentation index](../README.md) · [Next · Reference](../07-reference/README.md)
