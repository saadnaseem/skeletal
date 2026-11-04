# Tech stack — Lone Pair

> Status: draft (derived from the repo) · Last updated: 2026-11-03

| Area | Choice | Evidence |
|---|---|---|
| Language | Plain browser JavaScript in shared global scope, 5 main files in `src/` (`app.js`, `core.js`, `formats.js`, `ms.js`, `nmr.js`, …) | `src/`, `REVIEW.md` |
| Chemistry engine | OpenChemLib 9.25.1 (`OCL`), InChI via `inchi-js` (WASM) | `package.json` |
| Build | `node scripts/build.mjs` (esbuild) → single file `dist/lonepair.html`; `build:pages` → `site/` | `package.json`, `scripts/` |
| Hosting | Cloudflare Workers Builds from GitHub `main`; static assets + `worker/index.js` for `/api/*`; branch previews at `<branch>-lone-pair.saad455.workers.dev` | `wrangler.toml` |
| Unit tests | `node --test tests/unit/*.test.mjs`; modules loaded into a Node VM by `tests/unit/load.mjs` | `tests/unit/` |
| Browser tests | pytest + Playwright against `dist/lonepair.html` (`npm run test:e2e`); `LONEPAIR_URL` targets a served copy, `LONEPAIR_BROWSER` picks the engine | `tests/e2e/conftest.py` |
| Accuracy checks | `npm run validate` (held-out NMR / pKa sets) | `scripts/validate.mjs` |
| CI | GitHub Actions on push and PR: `npm ci`, build, unit, e2e (Chromium), `build:pages` | `.github/workflows/ci.yml` |
| License | MIT (repo is public) | `LICENSE`, GitHub |

## Conventions
- Branch per change off `main`; PR; merge commit. `dist/lonepair.html` is committed with each change.
- Each fix gets a unit test (Node) and, if it touches UI or import paths, a browser test.
- Comments are short and explain *why*; match the dense one-line style of `src/core.js`.

## Testing bar for every roadmap item ("don't break it")
1. `npm run build && npm test` — all unit tests pass.
2. `npm run test:e2e` — all browser tests pass (Chromium); WebKit run for UI changes.
3. `npm run validate` — accuracy numbers not worse than before.
4. The edge-case suite (`tests/e2e/test_landscape_suite.py`, once #29 lands) passes.
5. Branch preview checked with gstack `/qa-only` before merge; `/canary` on lonepair.app after merge.
