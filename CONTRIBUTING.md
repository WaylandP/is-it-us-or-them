# Contributing to Is It Us or Them?

Thanks for helping build a dependable, open-source status tool for IT teams. We welcome bug fixes, accessible UX improvements, documentation updates and useful provider integrations.

## Before you start

Check [open issues](https://github.com/WaylandP/is-it-us-or-them/issues) for existing work. For substantial architecture changes or integrations requiring credentials, describe your proposed approach in an issue first. Never include credentials, private URLs, or organization-specific logs in public discussions.

## Development setup

Requires Node.js 20.10+ and npm:

```bash
git clone https://github.com/WaylandP/is-it-us-or-them.git
cd is-it-us-or-them
npm ci
ADMIN_TOKEN=local-development-only npm run dev
```

Browse http://localhost:3000 and http://localhost:3000/admin. Use a strong token in any shared environment. No frontend build step is needed.

```bash
npm test
```

Tests use `node:test`. The local mock feed server in `test/helpers.js` serves fixtures from `test/fixtures/`; tests do not require live vendor APIs.

## Working on features

1. Reproduce the problem or define the expected user-facing outcome.
2. Check `src/verdict.js`, `src/snapshot.js`, `src/poller.js` and related code paths when changing status behavior.
3. Keep changes focused and dependency-light; avoid unnecessary rewrites.
4. Add or update automated tests, including unknown/error conditions.
5. For UI changes, inspect public **and** admin pages in light/dark themes and at phone widths. Include before/after screenshots.
6. Update README, deployment guidance or changelog for user-visible changes.
7. Open a descriptive pull request using the template.

## Adding a provider

Add `src/providers/<provider>.js` exporting a descriptor:

```js
export default {
  id: 'example',
  label: 'Example Status',
  description: 'Reads Example service health.',
  defaultOwner: 'vendor', // or 'internal'
  fields: [
    { key: 'baseUrl', label: 'Status URL', type: 'url', required: true },
  ],
  async check(service, ctx) {
    // ctx.now and ctx.timeoutMs are available.
    // Return { state, summary, incidents, maintenances }.
  },
};
```

Register the provider in `src/providers/index.js`. States must match `src/states.js`: `operational`, `maintenance`, `degraded`, `partial_outage`, `major_outage` or `unknown`.

Incident entries may include `id`, `title`, `status`, `impact`, `url`, `startedAt`, `updatedAt`, `latestUpdate` and `components`; maintenance entries may include `id`, `title`, `status`, `url`, `startsAt` and `endsAt`.

Throw a readable error for unreadable feeds; the poller will surface an unknown state and retain last-known status. Do not silently report healthy after a failed fetch. Be cautious with feed heuristics, authentication, redirects and untrusted content.

Add representative, **sanitized** fixtures and tests in `test/providers.test.js`. Document setup in README. Prefer native `fetch` and existing helpers over new runtime dependencies.

## Pull request checklist

- [ ] The change solves the described issue without unrelated rewrites.
- [ ] `npm test` passes locally or a reason is documented.
- [ ] Negative/unknown states are tested where relevant.
- [ ] Security and backward-compatibility impacts are considered.
- [ ] Docs reflect the new behavior.
- [ ] UI screenshots are included when applicable.

CI tests Node 20, 22 and 24 and builds the Docker image. An open PR is not equivalent to an approved release.

For private security reports, follow [SECURITY.md](SECURITY.md).
