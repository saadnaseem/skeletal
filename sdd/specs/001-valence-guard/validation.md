# Validation — 001-valence-guard

> Status: approved (user, 2026-11-03) · Last updated: 2026-11-03
> **How we know it's done.** Kept after the feature ships. Every requirement gets at least one check.

## 1. Definition of done
- [ ] TG-01 … TG-05 in `plan.md` ticked.
- [ ] Every row of §2 has ✅ with pasted evidence (command output, test name or screenshot path).
- [ ] The full bar (§7) passes **3 times in a row** locally, plus CI on the PR.
- [ ] Numbers are no worse than `sdd/product/baseline.md`: unit count ≥ 171 + new, e2e 0 failed, validate MAE ¹H ≤ 0.08 and ¹³C ≤ 0.73.
- [ ] gstack `/qa-only` on the PR's Cloudflare preview reports no new issues.
- [ ] Out-of-scope confirmation (§9) passes.
- [ ] `requirements.md` and `plan.md` describe what was actually built; deviations are logged in `sdd/product/decisions.md`.

## 2. Traceability matrix
| ID | Requirement (short) | TG | Check | Type | Verdict | Evidence |
|---|---|---|---|---|---|---|
| FR-001 | dialog text inputs are checked | TG-02 | CK-03 | automated | ✅ | `test_FR_001_002_dialog_refuses_five_bond_carbon` ×5 (4 SMILES + V2000 molfile) pass |
| FR-002 | refuse and name the atom and count | TG-02 | CK-03, CK-04 | automated | ✅ | CK-03 + `test_FR_002_counts_more_atoms` pass |
| FR-003 | Insert anyway inserts unchanged | TG-02 | CK-05 | automated | ✅ | `test_FR_003_008_insert_anyway_then_undo`, `test_FR_003_editing_the_text_hides_insert_anyway` pass |
| FR-004 | paste refused → dialog | TG-03 | CK-07 | automated | ✅ | `test_FR_004_paste_opens_dialog` pass (valid paste still direct) |
| FR-005 | text file refused → dialog | TG-03 | CK-08 | automated | ✅ | `test_FR_005_mol_and_sdf_file_open_dialog` [mol, sdf, smi] pass |
| FR-006 | real exceptions accepted | TG-01, TG-02 | CK-01, CK-09 | automated | ✅ | CK-01 (unit, 11 compounds) + `test_FR_006_valid_inputs_insert_without_prompt` ×11 pass |
| FR-007 | reaction checked as a whole | TG-02 | CK-06 | automated | ✅ | `test_FR_007_reaction_refused_as_a_whole` pass |
| FR-008 | one undo removes it | TG-02 | CK-05 | automated | ✅ | `test_FR_003_008_insert_anyway_then_undo` pass |
| FR-009 | document files open with a count | TG-04 | CK-10 | automated | ⬜ | |
| FR-010 | templates, examples, PubChem checked | TG-02 | CK-11 | automated | ✅ | `test_FR_010_pubchem_result_checked`, `test_FR_010_templates_and_examples_still_insert` pass |
| NFR-001 | < 20 ms for 200 atoms | TG-01 | CK-02 | measured | ✅ | median 0.44 ms, max 1.34 ms over 20 runs (node) |
| NFR-002 | no regression | TG-05 | CK-12 | automated ×3 | ⬜ | |
| NFR-003 | plain-language messages | TG-05 | M-1…M-6 | manual | ⬜ | |
| CON-001 | same rule as red warning | TG-01 | CK-01b | automated | ✅ | `CON-001 agrees with valenceError on the inserted drawing` passes on all 16 cases |
| CON-002 | hand drawing not blocked | TG-05 | CK-13, M-5 | automated + manual | ⬜ | |
| CON-003 | offline, single file, no new deps | TG-05 | CK-14 | automated | ⬜ | |

Verdicts: ⬜ not run · ✅ pass · ❌ fail · ⚠ accepted exception (with reason).

