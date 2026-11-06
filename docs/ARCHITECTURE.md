# Architecture and data flow

A single Node/Express process combines provider observations with IT-declared incidents and maintenance. The frontend is static HTML/CSS/JavaScript; there is no build step or external database.

## Flow

1. src/server.js creates the app and starts the poller. Startup validates operator network policy and freshness configuration.
2. src/store.js loads services, maintenance and posts from data.json; writes use a temporary file and rename.
3. src/poller.js runs enabled providers. All built-in network providers use src/providers/util.js, backed by src/check-network.js.
4. The transport validates destinations and DNS results, pins the actual connection, rechecks redirects and bounds time/body size. See [research and threat model](MONITORING_SECURITY.md).
5. Successful check completion records checkedAt and lastSuccessfulAt. Failed attempts cannot refresh the last successful observation. Results remain in RAM.
6. src/freshness.js derives observation age on every snapshot read. GeneratedAt is only snapshot creation time, never a substitute for checkedAt.
7. src/verdict.js combines current evidence with IT posts/maintenance. src/snapshot.js produces JSON and text; Slack uses the same text renderer.
8. The browser polls status and independently expires cached snapshots using elapsed time. Failed requests remain unverified across redraws until a new successful response.

## Status semantics

Each service exposes freshness (fresh, pending, failed, unknown, stale or invalid), ageSeconds, expiresAt, checkedAt, lastSuccessfulAt and lastKnown when applicable. Effective feed state becomes unknown when the observation is not fresh. Old incidents are not listed as current confirmed incidents; last-known status remains historical context.

The default threshold is max(60 seconds, three polling intervals, twice the timeout rounded to seconds). STATUS_STALE_AFTER_SECONDS can override it within the validated limits.

Internal and external evidence are independent. A current vendor incident and internal maintenance on the same service produce Both, rather than allowing maintenance to hide the outage. Display severity reflects the worst current signal. Untargeted critical IT posts contribute aggregate severity. Monitoring gaps remain counted even when an internal declaration establishes an issue.

Manual checks read a declared state; they do not independently verify equipment. RSS uses a recent-item heuristic. Freshness enforcement does not remove these provider-specific limitations.

## Concurrency

Polls are deduplicated for an unchanged configuration. A changed configuration invalidates old results. A result publishes only if its generation and configuration still match an enabled existing service. Delete, disable and shutdown invalidate pending publications. This prevents late successful requests from resurrecting obsolete health.

## Trust boundaries

- Public: status snapshot, text, posts, maintenance and provider descriptors. These can still contain internal operational information.
- Admin: service configuration GET/HEAD plus API writes require ADMIN_TOKEN. The existing UI still stores its token in local storage.
- Outbound policy: exact-origin/CIDR approvals are deployment environment settings, not an admin API bypass. Public allowed addresses remain reachable on ports 80/443 unless external egress policy restricts them further.
- Slack: signatures are verified only when its signing secret is configured.
- Browser: response headers restrict scripts, embedding and referrers; untrusted provider href values are scheme-validated.
- Storage: configuration and communications are plaintext; protect the volume and backups.

## Provider contract and limits

Providers export id, label, description, defaultOwner, fields and async check(service, ctx), returning state, summary, incidents and maintenances. Use the shared transport; do not introduce direct global fetch calls or test-mode network bypasses. See [CONTRIBUTING.md](../CONTRIBUTING.md).

The design remains single-process/single-writer: no shared database, tenant isolation, distributed scheduler or historical uptime store. No runtime dependency was added for monitoring hardening.
