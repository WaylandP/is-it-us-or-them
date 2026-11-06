# Changelog

Notable changes to Is It Us or Them? are recorded here. Format inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Interface
- Redesign the public dashboard and administration with shared light/dark/system themes, consistent typography, status symbols and responsive layouts.
- Put incident impact and monitoring freshness ahead of routine notices; add grouped service search, ownership/attention filters and expandable check details.
- Separate Services, Incidents, Maintenance and Announcements in administration without changing the API or datastore.
- Improve labeled forms, keyboard tabs, modal focus, destructive confirmation, pending/error handling and provider-switch draft retention.
- Preserve cached/offline warnings across the full public page; allow auto-refresh to be paused without disabling observation expiry.
- Report the actual Test feed result rather than treating every successful request as healthy.
- Add 33 frontend helper/contrast/markup checks and reproducible Chromium workflow checks with screenshot artifacts.
- Replace the old README screenshot with an actual capture of the redesigned frontend using clearly identified illustrative data.
- Document primary-source research, design decisions, verification boundaries and remaining accessibility validation.

### Security
- Route all built-in monitoring traffic through validated, DNS-pinned HTTP/HTTPS connections; validate redirects and preserve TLS identity.
- Deny metadata/special ranges and require exact-origin/CIDR operator approval for private and nonstandard-port checks.
- Bound total request time, headers, wire bytes and decompressed body size.
- Require admin authentication for service configuration GET/HEAD and add browser security headers and safe provider links.

### Fixed
- Expire old observations at snapshot-read time instead of treating dashboard refresh as fresh monitoring evidence.
- Keep offline/cached dashboard states visibly unverified across timer redraws.
- Preserve simultaneous internal and vendor problems on the same service and include general incident severity.
- Reject obsolete poll results after configuration changes, deletion, disabling or shutdown.
- Treat HTTP transport/policy failures as unknown instead of manufacturing major-outage incidents.

### Upgrade considerations
- CHECK_ALLOWED_TARGETS is required for legitimate internal/loopback/nonstandard-port targets; see [migration guide](docs/MONITORING_SECURITY.md#upgrade-checklist).
- HTTP_PROXY/HTTPS_PROXY/ALL_PROXY are not supported by the pinned transport and cause startup failure. Review proxy-dependent environments before upgrading.
- Scripts reading /api/services must authenticate. Public status remains available at /api/status.
- STATUS_STALE_AFTER_SECONDS defaults to a threshold derived from polling and timeout settings (normally 180 seconds).

### Changed
- Clarify self-hosting, architecture, research rationale, security boundaries and contributor guidance.
- Bind Compose to loopback by default and expose monitoring configuration via .env.
- Distinguish uncertain and maintenance-only states from All Clear.
- Restrict CI permissions and document the release process.

## 0.1.0 — 2026-10-29

### Added
- Public dashboard, vendor/internal ownership, incident posts, maintenance and IT announcements.
- Statuspage, Slack, Google, RSS/Atom, HTTP and manual providers.
- Admin UI, text summary and optional Slack command.
- Docker/Compose, JSON persistence, tests and GitHub Actions CI.

The initial package version is 0.1.0; no tagged GitHub release has been published yet. See [release guidance](docs/RELEASING.md).
