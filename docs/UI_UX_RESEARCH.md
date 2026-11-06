# UI/UX redesign: evidence, decisions and verification

Reviewed 2026-11-06. This is a design and implementation review based on primary-source guidance, code inspection and browser checks. It is **not** a usability study with employees or a claim of WCAG certification.

## Outcome and scope

Give an employee a fast answer to three questions: what is affected, whose signal is it, and how current is the information? Give administrators separate, discoverable workflows for services, incidents, maintenance and announcements. Keep the existing lightweight architecture, APIs and monitoring security intact.

The initial interface presented service cards, incidents and routine notices with similar visual weight. Administration mixed incidents into announcements, packed several actions into each row, and used partially specified tabs and dialogs. Background list replacement could disrupt keyboard context. A successful feed request used a green confirmation even when the returned service state was degraded. These findings come from inspecting the existing HTML/CSS/JS, not from invented user-survey results.

## Research translated into implementation

| Primary source | Relevant principle | Decision in this project |
| --- | --- | --- |
| [Atlassian: service status with components](https://support.atlassian.com/statuspage/docs/show-service-status-with-components/) | Show service-specific impact rather than a vague page-wide signal. | Retain the overall verdict, then show incident impact and a searchable inventory of named services. Keep internal/vendor ownership visible. |
| [IBM Carbon: status indicators](https://www.carbondesignsystem.com/building-blocks/core/patterns/status-indicators) | Severity should be distinguishable through consistent symbols, labels and color; emphasis should guide attention. | Use a restrained neutral/teal shell, semantic status colors, explicit text and original decorative SVG symbols. Critical information has stronger emphasis than routine notes. |
| [W3C: contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) | Normal text generally requires at least 4.5:1 contrast; large text has a separate threshold. | Test the actual light/dark text and status token pairs against 4.5:1. These token checks do not certify every rendered combination. |
| [W3C: reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) | Content should work at a 320 CSS-pixel width without unnecessary two-dimensional scrolling. | Stack the dashboard columns and convert admin records to labeled vertical layouts. Exercise 320, 390, 768, 1024 and 1440 CSS-pixel widths. |
| [W3C: target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | Pointer targets need adequate dimensions or spacing; the AA minimum has specific exceptions. | Use generously padded buttons, full-width service disclosures and spaced row actions, rather than tiny icon-only controls. |
| [W3C APG: tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) | Tab roles, relationships, selected states and keyboard behavior must agree. | Four named admin tabs, linked panels, roving tabindex, Left/Right and Home/End navigation. Panels are already loaded, so switching is immediate. |
| [W3C APG: modal dialogs](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) | Move focus inside a dialog, contain the tab sequence, support dismissal and restore meaningful focus. | Native dialogs, named headings, explicit keyboard wrapping, Escape dismissal, focus restoration, and a separate destructive confirmation whose default action keeps the item. |
| [W3C: status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) | Announce important results without moving focus or unnecessarily interrupting the user. | Polite, concise status regions for updates and searches; explicit error regions; avoid re-announcing unchanged periodic status. |
| [W3C: focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) | Keyboard users must be able to see the active interaction point. | Visible focus treatment, scrollable dialog bodies, separate action footers and restoration after list refreshes. |
| [Playwright: CI](https://playwright.dev/python/docs/ci) | Install browser dependencies and execute repeatable browser workflows in CI. | A fixture-driven Chromium check loads the real static frontend, with the application CSP, and retains screenshots as CI artifacts. No runtime browser dependency is introduced. |

These sources inform the design. They do not establish that this specific interface meets every accessibility criterion or that a five-second comprehension target has been measured.

## Public dashboard

The verdict is the primary heading. Its supporting strip separates internal signals, external signals and observation freshness. The incident area comes before the service list; planned maintenance and IT announcements occupy a quieter supporting column on wider screens.

Services are grouped, searchable and filterable by internal, external or needs-attention. A row shows name, status and check context without a wall of text. Expanding it reveals sources, independent ownership signals, monitoring errors, timestamps and last-known state. Expansion and keyboard context are retained across refreshes.

No uptime chart, percentage or historical trend is fabricated. The backend does not store a historical uptime series. A last-known status remains historical context, not a new observation.

Offline and stale snapshots are labeled across the verdict, services, incidents, maintenance and announcements. Auto-refresh can be paused, but observations still expire. A successful page refresh cannot reclassify failed checks as healthy. Public status requests never require an administrative bearer token.

## Administration

Services, incidents, maintenance and announcements have separate tabs. The interface continues to use the existing post severity model; no datastore migration is needed. Informational announcements do not become incidents accidentally.

Common actions remain visible: Edit, Check now, Set state, Add update, Resolve and scheduling transitions. Less frequent destructive actions live in the explicitly named edit dialog with confirmation. Service enable/disable remains a labeled form control, not an unexplained icon.

Forms use labels, help text, grouped sections and local-time explanations. Switching providers preserves drafts in the open form. Test feed presents the returned service state, even when it is degraded. Failed saves retain user input and show an inline error. A successful save followed by a failed refresh is identified as such so the user is not encouraged to submit twice.

Background refreshes do not replace open forms. Workspace reads are serialized, and session changes invalidate obsolete reads. Browser-local token storage remains the existing authentication model; this redesign is not a replacement for stronger sessions or deployment access controls.

## Visual system

CSS tokens define both light and dark themes, with a system default and a persistent local override. Fonts are system fonts. Icons are original, dependency-free inline SVGs. There are no external font, analytics, icon-CDN or image-service requests.

Reduced-motion, forced-color and print styles are included. Status is never communicated by color alone. Mobile navigation and content order retain the core tasks without requiring an off-canvas menu.

## Verification and reproduction

Run the backend and frontend helper suite:

```bash
npm ci
npm test
```

The new `test/ui.test.js` checks filtering, escaping, safe links, incident/announcement separation, maintenance boundary cases, semantic markup and **22 actual CSS token color pairs**. The remaining checks bring the new helper suite to 33 tests.

Optional browser checks require Python 3 and the pinned test-only Playwright dependency:

```bash
python -m pip install -r scripts/requirements-ui.txt
python -m playwright install --with-deps chromium
python scripts/ui-check.py --output ui-artifacts
```

The browser harness serves the actual public files with the application's CSP and intercepts API calls with simulated responses. It checks searches, filters, theme persistence, stale/offline/recovery states, authentication feedback, keyboard tabs, modal focus, provider drafts, failed-write recovery, destructive cancellation, service changes, incident updates and maintenance transitions. It checks page overflow at five widths and stores light/dark, phone and admin screenshots.

The CI workflow has read-only repository permissions. Its artifacts are retained for 14 days; they are test output, not a deployed demo. Fixture screenshots are visibly labeled as illustrative data. They must never be represented as evidence of a live vendor incident. The README preview is a cropped real rendering; see [screenshot provenance](screenshots/README.md).

Local review used an offline DOM adapter because this execution environment blocks browser navigation. It exercised the real CSS and JavaScript with the same API fixtures, but does not validate network/module loading or the HTTP CSP. The checked-in CI runner supplies that separate verification boundary. Refer to the PR's final CI results, not this document, for the current pass/fail state.

## Remaining validation

Before calling the design accessibility-compliant, perform screen-reader checks with VoiceOver/NVDA, text-only zoom and forced-color manual review, and the complete WCAG 2.2 audit. Test Firefox/WebKit and actual supported corporate browsers. The current automated browser target is Chromium, not a cross-browser certification.

The next useful product validation is a short task-based session with IT staff and nontechnical employees: identify the affected service, distinguish a stale check from an outage, report an internal incident, schedule maintenance and find the latest resolution. No user-study completion time or satisfaction result is claimed here.
