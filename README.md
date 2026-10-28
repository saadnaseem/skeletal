# Skeletal

A chemical structure editor that runs entirely in the browser. Draw molecules, reactions and arrow-pushing mechanisms in ACS journal style, then copy them into PowerPoint or Word or export them as PNG, SVG or PDF. Built-in tools estimate ¹H/¹³C NMR spectra, pKa values and bond dissociation energies, and look up NMR solvent and impurity peaks.

The whole app is one HTML file (about 1.3 MB). It needs no server, no install and no account, and works offline.

![Editor with a reaction scheme](docs/editor.png)

## Quick start

1. Download [`dist/skeletal.html`](dist/skeletal.html).
2. Open it in Chrome, Edge, Firefox or Safari.

That's it. Your work autosaves in the browser. Use **Save project (.html)** to keep a copy you can reopen anywhere.

To host it, publish `dist/skeletal.html` with GitHub Pages or any static file server.

## Features

### Drawing
- Single, double, triple, wedge, hashed, wavy and bold bonds, plus a chain tool with a live atom count.
- Benzene and 3- to 7-membered rings. Click a bond to fuse a ring, or click an atom to make a spiro ring.
- Any element, nicknames (OMe, Boc, Ph, CO₂H, Ts and about 50 more) and generic labels (R, R¹, X).
- Nicknames count toward formula and mass, and flip automatically (MeO, HO₂C) when the bond comes from the right.
- Charges, lone pairs and radicals.
- Reaction, equilibrium, retrosynthetic, resonance, dashed and failed-reaction arrows.
- Curved electron-pushing arrows (full and fishhook) with a draggable bend handle.
- Text with automatic chemical subscripts (H2SO4 → H₂SO₄) and `^` superscripts (Fe^3+). Each text box can have its own font, size, bold, italic, alignment and color.
- **Clean up** redraws the geometry while keeping stereochemistry. Flip, rotate, undo and redo are available throughout.
- Insert structures from SMILES, reaction SMILES (`A.B>>C`) or molfiles, or start from 16 built-in templates.

### Publication output
- **ACS Document 1996** style: 14.4 pt bonds, 0.6 pt lines, 2.0 pt bold bonds, 18% bond spacing and Arial 10 pt labels. A **Slides** style is also available.
- **Copy image** puts a high-resolution transparent PNG on the clipboard for Office.
- **Download PNG** saves a 600 dpi file with the dpi recorded, so it inserts at true size.
- **Download SVG** gives vector graphics; PowerPoint can convert them to shapes.
- **Vector PDF** export with standard fonts: cropped to the drawing, the whole document, or tiled printable sheets.
- **Document size:**
  - Letter, A4, Legal, Tabloid, A3, ACS single column (3.33 in), ACS double column (7 in), 16:9 and 4:3 slides, or a custom size.
  - Portrait or landscape.
  - Up to 8 × 8 sheets for posters.

### Projects
- Multiple pages per project, shown as tabs.
- Named versions stored inside the project, with one-click restore. Restoring first saves your current state as another version.
- **Save project (.html)** writes a complete copy of the editor with your pages and versions inside it. Double-click the file to keep working.
- Exported PNGs and SVGs carry the drawing data, so you can open them in Skeletal and edit them again.

### Chemistry tools
- **Analysis panel:** SMILES, formula, MW, exact mass, cLogP, tPSA, H-bond donors and acceptors, rotatable bonds, stereocenters and molfile, plus reaction SMILES built from the drawn arrow.
- **NMR prediction:**
  - ¹H and ¹³C shifts written on the structure, a simulated spectrum and a peak table with multiplicity, J and integration.
  - An optional overlay of solvent residual and water peaks.
  - A journal-format peak list you can copy or add to the drawing.
- **pKa tool:** click an atom to get the pKa of its hydrogen in water and DMSO, or the pKaH if the atom is a base.
- **BDE tool:** click a bond for its homolytic bond dissociation energy, or click an atom for its X–H bond.
- **Solvent peaks reference:**
  - Residual ¹H and ¹³C peaks and water/HDO peaks for 10 deuterated solvents.
  - About 40 common impurities in each solvent.
  - Search by name or by shift, for example typing 2.17 finds acetone in CDCl₃.

![Predicted NMR](docs/nmr.png)

## Keyboard and mouse

| Action | How |
| --- | --- |
| Change the atom under the cursor | Hover and press C, N, O, S, P, F, L (Cl), B (Br), I or H |
| Charge the atom under the cursor | Hover and press + or − |
| Set the order of the bond under the cursor | Hover and press 1, 2 or 3 |
| Edit an atom label | Double-click it (press and hold on touch screens) |
| Select | Drag a box with the Select tool; Shift adds to the selection |
| Draw without angle snapping | Hold Alt while dragging |
| Pan and zoom | Space + drag, two fingers, or Ctrl + wheel |
| Copy image, paste, duplicate | Ctrl/⌘ + C, V, D |
| Rotate the selection 15° | [ and ] |
| New line in text | Shift + Enter |

