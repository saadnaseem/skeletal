# Roadmap and to-do list — Lone Pair

> Status: draft · Last updated: 2026-11-03
> The **when**, and the working to-do list. Sizes: S (<1 day) / M (1–3 days) / L (>3 days, split before starting).
> Every item was checked against `main` at **30203e3** before planning (browser probe of `dist/lonepair.html` plus live lonepair.app).
> Baseline on that commit: unit tests **171/171 pass**; browser suite and `npm run validate` results in `sdd/product/baseline.md`.

**Verdict key:** ✅ confirmed (the problem is real) · 🟡 partly true · ❌ not true / already done · 🔀 being fixed in an open PR

## How we work through this list
1. Pick the **top `planned` item**. Nothing else is in flight at the same time (one at a time).
2. Write its spec in `sdd/specs/NNN-slug/` (requirements → plan → validation), each approved at a gate.
3. Write failing tests first, implement, then run the full bar from `tech-stack.md` (unit, browser, validate, edge-case suite) — repeatedly, before and after each task group.
4. PR → CI green → check the branch preview with gstack `/qa-only` → merge → `/canary` on lonepair.app.
5. Tick it here, update the score, move on.

## Current phase
Phase 1 — chemistry correctness. The #29–#34 stack merged on 2026-11-03 (edge-case suite, molfile wedges, ligand H, invented radicals, isotopes). Item 1 shipped 2026-11-04 (PR #37). Next: item 2 follow-up (MOL/CDXML radicals) or item 4.

## Phase 1 — Chemistry correctness
Goal: the app is never silently wrong about what was drawn or imported.
Exit criterion: every Phase 1 row is `done` and the edge-case suite runs on `main` in CI.

