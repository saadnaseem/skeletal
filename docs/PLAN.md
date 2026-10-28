# Competitor survey and build plan (October 2026)

## 1. What the others do

I used each tool hands-on in a browser and read its feature pages. I also checked ChemDraw's own "Save as" format list, which the user supplied as a screenshot.

### MolView (molview.com)
- **Sketcher:** bonds, charges, lone pairs and radicals, templates, clean up, reaction and pushing arrows, skeletal and full (non-skeletal) display, choice of whether C and H are shown, marking atoms and bonds, editing many atoms at once, R-groups.
- **3D viewer:** synced with the sketch; ball and stick, licorice and spacefill; spin animation; split view; lighting and material settings.
- **Data:** search by name, IUPAC name, SMILES, InChI or InChIKey, and formula; an info card with identifiers and a PubChem link; SDF export.
- **Cloud and sharing:** cloud save and shareable links.
- **Images:** PNG with transparency and a resolution choice, and SVG.

### MolDraw (moldraw.com), tested hands-on
- **Layout:** toolbar along the top, tools down the left, element palette on the right, ring templates along the bottom. There are document tabs, and a floating bar over the selection (flip, duplicate, delete, Actions).
- **Export:** SVG, PNG, PNG on white, JPEG, PDF, MOL, CDXML, CDX, SMILES, SMARTS, CML, RXN, chemfig (LaTeX) and InChI. There are also Copy SMILES and Copy SVG.
- **Selection actions:** Copy as…, add analysis to the canvas, stoichiometric coefficients, stoichiometry table, highlight, paste structure or image, group and ungroup, swap atom positions, Fischer projection, NMR prediction, compare molecules, ChEMBL lookup, point group, pKa and microspecies, show explicit C, add or remove explicit H, add all lone pairs, fold hydrogens.
- **Arrange:** circular, linear array, dendrimer and grid layouts.
- **Bonds:** single, double, triple, aromatic, wedge, hash, wedge/hash, wavy, cis/trans, dative, inductive, centroid (haptic), any, query bonds, H-bond and thick.
- **Other tools:** atomic orbitals, polymer brackets, cyclohexane chair template, lab glassware library, 3D view and 3D clean up, aromatize and dearomatize, a "look" theme (ball and stick on 2D), and a grid.
- **Extras:** an AI chat, structure scanning (image to structure, Pro only), cloud save (Pro only), and more than 40 separate calculators. These include TLC plates, equation balancing, R/S finding, functional groups, resonance structures, name reactions and isomers.
- **Weak spots:** labels use a serif font by default, which is not ACS style. The best features need an account or Pro, and it needs to be online.

### RCSB PDB chemical search (rcsb.org/search/chemical)
- You draw the query in a sketcher (MarvinJS) or paste SMILES or InChI.
- Match types: similar ligands (with or without stereo), quick screen, substructure (with or without stereo), and exact match. You can also search by formula or by chemical component ID.
- **Lesson for Skeletal:** a "Find in databases" action. Send the drawn structure to PubChem (exact, similar or substructure), RCSB PDB (ligands), ChEMBL or Google with one click.

### ChemDraw "Save as" list
SMILES, SMARTS, InChI, MDL Molfile, ISIS Sketch, ISIS TGF, ChemDraw CDX, ChemDraw XML, CML, MRV, Sybyl SLN, JME, SMD, PNG, PICT, GIF, WMF, SVG, EPS, MIF, SWF and PDF.

## 2. Where Skeletal stands

**Skeletal already has, and the others mostly don't:**
- ACS 1996 style by default.
- Offline single-file app.
- NMR, pKa and BDE estimates.
- Solvent impurity tables.
- Alignment and smart guides.
- Versions inside the project.
- Vector PDF on real page sizes.

**Gaps that matter, in priority order:**

1. **File formats.** No ChemDraw formats (CDXML and CDX, for writing and reading), CML, MRV, JME, chemfig, SMARTS, InChI or InChIKey, RXN, JPEG, GIF or EPS.
2. **Mass spectrometry.** It has MW and exact mass, but no m/z for common adduct ions, no isotope pattern and no MS/MS fragments.
3. **Selection.** No lasso (freehand) selection.
4. **Database search.** Only the name/CAS lookup exists. There is no similarity or substructure search, and no PDB or ChEMBL links.
5. **3D.** No 3D viewer or 3D export. OpenChemLib's ConformerGenerator could do this offline.
6. **Display.** No option to show all carbons and hydrogens, and no atom or bond highlighting.
7. **Drawing tools.** No arrange presets (grid, circle), no stoichiometry table, no polymer brackets and no orbitals.

## 3. Formats: what we will support and why

