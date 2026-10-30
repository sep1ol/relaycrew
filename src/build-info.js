/**
 * Public build metadata only. Inputs deliberately exclude gateway configuration.
 * @param {object} inputs
 * @param {string} inputs.version
 * @param {string|null} [inputs.revision] Environment override; `unknown` means unavailable.
 * @param {string|null} [inputs.gitRevision]
 * @param {string|null} [inputs.label] Checkout tag or short SHA.
 * @param {number} inputs.startedAt Milliseconds since the epoch.
 * @param {string} inputs.node
 */
export function createBuildInfo({ version, revision, gitRevision = null, label, startedAt, node }) {
  const source = revision?.trim() || gitRevision?.trim();
  const shortRevision = source && source !== 'unknown' ? source.slice(0, 7) : null;
  const versionInfo = {
    name: 'relaycrew',
    version,
    revision: shortRevision,
    label: label || shortRevision || version,
    node,
    startedAt: new Date(startedAt).toISOString(),
    features: ['member-accounts', 'grok'],
  };
  return {
    version: versionInfo,
    /** @param {number} now Milliseconds since the epoch. */
    health(now) {
      return { status: 'ok', version, revision: shortRevision, uptimeSeconds: Math.max(0, Math.floor((now - startedAt) / 1000)) };
    },
  };
}
