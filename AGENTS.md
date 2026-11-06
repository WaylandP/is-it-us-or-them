# Repository working agreements

This is an open-source, self-hosted IT status tool, not a hosted SaaS product. Preserve simple deployment, data ownership and a small dependency footprint.

- Inspect current code, tests and relevant docs before changes.
- Status rules live in src/verdict.js, src/freshness.js and src/snapshot.js. Never represent unknown, stale or not-yet-checked evidence as verified healthy. Internal declarations must not erase independent vendor evidence.
- All network providers must use src/providers/util.js and the guarded transport in src/check-network.js. Do not add direct fetch calls, blanket private-network switches, insecure TLS options or production test bypasses.
- Public status and administration are separate boundaries. Configuration reads under /api/services and all administrative writes require authentication. Public status/posts/maintenance still need appropriate deployment access control.
- UI changes must fit vanilla JS/CSS, both themes, phone/desktop layouts and accessible interaction. Cached/offline states must remain unverified until recovery.
- Prefer focused PRs. Keep docs accurate and add regression tests. Never claim execution, CI, deployment or visual verification without evidence.
- Do not deploy, merge significant work, delete history or perform destructive maintenance without authorization.

Read CONTRIBUTING.md, SECURITY.md, docs/ARCHITECTURE.md, docs/DEPLOYMENT.md and docs/MONITORING_SECURITY.md. Preserve the license and other contributors' work.
