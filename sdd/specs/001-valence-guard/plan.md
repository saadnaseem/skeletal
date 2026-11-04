# Plan — 001-valence-guard

> Status: approved (user, 2026-11-03) · Last updated: 2026-11-03
> The **how & in what order**. Every task group cites requirement IDs; every requirement appears in at least one group.

## 1. Approach
A new pure function `overValent(frag)` in `src/core.js` runs the existing `valenceError` on a fragment before it reaches the drawing. Every text insert already goes through `tryLoadText`, which collects its fragments and calls `insertFragments`. A check goes right before that call. If it fails, `tryLoadText` refuses the same way `readSmiles` refuses invented radicals today: it sets `loadError` and returns false. It also records an `overValence` flag. A new third argument, `force`, skips the check, and that is all **Insert anyway** does: it calls `tryLoadText(text, true, true)`.

The toast can't hold a button (`pointer-events:none`), so paste and file open show the refusal in the **Insert structure dialog** instead. The dialog opens with the text filled in, the reason shown and an **Insert anyway** button. That gives one place for the message and the button, and it is the dialog people already use.

Document files (`insertForeign`) are not refused. They count over-valent atoms and add the count to the "Opened …" toast.

- **Rationale:** one check point (`tryLoadText`) covers the dialog, paste, files, templates, examples and PubChem results. Reusing `valenceError` keeps the check and the red warning in step (CON-001).
- **Rejected:** checking inside `insertFragments`. It is also used by hand-drawing helpers (chair templates), and it has no text to rerun for Insert anyway.
- **Rejected:** a new toast with a button. It would be a second UI pattern, and it would need accessibility work for a short-lived element.

## 2. Constitution compliance
- Plain JS in the existing globals style; tests follow the existing patterns: `node --test` with `load.mjs`, and pytest + Playwright with `conftest.py`.
- No new dependencies; works offline. Deviation: none.

## 3. Files to touch
| Action | Path | Reason |
|---|---|---|
| modify | `src/core.js` | add `overValent(frag)` next to `valenceError` |
| modify | `src/app.js` | `tryLoadText(txt, quiet, force)` check and refusal; InChI branch check; Insert structure dialog: prefill, message, Insert anyway; paste and `openFile` hand over to the dialog; `insertForeign` count in its toast |
| create | `tests/unit/valence_guard.test.mjs` | `overValent` verdicts for the §9 cases, plus timing (NFR-001) |
| create | `tests/e2e/test_valence_guard.py` | dialog, Insert anyway, undo, paste, file open, reaction, PubChem path (stubbed), CDXML count, must-accept list |
| modify | `README.md` | one sentence under Drawing: refused input and Insert anyway |
| modify | `dist/lonepair.html` | rebuilt (committed with each change, per repo convention) |
| modify | `sdd/product/roadmap.md` | status |

Not touched: `tests/e2e/test_landscape_suite.py`. Its strict xfail `test_carbon_with_five_bonds_is_flagged` (B5) is about the **Analysis panel** not mentioning valence, which this spec doesn't change. If it starts passing, strict mode fails it and we notice.

## 4. Data & contract changes
- Schema: none. Saved files and formats are unchanged.
- `tryLoadText(txt, quiet)` → `tryLoadText(txt, quiet, force=false)`. Existing callers keep today's behaviour, except that over-valent text is now refused.
- New global `loadErrorKind` (`''` | `'valence'`), set beside `loadError`, so callers know whether to offer Insert anyway.
- Rollback: revert the PR. There is no data to migrate.

## 5. Task groups
Order: logic → interface → integration → docs. Every group ends with `npm run build && npm test` green. Groups that touch UI also run `npm run test:e2e`.

### TG-01: `overValent` and its unit tests   [S]   [satisfies: FR-006, NFR-001, CON-001]
- **Objective:** a pure function that returns the over-valent atoms of a fragment `{atoms, bonds}` using `valenceError`.
- **Inputs:** `src/core.js` `valenceError`, `buildIndex`; requirements §9.
- **Outputs:** `overValent` in `src/core.js`; `tests/unit/valence_guard.test.mjs`. Tests are written first, named after the requirement IDs. They cover the 11 must-accept cases (none flagged), the 4 must-refuse cases (each flagged with the right `why`), multiple bad atoms, and a 200-atom chain under 20 ms.
- **Acceptance:** the new tests pass and all 171+ existing unit tests still pass.
- **Verify:** `npm test`
- [x] complete (2026-11-03): `npm test` 196 pass / 0 fail (189 + 7 new)

