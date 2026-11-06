# present-list (repo `prezenty`)

Gift list site: static `docs/` on GitHub Pages + one Google Sheet and Apps Script web app per person
(`apps-script/Code.gs`, list of deployments in `apps-script/lists.txt`). README (Polish) has the setup.

## Working here
- Tests: `node --test tests/*.test.js`. Local preview in demo mode: `cd docs && python3 -m http.server 8000`.
- Before committing changes in `docs/`, run `scripts/stamp.sh` (cache-busting `?v=` links).
- Site deploys on push to `main`. Apps Script code deploys with `apps-script/deploy.sh redeploy [name]`
  (keeps the `/exec` URLs).
- PUBLIC repo (Pages needs it): admin keys and setup links live only in git-ignored
  `setup-links.local.md`. Never commit, print or paste them.
- No accounts for visitors by design; reservations are tied to an anonymous localStorage token.

## Long-term memory
@~/personal-bootstrap/memory/projects/present-list.md
