# Validation — 003-cdxml-fidelity

> Status: draft · Last updated: 2026-11-04
> **How we know it's done.** Kept after the feature ships. Every requirement gets at least one check.

## 1. Definition of done
- [ ] TG-01 … TG-05 in `plan.md` ticked.
- [ ] Every row of §2 has ✅ (or ⚠ with a reason) and evidence.
- [ ] The full bar passes **3 times in a row** locally, plus CI on the PR.
- [ ] Numbers are no worse than `sdd/product/baseline.md`: unit 209 + new, e2e 0 failed, validate MAE ¹H ≤ 0.08 and ¹³C ≤ 0.73.
- [ ] Manual checks M-1 … M-4 on the PR's Cloudflare preview pass.
- [ ] `requirements.md` and `plan.md` describe what was built; deviations are in `sdd/product/decisions.md`.

## 2. Traceability matrix
| ID | Requirement (short) | TG | Check | Type | Verdict | Evidence |
|---|---|---|---|---|---|---|
| FR-001 | grouped half-brackets open as a pair | TG-01 | CK-01 | automated | ⬜ | |
| FR-002 | facing half-brackets pair without a group | TG-01 | CK-02 | automated | ⬜ | |
| FR-003 | unpaired halves still counted | TG-01 | CK-02 | automated | ⬜ | |
| FR-004 | corner text attaches to pairs | TG-01 | CK-03 | automated | ⬜ | |
| FR-005 | brackets save as halves + group | TG-02 | CK-04, M-5 | automated + optional manual | ⬜ | |
| FR-006 | dashed and hashed bond tool styles, single for chemistry | TG-03 | CK-05, CK-07 | automated | ⬜ | |
| FR-007 | `Dash`/`Hash` read and written | TG-03 | CK-06 | automated | ⬜ | |
| FR-008 | drawn in every export; plain single elsewhere | TG-03 | CK-05, CK-07, M-2 | automated + manual | ⬜ | |
| FR-009 | arrow direction pinned | TG-04 | CK-08 | automated | ⬜ | |
| NFR-001 | no regression | TG-05 | CK-09 | automated ×3 | ⬜ | |
| NFR-002 | real files: 7 pairs, 1 left out | TG-01 | CK-10 | local | ⬜ | |
| NFR-003 | styles clear at normal zoom and in exports | TG-05 | M-1, M-2 | manual | ⬜ | |
| CON-001 | user's files only read locally | all | review | review | ⬜ | |
| CON-002 | offline, no new dependencies | TG-05 | CK-11 | automated | ⬜ | |
| CON-003 | wedges, wavy, bold, arrows, `SquarePair` unchanged | TG-01, TG-04 | CK-02b, CK-08, existing tests | automated | ⬜ | |
| CON-004 | old projects open; unknown style falls back | TG-03 | CK-05b | automated | ⬜ | |

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
