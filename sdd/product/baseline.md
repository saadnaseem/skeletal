# Test baseline — main 30203e3 (2026-11-03)

Every roadmap item must leave these numbers no worse.

| Check | Command | Result |
|---|---|---|
| Unit | `npm test` | 171 passed, 0 failed |
| Browser (Chromium) | `npm run test:e2e` | 221 passed, 3 skipped, 0 failed (146 s) |
| Accuracy | `npm run validate` | ¹H held-out n=28 MAE 0.08 (max 0.39); ¹³C n=38 MAE 0.73 (max 6.30) |
| Live site | gstack browse on https://lonepair.app | 200 in 0.43 s, no console errors |

Issue probe used for the roadmap verdicts: a Playwright script that loads each test input through `tryLoadText` / `FORMATS.read` and records formula, mass, radicals and bond styles (kept outside the repo; to be turned into tests per spec).
