# Lone Pair: edge-case audit and fix plan (3 November 2026)

[test-suite.md](test-suite.md) was run against the built page (`dist/lonepair.html`, commit `8f65df6`). Everything went through the app's own functions: `tryLoadText`, `analysisFor`, `exportData` and `FORMATS`. Every output was checked against **Indigo 1.46** (canonical SMILES, formula, masses, InChIKey), and molfiles written by **RDKit** were opened.

The scripts are in [opensource/scripts/lonepair/](opensource/scripts/lonepair/):
- `run.py`: section A, the C round trips and D, through the app
- `referee.py`: the Indigo check
- `ui.py`: the B, C and E checks
- `mk_rdkit_mol.mjs`: writes the RDKit molfiles

## 1. Scorecard

The test inputs were 41 SMILES (A1–A20, D1, D5, and 14 extra cases X1–X14), each sent through 11 paths: analysis, SMILES, molfile V2000 and V3000 export, molfile V2000 and V3000 re-import, and CDXML, CDX, CML and MRV round trips. On top of those come 3 RDKit molfiles and the UI checks.

| Area | Result |
| --- | --- |
| Canonical SMILES identity, against Indigo, over every path | **33 of 41 cases identical on every path.** All the misses are listed below |
| Stereo (A6, A7, A18, X1, X2, X3, X13), through SMILES, V2000, V3000, CDXML, CDX, CML and MRV | **Kept on every path.** L-alanine's InChIKey is right (`QNAYBMKLOCPYGJ-REOHCLBHSA-N`) |
| Radicals, charges, hypervalent S, N-oxide, allene, deuterium in SMILES and molfile, cumulenes | Kept |
| Reaction SMILES (A16) | Reactant, arrow, product. ✅ |
| 190-atom peptide (A20) | Drawn in **0.07 s** with no overlapping atoms or crossings, and all 21 stereocentres hashed ✅ (RDKit, ChemDraft and MolView all failed this) |
| Layout | Clean except for the cages (A14, X9) |
| Undo 20 steps, redo 20 steps | Back to exactly the same state ✅ |
| Phone width (390 px) | No sideways scrolling, all 49 tools present ✅ |
| Buttons without an accessible name | 0 of 147 ✅ |
| Console errors during the whole run | None ✅ |
| Lone Pair's own tests | See section 4 |

Overall, Lone Pair did better on this suite than any other web editor surveyed. The problems are at the edges: input that should be refused, atoms with an unusual H count, isotopes in two of the XML formats, and molfiles from other toolkits.

## 2. Bugs