## 3. Automated checks
Unit checks are in `tests/unit/valence_guard.test.mjs`; browser checks are in `tests/e2e/test_valence_guard.py`.

### CK-01: `overValent` accepts the real exceptions (FR-006)
- `test FR-006 accepts hypervalent, charged and metal compounds`: SF6, PCl5, IF7, PhI(OAc)2, ClO4⁻, DMSO, [N+](C)(C)(C)C, cisplatin, ferrocene, Wilkinson's catalyst and Grubbs II each return `[]`.
- **CK-01b (CON-001):** `test CON-001 agrees with valenceError`. For each of the 15 cases, the atoms `overValent` flags on the fragment are exactly the atoms `valenceError` flags once the fragment is inserted.

### CK-02: speed (NFR-001)
- `test NFR-001 200-atom check under 20 ms`: the median of 20 runs on a 200-atom chain is < 20 ms.

### CK-03: dialog refuses over-valent SMILES and molfile (FR-001, FR-002)
- `test_FR_001_002_dialog_refuses_five_bond_carbon`: type `C(C)(C)(C)(C)C` and press Insert. The atom count is unchanged, the dialog is still open, and `#smErr` contains "C has 5 bonds; at most 4" and "Nothing was inserted".
- The same test runs with a V2000 molfile of the same structure and with `N(C)(C)(C)C`, `O(C)(C)C` and `F(C)C`.

### CK-04: many bad atoms (FR-002)
- `test_FR_002_counts_more_atoms`: `C(C)(C)(C)(C)CC(C)(C)(C)(C)C` → the message names the first atom and says "and 1 more atom".

### CK-05: Insert anyway and undo (FR-003, FR-008)
- `test_FR_003_008_insert_anyway_then_undo`: after CK-03's refusal, `#smForce` is visible. Click it: 6 atoms are inserted, `#valWarn` is visible, and the dialog is closed. One `undo()` takes the atom count back to 0.

### CK-06: reaction (FR-007)
- `test_FR_007_reaction_refused_as_a_whole`: `CC>>C(C)(C)(C)(C)C` → nothing is inserted (no arrow, no atoms). After Insert anyway, 1 arrow and both structures are present.

### CK-07: paste (FR-004)
- `test_FR_004_paste_opens_dialog`: dispatch a `paste` event with `C(C)(C)(C)(C)C`. Nothing is inserted, the dialog is open, `#smIn` holds the text, and `#smErr` shows the reason. A valid paste (`CCO`) still inserts directly.

### CK-08: file open (FR-005)
- `test_FR_005_mol_and_sdf_file_open_dialog`: `set_input_files` with an over-valent `.mol` and `.sdf` opens the dialog with the reason. A valid `.mol` opens as before.

### CK-09: must-accept list end to end (FR-006)
- `test_FR_006_valid_inputs_insert_without_prompt` (parametrized): the 11 compounds from CK-01 each insert through `tryLoadText` with no dialog and no `#valWarn`.

### CK-10: document files (FR-009)
- `test_FR_009_cdxml_opens_with_count`: an inline CDXML with a five-bond carbon opens (atoms present), the toast contains "1 atom has too many bonds", and `#valWarn` is visible.

### CK-11: other paths (FR-010)
- `test_FR_010_pubchem_result_checked`: stub `pubchemNameToSmiles` to return `C(C)(C)(C)(C)C`, then type a name. The dialog shows the refusal and Insert anyway.
- `test_FR_010_templates_and_examples_still_insert`: every built-in template and NMR-guide example inserts with no refusal (guards against a false positive).

