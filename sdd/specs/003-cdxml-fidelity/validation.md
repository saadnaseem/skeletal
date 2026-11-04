# Validation — 003-cdxml-fidelity

> Status: shipped 2026-11-04 (PR #39, 242a5fc) · Last updated: 2026-11-04
> **How we know it's done.** Kept after the feature ships. Every requirement gets at least one check.

## 1. Definition of done
- [x] TG-01 … TG-05 in `plan.md` ticked.
- [x] Every row of §2 has ✅ (or ⚠ with a reason) and evidence.
- [x] The full bar passes **3 times in a row** locally, plus CI on the PR.
- [x] Numbers are no worse than `sdd/product/baseline.md`: unit 209 + new, e2e 0 failed, validate MAE ¹H ≤ 0.08 and ¹³C ≤ 0.73.
- [x] Manual checks M-1 … M-4 on the PR's Cloudflare preview pass (M-3 by `test_M3_…`; M-5 in ChemDraw is optional and not done).
- [x] `requirements.md` and `plan.md` describe what was built; deviations are in `sdd/product/decisions.md`.

## 2. Traceability matrix
| ID | Requirement (short) | TG | Check | Type | Verdict | Evidence |
|---|---|---|---|---|---|---|
| FR-001 | grouped half-brackets open as a pair | TG-01 | CK-01 | automated | ✅ | `FR-001 grouped half-brackets open as one pair…` (Square, Curly, Round), `FR-001 the same file as CDX…` (group link decoded from binary) pass |
| FR-002 | facing half-brackets pair without a group | TG-01 | CK-02 | automated | ✅ | `FR-002 facing halves…` (also within 1 pt), `FR-002, FR-003 halves of different kinds or heights…` pass |
| FR-003 | unpaired halves still counted | TG-01 | CK-02 | automated | ✅ | `FR-003 a lone curly brace is counted…`; existing `single brackets are reported` test unchanged and passing |
| FR-004 | corner text attaches to pairs | TG-01 | CK-03 | automated | ✅ | `FR-004 a charge at the top right and a count at the bottom right…` pass |
| FR-005 | brackets save as halves + group | TG-02 | CK-04, M-5 | automated + optional manual | ✅ (ChemDraw check pending) | `FR-005 each bracket is written as two half-brackets and a bracketedgroup…`, `FR-005 brackets, nested ones included, come back the same through CDXML and CDX`, `brackets and their labels round-trip…` pass |
| FR-006 | dashed and hashed bond tool styles, single for chemistry | TG-03 | CK-05, CK-07 | automated | ✅ | `test_FR_006_draw_save_reopen_undo` [dashed, hashed] (real mouse drag, formula C2H6), `test_FR_006_pressing_2_…`, unit `FR-006, FR-008 … single bonds for formula, SMILES and molfile` pass |
| FR-007 | `Dash`/`Hash` read and written | TG-03 | CK-06 | automated | ✅ | unit `FR-007 ChemDraw Dash and Hash bonds …` (CDXML and CDX), `test_FR_007_008_chemdraw_round_trip_and_exports` pass |
| FR-008 | drawn in every export; plain single elsewhere | TG-03 | CK-05, CK-07, M-2 | automated + manual | ✅ | unit SVG test (dash lengths, even marks), `test_FR_007_008_chemdraw_round_trip_and_exports` (molfile single bond, PDF nothing lost, PNG) pass |
| FR-009 | arrow direction pinned | TG-04 | CK-08 | automated | ✅ | `FR-009 a modern arrow and the older graphic it supersedes…`, `FR-009 an older file with only the graphic form…` (both directions) pass; values copied from a real file |
| NFR-001 | no regression | TG-05 | CK-09 | automated ×3 | ⚠ | Chromium ×3: unit 224/0, e2e 783 passed / 3 skipped / 7 xfailed / 0 failed, validate unchanged (¹H 0.08, ¹³C 0.73, pKa 0.40); CI 3/3 pass. WebKit still can't launch on this Mac (logged in spec 001), so not run |
| NFR-002 | real files: 7 pairs, 1 left out | TG-01 | CK-10 | local | ✅ | 4 files: 2 + 3 + 1 + 1 pairs (6 square, 1 curly); 1 bracket left out (the lone curly brace); atoms 852/1664/917/324, arrows 53/149/54/36, texts 54/98/48/26 unchanged |
| NFR-003 | styles clear at normal zoom and in exports | TG-05 | M-1, M-2 | manual | ✅ | Preview sdd-roadmap-after-002-lone-pair.saad455.workers.dev (gstack browse): single, dashed, hashed, hashed wedge, wedge and H-bond side by side at 115% and 345%, light and dark theme: dashed has long dashes, the H-bond short dots; hashed marks are all one length, the hashed wedge's widen. Exports covered by `test_FR_007_008_…` (PDF with nothing lost, PNG) |
| CON-001 | user's files only read locally | all | review | review | ✅ | read by scratchpad scripts only; fixtures hand-written (one arrow's coordinates reused as numbers) |
| CON-002 | offline, no new dependencies | TG-05 | CK-11 | automated | ✅ | `git diff origin/main -- package.json package-lock.json` empty |
| CON-003 | wedges, wavy, bold, arrows, `SquarePair` unchanged | TG-01, TG-04 | CK-02b, CK-08, existing tests | automated | ✅ | `CON-003 whole pairs …`, FR-009 tests, and the existing import/export suites pass |
| CON-004 | old projects open; unknown style falls back | TG-03 | CK-05b | automated | ✅ | `CON-004 the sanitizer keeps dashed and hashed; an unknown style still falls back to none` pass |

