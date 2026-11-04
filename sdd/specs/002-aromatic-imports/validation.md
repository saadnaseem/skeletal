# Validation — 002-aromatic-imports

> Status: in progress · Last updated: 2026-11-04
> **How we know it's done.** Kept after the feature ships. Every requirement gets at least one check.

## 1. Definition of done
- [ ] TG-01 … TG-04 in `plan.md` ticked.
- [ ] Every row of §2 has ✅ (or ⚠ with a reason) and evidence.
- [ ] The full bar (§4) passes **3 times in a row** locally, plus CI on the PR.
- [ ] Numbers are no worse than `sdd/product/baseline.md`: unit 196 + new, e2e 0 failed, validate MAE ¹H ≤ 0.08 and ¹³C ≤ 0.73.
- [ ] Manual checks M-1 … M-4 on the PR's Cloudflare preview pass.
- [ ] `requirements.md` and `plan.md` describe what was built; deviations are in `sdd/product/decisions.md`.

## 2. Traceability matrix
| ID | Requirement (short) | TG | Check | Type | Verdict | Evidence |
|---|---|---|---|---|---|---|
| FR-001 | type-4 molfiles alternate, every route | TG-01, TG-02 | CK-01, CK-05 | automated | ✅ | CK-01 unit (11 compounds × V2000/V3000, coronene) pass; `test_FR_001_type4_benzene_every_route` [dialog, paste, mol, sdf], `test_FR_001_type4_formulas_match_smiles` ×4, `test_FR_001_undo_removes_in_one_step` pass |
| FR-002 | coordinates, charges, isotopes, H counts, wedges kept | TG-01 | CK-02 | automated | ✅ | `FR-002 charges, isotopes, coordinates and wedges are kept`, `FR-001, FR-002 pyrrole with its N–H drawn as an H atom` pass |
| FR-003 | molfile ring that can't alternate is refused | TG-01, TG-02 | CK-03, CK-06 | automated | ✅ | CK-03 unit (1, 1, 2, 1 rings) pass; `test_FR_003_dialog_refuses_ring_that_cannot_alternate`, `test_FR_003_paste_and_file_show_the_reason` pass |
| FR-004 | document files open with a ring count | TG-03 | CK-08 | automated | ⬜ | |
| FR-005 | Kekulé molfiles and alternating document files unchanged | TG-01, TG-03, TG-04 | CK-04, CK-08, CK-09 | automated | ⬜ | |
| NFR-001 | no regression | TG-04 | CK-09 | automated ×3 | ⬜ | |
| NFR-002 | plain messages | TG-04 | M-1 … M-4 | manual | ⬜ | |
| CON-001 | one converter (`kekulize`) | TG-01 | CK-01 | review + automated | ✅ | `kekulizeFragment` calls `FORMATS.kekulize`; no other converter added |
| CON-002 | offline, no new dependencies | TG-04 | CK-10 | automated | ⬜ | |
| CON-003 | SMILES and valence guard unchanged | TG-01, TG-02 | CK-04b, CK-07 | automated | ✅ | `CON-003 SMILES never gives a 1.5 bond`, `test_CON_003_over_valent_type4_still_offers_insert_anyway` pass; spec 001 suite unchanged and green |

Verdicts: ⬜ not run · ✅ pass · ❌ fail · ⚠ accepted exception (with reason).

## 3. Checks
Unit checks: `tests/unit/aromatic_imports.test.mjs`. Browser checks: `tests/e2e/test_aromatic_imports.py`.

| Check | What | Where |
|---|---|---|
| CK-01 | benzene, pyridine, naphthalene, furan, thiophene, pyrrole/indole/imidazole with an N H count, pyridinium, N-methylpyrrole, phenylboronic acid, as V2000 and V3000 type-4 molfiles: no rings left, same formula and same canonical structure as their SMILES; coronene converts in full | unit |
| CK-02 | a wedged, charged, ¹³C-labelled type-4 molfile keeps its wedge, charges, isotope, coordinates and stereo; pyrrole with its N–H drawn as an H atom gives C4H5N | unit |
| CK-03 | pyrrole and indole with no H count, two pyrroles, and a C5 ring report 1, 1, 2 and 1 rings | unit |
| CK-04 | Kekulé molfiles give exactly the fragment they gave before; a hydrogen-count column without type-4 bonds is not read | unit |
| CK-04b | no template, example or SMILES gives a 1.5 bond | unit |
| CK-05 | dialog, paste, `.mol` and `.sdf` of type-4 benzene insert C6H6; one undo removes it | e2e |
| CK-06 | type-4 pyrrole with no H: nothing inserted, the reason shown, no Insert anyway; paste and file show a toast | e2e |
| CK-07 | an over-valent type-4 molfile still gets the spec 001 refusal with Insert anyway | e2e |
| CK-08 | CDXML and CML five-membered rings with no N–H open with "1 aromatic ring" in the message; a benzene CDXML doesn't mention rings; CDXML furan in any atom order alternates | unit + e2e |
| CK-09 | full bar: `npm test`, `npm run test:e2e` (Chromium; WebKit if it launches), `npm run validate`, 3 runs | local + CI |
| CK-10 | `git diff origin/main -- package.json package-lock.json` is empty | local |

## 4. Manual checks (PR preview)
- **M-1:** paste a type-4 benzene molfile: alternating bonds, formula C6H6 in the panel.
- **M-2:** paste a type-4 pyrrole with no H: the toast reads as a fix, not an error code.
- **M-3:** open a type-4 `.sdf`: as M-1.
- **M-4:** open a CDXML pyrrole with no N–H: the drawing opens, and the message counts 1 ring.
