# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.0] - 2026-10-29

### Added

- Public status page with an "us or them" verdict banner, service cards,
  active incidents, maintenance and announcements. Light and dark mode,
  mobile layout, auto-refresh.
- Admin page to add, edit, test, disable and remove tracked services, and to
  manage maintenance windows and posts.
- Feed providers: Statuspage.io, Slack, Google Workspace/Cloud, RSS/Atom,
  HTTP check, Manual.
- Maintenance calendar that flips affected services to "under maintenance"
  while a window is active.
- Announcements and incident posts with timeline updates, pinning and
  resolution.
- Plain-text brief at `/api/status.txt` and a Slack slash-command endpoint.
- Token-protected write API, JSON file persistence, Dockerfile, Compose file,
  CI workflow and a `node:test` suite with recorded feed fixtures.

[Unreleased]: https://github.com/WaylandP/is-it-us-or-them/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/WaylandP/is-it-us-or-them/releases/tag/v0.1.0
