# Architecture and data flow

The goal is a lightweight, inspectable, self-hosted application that answers whether a service disruption belongs to the internal IT team, an external provider, or both.

## Request flow

1. `src/server.js` creates the Express app in `src/app.js`, starts the poller and listens on the configured port.
2. `src/store.js` loads services, maintenance and posts from a single JSON file. Writes use a temporary file and rename.
3. `src/poller.js` periodically runs enabled provider checks from `src/providers/`. Status results are kept **in memory**, not persisted.
4. `src/verdict.js` combines the latest results with unresolved IT incident posts and active maintenance windows.
5. `src/snapshot.js` builds `GET /api/status` and the plain-text summary.
6. The static dashboard in `public/` requests the snapshot and refreshes periodically.

```text
Statuspage / Slack / Google / RSS / HTTP / Manual
                      |
                provider adapters
                      |
                  poller (RAM)         data.json
                      |                  |
                      +---- verdict -----+
                              |
                           snapshot
                              |
                   public dashboard / API
```

## Trust boundaries

- **Public:** the dashboard, status snapshot, provider descriptions, service configuration reads, maintenance and posts. Anyone who can reach the service can read these endpoints.
- **Admin:** POST, PUT, PATCH and DELETE API operations use `ADMIN_TOKEN`. The admin UI stores this token in browser local storage.
- **Slack:** `POST /slack/command` validates request signatures only when `SLACK_SIGNING_SECRET` is configured.
- **Outbound networking:** admins configure URLs read by the server. `fetch` follows redirects; restricting outbound destinations remains a security concern.
- **Persistence:** `data.json` contains configuration and communications in plain text. Back it up and protect the volume.

Do not assume that public endpoint data is automatically safe for external audiences. This application has no built-in per-role filtering.

## Verdict precedence

A service's displayed state is determined, in order, by:
1. An unresolved, warning/critical IT incident post for that service.
2. An active IT maintenance window for that service.
3. The most recent provider result.

Ownership matters: provider-reported problems on internal services count as **us**, while problems on vendor services count as **them**, unless overridden by an IT incident or maintenance. Untargeted IT incidents or maintenance can also contribute to **us**. Both can coexist.

When no classified issue exists, unknown feeds produce **Status uncertain**, not **All clear**. Vendor maintenance without an outage produces **Maintenance reported**. Only successfully reported operational statuses qualify for **All Clear**. The current system does **not** yet implement an age-based stale-data timeout.

## Provider contract

A provider exports `id`, `label`, `description`, `defaultOwner`, `fields` and an asynchronous `check(service, ctx)` returning normalized `state`, `summary`, `incidents` and `maintenances` values. Register it in `src/providers/index.js`. See [CONTRIBUTING.md](../CONTRIBUTING.md) for examples and test expectations.

## Scaling boundaries

The design is intentionally **single-process, single-writer**. There is no distributed queue, shared cache, database, tenant isolation or historical uptime store. Do not add multiple replicas or serverless hosting without first addressing shared state, concurrent writes, scheduling, and durability.
