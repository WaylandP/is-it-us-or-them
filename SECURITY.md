# Security

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's private
vulnerability reporting on this repository ("Security" tab → "Report a
vulnerability"), or contact the maintainer directly. You should get a reply
within a few days.

## Deployment guidance

This application is designed to run inside an organisation's network.

- **Reads are public by design.** Anyone who can reach the server can read
  the status page and the JSON API. Put the service behind your SSO proxy,
  VPN or firewall if the page itself should be internal-only.
- **Writes require `ADMIN_TOKEN`.** Treat it like a password: set it from a
  secret store, do not commit it, and rotate it if it leaks. If it is unset,
  a random token is generated at startup and printed to the server log.
- **Slack slash command.** Set `SLACK_SIGNING_SECRET` so requests to
  `/slack/command` are verified. Without it, anyone who can reach the
  endpoint can call it (it only returns the public brief, but still).
- **Outbound requests.** The server fetches the feed URLs and HTTP-check
  URLs that admins configure. Only people you trust should hold the admin
  token, since an admin can point an HTTP check at any URL reachable from
  the server.
- **Data at rest.** All state lives in `DATA_DIR/data.json` in plain text.
  It contains service configuration, maintenance windows and posts, nothing
  more sensitive than what the page shows.
- **TLS.** The app serves plain HTTP. Terminate TLS at a reverse proxy.

## Supported versions

Only the latest release on `main` receives fixes.
