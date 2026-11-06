# Security policy

## Reporting a vulnerability

**Do not disclose exploit details, credentials or sensitive logs in a public issue.**

If GitHub private vulnerability reporting is available on the repository's **Security** tab, use it. If it is not available, open a minimal public issue asking the maintainer to arrange a private contact channel **without including sensitive technical details**.

There is no guaranteed response SLA at this stage. Maintainers will triage reports as availability permits.

## Deployment model and current limitations

This is an early-stage, self-hosted application. Treat it as an **internal-only service** unless you have configured and reviewed appropriate external access controls.

- **Unauthenticated reads:** `/api/status`, `/api/services`, `/api/posts` and `/api/maintenance` can reveal service names, service configuration URLs and internal announcements to any reachable client. Protect the entire application behind a VPN, firewall or identity-aware reverse proxy when it contains internal data.
- **Administrative authentication:** writes require a bearer `ADMIN_TOKEN`. Use a unique, high-entropy secret. Compose rejects missing or empty tokens; a direct Node startup without a token generates one and prints it to logs. Rotate secrets after suspected exposure.
- **Browser storage:** the admin UI stores the token in local storage. Only administer the instance through a trusted browser over HTTPS or a protected local connection. Clear site storage after using a shared computer.
- **SSRF risk:** administrators can configure URLs that the server fetches, and redirects are followed. URL syntax validation is **not** an SSRF defense. Restrict admin access and container egress to approved destinations; don't allow untrusted administrators.
- **Slack:** set `SLACK_SIGNING_SECRET` if enabling slash commands. Without it, requests are not signature-verified. Avoid publishing an unsigned endpoint.
- **Storage:** `data.json` is unencrypted. Protect the container volume and backups and limit file-system access.
- **TLS:** the app serves HTTP. Put it behind a correctly configured HTTPS reverse proxy when accessed outside localhost.
- **Monitoring accuracy:** an unavailable feed should be presented as uncertain. Polling states are in memory, and automatic stale-age enforcement is not yet implemented.
- **No telemetry:** the application itself does not require an external analytics or telemetry account. Configured vendor checks and optional Slack integration still make outbound requests.

See [Self-hosting and operations](docs/DEPLOYMENT.md) for safer port binding, backup and restore guidance.

## Supported versions

Security fixes are currently developed against the latest `main` branch. There is no published support schedule or long-term-support release.

## Maintainer security checklist

Before broad public exposure, prioritize SSRF protection, review unauthenticated configuration endpoints, consider stronger admin sessions, add deployment threat-model tests, and validate HTTP response security headers.
