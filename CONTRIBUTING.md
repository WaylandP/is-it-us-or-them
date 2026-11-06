# Contributing to Is It Us or Them?

Thanks for helping build a dependable self-hosted status tool for IT teams. Bug fixes, accessible UX improvements, documentation and provider integrations are welcome.

## Setup

Check open issues for related work. Discuss substantial architecture or authenticated-provider changes before implementing them. Never publish credentials, private URLs or organization-specific logs.

Requires Node.js 20.10+ and npm:

```bash
git clone https://github.com/WaylandP/is-it-us-or-them.git
cd is-it-us-or-them
npm ci
ADMIN_TOKEN=local-development-only npm run dev
```

This token is for isolated local development only. Public status is at http://localhost:3000 and admin at http://localhost:3000/admin. Direct Node startup reads environment variables, not .env automatically.

```bash
npm test
```

Tests use node:test and local fixture servers, not live vendor APIs. test/helpers.js explicitly approves each fixture server's origin and loopback address; it does not disable production SSRF controls. Proxy variables must not be set for these tests. The disposable TLS fixtures are public test credentials only, as documented in test/fixtures/README.md.

## Working on changes

1. Reproduce the problem or define the expected outcome.
2. Inspect relevant code and tests. Status changes often span the poller, freshness, verdict, JSON snapshot, text/Slack renderer and browser.
3. Preserve independent sources, timestamps and uncertainty. A failed monitor is not evidence of a vendor outage.
4. Keep changes focused and dependency-light; add negative and boundary tests.
5. For UI work, check public and admin pages, phone/desktop layouts, light/dark themes, keyboard access and disconnected states. Include screenshots for visual changes.
6. Update docs and changelog for user-visible behavior or upgrade requirements.
7. Open a descriptive PR and distinguish tests actually run from validation still pending.

## Adding a provider

Add src/providers/<provider>.js with a descriptor:

```js
import { fetchJson, result } from './util.js';

export default {
  id: 'example',
  label: 'Example Status',
  description: 'Reads Example service health.',
  defaultOwner: 'vendor',
  fields: [{ key: 'baseUrl', label: 'Status URL', type: 'url', required: true }],
  async check(service, ctx) {
    const data = await fetchJson(service.config.baseUrl, { timeoutMs: ctx.timeoutMs });
    // Validate the documented provider schema before interpreting it.
    if (typeof data.healthy !== 'boolean') throw new Error('Unsupported status response');
    return result({ state: data.healthy ? 'operational' : 'degraded' });
  },
};
```

This is a contract example, not a real vendor integration. Register the adapter in src/providers/index.js, add sanitized fixtures and document setup. Supported normalized states are operational, maintenance, degraded, partial_outage, major_outage and unknown.

Incident entries may include id, title, status, impact, url, startedAt, updatedAt, latestUpdate and components. Maintenance entries may include id, title, status, url, startsAt and endsAt. Throw safe, readable errors for invalid/unreadable feeds; do not report healthy after parsing failure or include credentials/private URLs in error text.

All provider traffic must use the shared helpers in util.js. Do not bypass network policy with global fetch, unchecked redirects, broad private-IP permissions or insecure certificate verification. See [Monitoring security](docs/MONITORING_SECURITY.md) for policy and limits.

## Review checklist

- Focused solution with suitable unit/integration regressions.
- Freshness, failure, invalid input and authentication cases considered.
- API/deployment compatibility and migration documented.
- UI behavior checked where changed; no fabricated verification claims.
- npm test and relevant CI results reviewed.

CI tests Node 20, 22 and 24 and builds the Docker image. Passing CI is not a security audit or release approval. Report vulnerabilities according to [SECURITY.md](SECURITY.md).
