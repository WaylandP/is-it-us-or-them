# Roadmap

This is an **early-stage community roadmap**, not a release schedule or a promise of implementation. Ideas should be discussed in [GitHub issues](https://github.com/WaylandP/is-it-us-or-them/issues) before work begins.

## 1. Trust and reliability
- Detect stale feed results and distinguish checked, failed, old, and never-checked services.
- Preserve source, timestamps and confidence clearly across status surfaces.
- Improve provider parsing and edge-case tests.
- Prevent false "All Clear" conclusions.

## 2. Security and self-hosting
- Harden configurable network checks against SSRF and unsafe redirects.
- Review public configuration exposure and token-handling design.
- Establish safe reverse-proxy/SSO patterns and deployment validation.
- Document and test backup, restoration and upgrades.

## 3. User experience
- Make the public status dashboard understandable within five seconds.
- Refine admin navigation, accessibility, mobile layouts, error states and dark mode.
- Improve incident detail, ownership cues and maintenance scheduling.

## 4. Integrations and operations
- Evaluate authenticated Microsoft 365 service health integration.
- Add high-value providers through documented, testable APIs.
- Explore opt-in notifications and incident history **only** with reliable persisted data.

## 5. Community
- Keep onboarding and provider documentation current.
- Publish reviewed releases with migration notes when needed.
- Welcome focused bug reports, provider requests and pull requests.

### Out of scope by default

Mandatory cloud hosting, subscriptions, telemetry, unnecessary runtime dependencies, and a multi-tenant SaaS backend. Self-hosting and operational correctness come first.
