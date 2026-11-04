# Requirements — 001-valence-guard

> Status: approved · Approved by: user (2026-11-03) · Last updated: 2026-11-03
> The **what & why**. Behaviour and constraints only.

## 1. Summary
Structures typed or pasted as text (SMILES, reaction SMILES, molfile, InChI) are inserted even when an atom has more bonds than its element allows. The only sign is a red warning, and the formula and mass are then wrong (`C(C)(C)(C)(C)C` gives C6H15). After this change the app refuses such input, says which atom is wrong and why, and offers **Insert anyway** as a deliberate choice. Real exceptions (hypervalent S, P, I, Cl; charged atoms; metals) keep working with no prompt.

## 2. Mission & roadmap link
- Serves mission principle 1, "Never be silently wrong", and the rubric metric (+1.8).
- Roadmap: Phase 1, item 1.

## 3. User stories
### US-001: Catch an impossible structure before it lands
As a student pasting a SMILES, I want to be told that it has a five-bond carbon before it is drawn, so that I don't copy a wrong formula into my report.
- WHEN text input contains an atom over its allowed valence THE app SHALL refuse it and name the atom and its bond count.

### US-002: Draw it anyway on purpose
As a teacher drawing an SN2 transition state, I want to insert a five-bond carbon on purpose.
- WHEN the user chooses **Insert anyway** THE app SHALL insert the structure exactly as it would have before this change.

### US-003: Real hypervalent compounds are not nagged
As a chemist, I want SF6, PCl5, IF7, Ph-I(OAc)2, ClO4⁻, sulfoxides and metal complexes to insert without any prompt.

## 4. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-001 | WHEN a SMILES, reaction SMILES, molfile (V2000/V3000) or InChI is entered in the Insert structure dialog, THE app SHALL check every new atom with the same valence rule that drives the red on-canvas warning. | must |
| FR-002 | IF any new atom breaks that rule THEN THE app SHALL not insert anything, and SHALL show in the dialog a message naming the first offending atom (element, charge, bond count, allowed maximum) and how many atoms are affected. | must |
| FR-003 | WHEN FR-002 refuses input in the dialog, THE dialog SHALL offer an **Insert anyway** button. Pressing it inserts the structure unchanged and leaves the existing red warning on the canvas. | must |
| FR-004 | IF text pasted onto the canvas (Ctrl/⌘+V) would break the rule THEN THE app SHALL not insert it, and SHALL show a message with the same reason and an **Insert anyway** action. | must |
| FR-005 | IF a text file opened with File → Open or drag and drop (`.smi`, `.mol`, `.sdf` first record, `.txt`) would break the rule THEN THE app SHALL behave as in FR-004. | must |
| FR-006 | THE check SHALL accept every structure the existing rule accepts, including hypervalent P, As, S, Se, Te, Cl, Br, I, charged atoms (e.g. [N+](C)(C)(C)C) and atoms of elements with no fixed valence (metals). | must |
| FR-007 | WHEN a reaction SMILES is checked, THE app SHALL check every reactant and product and refuse or offer **Insert anyway** for the reaction as a whole. | must |
| FR-008 | WHEN a structure is inserted after **Insert anyway**, THE single undo step SHALL remove it, as for any insert. | must |
| FR-009 | WHEN another program's document file is opened (CDXML, CDX, CML, MRV) that contains over-valent atoms, THE app SHALL open it as today and SHALL add the count of over-valent atoms to the "Opened …" message. It SHALL NOT refuse the file. | should |
| FR-010 | The built-in templates, examples and PubChem name lookups SHALL go through the same check (a PubChem result that fails it is refused with the same message). | should |

## 5. Non-functional requirements

| ID | Requirement | Threshold | Measured by |
|---|---|---|---|
| NFR-001 | Check adds little time to insert | < 20 ms for a 200-atom molecule | unit timing test |
| NFR-002 | No regression | unit, browser, `validate` and the edge-case suite all pass; numbers no worse than `sdd/product/baseline.md` | CI + local runs |
| NFR-003 | Messages are plain words a student understands, with no internal codes | review | manual script in validation.md |

## 6. Constraints

| ID | Constraint | Source |
|---|---|---|
| CON-001 | Reuse the existing `valenceError` rule, so that the insert check and the red warning always agree. Don't add a second valence table. | tech-stack.md, reuse |
| CON-002 | Drawing by hand is not blocked. A sixth bond drawn with the mouse still only shows the red warning, because drawings pass through over-valent states while being edited. | UX |
| CON-003 | Keep working offline, inside the single HTML file, with no new dependencies. | mission principle 3 |

