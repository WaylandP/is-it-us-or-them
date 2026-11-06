# Changelog

Notable changes to Is It Us or Them? are recorded here. Format inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Changed
- Clarify open-source self-hosting, architecture, roadmap, security considerations and contributor guidance.
- Bind the Compose host port to loopback by default; make monitoring settings configurable via `.env`.
- Distinguish uncertain and vendor-maintenance-only statuses from verified "All Clear".
- Tighten default CI permissions and document the maintainer release process.

## 0.1.0 — 2026-10-29

### Added
- Public service dashboard, vendor and internal service ownership, incident posts, maintenance, and IT announcements.
- Providers for Statuspage, Slack, Google, RSS/Atom, HTTP checks and manual statuses.
- Admin interface, plain-text status endpoint and optional Slack slash command.
- Docker/Compose setup, JSON persistence, basic tests and GitHub Actions CI.

> The package was set to `0.1.0` in the initial code. **No tagged GitHub release has been published yet.** See [docs/RELEASING.md](docs/RELEASING.md) before publishing one.
