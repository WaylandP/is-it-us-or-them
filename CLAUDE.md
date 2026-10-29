# Working on is-it-us-or-them

Internal IT status page. Express 5 server in `src/`, vanilla JS frontend in
`public/`, no build step, one runtime dependency.

- Run: `ADMIN_TOKEN=dev npm run dev`. Test: `npm test` (node:test, no network;
  feeds come from `test/fixtures/` via a mock server in `test/helpers.js`).
- Keep it dependency-free beyond Express unless there is no reasonable
  alternative.
- Feed providers live in `src/providers/`, one file each, registered in
  `index.js`. Their `fields` array drives the admin form and validation.
  See `CONTRIBUTING.md` for the contract.
- Verdict logic ("us" vs "them") is in `src/verdict.js`; the page payload and
  the text brief are built in `src/snapshot.js`. Change behaviour there and
  cover it in `test/verdict.test.js`.
- Writes under `/api` require the admin token; reads are public. Keep it
  that way.
- For UI changes, check both colour schemes and a phone-width viewport.