| # | Severity | Bug | Evidence | Cause | Fix |
| --- | --- | --- | --- | --- | --- |
| **B1** | **High** | A molfile with chiral flag 0 (RDKit writes these, and so do many others) is read as **racemic**: the stereocentre gets an "&1" group (`stg: 'and1'`). **Lone Pair's own exports then disagree:** SMILES drops the stereo (`CC(C(O)=O)N`), but the InChIKey export still says L-alanine. The hash wedge stays on the canvas. RDKit meant one enantiomer | RDKit's L-alanine V2000 molfile. RDKit's V3000 version is fine | `OCL.Molecule.fromMolfile` reads flag 0 as an ESR AND group (`src/app.js:1047`). That follows the letter of the MDL spec, but RDKit, Indigo and most toolkits read the wedges as absolute | Read the wedges as absolute: set the flag to 1 before parsing a V2000 file with wedges and flag 0, or turn the AND groups back to ABS afterwards. Say so in a toast ("Stereo read as drawn"), and keep the user's right-click &1 option for racemates. Test: `test_molfile_from_rdkit_keeps_its_stereocentre[V2000]` |
| **B2** | **High** | An atom with an explicit H count that the bonds don't imply loses its H. Cisplatin `Cl[Pt](Cl)([NH3])[NH3]` becomes `N[Pt](N)(Cl)Cl`: **wrong formula (H4 against H6), wrong mass (296.94 against 298.96) and a wrong InChIKey** | Indigo check on X7. Direct OpenChemLib output is right (`[NH3][Pt]…`) | `fromOCL` (`src/core.js:796`) doesn't carry OpenChemLib's explicit H or abnormal valence into the drawing, so `toOCL` works H out again from the default valence | In `fromOCL`, when the H count differs from the default, label the atom (`NH3`), as Lone Pair already does for CH₃ labels. In `toOCL`, set the abnormal valence or explicit H from the label. This affects every coordination complex (ammine, aqua and phosphine ligands) |
| **B3** | Medium | SMILES whose aromatic rings can't be turned into single and double bonds (`c1cccc1`, `c1ccc[nH]c1`) are drawn as **radicals, without a word**. The same happens on paste, in the insert dialog and in file import | A19c and A19d: 1 radical invented each time, empty toast | OpenChemLib invents a radical rather than rejecting the input | After `smilesMol`, compare the radical count with the radicals actually written in the SMILES. If OpenChemLib made some up, refuse with "Aromatic ring can't be drawn with alternating bonds (did you mean `c1cc[nH]c1`?)", or draw it with a visible warning |
| **B4** | Medium | Isotopes are lost in **CML and MRV** export: ¹³CH₄ → CH₄, CD₃OH → CH₃OH | A11 and X6 round trips | The writers at `src/formats.js:479–484` (CML) and the MRV equivalent have no isotope attribute (CML `isotopeNumber`, MRV `isotope`). The readers ignore it too | Add the attribute on write and read; add an A11 and X6 round-trip test |
| **B5** | Medium | A carbon with five bonds is accepted without any warning. `C(C)(C)(C)(C)C` loads; drawing a fifth bond on neopentane's centre gives "C6H15" with no red flag | `ui.py` B4 | Valence is only checked for typed labels (CH₃ on a carbon with two bonds), not for plain carbon vertices | Draw an over-valent atom in red (as for labels), and add "Valence: C has 5 bonds" to the Analysis panel. Keep exporting what was drawn |
| **B6** | Low | Formulas aren't in **Hill order** when there is no carbon, or when the element after H isn't alphabetical: `H4NCl` (Hill: `ClH4N`), `C2H3O2Na` (`C2H3NaO2`), `CHOD3` (`CHD3O`, or `CH4O` with D shown as an isotope of H) | Indigo check on A8, X14, X6 | It uses OpenChemLib's `getMolecularFormula().formula` string, which isn't strictly Hill | Write Lone Pair's own Hill formatter from the atom counts, with isotopes as ¹³C and D. It also fixes the dropped-isotope problem noted in [opensource/openchemlib-rdkit.md](opensource/openchemlib-rdkit.md) |
| **B7** | Low | Typing or pasting invalid SMILES in the insert box gives no reason. `C1CC` (unclosed ring) goes on to a PubChem name lookup and then says "Not a valid SMILES, and PubChem has no compound named…" (offline, only the lookup failure). The `tryLoadText(…, quiet)` paths say nothing | `ui.py` A19 | The parser's message is thrown away | Keep OpenChemLib's error text and check common faults locally (an unclosed ring number, unbalanced brackets or parentheses, an unknown element) *before* going to PubChem. Show "Ring bond 1 is never closed" |
| **B8** | Low | Cage layout: adamantane (X9) has two atoms 0.5 bond lengths apart and one bond crossing; cubane (A14) has 2 crossings | Layout check | OpenChemLib's `inventCoordinates` has no cage templates | A small set of templates (cubane, adamantane, norbornane, bicyclo[2.2.2]octane, twistane), matched by substructure before layout |
| **B11** | **High** | **A molfile whose name line is blank can't be pasted or opened** ("Clipboard text is not a SMILES string or molfile" or "Could not read this file"). RDKit always leaves that line blank. Found while checking the B1 fix in the browser | Pasting RDKit's alanine molfile; opening it as a `.mol` file | The paste handler and `openFile` call `tryLoadText(txt.trim())`, which removes the blank first line and the counts line's leading spaces, so the header is a line short | **Fixed with B1:** `molfileMol` finds the counts line and restores the missing header lines and padding, whoever trimmed the text |
| **B10** | Low | **V3000 export of a structure with no bonds** (a salt drawn as ions, a single atom, a radical) has an empty `BEGIN BOND`/`END BOND` block. The IUPAC InChI library rejects it ("No V3000 CTAB end marker"); Indigo reads it. Found when the suite was made a permanent test | `[13CH4]`, `[CH3]`, `[NH4+].[Cl-]` | OpenChemLib's `toMolfileV3()`, called from `molWrite` (`src/formats.js:561`) | Leave out the empty bond block when there are no bonds |
| **B9** | Low | A **reaction exported as SMILES** gives the parts joined with dots (`CC(O)=O.CC(Oc1…)=O`), not reaction SMILES. The Analysis panel does show reaction SMILES | `ex_smiles` for A16 | `exportData('smiles')` uses the molecule path | When the page has a reaction arrow, export `reactionSmiles()` (and say so in the Save-as row) |

## 3. Improvements from the survey

These come from what the other editors do. Each is sized: **S** = under a day, **M** = a few days, **L** = a week or more.

