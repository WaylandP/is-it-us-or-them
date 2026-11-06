# Monitoring trust: threat model, research and upgrade guide

Reviewed 2026-11-06. This document records the reasoning behind the monitoring hardening, its verification boundaries and its operational costs. It is not a claim that the application is invulnerable.

## Threat model

A status monitor intentionally makes server-side requests to administrator-configured URLs. Risks include a compromised admin token, a malicious vendor response, redirects to internal endpoints, DNS answers that change between validation and connection, requests to cloud metadata/control services, and response bodies that consume excessive resources. Separate from security, old observations can mislead readers when the page itself is still reachable.

The application trusts the deployment operator to set environment policy and the IT team to publish incident information. It does not treat a private hostname, a syntactically valid URL, or a successful page refresh as evidence that a check is safe or current.

## Research and decisions

### 1. Destination policy, not a string blacklist

[OWASP's SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) recommends restricting destinations and protocols, accounting for redirects, and checking resolved IPv4/IPv6 addresses. Its discussion of DNS pinning explains why validating a hostname before an unrelated connection is insufficient. [GitLab's secure coding guidance](https://docs.gitlab.com/development/secure_coding_guidelines/) likewise treats requests to user-supplied URLs as a security boundary.

Implementation: permit HTTP/HTTPS only; reject embedded credentials, fragments, unsafe characters and port zero. Public destinations use ports 80/443 by default. Every DNS answer must satisfy the destination policy. Private/loopback addresses and nonstandard ports require an operator-controlled exact-origin/CIDR entry. Origin comparison includes scheme, hostname and effective port; it is not a suffix match or wildcard.

The policy uses the [IANA IPv4](https://www.iana.org/assignments/iana-ipv4-special-registry) and [IPv6](https://www.iana.org/assignments/iana-ipv6-special-registry) special-purpose registries conservatively. Link-local, multicast, reserved/documentation/translation ranges are not treated as public vendor endpoints. Some special global-use exceptions are deliberately denied rather than maintaining a permissive exception list. Revisit this policy as registries evolve.

Cloud endpoints deserve explicit attention: AWS documents an [IPv6 metadata endpoint](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instancedata-data-retrieval.html), and Azure documents [168.63.129.16](https://learn.microsoft.com/azure/virtual-network/what-is-ip-address-168-63-129-16) as a platform virtual IP. Those endpoints are blocked even under an overbroad operator approval; ordinary IPv4 link-local metadata endpoints are already denied.

### 2. Pin connections while preserving TLS identity

We use Node's native HTTP/HTTPS request APIs with a per-request agent and custom lookup that returns only validated addresses. The original URL hostname remains the Host header and TLS server identity. Certificate verification stays enabled, including when an insecure TLS environment variable is set. See [Node HTTP](https://nodejs.org/api/http.html), [HTTPS](https://nodejs.org/api/https.html), and [net.BlockList](https://nodejs.org/api/net.html).

Each redirect is checked again, including DNS resolution for the new destination. At most three redirects are followed; HTTPS-to-HTTP downgrade is blocked. There is no unchecked second DNS lookup, shared connection pool, authorization header forwarding or cookie jar.

Why not retain global fetch? Its normal call site did not give this application an explicit, verified connection-time destination boundary. Native requests provide the required control without adding a runtime package. This is a focused transport replacement, not an HTTP client intended for arbitrary application use.

### 3. Bound the whole request

The deadline includes DNS, redirects, headers and response consumption. Body limits apply to both received and decompressed bytes: 1 MiB each. Response headers are limited to 16 KiB. The accepted methods are GET and HEAD. Decompression supports gzip, deflate and Brotli under the same byte limit.

Cancellation stops sockets/response consumption. An already-started operating-system DNS lookup may finish after cancellation; its result cannot initiate a later connection. There is no promise of instantaneous DNS cancellation.

### 4. Proxies are a separate trust boundary

An outbound proxy can resolve a hostname or route a request independently of the client's validation. This version intentionally rejects HTTP_PROXY, HTTPS_PROXY and ALL_PROXY, including lowercase variants, rather than silently bypassing an organization's proxy or weakening pinning. NO_PROXY is not an authorization mechanism. The Docker image no longer enables environment-proxy handling.

This is a compatibility cost, not a claim that secure proxy support is impossible. Supporting a mandatory proxy later requires a separately reviewed design and enforced destination policy at that proxy.

### 5. Freshness is a property of observations

[Prometheus's staleness semantics](https://prometheus.io/docs/prometheus/latest/querying/basics/#staleness) illustrate the distinction between old samples and current data. We adopt the principle, not its fixed thresholds.

Our default expiry is max(60 seconds, three polling intervals, twice the request timeout rounded to seconds). Default configuration therefore expires after 180 seconds. This is an explicit product choice, not a universal monitoring standard. STATUS_STALE_AFTER_SECONDS can override it but must cover a poll interval plus timeout and cannot exceed 30 days.

CheckedAt records completion. LastSuccessfulAt is not refreshed by failed attempts. GeneratedAt records snapshot construction only. At or beyond expiry, the effective feed state becomes unknown, and prior status is labeled last-known rather than active. Missing, malformed and future timestamps cannot establish current health.

An internal incident and a vendor outage are independent signals. Local maintenance does not erase a simultaneous vendor outage. Declared internal incidents remain visible even if monitoring fails. The browser ages received snapshots with elapsed time rather than trusting its own wall-clock alignment with the server; an offline error remains latched until a successful refresh.

## Upgrade checklist

1. Back up data and preserve the currently deployed version for rollback.
2. Inventory private/loopback targets, unusual ports, redirect destinations and proxy requirements.
3. Add narrow approvals in `.env`, for example:

```dotenv
CHECK_ALLOWED_TARGETS={"https://wiki.internal:8443":["10.20.0.25/32"]}
STATUS_STALE_AFTER_SECONDS=
```

The origin does not include a path. Configure the service URL separately, for example `https://wiki.internal:8443/health`. All resolved addresses must match the entry. List both approved IPv4 and IPv6 CIDRs when necessary. Redirected private origins need their own entries. Avoid subnet-wide approvals when a host route is sufficient.

4. Do not upgrade a proxy-dependent instance until a reviewed direct-egress or alternative solution is available. Proxy variables cause startup to fail with an explicit error.
5. Update scripts reading `/api/services` to send the admin bearer token, or use public `/api/status` for a nonconfiguration snapshot. GET and HEAD are protected.
6. Rebuild/restart, test every affected service using Test feed, and inspect check timestamps and errors. A policy-blocked check is unknown, not an outage.
7. Confirm public status content is appropriate for its audience, and retain VPN/SSO and egress restrictions.

## Verification and remaining risks

Regression tests cover alternate IPv4 spellings, IPv4-mapped IPv6, DNS answer mixtures, connection pinning, exact-origin/CIDR policy, forbidden cloud endpoints, redirects, real TLS hostname/SNI behavior, deadline/body limits, observation expiry, same-service concurrent issues, poller races, configuration authentication and text/API consistency. TLS fixture credentials are disposable and deliberately public; never use them in production.

The browser regression harness verifies cached/offline/recovery behavior with mocked fetch. It is not a full visual, accessibility or live-vendor certification. Provider payload formats, RSS heuristics, manual declarations, maximum-response compatibility and real network behavior still require operator validation.

Private approvals allow any path on the approved origin, and an allowed endpoint can itself forward traffic. Network egress controls remain defense in depth. Public announcements/status are still public to reachable clients. Admin local-storage tokens, rate limiting, durable audit logs, multiuser authorization and a full provider-schema audit remain separate work.
