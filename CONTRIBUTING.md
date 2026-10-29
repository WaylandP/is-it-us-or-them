# Contributing

Thanks for helping make this a better status page. Issues and pull requests
are welcome.

## Getting set up

```bash
git clone https://github.com/WaylandP/is-it-us-or-them.git
cd is-it-us-or-them
npm install
ADMIN_TOKEN=dev npm run dev
```

The server restarts on file changes. The public page is at
<http://localhost:3000> and the admin page at <http://localhost:3000/admin>.

There is no build step and no transpiler. The server is plain ES modules on
Node 20+; the frontend is vanilla HTML, CSS and JavaScript modules.

## Running tests

```bash
npm test
```

Tests use `node:test` and need no network: vendor feeds are served from
recorded fixtures in `test/fixtures/` by a local mock server. Please add or
update tests with any change to a provider, the verdict logic or the API.

## Adding a feed provider

This is the most useful kind of contribution. A provider is one file in
`src/providers/`:

```js
export default {
  id: 'acme',                       // stable identifier stored with each service
  label: 'Acme Status',             // shown in the admin form
  description: 'What it reads.',    // shown under the provider picker
  defaultOwner: 'vendor',           // 'vendor' (problems are "them") or 'internal'
  fields: [                         // drives the admin form and validation
    { key: 'baseUrl', label: 'Status page URL', type: 'url', required: true },
    { key: 'region', label: 'Region', type: 'text', placeholder: 'eu-west', help: 'Optional.' },
  ],
  async check(service, ctx) {
    // ctx.timeoutMs, ctx.now
    // Return { state, summary, incidents, maintenances }
  },
};
```

- `state` is one of `operational`, `maintenance`, `degraded`,
  `partial_outage`, `major_outage`, `unknown` (see `src/states.js`).
- `incidents` entries look like `{ id, title, status, impact, url, startedAt,
  updatedAt, latestUpdate, components }`.
- `maintenances` entries look like `{ id, title, status, url, startsAt, endsAt }`.
- Throw an `Error` with a readable message when the feed cannot be read; the
  poller reports it on the page and keeps the last known state.

Register the provider in `src/providers/index.js`, add a fixture under
`test/fixtures/` captured from the real feed (trim it to a few representative
incidents), and add tests in `test/providers.test.js`. Document it in the
providers table in `README.md`.

Please do not add runtime dependencies for a provider unless the format
genuinely cannot be handled with `fetch` and a little parsing.

## Pull requests

- Keep changes focused. One feature or fix per PR.
- Run `npm test` before pushing.
- Describe what changed and why, and include a screenshot for UI changes.
- CI runs the tests on Node 20, 22 and 24 and builds the Docker image.

## Reporting bugs

Open an issue using the bug template. Include the provider involved, the
feed URL if it is public, and what the page showed versus what you expected.
Never paste your `ADMIN_TOKEN` or a Slack signing secret into an issue.
