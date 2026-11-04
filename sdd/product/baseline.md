# Test baseline — main 30203e3 (2026-11-03)

Every roadmap item must leave these numbers no worse.

| Check | Command | Result |
|---|---|---|
| Unit | `npm test` | 171 passed, 0 failed |
| Browser (Chromium) | `npm run test:e2e` | 221 passed, 3 skipped, 0 failed (146 s) |
| Accuracy | `npm run validate` | ¹H held-out n=28 MAE 0.08 (max 0.39); ¹³C n=38 MAE 0.73 (max 6.30) |
| Live site | gstack browse on https://lonepair.app | 200 in 0.43 s, no console errors |

Issue probe used for the roadmap verdicts: a Playwright script that loads each test input through `tryLoadText` / `FORMATS.read` and records formula, mass, radicals and bond styles (kept outside the repo; to be turned into tests per spec).

## Baseline on main 5a5109e (2026-11-03, before spec 001 TG-01)
After #29–#34 merged. Recorded on the `sdd/roadmap` worktree (no code diff from main).
- Unit (`npm test`): **189 passed**, 0 failed.
- E2e Chromium (`npm run test:e2e`): **735 passed, 3 skipped, 7 xfailed**, 0 failed (142 s).
- Validate: ¹H n=28 MAE 0.08 (max 0.39); ¹³C n=38 MAE 0.73 (max 6.30); pKa n=22 MAE 0.40 (max 2.70).