| # | Improvement | Where it comes from | Size |
| --- | --- | --- | --- |
| I1 | **R/S and E/Z labels.** Show CIP labels next to stereocentres and double bonds (a toggle), and list them in Analysis. No CIP is shown anywhere today (D3) | ChemDraw, ChemDraft, Octet, Zoho | S–M |
| I2 | **Read every structure export back** (SMILES, molfile, CDXML, CML, MRV) and compare canonical SMILES before saving; warn when they differ. B4 would have been caught this way | ChemDraft | S |
| I3 | **A result record for every number:** `{value, method, version, interval, status}` for NMR, pKa, BDE and MS, carried into copied text | ChemDraft | M |
| I4 | **Offline names:** a slice of a refereed dictionary (the top 5,000–20,000 compounds, names, CAS numbers and SMILES, 0.5–1.5 MB gzipped) bundled in the file, with typo suggestions and a CAS check-digit test. OPSIN as an optional download | Octet, Zoho | M |
| I5 | **Only show a name that reads back to the same structure** (InChI check) | Octet | S, once I4 is done |
| I6 | **CDXML inside the clipboard:** write `text/html` and `image/svg+xml` with CDXML in the SVG's metadata, and read it back on paste | Octet | M (start with a spike) |
| I7 | **Lone Pair's JSON inside its CDXML export**, hashed, so a ChemDraw round trip keeps Lone Pair-only objects (TLC plates, captions) | ChemDraft, Octet | S–M |
| I8 | **Command palette** (⌘K) over every action | Octet | M |
| I9 | **An Actions panel that follows the selection:** formula, problems with a fix for each (B5's valence warning goes here), and likely next steps | Octet, MolDraw | M |
| I10 | **More hover hotkeys and a ChemDraw keymap:** 1/2/3 bond order on a bond, a number for rings, Enter for an abbreviation, `2` for =O on S and P | ChemDraft, Octet, Zoho | S–M |
| I11 | **Stoichiometry table** for a reaction (masses, moles, equivalents, yield) | Zoho, MolDraw, ChemDraw | M |
| I12 | **Catalytic cycle layout:** order the structures by angle, place them on a circle, store the cycle as data and recompute its arrows | Octet | M |
| I13 | **Wiley style preset.** Once Zoho is installed, its Document Settings would show the values | Zoho | S |
| I14 | **A "group with integral" lock** for finished schemes | Zoho | S |
| I15 | **Polymer brackets with n and Markush R-group lists** | Zoho, MolDraw | M–L |
| I16 | **An embeddable API**: load a structure, get SMILES or a molfile, an on-change event, `postMessage` from an iframe | Marvin JS on RCSB, Ketcher | M |
| I17 | **A CLI or MCP entry point** over the same core, for AI assistants | ChemDraft | L |
| I18 | **This suite as a permanent test.** Move `run.py` and `ui.py` into `tests/e2e/test_landscape_suite.py`, with Indigo (or the RDKit npm package) as the referee in CI | All the studies | S |

## 4. Lone Pair's own tests (baseline)

| Suite | Result |
| --- | --- |
| Unit (`npm test`) | **171 passed**, 0 failed (2.1 s) |
| Browser (`npm run test:e2e`, Chromium) | **219 passed**, 3 skipped, 0 failed (2 min 32 s) |

All green, so none of the bugs above is covered by an existing test. Each fix adds one.

## 5. Fix plan: one at a time

Each step is one branch and one PR. Each starts with a test that fails on the current code, and ends with `npm run test:all` green and this suite re-run.

| Order | Item | Why this order |
| --- | --- | --- |
| 1 | **I18** (a small part of it): add the suite as `tests/e2e/test_landscape_suite.py`, with the known failures marked `xfail` | **Done** (branch `test/landscape-suite`): 480 checks pass and 28 are strict `xfail`s, each naming its bug. It runs in about 3 s. Every later fix flips its `xfail`s, so progress shows and nothing regresses |
| 2 | **B1** molfile chiral flag, and **B11** trimmed molfiles | **Done** (branch `fix/molfile-chiral-flag`). `molfileMol` in `src/core.js` reads a chiral-flag-0 V2000 file's wedges as drawn and says so in a toast, and restores a header that trimming broke. 5 unit tests and 3 browser tests cover it |
| 3 | **B2** explicit H and abnormal valence | High; wrong formulas, masses and InChIKeys for coordination compounds |
| 4 | **B3** invented radicals | Silent wrong structures from a common typo |
| 5 | **B6** Hill formula with isotopes | Small; fixes how formulas display everywhere |
| 6 | **B4** isotopes in CML and MRV | Small; the read-back in I2 then checks it |
| 7 | **I2** read every export back | Catches future B4-style bugs |
| 8 | **B7** say why SMILES is invalid | Small; clearer errors |
| 9 | **B5** valence warning | Small; it also starts I9 |
| 10 | **B9** reaction SMILES export, and **B10** the empty V3000 bond block | Small |
| 11 | **I1** R/S and E/Z labels | The biggest user-visible gap in drawing |
| 12 | **B8** cage templates | Small and contained |
| 13 onwards | I10, I8, I9, I3, I4/I5, I7, I6, I11, I12, then the rest | Feature work, in the order of how often users would meet it |

When I fix the bugs, I'll take them in this order and stop after each one so you can review it.
