# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.0] - 2026-10-29

### Added

- Public status page with a colour-coded "us or them" verdict banner, an
  "Is ___ down?" search, side-by-side Us and Them columns, 24-hour history
  bars with expandable per-service detail, active incidents, maintenance
  and announcements. Light and dark mode (automatic or forced), mobile
  layout, live updates over server-sent events, copy-to-chat summary and an
  embeddable SVG status badge.
- Admin page with an overview (stats, quick actions, needs-attention list)
  and pages to add, edit, test, reorder, disable and remove tracked
  services, and to manage maintenance windows and posts.
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