### TG-02: refuse in `tryLoadText`, and Insert anyway in the dialog   [M]   [satisfies: FR-001, FR-002, FR-003, FR-007, FR-008, FR-010]
- **Objective:** SMILES, reaction SMILES, molfile and InChI inserts are checked. The dialog shows the reason and an **Insert anyway** button.
- **Inputs:** `tryLoadText`, `openSmilesDialog`, the `readSmiles` refusal pattern.
- **Outputs:** the `force` parameter; the check before each `insertFragments` call in `tryLoadText`, and in the async InChI `.then`. The message reads: "C has 5 bonds; at most 4 (and 2 more atoms). Nothing was inserted." The dialog gets a hidden `#smForce` button, shown when `loadErrorKind==='valence'`, which reruns with `force`. The PubChem result path and templates/examples get the check for free. Browser tests come first.
- **Acceptance:** the e2e tests for FR-001/2/3/7/8/10 pass; the full e2e suite passes.
- **Verify:** `npm run build && npm test && npm run test:e2e`
- **Depends on:** TG-01
- [x] complete (2026-11-03): unit 196 pass; e2e 758 passed, 3 skipped, 7 xfailed, 0 failed (735 + 23 new)

### TG-03: paste and file open go to the dialog   [S]   [satisfies: FR-004, FR-005]
- **Objective:** a refused paste or file opens the Insert structure dialog with the text filled in, the reason shown and Insert anyway available.
- **Inputs:** the `paste` listener and `openFile` in `src/app.js`.
- **Outputs:** `openSmilesDialog(prefill, err)`; the paste and `openFile` (`.sdf` first record and generic text) branches call it when `loadErrorKind==='valence'`. Other errors still show a toast, as today.
- **Acceptance:** the e2e paste and file tests pass (`.mol` and `.sdf` via `set_input_files`).
- **Verify:** `npm run build && npm run test:e2e`
- **Depends on:** TG-02
- [x] complete (2026-11-03): unit 196 pass; e2e 762 passed, 3 skipped, 7 xfailed, 0 failed. Also `.smi` file covered. Side effect: a refused `.sdf` now shows the specific reason (e.g. the invented-radical message) instead of 'Could not read this file', the same as other text files.

### TG-04: document files count, without refusing   [S]   [satisfies: FR-009]
- **Objective:** `insertForeign` adds "2 atoms have too many bonds (shown in red)" to its toast.
- **Outputs:** the count in `insertForeign`; an e2e test with an inline CDXML that has a five-bond carbon.
- **Acceptance:** the file opens, the toast includes the count, and the red warning is visible.
- **Verify:** `npm run build && npm run test:e2e`
- **Depends on:** TG-01
- [ ] complete

### TG-05: docs, full regression and preview QA   [S]   [satisfies: NFR-002, NFR-003, CON-002, CON-003]
- **Objective:** prove nothing else broke, and that the messages read well.
- **Outputs:** README sentence; roadmap status; rebuilt `dist/lonepair.html`.
- **Steps:**
  1. Run the full bar 3 times: unit, e2e (Chromium), `validate`, and e2e in WebKit (`LONEPAIR_BROWSER=webkit`).
  2. Compare against `baseline.md`.
  3. Hand-draw a sixth bond and confirm only the red warning appears (CON-002).
  4. Push, open the PR, wait for CI.
  5. Run gstack `/qa-only` on the branch preview.
- **Acceptance:** everything in `validation.md` is ticked.
- **Depends on:** TG-02, TG-03, TG-04
- [ ] complete

## 6. Coverage check
| Requirement | Task group(s) |
|---|---|
| FR-001, FR-002, FR-003 | TG-02 |
| FR-004, FR-005 | TG-03 |
| FR-006 | TG-01 (unit), TG-02 (e2e must-accept list) |
| FR-007, FR-008, FR-010 | TG-02 |
| FR-009 | TG-04 |
| NFR-001 | TG-01 |
| NFR-002, NFR-003 | TG-05 |
| CON-001 | TG-01 |
| CON-002, CON-003 | TG-05 |

Orphan requirements: none · Orphan task groups: none

## 7. Parallelization
- Independent: TG-04 can run after TG-01, alongside TG-02 and TG-03. We do them in order anyway (one at a time).
- Sequential: TG-01 → TG-02 → TG-03 → TG-05.

## 8. Risks
| Risk | Likelihood | Impact | Mitigation | Early signal |
|---|---|---|---|---|
| An existing browser test inserts deliberately over-valent text via `tryLoadText` | medium | tests break | grep the tests for such inputs in TG-02, and pass `force` in those tests where the intent is "draw it anyway" | e2e failures in TG-02 |
| `valenceError` flags a real compound we haven't listed (e.g. a hypervalent Xe or Si species) | low | a valid input is refused | Insert anyway is always available; log a follow-up for the rule | user reports, QA |
| Fragment atoms have `id:0` before insert, which `buildIndex` keys on | high | wrong verdicts | `overValent` gives fragment atoms temporary ids from their indices | TG-01 unit tests |
| The dialog's async PubChem path races with Insert anyway | low | double insert | Insert anyway reruns the last refused *text*, and the button hides after use | e2e |

## 9. Rollout
- No feature flag. The PR runs CI, and its Cloudflare preview gets gstack `/qa-only`.
- After merge: gstack `/canary` on lonepair.app. The daily scheduled health check also covers it.
- Rollback trigger: any valid compound refused in the field, or any CI/canary regression → revert the PR.