| # | Item (rubric pts) | Verified on main 30203e3 | Size | Depends on | Spec / PR | Status |
|---|---|---|---|---|---|---|
| 0 | Land the open correctness stack | #29 edge-case suite, #30 molfile wedges, #31 ligand H + `N->[BH3]`, #32 invented radicals — all CI green | S | — | PRs #29–#34 | done (merged 2026-11-03) |
| 1 | Block structures that break valence rules (+1.8) | ✅ `C(C)(C)(C)(C)C` is inserted with only a red "C has 5 bonds" warning; analysis then reports C6H15. SF6 correctly accepted. | M | — | `sdd/specs/001-valence-guard` | **shipped 2026-11-04 (PR #37, merge 1bf2980)** |
| 2 | Refuse radicals the input didn't ask for (+1.8) | ✅🔀 `c1ccnc1` → `[CH]1N=CC=C1` (C4H4N), `c1cccc1` → radical; `c1cc[nH]c1` fine. SMILES fixed in #32; **MOL and CDXML imports not covered**. | S | 0 | #32 merged; MOL/CDXML follow-up | partly done |
| 3 | Keep hydrogens in metal complexes (+1.8) | ✅🔀 Cisplatin `Cl[Pt](Cl)([NH3])[NH3]` → H4N2Cl2Pt, 298.03 (should be H6, 300.05). Ferrocene (C10H10Fe) and Wilkinson's (C54H45ClP3Rh) already right. Grubbs II not yet tested. | S | 0 | #31 merged (cisplatin now H6N2Cl2Pt); add Grubbs II test | done |
| 4 | CDXML bond styles and arrow direction (+2.2) | 🟡 Wedged hash, wedge, wavy, bold import and export correctly. **Plain `Dash` and `Hash` bonds import as plain lines** (confirmed). Modern `<arrow Head3D/Tail3D>` reads in the right direction; the legacy `<graphic ArrowType>` path swaps BoundingBox ends — needs a real ChemDraw file to confirm which is right. | M | 0 | `002-cdxml-fidelity` | planned |
| 5 | Dative bonds everywhere (+1.6) | ✅🟡 `N->[Pt]` and `[NH3]->[Pt](Cl)(Cl)<-[NH3]` rejected ("not a valid SMILES"). #31 fixes `->` being read as a reaction arrow for `N->[BH3]`. CDXML `Order="dative"` already reads. Writing dative to SMILES / V3000 / CDXML not done. | M | 0, 3 | `003-dative-bonds` | planned |
| 6 | Analyze reactions per component (+1.55) | ✅ `CCO.CC(=O)O>>CC(=O)OCC.O` analysed as one formula C8H20O6, 212.24 ("4 structures"). Reaction SMILES row already exists; no per-species formula/mass, no atom-balance check. | M | — | `004-reaction-analysis` | planned |
| 7 | License, terms, about, changelog pages (+1.6) | 🟡 Repo is already **public under MIT** and `/privacy` exists. `/about`, `/license`, `/terms`, `/changelog` return 404 on lonepair.app. #14 adds `/about`. No OpenChemLib/InChI credit page on the site (`THIRD_PARTY_NOTICES.md` exists in repo only). | S | #14 | `005-legal-pages` | planned |

## Phase 2 — File fidelity and competitive parity
Goal: files round-trip without loss; the app is checked by a second engine and usable without a mouse.
Exit criterion: rubric ≥ 78.5.

| # | Item (rubric pts) | Verified on main 30203e3 | Size | Depends on | Spec | Status |
|---|---|---|---|---|---|---|
| 8 | Enhanced stereo in CXSMILES (+3.1) | 🟡 Drawing abs/&n/orn labels and V3000 / CDXML round trips **already exist** (README; `toOCL`/`fromOCL`). Gap confirmed: `C[C@H](O)[C@@H](C)N \|&1:1,3\|` loads with the group dropped silently; CXSMILES not written. | M | — | `006-cxsmiles-stereo` | planned |
| 9 | RDKit second opinion (+1.8) | ✅ No RDKit anywhere. Note: adds ~6–7 MB WASM — must load lazily so the single-file app stays usable offline. | L | — | `007-rdkit-check` | planned |
| 10 | Test suite with automatic runs (+2.2) | ❌🟡 Claim "no public tests" is wrong: 171 unit tests, 14 browser test files, CI on every push and PR. #29 adds the 41-structure edge-case suite. **Real gaps:** real ChemDraw SI files, rendered-image comparison, a post-deploy smoke test of lonepair.app (the daily gstack check covers part of this). | M | 0 | `008-visual-and-si-tests` | planned |
| 11 | Accessibility and keyboard drawing (+1.2) | 🟡 131 aria/role/alt attributes (not ~70). Confirmed gaps: drawing canvas has no accessible name or description, no keyboard cursor for drawing, no high-contrast theme. | L | — | `009-a11y` (split) | planned |
| 12 | Publication output (+1.0) | 🟡 EMF and PDF export **already exist**. Not verified: exact ACS 1996 match, editable structure embedded in PDF/EMF, one-click copy for Office. | L | — | `010-publication-output` | needs verification |
| 13 | Name → structure offline (OPSIN) (+0.5) | ✅ Naming goes to PubChem only. OPSIN is Java; a JS/WASM build must be found or made — size/feasibility spike first. | L | — | spike | planned |

## Phase 3 — Strategic features
| # | Item (rubric pts) | Verified | Size | Status |
|---|---|---|---|---|
| 14 | In-page API, CLI and MCP server for AI agents (+2.1) | ✅ No public API on `window`. | L | planned |
| 15 | Publish the source (+0.8 / +3.2) | ❌ **Already done**: `saadnaseem/skeletal` is public, MIT. Remaining: link to the source from the site (fold into item 7). | S | fold into 7 |
| 16 | Full reaction tools (+1.05) | 🟡 RXN V2000/V3000 **export exists**. Missing: RXN/RDF import, atom mapping, conditions layout, stoichiometry table. | L | planned |
| 17 | Image → structure (+0.7) | ✅ absent | L | planned |
| 18 | Office / Google Docs / ELN plugins (+0.7) | ✅ absent | L | planned |
| 19 | Real-time co-editing (0 pts) | ✅ absent | L | not now |

## Sequencing notes
- Item 0 first: #29's edge-case suite is the safety net for every later item, and #30–#32 already fix most of items 2, 3 and 5.
- Item 1 does not overlap the open stack, so its spec can be written now; implementation branches from `main` after the stack merges, to avoid conflicts in `src/core.js`.
- Item 3 before 5 (both change hydrogens on atoms bonded to metals).
- Item 7 after #14 (#14 adds `/about`).
- Item 10's visual-regression harness should land before 11 and 12, which change rendering.

## Not now
| Item | Why | Revive when |
|---|---|---|
| 19 Co-editing | No rubric points; needs accounts and a server, against the offline-first principle | Phases 1–2 done and users ask for it |

## Open product questions
| Question | Blocks | Owner |
|---|---|---|
| Who merges the #29–#32 stack (you, or this SDD session after review)? | item 0 | you |
| Can you supply 3–5 real ChemDraw `.cdxml` files from journal SI (with hashed bonds and arrows)? | items 4, 10 | you |
| Is a 6–7 MB lazy-loaded RDKit acceptable? | item 9 | you |

## Changelog
- 2026-11-03 — created from the 19-item improvement list; each item verified against main 30203e3.