## How the estimates work, and how accurate they are

All predictions are rule-based. They run instantly and offline, but they are estimates, not measurements. Each result card in the app shows the reference value and correction it used.

| Tool | Method | Held-out error* |
| --- | --- | --- |
| ¹H NMR | Shoolery/Pretsch increments for sp³ C–H, Pretsch Z values for aromatic H, Pascual–Meier–Simon increments for alkene H, first-order multiplets | MAE 0.08 ppm, max 0.39 |
| ¹³C NMR | Grant–Paul and substituent increments, benzene ipso/ortho/meta/para increments, alkene and carbonyl class tables | MAE 0.7 ppm, max 6.3 |
| pKa | Class values from the Evans–Ripin, Bordwell/Reich (DMSO) and Williams (water) tables, Hammett σ for aromatic sites, inductive attenuation for aliphatic sites | MAE 0.4, 19 of 22 within 1 unit, max 2.7 |
| BDE | Blanksby & Ellison (2003) values plus additive radical-stabilization terms; Sanderson/Reusch R–X values for other bonds | Reference set within 1 kcal/mol; expect ±2–3 for other molecules |

\* "Held-out" means 10 NMR compounds and 22 pKa sites that were not used while tuning the rules. Run `npm run validate` to reproduce these numbers.

Known weak spots:
- Saturated rings: the γ-carbon of cyclohexanone is about 6 ppm off.
- C–H acidity with two different activating groups: deoxybenzoin is 2.7 units too acidic and ethyl acetoacetate 1.6 units too acidic.
- Ortho effects and zwitterions.
- OH and NH shifts, which depend on solvent.

For research decisions, confirm against measured data or a database-backed or machine-learning predictor.

## Development

Requirements: Node.js 20 or later. Python 3.10 or later is needed for the browser tests.

```bash
npm install          # OpenChemLib + esbuild
npm run build        # writes dist/skeletal.html
npm test             # 82 unit tests (Node test runner)
npm run validate     # held-out accuracy report for NMR and pKa
pip install -r requirements-dev.txt && python -m playwright install chromium
npm run test:e2e     # 19 browser tests (Playwright)
```

### Project layout

```
src/
  shell.html     page markup and CSS; the build fills in the /*OCL*/ and /*APP*/ markers
  core.js        data model, geometry, label layout, SVG rendering, OpenChemLib bridge, file sanitizer
  nmr.js         NMR, pKa and BDE estimators
  pdf.js         vector PDF writer for the app's own SVG
  solvents.js    NMR solvent and impurity data (Fulmer et al. 2010)
  app.js         interaction, tools, pages and versions, export, dialogs
scripts/
  build.mjs      bundles OpenChemLib and inlines everything into one file
  validate.mjs   held-out accuracy check
tests/unit/      chemistry, data and sanitizer tests (Node VM with DOM stubs)
tests/e2e/       Playwright tests against dist/skeletal.html
dist/            the built app (committed, so it can be downloaded directly)
```

The files are plain browser scripts that share one global scope and load in the order listed in `scripts/build.mjs`. Edit them in `src/`, then run `npm run build`.

### Drawing format

A drawing is JSON. Coordinates are in points, with y pointing down.

```json
{ "atoms":  [{ "id": 1, "x": 0, "y": 0, "el": "C", "charge": 0, "lp": 0, "rad": 0 }],
  "bonds":  [{ "id": 3, "a": 1, "b": 2, "order": 1, "stereo": "none|wedge|hash|wavy|bold" }],
  "arrows": [{ "id": 4, "type": "reaction|equilibrium|retro|resonance|dashed|nogo|curly|fishhook", "x1": 0, "y1": 0, "x2": 40, "y2": 0 }],
  "texts":  [{ "id": 5, "x": 0, "y": 20, "text": "H2SO4", "size": 10, "font": "sans|serif|mono" }],
  "pluses": [], "style": "acs|slides", "page": { "w": 612, "h": 792, "across": 1, "down": 1 } }
```

A project wraps a list of `pages` (each holding one drawing) and a list of `versions`. Every file is passed through `sanitizeDoc()` when it is loaded, because values end up in SVG markup.

## Browser notes

- Copying to the clipboard needs a secure context (HTTPS or a local file). When a browser blocks it, Skeletal shows the image so you can right-click it and choose Copy image.
- Autosave uses `localStorage`, which is separate for each browser and can be cleared. Save the project as HTML to keep it permanently.
- Labels render in Arial/Helvetica so they match Office and journal fonts.

## Contributing

Issues and pull requests are welcome. Please add a unit test for chemistry changes and run `npm test` and `npm run test:e2e` before opening a pull request. If you change an estimation rule, include the `npm run validate` output.

## License and credits

MIT (see [LICENSE](LICENSE)). The bundled [OpenChemLib JS](https://github.com/cheminfo/openchemlib-js) is BSD-3-Clause. Reference data are credited in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
# skeletal
