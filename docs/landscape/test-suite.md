# Edge-case test suite for structure editors

Every app and engine in this survey is run against the same cases, so the results can be compared side by side. Each case has an ID, used in the result tables in `apps/` and `opensource/`.

Results are recorded as **pass**, **fail** (wrong output, with a note), **partial**, **n/a** (feature missing) or **crash**.

## A. SMILES input and round trip

Paste the SMILES, then export SMILES (and a molfile where possible) and compare.

| ID | Input | What it checks | Expected |
| --- | --- | --- | --- |
| A1 | `CCO` | Baseline | Ethanol, C2H6O, 46.07 |
| A2 | `c1ccccc1` | Aromatic input | Benzene, drawn Kekulé or with a circle |
| A3 | `C1=CC=CC=C1` | Kekulé input | Same canonical SMILES as A2 |
| A4 | `c1ccc2ccccc2c1` | Fused aromatics | Naphthalene, C10H8 |
| A5 | `c1cc[nH]c1` | Aromatic N–H | Pyrrole; fails if `[nH]` is lost |
| A6 | `C[C@H](N)C(=O)O` | Tetrahedral stereo | L-alanine, (S); wedge drawn correctly |
| A7 | `F/C=C/F` and `F/C=C\F` | E/Z | trans and cis kept apart |
| A8 | `[NH4+].[Cl-]` | Charges, disconnected parts | Two fragments, charges kept |
| A9 | `C[N+](=O)[O-]` | Charge-separated nitro | Kept, or normalised, and reported |
| A10 | `CS(=O)(=O)C` | Hypervalent S | Accepted without a valence error |
| A11 | `[13CH4]` | Isotope | Mass 17.03, label ¹³C |
| A12 | `[CH3]` (radical) | Radical | One radical dot |
| A13 | `C1CC1` … `C1CCCCCCCCCCC1` | Small and large rings | Sensible 2D layout |
| A14 | `C12C3C4C1C5C2C3C45` | Cubane (cage) | Laid out without overlaps |
| A15 | `[Fe+2].c1cc[cH-]c1.c1cc[cH-]c1` | Ferrocene, organometallic | Accepted |
| A16 | `CC(=O)Oc1ccccc1C(=O)O>>CC(=O)O` | Reaction SMILES | Reactant, arrow, product |
| A17 | `CC1=CC=CC=C1` and `Cc1ccccc1` | Canonical output stable | Same SMILES for both |
| A18 | `OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O` (glucose) | Several stereocenters | All centers kept |
| A19 | `xyz` and `C1CC` | Invalid input | A clear error, no crash |
| A20 | A 300-atom peptide SMILES | Large molecule | Draws in under 5 s, still usable |

## B. Drawing and editing

| ID | Action | Expected |
| --- | --- | --- |
| B1 | Draw a chain of 6 by dragging | Zigzag, 120° angles |
| B2 | Click a bond with the benzene tool | Fused ring on that bond |
| B3 | Click an atom with a ring tool | Spiro ring |
| B4 | Draw a bond off an atom that has 4 | Valence warning, or a pentavalent C flagged |
| B5 | Type `OMe`, `CO2H`, `Boc` as labels | Abbreviation expands in the formula |
| B6 | Label on the left of a bond (`OMe` drawn leftwards) | Flips to `MeO` |
| B7 | Wedge, then hash, then click again | Cycles direction or type |
| B8 | Undo 20 steps, redo 20 steps | Returns to the same state |
| B9 | Clean up a hand-drawn messy ring | Regular polygon, stereo kept |
| B10 | Copy, paste into the app | Duplicate appears offset |
| B11 | Delete an atom shared by two rings | Both rings open correctly |
| B12 | Charge +, then + again | Goes to 2+ (or cycles), shown correctly |
| B13 | Curved arrow from lone pair to bond | Arrow attaches and stays attached when moved |
| B14 | Reaction arrow with text above and below | Text stays with the arrow |
| B15 | Zoom to 10% and 1000% | Still usable, no rendering faults |

## C. Interoperability

| ID | Action | Expected |
| --- | --- | --- |
| C1 | Export a molfile V2000, reimport | Same structure, same stereo |
| C2 | Export V3000 | Valid V3000 block |
| C3 | Open a ChemDraw CDXML file (`tests/fixtures` sample) | Opens with labels and arrows |
| C4 | Copy to clipboard, paste into Word/PowerPoint | Picture, or editable object |
| C5 | Export SVG | Valid SVG, text as text or paths (note which) |
| C6 | Export PNG | Resolution and transparency options noted |
| C7 | InChI / InChIKey for A6 | `InChIKey=QNAYBMKLOCPYGJ-REOHCLBHSA-N` |
| C8 | Name to structure: "caffeine", "aspirin" | Correct structure |
| C9 | Structure to name for A6 | (S)-2-aminopropanoic acid or alanine |

## D. Analysis

| ID | Action | Expected |
| --- | --- | --- |
| D1 | Formula and MW for caffeine | C8H10N4O2, 194.19 |
| D2 | Exact mass for caffeine | 194.0804 |
| D3 | CIP label on A6 | S |
| D4 | NMR prediction on ethyl acetate, if offered | 3 ¹H signals, 4 ¹³C |
| D5 | Any property (logP, TPSA, pKa) on aspirin | Value noted with its source |

## E. App-level behaviour

| ID | Check |
| --- | --- |
| E1 | Works without an account? Which features need one or a paid plan? |
| E2 | Works offline after load? |
| E3 | Autosave or cloud save; does a reload keep the drawing? |
| E4 | Mobile or touch support at phone width |
| E5 | Keyboard shortcuts: which exist, and are they listed in the app? |
| E6 | Time to first usable canvas (cold load), and page weight |
| E7 | Accessibility: keyboard-only use, screen-reader labels |
| E8 | AI features: what they are, and what they get wrong on two tries |
