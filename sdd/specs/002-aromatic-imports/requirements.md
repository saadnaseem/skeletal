# Requirements — 002-aromatic-imports

> Status: approved (user, 2026-11-04) · Last updated: 2026-11-04
> The **what & why**. Behaviour and constraints only.

## 1. Summary
Roadmap item 2's follow-up asked whether molfile and CDXML imports invent radicals, as SMILES did before #32. Probed on main 1bf2980: **they don't**. Neither path sets a radical. The probe found two other ways these imports are silently wrong:

1. **Molfile aromatic bonds are dropped.** A V2000 or V3000 molfile that writes aromatic bonds as bond type 4 (as CDK, Open Babel's aromatic output and some ELN exports do) opens with every aromatic bond as a single bond. Benzene opens as cyclohexane (C6H12), pyridine as piperidine (C5H11N). There is no warning, and the formula, mass and NMR are all wrong. OpenChemLib keeps these bonds as "delocalized" and never converts them to alternating single and double bonds; its JavaScript build has no call to do that.
2. **Rings that can't alternate get a guessed hydrogen.** When aromatic bonds can't be given alternating single and double bonds (a five-membered ring written without its N–H, or `c1cccc1`), the CDXML/CML/MRV converter leaves them single. One atom then silently gets an extra H. Pyrrole written without its H opens as 2H-pyrrole (a different tautomer); a C5 aromatic ring opens as cyclopentadiene. SMILES refuses these cases since #32.

After this change, molfile aromatic bonds are read as alternating single and double bonds, as CDXML aromatic bonds already are. A ring that can't alternate is refused for molfile text (with the same advice as SMILES), and opened with a message for document files.

## 2. Mission & roadmap link
- Mission principle 1, "Never be silently wrong".
- Roadmap: Phase 1, item 2 (the MOL/CDXML follow-up), reworded to what was found. This changes the roadmap row, so it needs your approval at this gate.

## 3. User stories
### US-001: an aromatic molfile opens as the right molecule
As a chemist opening a `.mol` or `.sdf` exported from a tool that writes aromatic bonds as type 4, I want benzene to open as benzene, so the formula, mass and NMR are right.

### US-002: I'm told when a ring's hydrogens are missing
As a student pasting a molfile, or opening a ChemDraw file, whose five-membered aromatic ring has no N–H, I want to be told, not given a different tautomer.

## 4. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-001 | WHEN a V2000 or V3000 molfile with aromatic bonds (bond type 4) is inserted by any route (Insert structure dialog, paste, `.mol`/`.sdf` file), THE app SHALL draw those bonds as alternating single and double bonds, with the same result as the SMILES of the same molecule (benzene C6H6, pyridine C5H5N, naphthalene C10H8). | must |
| FR-002 | THE conversion SHALL keep the molfile's own atom coordinates, charges, isotopes, explicit hydrogen counts and wedge bonds. | must |
| FR-003 | IF a molfile's aromatic bonds can't all be given alternating single and double bonds THEN THE app SHALL insert nothing, and SHALL say why in the same words as the SMILES refusal from #32, adapted to molfiles: give the ring N–H its H. There is no Insert anyway, as for SMILES. | must |
| FR-004 | WHEN a CDXML, CDX, CML or MRV file has aromatic bonds that can't alternate, THE app SHALL open it as today and SHALL add to the "Opened …" message how many rings could not be given alternating double bonds, and that a ring N–H may be missing its H. It SHALL NOT refuse the file. | should |
| FR-005 | Molfiles with only single, double and triple bonds, and CDXML/CML/MRV files whose aromatic rings can alternate, SHALL open exactly as today. | must |

## 5. Non-functional requirements

| ID | Requirement | Threshold | Measured by |
|---|---|---|---|
| NFR-001 | No regression | unit, browser, `validate` and edge-case suite pass; numbers no worse than `sdd/product/baseline.md` | CI + 3 local runs |
| NFR-002 | Messages in plain words that say what to fix | review | manual check on preview |

## 6. Constraints

| ID | Constraint | Source |
|---|---|---|
| CON-001 | Reuse the existing converter (`kekulize` in `src/formats.js`), so molfiles and ChemDraw files give the same answer. Don't add a second one. | reuse |
| CON-002 | Offline, single file, no new dependencies. | mission principle 3 |
| CON-003 | Don't change SMILES import (#32) or the spec 001 valence guard; molfile results still go through the valence check. | scope |

## 7. Interfaces & data
No saved-data or file-format changes. Export is unchanged: molfiles are already written with single and double bonds.

## 8. Edge cases

| Case | Expected | Req |
|---|---|---|
| Benzene, pyridine, naphthalene, indole with an N–H count, as type-4 molfiles | open with alternating bonds; formula matches SMILES | FR-001 |
| Pyrrole type-4 molfile with H count 1 on N (or the N–H drawn as an atom) | opens as pyrrole, C4H5N | FR-001, FR-002 |
| Pyrrole type-4 molfile with no H on N, or a C5 type-4 ring | refused with the reason; nothing inserted | FR-003 |
| Furan, thiophene (O, S give two electrons) | open correctly | FR-001 |
| Type-4 molfile with a wedge bond on a substituent | wedge kept | FR-002 |
| `.sdf` whose first record is a type-4 molfile | as FR-001 | FR-001 |
| CDXML with an aromatic five-membered ring with no N–H | opens; message counts 1 ring | FR-004 |
| Existing Kekulé molfiles (RDKit, ChemDraw output) | unchanged | FR-005 |

## 9. Reuse

| What | Path | Used for |
|---|---|---|
| `kekulize(atoms, bonds)` | `src/formats.js:298` | converting aromatic bonds (CON-001) |
| `molfileMol`, `fromOCL`, `molToFragment` | `src/core.js:897`, `:796`, `src/app.js` | where molfile bonds are read |
| SMILES invented-ring refusal (#32) | `readSmiles` in `src/app.js` | same message and refusal pattern |
| `insertForeign` toast (spec 001 count) | `src/app.js` | FR-004 message |

## 10. Out of scope
- Radicals the file asks for (`M  RAD`, CDXML `Radical="Doublet"`): kept as today.
- Query bond types 5–8 (single-or-double and so on), and aromatic atom flags in V3000 query files.
- Changing which tautomer the converter picks for rings that do alternate.

## 11. Open questions
Resolved at the gate (user, 2026-11-04):
- Roadmap item 2 is reworded to this aromatic-bond fix.
- FR-003: refuse a molfile ring that can't alternate, with no Insert anyway (as for SMILES).