### CK-12: full regression (NFR-002), run 3 times
```
npm run build && npm test && npm run test:e2e && npm run validate
LONEPAIR_BROWSER=webkit npm run test:e2e
```
- Expected: 0 failures in every run. Unit ≥ 171 + new. E2e baseline 221 passed / 3 skipped, plus the new tests (the count includes the #29 suite now on main; record the new main baseline before TG-01). Validate MAE no worse.

### CK-13: hand drawing not blocked (CON-002)
- `test_CON_002_drawing_sixth_bond_only_warns`: with the bond tool, click 5 times on one carbon of `CC`. The bonds are added, `#valWarn` is visible, and no dialog opens.

### CK-14: offline, no new deps (CON-003)
- `git diff origin/main -- package.json package-lock.json` is empty. The e2e suite already blocks the network for fonts, and CK-03…CK-11 pass offline (PubChem is stubbed).

## 4. Manual verification script
On the PR's Cloudflare preview (`https://<branch>-lone-pair.saad455.workers.dev`), with gstack `/qa-only` or by hand:
- **M-1** Insert structure → `C(C)(C)(C)(C)C` → the message is readable, and Insert anyway is visible and keyboard-focusable.
- **M-2** Press Insert anyway → the structure is drawn with the red warning; click the warning → the carbon is selected.
- **M-3** Ctrl/⌘+V `O(C)(C)C` on the canvas → the dialog opens with the text and the reason.
- **M-4** Open a `.cdxml` with an SN2 transition state → it opens, and the toast mentions the count.
- **M-5** Draw a sixth bond on a carbon by hand → only the red warning appears.
- **M-6** Phone width (390 px): the dialog message and both buttons fit with no horizontal scroll.

## 5. Non-functional verification
| NFR | Tool | Measurement | Threshold | Result |
|---|---|---|---|---|
| NFR-001 | node --test | median over 20 runs, 200 atoms | < 20 ms | 0.44 ms ✅ |
| NFR-002 | CI + 3 local runs | failures | 0 | |
| NFR-003 | manual M-1…M-6 | reviewer reads the messages | no jargon, says what to do | |

## 6. Edge-case checks
| Case (requirements §9) | Check | Expected |
|---|---|---|
| hypervalent / charged / metals | CK-01, CK-09 | no prompt |
| 5-bond C, 4-bond N, 3-bond O, 2-bond F | CK-03 | refused |
| several bad atoms | CK-04 | "and N more" |
| bad product in a reaction | CK-06 | whole reaction refused |
| invented radical `c1cccc1` | existing #32 test | still refused, with no Insert anyway |
| undo | CK-05 | one step |
| CDXML file | CK-10 | opens with a count |

## 7. Regression protection
| Existing behaviour at risk | Why | Check |
|---|---|---|
| Paste of a copied drawing (internal clipboard) | the paste handler changes | existing e2e paste tests + CK-07 valid case |
| Invented-radical refusal message (#32) | shares `loadError` | existing `smiles_radicals` unit + e2e tests |
| Edge-case suite paths (#29) | `tryLoadText` changes | `test_landscape_suite.py` all pass; strict xfail B5 still xfails |
| Reaction SMILES agent text above the arrow | the reaction branch changes | CK-06 + existing reaction tests |
| Molfile "stereo read as drawn" toast | the molfile branch changes | existing #30 tests |
| Templates (chairs use `insertFragments` directly) | must not be checked twice or blocked | CK-11 |

## 8. Human review checklist
- [ ] `force` is reachable only from the user's Insert anyway click (and tests), not from file contents.
- [ ] The text shown in `#smErr` comes from `valenceError`'s `why` (element symbols and numbers only) and is set with `textContent`, so no HTML injection is possible.
- [ ] Insert anyway is a real `<button>`, reachable by Tab and labelled.
- [ ] No leftover debug output or TODOs; the comment style matches `src/app.js`.
- [ ] `dist/lonepair.html` is rebuilt and committed.

## 9. Out-of-scope confirmation
- [ ] No prompt or block while drawing by hand (CK-13).
- [ ] `VAL`, `GROUP`, `HYPER_LIG` and `valenceError` are unchanged (`git diff` shows only the added `overValent`).
- [ ] No OpenChemLib validity check and no RDKit added.
- [ ] Analysis panel unchanged (the B5 xfail still xfails).

## 10. Sign-off
| Role | Who | Evidence needed | Date |
|---|---|---|---|
| Implementer | Claude | §2 matrix all ✅, CK-12 output ×3 | |
| Owner | user | PR review, preview checked | |