| Format | Plan | How |
| --- | --- | --- |
| SMILES, SMARTS | Write | OpenChemLib `toIsomericSmiles`, `toSmarts` |
| InChI, InChIKey | Write, and read InChI | `inchi-js` 0.2.0: the official IUPAC InChI C library compiled to WebAssembly (MIT, by the OpenChemLib author). Adds about 0.6 MB and works offline |
| MDL Molfile V2000 and V3000, SDF | Write and read | OpenChemLib. SDF holds one record per structure |
| RXN (V2000 and V3000) | Write | Reactants and products are taken from the drawn arrow, and OpenChemLib writes `Reaction.toRxn` |
| ChemDraw XML (.cdxml) | Write and read | Our own writer. Attribute names and codes come from Indigo's CDX tables (`CDXConstants.h`, `CDXCommons.h`) and ChemDraw 20 sample files. It keeps the document style (bond length, line and bold widths, spacing, fonts), nicknames (as a Nickname node with an inner fragment), generic labels, charges, radicals, stereo bonds, double-bond position, arrows (reaction, equilibrium, retrosynthetic, resonance, dashed, no-go, curved), pluses, text and colors |
| ChemDraw binary (.cdx) | Write and read | The same object tree as CDXML, written with the binary tag and type table: 22-byte header, little-endian, coordinates in units of 1/65536 pt |
| CML, MRV (Marvin) | Write and read | Small XML writers and readers |
| JME | Write | A simple text format |
| chemfig (LaTeX) | Write | A spanning-tree walk that writes `\chemfig{}` with bond angles |
| PNG, JPEG, WebP | Write | Canvas. JPEG and WebP use a white background |
| GIF | Write | A small built-in LZW encoder with a 256-color palette |
| SVG, PDF | Write | These exist already |
| EPS | Write | A PostScript writer that reads the same SVG the PDF writer does |
| ISIS Sketch, ISIS TGF, PICT, MIF, SWF, SMD, Sybyl SLN, WMF | **Not planned** | These are obsolete or closed. ISIS and SMD are retired MDL formats, PICT is a classic-Mac format, MIF is FrameMaker, and SWF is Flash, which no current software runs. SLN has no free reader to test against. For WMF, Office now prefers EMF or SVG, and current Office converts SVG to shapes, so we point users to SVG and PDF |

**Verification.** Every chemical format is read back by RDKit 2026.09 and Open Babel 3. Each test structure must survive the round trip with the same canonical SMILES.

## 4. Mass spectrometry and NMR

- **m/z table:** the monoisotopic mass plus [M+H]⁺, [M+Na]⁺, [M+K]⁺, [M+NH₄]⁺, [M+2H]²⁺, [M−H]⁻, [M+Cl]⁻, [M+HCOO]⁻ and M⁺• (EI). Masses use exact isotope masses and subtract the electron mass. Each row has a Copy button.
- **Isotope pattern:** built from natural abundances (C, H, N, O, S, Cl, Br, Si, B, Se and others) with peaks merged to 0.01 Da. It is shown as a stick spectrum, with relative intensities for M, M+1, M+2 and onwards.
- **MS/MS (in-silico, rule-based):**
  - Fragments come from breaking each non-ring single bond, and pairs of ring bonds. Each fragment can take a ±H transfer.
  - The list adds common neutral losses: H₂O, NH₃, CO, CO₂, CH₃OH, HCl, HBr and C₂H₄.
  - Fragments are scored by charge site and bond lability: α to a heteroatom, benzylic and allylic positions score highest.
  - The result is a simulated spectrum with a table of fragment structures, formulas and m/z, in positive or negative mode. Clicking a peak highlights the bonds that break.
  - It is labeled as an estimate, in the same way as the NMR and pKa tools.
- **NMR:** this exists already (¹H and ¹³C). It will also be reachable from the right-click menu and the new MS panel.

## 5. Interaction

- **Lasso selection:** a Select-tool mode. Press L or use the toggle in the tools rail. Points are tested against the polygon by ray casting. Shift adds to the selection.
- **Find in databases:**
  - PubChem: identity, similarity (Tanimoto 90%) and substructure searches.
  - RCSB PDB: similar ligands.
  - ChEMBL.
  - Google.
  - Each one opens a new tab and sends only the SMILES.
- **Later, if time allows:** 3D viewer (OpenChemLib conformer, rotatable ball and stick on a canvas) with XYZ and PDB export, an option to show all C and H, and arrange presets.

## 6. Order of work (one commit per step, pushed)

1. This plan.
2. Format module (`src/formats.js`), with unit tests and the RDKit/Open Babel round-trip check.
3. InChI bundling and an Export ("Save as…") dialog listing every format. Import for CDXML, CDX, CML, MRV, InChI and SDF.
4. Image formats: JPEG, WebP, GIF and EPS.
5. Mass spec: m/z table and isotope pattern.
6. MS/MS fragment prediction.
7. Lasso selection.
8. Find in databases. Make NMR easier to reach.
9. Browser tests, README, a comparison table in REVIEW.md, and a rebuild.
