# Repository working agreements

This project is an open-source, self-hosted IT service status tool, not a hosted SaaS service. Keep deployment, dependency footprint and data ownership straightforward.

- Before changes, inspect the latest code and tests; do not rely on README claims alone.
- Core status rules live in `src/verdict.js` and `src/snapshot.js`. Unknown, stale, unresponsive and not-yet-checked statuses must not be represented as verified healthy.
- Provider adapters are under `src/providers/`. Follow their normalized response contract and include mocked tests.
- Protect API writes and secrets; treat configurable HTTP URLs as SSRF-sensitive.
- Public status and administration are distinct trust boundaries. Remember public GETs are currently unauthenticated.
- UI changes must work with vanilla JS/CSS, light/dark themes, mobile layouts and accessible interactions.
- Prefer focused, reviewed PRs over broad rewrites. Keep documentation accurate, update tests and verify CI before claiming success.
- Never deploy, merge significant work, delete history or perform destructive repository maintenance without authorization.

See `CONTRIBUTING.md`, `SECURITY.md`, `docs/ARCHITECTURE.md` and `docs/DEPLOYMENT.md` for more detail.
