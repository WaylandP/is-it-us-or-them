# Security policy

## Reporting a vulnerability

**Do not disclose exploit details, credentials or sensitive logs in a public issue.**

Use GitHub private vulnerability reporting on the repository's Security tab when available. Otherwise open a minimal issue requesting a private contact channel, without sensitive technical details. There is no guaranteed response SLA at this stage.

## Deployment model

This early-stage application is intended for a trusted IT team. Use VPN, firewall or identity-aware reverse-proxy protection when operational data is private. Do not treat these controls as certification for unrestricted internet exposure.

- **Public reads:** `/api/status`, `/api/status.txt`, `/api/posts`, `/api/maintenance` and provider descriptors remain unauthenticated. Service names, descriptions, declared status-page links and announcements can be sensitive. Service configuration GET/HEAD under `/api/services` now requires the admin token.
- **Admin authentication:** writes and configuration reads require a unique, high-entropy bearer token. Compose requires a nonempty value. A direct Node startup without a token generates one and prints it to logs. Protect logs and rotate secrets after exposure.
- **Browser storage:** the admin UI still uses local storage. Use a trusted browser and HTTPS; clear site storage after shared-computer use. This change does not introduce secure sessions or multiuser roles.
- **Outbound checks:** all built-in providers use a guarded transport with resolved-IP validation, connection pinning, redirect validation, TLS verification, deadlines and byte limits. Private/nonstandard-port targets need exact-origin/CIDR approval in CHECK_ALLOWED_TARGETS. Metadata and prohibited ranges remain denied. Keep approvals narrow and enforce network egress restrictions.
- **Proxy compatibility:** HTTP_PROXY, HTTPS_PROXY and ALL_PROXY are deliberately unsupported, including lowercase variants; startup fails instead of silently routing around policy. Review [migration guidance](docs/MONITORING_SECURITY.md#upgrade-checklist).
- **Response protections:** CSP restricts scripts to the same origin, embedding is denied, MIME sniffing is disabled and referrers are suppressed. Inline styles remain permitted for existing UI components. These are defense in depth, not substitutes for safe rendering.
- **Slack:** set SLACK_SIGNING_SECRET when exposing slash commands. Without it, requests are not signature-verified.
- **Storage:** data.json and backups are unencrypted. Protect the volume, configuration and backups. No schema/data migration is introduced by monitoring hardening.
- **TLS:** the application serves HTTP; terminate HTTPS at a reviewed reverse proxy. Do not disable certificate validation on outbound checks; use a properly mounted CA trust bundle for private CAs.
- **Monitoring:** stale/failed results do not establish healthy service status. Results live in memory; recent monitoring cannot guarantee a vendor feed is complete or semantically accurate.
- **Privacy:** no mandatory telemetry. Configured monitoring endpoints and optional integrations still involve network communication.

## Known boundaries

An approved origin permits all paths within that origin and approved addresses. An allowed remote service could itself act as a proxy. Network routing, DNS infrastructure, host compromise, deliberate operator over-approval, public incident content and authenticated-admin misuse are not eliminated by application URL validation.

See [Monitoring research and threat model](docs/MONITORING_SECURITY.md) and [Deployment](docs/DEPLOYMENT.md). Further work includes stronger admin sessions, rate limiting, durable audit trails and deeper provider-schema validation.

## Supported versions

Security fixes are currently developed against the latest main branch. There is no published long-term-support schedule.