Verdicts: ⬜ not run · ✅ pass · ❌ fail · ⚠ accepted exception (with reason).

## 3. Checks
Unit checks: `tests/unit/cdxml_fidelity.test.mjs` (and the updated `brackets.test.mjs`). Browser checks: `tests/e2e/test_cdxml_fidelity.py`.

| Check | What | Where |
|---|---|---|
| CK-01 | grouped Square, Curly and Round halves → one pair each, spanning both halves; same from CDX | unit |
| CK-02 | facing halves without a group pair; different kinds or heights don't; a lone half is counted | unit |
| CK-02b | `SquarePair` from an older Lone Pair file opens as before | unit |
| CK-03 | "2–" at a pair's top right becomes its `sup`; a repeat count at the bottom right its `sub` | unit |
| CK-04 | brackets round-trip through CDXML and CDX; the CDXML has two halves and one `bracketedgroup` pointing at them | unit |
| CK-05 | sanitizer keeps both styles; SVG draws a dashed line and even hash marks | unit |
| CK-05b | an unknown style falls back to `none` | unit |
| CK-06 | `Display="Dash"`/`"Hash"` open as the styles and write back, in CDXML and CDX | unit |
| CK-07 | formula, SMILES and molfile equal the plain-bond drawing; e2e: draw, save, reopen, undo, change order to 2, export SVG and PNG | unit + e2e |
| CK-08 | modern arrow + superseded graphic → one arrow, head at Head3D; graphic-only arrow → head at the BoundingBox's first point | unit |
| CK-09 | full bar: `npm test`, `npm run test:e2e` (Chromium; WebKit if it launches), `npm run validate`, 3 runs | local + CI |
| CK-10 | the four real ChemDraw files: 7 pairs, 1 bracket left out, other objects unchanged | local script, not committed |
| CK-11 | `git diff origin/main -- package.json package-lock.json` is empty | local |

## 4. Manual checks (PR preview)
- **M-1:** draw a dashed and a hashed bond: they look different from a hydrogen bond, a single bond and a hashed wedge, at 100% and zoomed, in light and dark.
- **M-2:** export SVG, PNG and PDF of them: the styles show.
- **M-3:** open a hand-written CDXML with grouped square brackets and a "2–": one bracket pair with its charge.
- **M-4:** messages and tool tips read plainly.
- **M-5 (optional, user):** open a CDXML saved from the preview in ChemDraw; the brackets are one pair.

## 5. After merge (2026-11-04)
Merged as 242a5fc once CI passed (Workers Builds, test ×2). On https://lonepair.app (gstack browse): grouped ChemDraw half-brackets → one square pair, nothing left out; a `Display="Dash"` bond → dashed; the toolbar has 51 tools; aspirin → C9H8O4. No console errors. M-5 (opening a saved file in ChemDraw) not done.
