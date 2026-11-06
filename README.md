# Is It Us or Them?

**Your IT status page. One question. A clearer answer.**

[![CI](https://github.com/WaylandP/is-it-us-or-them/actions/workflows/ci.yml/badge.svg)](https://github.com/WaylandP/is-it-us-or-them/actions/workflows/ci.yml)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20.10%2B-339933.svg)](package.json)

**Is It Us or Them?** is a free, open-source, self-hosted status dashboard for IT teams. It brings external vendor outages, internal checks, scheduled maintenance, and IT announcements into one place, so employees can quickly understand what's happening without another "is everything down?" message.

- **Self-hosted:** your infrastructure, configuration, and data; no required cloud account or subscription.
- **Lightweight:** Express 5 and vanilla JavaScript; no frontend build or external database.
- **Designed for IT:** service ownership, incident timelines, maintenance windows, and a clear status summary.

![Public status dashboard showing the verdict, services and incidents](docs/screenshot.png)

> [!IMPORTANT]
> This is an early-stage project (package version `0.1.0`). Review the [security considerations](SECURITY.md) and [current limitations](#known-limitations) before exposing it outside a trusted network.

## The answer at a glance

| Verdict | Meaning |
| --- | --- |
| **It's Us** | An internal system or IT-managed incident/maintenance is affected. |
| **It's Them** | An external provider reports a problem. |
| **It's Both** | Internal and external issues coexist. |
| **All Clear** | All enabled monitored services have reported healthy status. |
| **Status Uncertain** | No known issues, but some status information is missing or unreadable. |
| **Maintenance Reported** | A service reports maintenance without an incident classified as internal or external. |

A failed check does **not** establish that a vendor is down. Equally, an unreadable feed is **not** proof that the vendor is healthy.

## What works today

- **Service dashboard** with groups, ownership, service cards, light/dark themes and mobile layouts.
- **Six check types:** Atlassian Statuspage, Slack, Google Workspace/Cloud, RSS/Atom, HTTP and manual.
- **Incident posts** with severity, affected services, resolution, pinned messages and timeline updates.
- **Maintenance scheduling** with upcoming and active windows; upcoming windows appear up to 14 days ahead.
- **Admin interface** for adding, editing, testing, disabling, refreshing and removing services.
- **Plain-text status** at `/api/status.txt` and an optional verified Slack slash command.
- **Docker and Compose** deployment, local JSON persistence and automated tests.

## Quick start: Docker Compose

**Requirements:** Docker Engine with the Compose plugin, and a free port on the host.

```bash
git clone https://github.com/WaylandP/is-it-us-or-them.git
cd is-it-us-or-them
cp .env.example .env
```

Generate a unique admin token and paste it into `.env` as `ADMIN_TOKEN=...`:

```bash
openssl rand -hex 32
```

Then start the application:

```bash
docker compose up -d --build
docker compose ps
```

Open **http://localhost:3000** for the status dashboard, or **http://localhost:3000/admin** for administration.

By default, Compose binds **only to 127.0.0.1** for safer local setup. To use it from another device, configure a reverse proxy, VPN or deliberate bind address as explained in the [deployment guide](docs/DEPLOYMENT.md). Do not expose the admin screen unprotected on the public internet.

A new installation starts with four example services: Google Workspace, Slack, Zoom and Jamf. These require outbound internet access and can be removed.

### Run directly with Node.js

Requires Node.js 20.10+ and npm.

```bash
npm ci
ADMIN_TOKEN="$(openssl rand -hex 32)" npm start
```

Open http://localhost:3000. For persistent use, supply a stable token through your environment or process manager. Data defaults to `./data/data.json`. `npm run dev` restarts on file changes.

## Configure your status page

Open `/admin` and enter your configured admin token. Under **Services**, add a provider, enter its settings, use **Test feed**, and save. Choose **Vendor** for external services and **Internal** for systems your team manages.

| Provider | Intended use |
| --- | --- |
| `statuspage` | Statuspage-compatible vendors such as Zoom, Jamf, or GitHub; accepts a base URL and optional component filters |
| `slack` | Slack's public service-status API; no credentials required |
| `google` | Google Workspace/Cloud incidents feed; optional product filtering |
| `rss` | RSS/Atom updates; recent items are treated as degraded by a **heuristic**, not as verified active incidents |
| `http` | Reachability, expected HTTP code and optional latency threshold for configured URLs |
| `manual` | IT-managed states for systems without an automated feed |

Use **Maintenance** to announce planned work and **Announcements** for messages or incidents with updates.

Microsoft 365 service health is **not** a native provider yet; it needs authenticated Microsoft Graph integration. See [Roadmap](docs/ROADMAP.md) for planned work, not promised functionality.

## Configuration

Compose reads `.env`. The application reads the following environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `ADMIN_TOKEN` | Random token printed on startup if unset outside Compose | Required for writes; **Compose requires an explicit value** |
| `PORT` | `3000` | Container/server listening port |
| `DATA_DIR` | `./data` (Node) / `/data` (Docker) | JSON persistence directory |
| `SITE_NAME` | `Is it us or them?` | Dashboard branding |
| `ORG_NAME` | `IT` | Announcement attribution |
| `POLL_INTERVAL_SECONDS` | `60` | Vendor polling interval |
| `FETCH_TIMEOUT_MS` | `10000` | Timeout for individual feed requests |
| `SEED_SERVICES` | `true` | Seed example services on initial setup only |
| `SLACK_SIGNING_SECRET` | unset | Optional signing verification for Slack commands |

Compose-only variables `BIND_ADDRESS` and `HOST_PORT` control the published host port. See [Deployment](docs/DEPLOYMENT.md). Never commit a real `.env` or tokens.

## API and automation

- `GET /api/status`: public snapshot used by the dashboard.
- `GET /api/status.txt`: short text report, optionally filtered with `?q=zoom`.
- `GET /api/providers`, `/api/services`, `/api/maintenance`, `/api/posts`: public reads. **The services list includes configuration fields.**
- `GET /healthz`: process health, **not** proof that any monitored service is healthy.
- `POST /api/services`, `PUT /api/services/:id`, `PATCH /api/services/:id/state`, `DELETE /api/services/:id`: admin writes; similar endpoints exist for maintenance and posts.
- `POST /api/services/test` and `POST /api/services/:id/refresh`: administrator-initiated checks.
- `POST /slack/command`: optional Slack slash-command response.

All admin writes require `Authorization: Bearer <ADMIN_TOKEN>`. Read endpoints are unauthenticated by the application; protect network access as appropriate.

```bash
curl http://localhost:3000/api/status.txt
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/api/admin/whoami
```

## Architecture and development

```text
public/             Status dashboard and admin interface (no build step)
src/providers/       Provider adapters
src/poller.js        Periodic checks and in-memory results
src/verdict.js       "Us", "Them", "Both" and uncertain status rules
src/snapshot.js      Public JSON snapshot and text report
src/routes/          Express routes
src/store.js         Local JSON data store
test/                Node test runner and feed fixtures
```

```bash
npm ci
npm test
npm run dev
```

Learn more: [Architecture](docs/ARCHITECTURE.md) · [Self-hosting and operations](docs/DEPLOYMENT.md) · [Roadmap](docs/ROADMAP.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md).

## Known limitations

- Designed for a **single running process** with a persistent filesystem. It is not suitable for serverless or multi-replica use without architectural changes.
- Provider states live in memory and are repolled after restart; there is no historical uptime database.
- A successful poll can become stale between checks; automatic age-based freshness enforcement is not yet implemented. Check timestamps and feed errors.
- RSS updates are interpreted heuristically; a new post may describe a resolved event.
- Configurable URLs are fetched by the server, including redirects. **SSRF hardening and a safe network egress policy are required before exposing the admin interface to untrusted users.**
- The admin token is stored in browser local storage. Use a trusted browser and protect the site behind VPN/SSO or a reverse proxy.
- No built-in multiuser roles, SSO, alert delivery, or Teams integration.

## Contribute

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, tests and the provider contract. For vulnerabilities, use the process in [SECURITY.md](SECURITY.md), **not** a public bug report.

Licensed under the [MIT License](LICENSE). No subscription and no mandatory telemetry.
