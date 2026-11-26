# present-list (repo `prezenty`)

Gift list site: static `docs/` on GitHub Pages + one Cloudflare Worker with D1 for all lists
(`worker/`, https://prezenty-api.tszos.workers.dev/<person>). README (Polish) has the setup.
`apps-script/` is the old Google Sheets backend, unused since 2026-11-26 and kept briefly for rollback.

## Working here
- Tests: `node --test tests/*.test.js`. Local preview in demo mode: `cd docs && python3 -m http.server 8000`.
- Before committing changes in `docs/`, run `scripts/stamp.sh` (cache-busting `?v=` links).
- Site deploys on push to `main`. API deploys with `cd worker && wrangler deploy` (migrations first:
  `wrangler d1 migrations apply prezenty --remote`). New list: `node scripts/new-list.mjs <person>`.
- The Worker keeps the old Apps Script request format (same actions and JSON), so `docs/` only knows `apiUrl`.
- Gifts are no longer edited in a Google Sheet: only through the site (owner mode) and `docs/dodaj/`.
- PUBLIC repo (Pages needs it): admin keys and setup links live only in git-ignored
  `setup-links.local.md`; D1 stores only their SHA-256. Never commit, print or paste them.
  Reservation tokens are secret too: keep any data export outside the repo.
- No accounts for visitors by design; reservations are tied to an anonymous localStorage token.
- Design: Domowy. `docs/tokens.css`, `components.css`, `theme.js` and `icons.svg` are copies from
  `~/projects/home-design`: never edit them here. Change them in home-design and run its
  `./sync.sh present-list`, then `scripts/stamp.sh`.

## Long-term memory
@~/personal-bootstrap/memory/projects/present-list.md
