# Self-hosting and operations

This guide covers the current **single-instance** deployment. The app uses one Node process and a local JSON file; do not run multiple replicas against the same data volume.

## Prerequisites and first run

Install Docker Engine and the Compose plugin, then:

```bash
git clone https://github.com/WaylandP/is-it-us-or-them.git
cd is-it-us-or-them
cp .env.example .env
openssl rand -hex 32
```

Set `ADMIN_TOKEN` in `.env` to the generated value. Avoid placeholder or reused passwords.

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 status
curl --fail http://127.0.0.1:3000/healthz
```

The initial four seeded vendor services need internet access. A healthy `/healthz` response only proves the server is answering, **not** that any monitored provider is healthy.

## Port binding, TLS and access control

Compose defaults to `BIND_ADDRESS=127.0.0.1` and `HOST_PORT=3000`. On a single host, this limits direct network access to the local machine.

To change the host port, set `HOST_PORT=8080` in `.env`. For intentional LAN access, set `BIND_ADDRESS=0.0.0.0` and enforce firewall/VPN restrictions. Be aware that **all GET APIs and the status dashboard are unauthenticated**; the admin screen is reachable on the same port, although writes require a token.

For HTTPS on a dedicated host, configure a reverse proxy such as Caddy or Nginx and keep the container listening on loopback. Example Caddyfile (replace the host and provide a real DNS record):

```caddy
status.example.org {
    reverse_proxy 127.0.0.1:3000
}
```

This example provides TLS when Caddy can obtain certificates. It does **not** add login protection. Use a VPN, identity-aware reverse proxy, or other access control if internal status information and the admin page must not be reachable by the public. Do not expose admin access to untrusted networks.

## Back up data

The named Docker volume stores `/data/data.json`. The store writes changes using a temporary file and rename; the following copies the current file into a dated local backup:

```bash
mkdir -p backups
docker compose exec -T status cat /data/data.json > "backups/data-$(date +%Y%m%d-%H%M%S).json"
```

Keep these backups in a protected location; they contain your configured service URLs and IT announcements. Test restoration periodically. Backups are not encrypted by this application.

## Restore data

1. Choose a trusted backup and validate that it contains a JSON object with `services`, `maintenance`, and `posts` arrays.
2. Stop the application.
3. Place the selected backup at `backups/restore.json`.
4. Run a one-off container to copy it into the persistent volume.
5. Start the service and verify your configuration.

```bash
docker compose stop status
docker compose run --rm --no-deps \
  -v "$PWD/backups:/backup:ro" \
  --entrypoint sh status \
  -c 'cp /backup/restore.json /data/data.json'
docker compose up -d
docker compose logs --tail=50 status
```

Never restore an untrusted or malformed file. Make a backup of the current data before replacing it.

## Upgrade and rollback

1. Read [CHANGELOG.md](../CHANGELOG.md) and back up `data.json`.
2. Pin a reviewed Git commit or released tag instead of blindly following an untested branch.
3. Update the checkout, then rebuild and restart:

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 status
```

If the upgrade fails, stop the container, restore the previously reviewed code and data backup, and restart. At present, there is no schema migration framework or automated rollback command.

## Direct Node.js deployments

Node 20.10+ is required. Run `npm ci` and `npm start` with persistent `DATA_DIR` and a fixed `ADMIN_TOKEN`; terminate TLS at a reverse proxy. Use a service manager for startup and restarts. Running from a shell with an ephemeral admin token is suitable only for local evaluation.

## Proxy and network considerations

External checks use Node's built-in `fetch`. The Docker image sets `NODE_USE_ENV_PROXY=1`. Configure proxy environment variables for deployments that need them, and validate compatibility with your Node image. Do not assume an HTTP proxy blocks SSRF or limits access to cloud instance metadata.

A configured HTTP URL may point to internal services, and redirects are followed. Restrict who receives the admin token, and limit the container's egress routes using your network policy.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `docker compose up` rejects an environment variable | Set a nonempty `ADMIN_TOKEN` in `.env` |
| Cannot access from another computer | Loopback-only default binding; configure VPN/reverse proxy or deliberate network bind |
| Status page shows unknown | Feed URL, DNS, egress policy, timeouts, provider availability and log entries |
| Status works but admin login fails | Token in `.env` and the browser; restart after changing environment |
| Data disappears after restart | Named volume mounted at `/data`; avoid `docker compose down -v` |
| `/healthz` is OK but a vendor is down | Health endpoint only reports server availability |

For additional safety notes, read [SECURITY.md](../SECURITY.md).