## 7. Interfaces & data
```
overValent(fragment) -> [{atomIndex, have, max, why}]   // empty = OK; same verdicts as valenceError
```
The error carries the list, so the dialog, paste and file paths can each show it and keep the parsed fragment for **Insert anyway**.
No saved-data or file-format changes.

## 8. Flows
**Happy path:** Insert structure → `CCO` → inserted, no prompt.
**Refused:** Insert structure → `C(C)(C)(C)(C)C` → dialog stays open: "C has 5 bonds; at most 4. Nothing was inserted." → [Insert anyway] → inserted, red warning shown.
**Paste:** Ctrl+V of `C(C)(C)(C)(C)C` → message with [Insert anyway] → nothing inserted unless clicked.

## 9. Edge cases & failure modes

| Case | Expected | Req |
|---|---|---|
| SF6, PCl5, IF7, PhI(OAc)2, ClO4⁻, DMSO, [N+](C)(C)(C)C | inserted, no prompt | FR-006 |
| Cisplatin, ferrocene, Wilkinson's catalyst, Grubbs II | inserted, no prompt (metals have no fixed valence) | FR-006 |
| Five-bond carbon, `N(C)(C)(C)C` (neutral four-bond N), `O(C)(C)C` (neutral three-bond O), `F(C)C` | refused with reason | FR-002 |
| Several bad atoms | message names the first and says "and N more" | FR-002 |
| Reaction with one bad product | whole reaction refused, Insert anyway inserts all of it | FR-007 |
| Invented-radical SMILES (`c1cccc1`) | still refused by the existing check (#32), with no Insert anyway | out of scope |
| Undo after Insert anyway | one undo removes it | FR-008 |
| Over-valent atom in a CDXML file | opens, message counts it | FR-009 |

## 10. Reuse

| What | Path | Used for |
|---|---|---|
| `valenceError(atom, ix)`: element valences, charge, hypervalent halogen rule, octet | `src/core.js:265` | the rule (CON-001) |
| `VAL`, `GROUP`, `HYPER_LIG` tables | `src/core.js:37`, `:262` | unchanged |
| `readSmiles` / `inventedRadicals` refuse-with-message pattern (`e.user`, `loadError`) | `src/app.js` `readSmiles`, `tryLoadText` | same error path and dialog message |
| `tryLoadText`, `insertFragments`, `insertForeign` | `src/app.js` | the single place every text insert goes through |
| `#valWarn` red warning | `src/app.js:363` | unchanged; shown after Insert anyway |
| Edge-case suite | `tests/e2e/test_landscape_suite.py` | already includes a five-bond carbon; its expectation changes |

## 11. Out of scope
- Blocking or prompting while drawing by hand (CON-002).
- Changing the valence rule itself (new elements, new hypervalent cases). If the rule is wrong for a case, that is a separate fix.
- Invented radicals and hydrogen counts (done in #31 and #32; MOL/CDXML radical checks are a separate roadmap follow-up).
- Running OpenChemLib's own validity check as a second rule. It would disagree with the red warning (CON-001).
- RDKit cross-checking (roadmap item 9).

## 12. Decisions made while shaping

| Decision | Rationale | Alternative rejected |
|---|---|---|
| Use Lone Pair's own `valenceError`, not the engine's check | The insert check and the red warning must give the same answer; the roadmap item suggested the engine's check | OCL's validity check, which would add a second rule that disagrees with the red warning |
| Refuse text input, but open document files with a count | A ChemDraw file may hold a deliberate transition state; refusing the whole file loses work | refusing files too |
| Insert anyway, not "fix it for me" | Fixing it would mean guessing what the user meant | auto-removing bonds |

## 13. Assumptions
- Verified 2026-11-03 on main 5a5109e: the existing rule accepts all 11 must-accept cases in §9 (incl. Grubbs II) and flags all 4 must-refuse cases; today all 15 are inserted.
- Resolved in plan.md: the toast has no pointer events, so paste and file refusals open the Insert structure dialog instead.

## 13a. Changed while building
- FR-009 narrowed: Lone Pair's own saved projects and JSON drawings open without a count (see `decisions.md`, 2026-11-03).

## 14. Open questions

| Question | Owner | Needed by |
|---|---|---|
| FR-009: select over-valent atoms when a file opens? **Resolved: no** (default accepted); the red warning selects them on click. | user | done |
