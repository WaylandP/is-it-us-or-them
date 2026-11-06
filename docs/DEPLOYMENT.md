# Self-hosting and operations

The application uses one Node process and one JSON file. Do not run multiple replicas against the same data volume.

## First run

Install Docker Engine and the Compose plugin, then:

```bash
git clone https://github.com/WaylandP/is-it-us-or-them.git
cd is-it-us-or-them
cp .env.example .env
openssl rand -hex 32
```

Set ADMIN_TOKEN in `.env` to that generated value. Review CHECK_ALLOWED_TARGETS for internal checks before starting.

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 status
curl --fail http://127.0.0.1:3000/healthz
```

A healthy `/healthz` only proves the server responds, not that monitored services are healthy. Seeded vendors need direct outbound internet access.

## Ports, TLS and access control

Compose defaults to BIND_ADDRESS=127.0.0.1 and HOST_PORT=3000. Change HOST_PORT for another local port. Set BIND_ADDRESS=0.0.0.0 only for intentional remote access with firewall/VPN restrictions.

Status, posts and maintenance reads are unauthenticated. Administrative writes and service configuration reads require the admin token. Protect the entire instance if its operational information is private.

Example Caddyfile for a reverse proxy on the same host, replacing the hostname and providing a real DNS record:

```caddy
status.example.org {
    reverse_proxy 127.0.0.1:3000
}
```

This can provide TLS when certificates can be obtained; it does **not** provide login protection. Use a VPN or identity-aware proxy as appropriate. A reverse proxy in a separate container must use deliberately configured container networking, not its own loopback address. The application no longer trusts arbitrary forwarded proxy headers.

## Internal checks and freshness

The default network policy allows public HTTP/HTTPS destinations on ports 80/443 and blocks private/loopback/special destinations. A narrow `.env` approval looks like:

```dotenv
CHECK_ALLOWED_TARGETS={"https://wiki.internal:8443":["10.20.0.25/32"]}
STATUS_STALE_AFTER_SECONDS=
```

Configure the actual check path in the admin UI. Every resolved IPv4/IPv6 address must satisfy the origin's CIDRs. Separate private redirect origins need separate approvals. Link-local metadata/control endpoints remain forbidden. Do not use broad approval ranges merely to make a failing test pass.

A blank freshness override uses max(60 seconds, three polling intervals, twice the timeout rounded to seconds), normally 180 seconds. An explicit value must cover a poll interval plus timeout and be no more than 30 days. Observations expire at the threshold even if the web server remains reachable. Policy, DNS, TLS and transport failures are unknown; unexpected HTTP responses remain observed service failures.

Checks have a 1 MiB wire/decompressed-body limit, 16 KiB headers, at most three redirects and a shared total deadline. HTTPS downgrades are denied. Validate unusually large vendor feeds before upgrading.

**Outbound proxies:** HTTP_PROXY, HTTPS_PROXY and ALL_PROXY, including lowercase, cause startup to fail. The pinned transport intentionally requires direct, restricted egress. Do not bypass an organizational proxy mandate; arrange a reviewed solution before upgrading. Inbound reverse proxies are unaffected. See [research and migration notes](MONITORING_SECURITY.md#upgrade-checklist).

## Backups

The named volume stores `/data/data.json`. Writes use a temporary file and rename. Copy the current file into a protected local backup:

```bash
mkdir -p backups
docker compose exec -T status cat /data/data.json > "backups/data-$(date +%Y%m%d-%H%M%S).json"
```

Backups contain configured URLs and communications and are not encrypted by this application. Check that the command succeeded and validate the resulting JSON before relying on it. Store backups away from the host and test restoration.

## Restore

Validate that a trusted backup contains a JSON object with services, maintenance and posts arrays. Back up current data first, place the selected file at backups/restore.json, then:

```bash
docker compose stop status
docker compose run --rm --no-deps \
  -v "$PWD/backups:/backup:ro" \
  --entrypoint sh status \
  -c 'cp /backup/restore.json /data/data.json'
docker compose up -d
docker compose logs --tail=50 status
```

Confirm the restored configuration and check outcomes. Never restore untrusted data.

## Upgrade and rollback

Read [CHANGELOG.md](../CHANGELOG.md), back up data and record the deployed commit. For the monitoring hardening update, inventory private targets and proxies and update scripts that read `/api/services` without credentials.

Pin a reviewed commit or published tag, update the checkout, then:

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 status
```

Verify configured services using Test feed. For rollback, stop the instance, restore the reviewed earlier code and appropriate data backup, then restart. There is no automatic rollback/migration framework. Avoid `docker compose down -v`, which removes the data volume.

## Direct Node.js

Use a supported runtime satisfying package.json, run npm ci, and supply persistent DATA_DIR plus a fixed ADMIN_TOKEN through a service manager. `npm start` reads environment variables, not `.env` automatically. Use HTTPS termination and restart management. For private CAs, mount a trusted CA file and configure NODE_EXTRA_CA_CERTS before process startup; do not disable TLS verification.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Missing admin token | Set a nonempty ADMIN_TOKEN in .env |
| CHECK_POLICY | Exact origin, permitted CIDRs, DNS answers, redirect destinations and prohibited address ranges |
| CHECK_PROXY | Mandatory proxy compatibility; do not silently remove mandated controls |
| CHECK_LIMIT | Oversized wire/decompressed response or headers; inspect provider compatibility |
| Stale/unknown status | Last check, last success, poll interval, timeouts, clock accuracy and logs |
| Cannot connect remotely | Loopback-only default; review VPN/reverse-proxy/network binding |
| Lost data | Confirm named volume and avoid destructive Compose volume removal |

See [SECURITY.md](../SECURITY.md) for additional boundaries.
