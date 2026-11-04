# JSME, Kekule.js and MolView: source study and headless tests

**Checked:** 3 November 2026. Clones (shallow, outside the repo) are in the session scratchpad under `oss/jsme`, `oss/jsme-webpack`, `oss/kekule` and `oss/molview`. Scripts are in [scripts/](scripts/), and raw outputs are in [scripts/results/](scripts/results/).

## Summary

| | JSME | Kekule.js | MolView (old app) |
| --- | --- | --- | --- |
| Public code | **Compiled GWT output only.** The Java source is not published | Full source, MIT | Full source, but **no open-source license since June 2023** (commit `0ec05be6` "Retract license"). Before that it was AGPL-3.0 |
| Stated license | BSD-3-Clause (`dist/license.txt`, Novartis and Bruno Bienfait) | MIT | `COPYRIGHT.md`: "not allowed to redistribute it without written permission" |
| Last activity | Site repo pushed 2025-03-09; npm `jsme-editor` 2024.4.29 (published 2024-07-21) | 2026-09-21 (v1.0.5, frequent commits) | 2026-07-06 (small web fixes) |
| Stack | Java compiled by GWT 2.5.1 (`$gwt_version = "2.5.1"`), gwt-mosaic UI, gwt-exporter API | Hand-written ES5 with its own class system (`src/lan/classes.js`) | jQuery 2, Grunt concatenation, PHP backend |
| Sketcher | JSME itself | `Kekule.Editor.Composer` | **MolPad** (`src/js/molpad/`), MolView's own. **Not ChemDoodle** |
| 2D drawing | Canvas 2D; SVG export by string building | Draw bridges: Canvas (`CanvasRendererBridge`) or SVG through Raphael (`RaphaelRendererBridge`) | Canvas 2D only |
| SMILES in | Yes, local | **No native reader.** Only through the OpenBabel WASM add-on | **No local parser.** Sent to PubChem |
| 2D layout | Local | No native layout. Uses OpenBabel `Gen2D` (WASM, web worker) or Indigo | None. Coordinates come from PubChem's 2D SDF |
| Undo | Undo stack (snapshot of editor state, per release notes) | Command pattern: `Kekule.Operation` / `OperationHistory` | Whole-molecule snapshots (`MPMolecule.updateCopy`, max 100) |
| Section A, headless | 22 of 24 identical to input (by OpenBabel canonical SMILES); A9 normalised, A12 radical lost | Default path keeps stereo in 0 of 6 stereo cases; drops H counts on bracket atoms | PubChem path ok for known compounds; local export drops H on bracket atoms and breaks stereocentres |

ChemDoodle Web Components 6.0.1 is bundled in MolView (`src/js/lib/ChemDoodleWeb.js`), and its header says it is under GPL-3.0. MolView uses it only as a **3D model renderer** (`CDWPlugin.js`: `ChemDoodle.TransformCanvas3D`, `readMOL`, `readPDB`, `readCIF` for crystals) and as a **spectrum viewer** (`Spectroscopy.js`: `ObserverCanvas`, `SeekerCanvas`, `readJCAMP`). The sketcher is MolPad, and its file handling is Ketcher's 2010 `chem` library (`src/js/chem/`, AGPL-3.0, GGA Software).

---

## 1. JSME

### What is public

- `github.com/jsme-editor/jsme-editor.github.io` (the "organisation" is a user account) contains `dist/jsme/` (compiled GWT), example HTML pages, a Javadoc of the exported API (`dist/api_javadoc/export/client/JSME.html`, 104 methods), `help.html`, `dist/doc.html`, `dist/release_notes.txt`, and versioned zips in `downloads/` (2017 to 2024). There is no `.java` file anywhere, and the zips hold the same compiled output.
- `JSME-webpack-example` (BSD-2-Clause, 2020) only shows how to copy the static assets.
- So the BSD license applies to a binary. You can redistribute and embed JSME, but you can't realistically fork it or fix it.
- `dist/license.txt` lists bundled code: Apache Harmony, gwt-mosaic, gwt-exporter, GWT, **OpenChemLib**, **InChI 1.05** (emscripten).

### Build and layout (from the compiled output)

- `jsme.nocache.js` is the GWT bootstrap. It picks one of three permutations (`compilation-mappings.txt`: user agent `gecko1_8`, `is_android_or_ios`, `drag_and_drop_support_html5`). Two are about 425 KB each; the third (`96E40B96...cache.js`) is 1.2 MB.
- `deferredjs/<hash>/1..11.cache.js` are GWT `runAsync` fragments that load on first use. In our headless run, the first SMILES read took longer than later ones, and `JSApplet.Inchi` doesn't exist until the InChI fragment loads.
- The compiled code is obfuscated, but its string table shows the formats: `$RXN`, `V3000`, `M  CHG`, SVG attribute fragments (`" stroke="`, `" x2="`), and a built-in table of substituent labels (`-NO2`, `-CF3`, `-C(=O)OMe`, `-NH-SO2-Me` ...).

### Architecture (from the API and docs)

- **Data model:** JME's own molecule model. Since 2021 it is exposed read-only through `getMolecule()`, `getAtom()` and `getBond()`. JME string format (`jmeFile()`) is the native serialisation.
- **Tools and UI:** JME layout: a top bar of action buttons (delete, D-R, charge, ring templates, chain tool, stereo bond, undo, redo, "new part", reaction arrow), a left column of element buttons (C N O S F Cl Br I P and X for others), and a right-click pop-up for copy and paste. Clicking a stereo bond cycles up, down and orientation. The chain tool shows the chain length. `setMenuXShortcuts` customises the X button.
- **Events:** callbacks registered by name: `setCallBack("AfterStructureModified", fn)`, atom and bond highlight callbacks, `setBeforePasteCallback` and `setAfterPasteCallback`.
- **Rendering:** Canvas 2D (`getContext("2d")` appears once in the main permutation). `getMolecularAreaGraphicsString()` returns an SVG string. Headless, it gave 597 bytes for ethanol and 60 KB for the 282-atom peptide. With the `useopenchemlib` option, SMILES conversion, 2D coordinates and SVG export go through OpenChemLib.
- **IO:** `smiles()`, `nonisomericSmiles()`, `molFile(v3000?)`, `jmeFile()`, `readGenericMolecularInput()` (auto-detects SMILES, MOL, RXN, JME), `readMolFile()`, `getMultiSDFstack()`, InChI and InChIKey export (menu, `exportinchi`), and SMARTS in query mode.
- **Options** (one comma-separated string, `dist/doc.html`): `autoez` (E/Z on all acyclic double bonds, default on), `canonize`/`nocanonize`, `stereo`/`nostereo`, `reaction`, `multipart`, `query`, `depict` (read-only view), `paste`, `zoom`, `oldlook`, `marker`, `star`.
- **Embedding:** load `jsme/jsme.nocache.js`, define a global `jsmeOnLoad()`, then call `new JSApplet.JSME("divId", "380px", "340px", {options: "..."})`. `replaceAllAppletsByJSME()` turns old `<applet code="JME.class">` tags into JSME.

### Running it without a browser

JSME runs in **jsdom** (no canvas package needed; canvas calls do nothing). The script is [scripts/jsme_suite.cjs](scripts/jsme_suite.cjs). It needs two stubs: `window.matchMedia`, without which `readGenericMolecularInput` throws `$wnd.matchMedia is not a function` on stereo input, and `window.alert`.

Two harness findings:

1. Creating JSME with `{options: "nocanonize"}` makes `smiles()` echo the input instead of canonicalising it.
2. After a reaction has been read, `reset()` followed by reading a plain molecule still returns SMILES ending in `>>`. Reaction mode outlives `reset()`. The suite therefore creates a new editor for each case.

---

## 2. Kekule.js

### Build and layout

- 1.0.5 (`package.json`). `src/` is 73 MB because it includes WASM builds and Moodle plug-ins; `dist/` is 20 MB. Modules are listed in `src/kekule.js`: lan, root, localization, common, core, html, io, render, spectroscopy, widget, chemWidget, webComponent, algorithm, calculation, data, emscripten, openbabel, indigo, inchi.
- Distribution: `dist/kekule.min.js` (script tag), `dist/kekule.cm.js` (CommonJS), `dist/kekule.esm.mjs` (ESM, imports `dist/mins/*.min.js`), and per-module `dist/jsmods/*`.
- WASM add-ons are in `dist/extra/`: `openbabel.{js,wasm,data}` (about 8.4 MB in total), `indigo.wasm` (5.5 MB), `inchi.wasm` (0.6 MB).
- **Node bug:** `require('kekule')`, or `dist/kekule.moduleEnvInits.cm.js`, throws `ERR_INVALID_URL`, because it calls `new URL(__filename)` on a plain path. The ESM build loads. `test/nodeTest/helloWorld.js` fails this way and `helloWorld.mjs` runs.

### Data model (`src/core/`)

`Kekule.ChemObject` → `Kekule.ChemStructureObject` → nodes and connectors. The node classes are `Kekule.Atom`, `Pseudoatom`, `VariableAtom` and `ChemStructureNode`. `Kekule.StructureFragment` **is itself a node** (`StructureFragment < ChemStructureNode`), so `Kekule.SubGroup` (abbreviations) and `Kekule.Molecule` nest. A fragment holds a `Kekule.StructureConnectionTable`. Bonds are `Kekule.Bond < ChemStructureConnector`. Each node has `coord2D`/`coord3D`, charge, radical, mass number and parity. The containers are `Kekule.ChemSpace` and `Kekule.ChemDocument`, which hold molecules, glyphs (`chemdoc/kekule.glyph.*`: arrows, path glyphs), text and image blocks, and attached markers (charges, electrons). Reactions are `Kekule.Reaction` in `core/kekule.reactions.js`. All properties are declared with `defineProp`, which gives generic serialisation (`io/native`) and the object inspector.

### Editor architecture (`src/widgets/chem/editor/`)

- `Kekule.Editor.Composer` (`kekule.chemEditor.composers.js`, 3.6 k lines) is the full UI: a common toolbar, a chem-tool toolbar, a zoom toolbar, a style toolbar and an object-modifier toolbar (`ComposerStyleToolbar`, `ComposerObjModifierToolbar`, `adjustStyleAndObjModifierToolbarPosition`), plus an optional object inspector and structure tree. `ComposerFrame` and `ComposerDialog` wrap it.
- It wraps `Kekule.Editor.ChemSpaceEditor` < `BaseEditor` < `ChemWidget.ChemObjDisplayer`. `baseEditors.js` (8.7 k lines) and `chemSpaceEditors.js` (7.6 k lines) are where most of the work happens.
- **Tools are interaction controllers** (`Kekule.Widget.InteractionController` subclasses): `SelectIaController`, `BasicMolEraserIaController`, `MolBondIaController`, `MolAtomIaController`, `MolRingIaController`, `MolFlexChainIaController`, `MolFlexRingIaController`, `RepositoryStructureFragmentIaController` (templates), `ArrowLineIaController`, `PathGlyphIaController`, `FormulaIaController`, `TextBlockIaController`, `AttachedMarkerIaController` and more. Each overrides `react_pointerdown`, `react_pointermove`, `react_pointerup` and `react_keydown`. Toolbar buttons are `Action` classes (`kekule.chemEditor.actions.js`, for example `ActionComposerSetBondControllerWedgeUp`) that switch the active controller. Hammer.js (`src/lib/hammer.js`) handles touch gestures.
- **Undo** is a command pattern. `Kekule.Operation` (`execute`/`reverse`), `Kekule.MacroOperation` and `Kekule.OperationHistory` are in `widgets/operation/kekule.operations.js`. The chem operations are in `kekule.chemEditor.operations.js`: `ChemStructOperation.AddNode`, `RemoveNode`, `AddConnector`, `MergeNodes`, `MergeNodesPreview`, `SplitStructFragment`, `ChemObjOperation.MoveAndResize`, `ModifyHashProp` and others. Edits go through `editor.pushOperation(op, autoExec)`.
- **Embedding:** `new Kekule.Editor.Composer(parentElem)`, then `composer.setChemObj(mol)` and `getChemObj()`. You can also use HTML auto-launch (`data-widget="Kekule.Editor.Composer"`, `kekule.widget.autoLaunchers.js`) or the web component `<kekule-composer>` (`webComponents/kekule.webComponent.widgetWrappers.js`, which also defines `kekule-viewer`, `kekule-viewer2d`/`3d` and `kekule-periodic-table`).

### Rendering (`src/render/`)

- There is a renderer tree per object type: `Kekule.Render.ChemCtab2DRenderer`, `ChemNodeLabel2DRenderer`, `StructFragment2DRenderer`, `Reaction2DRenderer`, `ChemSpace2DRenderer` (`2d/kekule.render.renderer2D.js`, 5.3 k lines). They draw through a pluggable bridge: canvas or Raphael SVG (`raphaelRenderer.js`, with `toSVG()` export). 3D uses `ThreeRenderer`.
- **Double bonds:** the gap is `multipleBondSpacingRatio × bond length`, capped by `multipleBondMaxAbsSpacing`. For an even number of lines, `_decideEvenBondAlign(context, node1, node2)` adds up the side on which each neighbour lies relative to the bond vector and puts the second line on the busier side, so ring double bonds go inside the ring. Crossed double bonds are centred.
- **Wedges:** `BondRenderType` values `WEDGED_SOLID`, `WEDGED_SOLID_INV`, `WEDGED_HOLLOW`, `WEDGED_HASHED`, `WEDGED_SOLID_BOTH` and `HASHED`, drawn as triangles, hashed triangles or rectangles.
- **Labels:** `_decideNodeLabelCharDirection` picks LTR or RTL (H on the left or right) from the neighbours. `ChemStructureUtils.getMostEmptyDirection2DAngleOfObj` (`core/kekule.chemUtils.js`) places charges and markers in the emptiest direction. Charge marks can be circled (`ChargeMarkRenderType.CIRCLE_AROUND`).

### IO (`src/io/`)

- Native: MDL V2000/V3000, RXN and SD (`io/mdl/`), CML (`io/cml/`), Kekule JSON/XML (`io/native/`), JCAMP-DX and CML spectra.
- **SMILES: writer only.** `io/smiles/kekule.io.smiles.js` registers only `Kekule.IO.SmilesMolWriter`, which generates SMILES from a longest-path spanning tree, Morgan-style canonical ranks and `getAromaticRings()`. Reading SMILES needs `Kekule.OpenBabel.enable()`, which registers OpenBabel readers for SMILES, PDB, mol2, CDX and ct (`_extras/OpenBabel/kekule.openbabel.io.js`). Without it, `loadFormatData(s, 'smi')` throws "Can not read data of format: smi". Upstream issue from 2025-09-10 has the same title.
- The OpenBabel reader goes **SMILES → OBMol → 0D molfile string → Kekule MdlMolReader** (`AdaptUtils.obMolToKekule`). The source comment says wedge and stereo transfer is "very complex", so it goes through a molfile instead. This is where stereo and radicals are lost (section 4).

### Chemistry

- **Valence:** `Kekule.ValenceUtils` (`core/kekule.valences.js`) follows the MDL valence model (`getImplicitMdlValence`).
- **Aromaticity:** π-electron counting with 4n+2 and uncertain counts (`algorithm/kekule.structures.aromatics.js`, `perceiveAromaticRings`).
- **Stereo:** parity from 2D coordinates plus wedges (`Kekule.MolStereoUtils.perceiveStereos`, `algorithm/kekule.structures.stereos.js`).
- **Algorithms:** canonicalisation (`kekule.structures.canonicalizers.js`), SSSR and all-ring search, substructure search, structure comparison.
- **No native 2D layout:** `Kekule.Calculator` GEN2D/GEN3D services are backed by OpenBabel (`kekule.worker.obStructureGenerator.js`, a web worker) or Indigo.
- **No molecular-weight API.** The suite sums `atom.getAtomicMass()` plus implicit H.
- Formula text is not in Hill order: glucose comes out as `O6H12C6`, ammonium chloride as `N+H4 +Cl-`.

### Unit tests (Jasmine, run in Node)

`unitTests/spec/support/jasmine.json` plus `_utils/kekuleLoaderCli.js` give a Node runner. Many specs need OpenBabel in `beforeAll` ("this test should be done in browser"). I added [scripts/kekule_jasmine_ob_helper.js](scripts/kekule_jasmine_ob_helper.js) to preload the WASM.

| Folder | Specs | Pass | Notes |
| --- | --- | --- | --- |
| algorithm | 116 | 116 | |
| io | 217 | **217** with the OB helper | 110 pass without it (107 not run: the OB `beforeAll` throws "using preloaded data can only be done on a web page") |
| core | 97 | 26 | 71 condensed-formula specs need `Kekule.Editor.RepositoryData` (editor module, not loaded by the CLI loader) |
| spectrum | 68 | 56 | 12 time out (`null.getChildCount`) |
| reaction | 4 | 3 | `window is not defined` |
| widget | 1 | 1 | |
| **Total** | **503** | **419** | |

The first combined run with random order hit the 600 s cap. Per-folder runs finish in 0.1 to 61 s.

---

## 3. MolView

### What it is now

The README says the repository holds "the old MolView app ... developed between 2012 and 2015" and that since 2023 its patches are not open source. The new app at app.molview.com is closed (see [../apps/molview-rcsb.md](../apps/molview-rcsb.md)). The code here was AGPL until commit `0ec05be6` (2023-06-21). Only the AGPL snapshot before that commit (for example `ae1d2c1d`, 2022-10-28) can be reused, and only under AGPL terms.

### Build and layout

- `Gruntfile.js` concatenates and uglifies four bundles: libs (JSmol, three.js, GLmol, ChemDoodleWeb), Ketcher `chem`, the app (`src/js/*.js`), and MolPad (`src/js/molpad/*.js`). Styles are LESS in `src/less/`.
- `build.sh` fetches JSmol and Parsedown and renders SVG icons with Inkscape and ImageMagick.
- PHP pages (`index.html`, `page.php`, `php/`) need a server. An embed variant lives in `embed/v1/` (`MolView.Embed.js`, query `?smiles=`, `?cid=`, `?pdbid=`).

### MolPad, the sketcher (about 5,100 lines)

- `MolPad(container, devicePixelRatio, buttons)` (`MolPad.js`). The tool state is `{type: "bond"|"fragment"|"chain"|"charge"|"erase"|"drag"|"select"|"atom", data}`.
- **Model:** `MPMolecule` holds arrays of `MPAtom` (element, charge, isotope, centre) and `MPBond` (type 1 to 5, stereo 0/1/3/4/6, from, to). **There are no radicals, explicit H counts, reactions, arrows or text.**
- **Events:** `MPEvents.js`. `onPointerDown`, `onPointerMove` and `onPointerUp` dispatch to handler objects: `hoverHandler`, `mouseDragHandler`, `multiTouchHandler`, `selectionToolHandler`, `MPAtom.getHandler`, `MPBond.getHandler`. It has pinch zoom and lasso or rectangle selection (`MPAtom.handlePolygonSelect`).
- **Undo:** `MPMolecule.updateCopy()` compares a fingerprint and pushes a plain-JSON copy of the whole molecule onto `stack` (`maxStackSize: 100`). `undo`/`redo` reload that copy.
- **Rendering:** Canvas 2D (`MPGraphics.js`, `MPBond.drawBond`, `MPAtom.drawLabel`).
  - Double bonds are always **centred** (`MPSettings.js` `bond.delta: [-4, 4]` px). There is no ring-inside offset.
  - Wedges are triangles with `delta [-6, 6]`.
  - Bonds are coloured with Jmol colours and a gradient between unlike atoms.
  - A new bond's direction is the middle of the largest free angle (`MPAtom.calculateNewBondAngle`).
  - A "skeletal" toggle adds or removes explicit H atoms (`addImplicitHydrogen`/`removeImplicitHydrogen`).
  - Label direction is a TODO in the source ("add support for collapsed groups (CH2- to H2C-, OH- to HO-)").
- **IO:** only through Ketcher's `chem`. `MPMolecule.loadMOL` calls `chem.Molfile.parseCTFile`. `getMOL` calls `chem.MolfileSaver`, and `getSMILES` calls `chem.SmilesSaver`.
- **SMILES in and 2D layout come from the network.** `Loader.loadSMILES` → `Request.resolve` → PubChem `compound/smiles/cids/json` → PubChem `cid/<cid>/sdf?record_type=2d`. The NCI CIR fallback is turned off in the code (`Request.CIR: { available: false }` in `src/js/Request.js`), so a SMILES with no PubChem record can't be loaded at all.
- **3D:** GLmol (default), JSmol, or ChemDoodle `TransformCanvas3D` (`Model.js`, `CDWPlugin.js`). 3D molfiles come from PubChem.
- **Global side effect:** `src/js/chem/prototype.js` replaces `Array.prototype.find` with a function that uses undefined `iterator` and `context` variables. Any later `[].find(fn)` on the page throws.

---

## 4. Section A results (headless)

How each was run:

- **Kekule:** [scripts/kekule_suite.mjs](scripts/kekule_suite.mjs), through [scripts/kekule_ob_loader.mjs](scripts/kekule_ob_loader.mjs), with Node 20. There are three paths:
  - **K** is `Kekule.IO.loadFormatData(smi,'smi')`, what the Composer does on paste.
  - **K2D** is K followed by `OpenBabel.StructUtils.generate2DStructure`, the displayer's automatic coordinate step.
  - **OB2D** is OpenBabel reading the SMILES and running its own `Gen2D`, written as a 2D molfile with wedges, then read by Kekule's native `MdlMolReader` and written by `SmilesMolWriter`. This is the best case and shows that Kekule's own stereo perception works when given wedges.
- **JSME:** [scripts/jsme_suite.cjs](scripts/jsme_suite.cjs) in jsdom.
- **MolView:** [scripts/molview_suite.cjs](scripts/molview_suite.cjs) runs MolView's own Ketcher `chem` code in a Node `vm`. **PC** makes real PubChem calls, as `Request.resolve` does, then applies the MolPad atom and bond filter and `SmilesSaver`. **LOC** feeds JSME's 2D molfile into the same filter and saver, with no network.
- **Referee:** [scripts/ob_referee.mjs](scripts/ob_referee.mjs) and the Kekule suite compare OpenBabel canonical SMILES of the input and the output. "OK" means same constitution, charges, isotopes, H counts and stereo.

| ID | Kekule K (paste) | Kekule OB2D | JSME `smiles()` | MolView PC | MolView LOC |
| --- | --- | --- | --- | --- | --- |
| A1 ethanol | OK `CCO`, C2H6O, 46.07 | OK | OK `CCO` | OK (CID 702) | OK |
| A2/A3 benzene | OK, both `c1ccccc1` | OK | OK, both `c1ccccc1` | OK (CID 241) | OK, Kekulé `C1C=CC=CC=1` |
| A4 naphthalene | OK `c1cc2c(cc1)cccc2` | OK | OK | OK | OK |
| A5 pyrrole | OK `c1[nH]ccc1` | OK | OK `c1cc[nH]c1` | OK | OK `C1=CNC=C1` |
| A6 L-Ala | **stereo lost** `O=C(O)C(N)C`; K2D **wrong enantiomer** `[C@H]` | OK `O=C(O)[C@@H](N)C` | OK; molfile has wedge, chiral flag 1 | OK (CID 5950) | **broken** `C[C@@](C(O)=O)N` (no H on C*) |
| A7 E/Z | **lost**, both `FC=CF`; K2D gives both as Z | OK, kept apart | OK, kept apart | OK (CIDs 5365501, 5462921) | OK |
| A8 NH4Cl | **H lost** `[N+].[Cl-]` (formula still N+H4) | same bug | OK `[NH4+].[Cl-]` | OK (CID 25517) | **H lost** `[N+].[Cl-]` |
| A9 nitro | OK, charge-separated kept | OK | **normalised** to `CN(=O)=O` without notice | OK | inherits `CN(=O)=O` |
| A10 sulfone | OK | OK | OK `CS(C)(=O)=O` | OK | OK |
| A11 ¹³CH4 | **H lost** `[13C]`; MW 17.04 | same | OK `[13CH4]` | OK | **H lost** `[13C]` |
| A12 radical | **lost**, CH4 (OB writes valence column 3, Kekule ignores it) | lost | **lost** `C` | PubChem maps it to **methane** (CID 297) | lost (no radical field in MolPad) |
| A13 3- and 12-rings | OK | OK | OK | OK | OK |
| A14 cubane | OK; min atom gap after Gen2D 0.6 bond lengths | OK | OK | OK (CID 136090) | OK |
| A15 ferrocene | **H lost** `[c-]` | same | OK `[cH-]` | OK (CID 7611) | **H lost** `[C-]` |
| A16 reaction | **merged into one molecule** (C11H12O6, arrow lost) | same | OK, reaction kept `...>>CC(=O)O` | PubChem rejects it, so nothing loads | arrow dropped by MolPad (raw Ketcher keeps `>>`) |
| A17 toluene | OK, same canonical `c1cc(C)ccc1` | OK | OK, same `Cc1ccccc1` | OK | OK |
| A18 glucose (4 centres) | **all lost**; K2D wrong | OK | OK, all kept | OK (CID 5793) | **broken** (bare `[C@@]` atoms) |
| A19 `xyz`, `C1CC` | returns `null` without an error | n/a | empty structure; no exception or alert seen in jsdom | PubChem "Unable to standardize" | n/a |
| A20 peptide, 282 heavy atoms | stereo lost; load 0.4–2.4 s, SMILES 0.3–1.6 s, Gen2D 0.8–3.8 s (Node; two runs) | OK, 33 centres | OK, 4.4 s to read and lay out; molfile round trip same | no CID, and the CIR fallback is off, so it **cannot load** | **broken** stereocentres |

The molfile round trip (write and re-read, compare SMILES) was unchanged for every case in Kekule (K and OB2D) and JSME. Raw output is in `scripts/results/{kekule,jsme,molview}_output.txt` and `ob_referee_output.txt`.

Patterns:

- **Kekule's SmilesMolWriter leaves out the hydrogen count in bracket atoms** (`[N+]`, `[13C]`, `[c-]`). It does so even for a molecule built natively (`atom.setCharge(1)` on N gives `[N+]` while the formula says NH4+).
- **Ketcher's `SmilesSaver` in MolView does the same**, because MolPad never calls `chem.Struct.calcImplicitHydrogen`. No code under `src/js/molpad`, `Sketcher.js` or `Loader.js` calls it. Stereocentres come out as `[C@@]` with no H. `Sketcher.getSMILES()` is what MolView sends to PubChem to build the 3D model, so drawn stereocentres may fail to resolve. **This needs a browser check.**
- In Kekule, **stereo never survives the SMILES reader**, because the 0D molfile hand-off drops it. The K2D path then *makes up* stereo from the layout: it was wrong for A6, A7a and A18, and right for A7b and A20.

## 5. What needs a browser (for your separate pass)

- **JSME:** everything in B (drawing, chain tool, ring fusion, wedge cycling, undo depth, charge cycling, zoom), C3–C6 (clipboard, SVG and PNG look), C7 (InChI loads lazily; `JSApplet.Inchi` was undefined headless), C8–C9 and D (JSME has no name tools, MW, CIP or NMR), and E. Also check: the A19 message in the info bar, and whether A9 normalisation and A12 radical loss show anything in the UI.
- **MolView:** all of B and E. A in the real app, especially:
  - A6, A18 and A20 drawn in MolPad, then "update 3D" (to test the H-less stereo SMILES above)
  - A16 (no reactions)
  - A12 (shows methane?)
  - any SMILES not in PubChem (expect a failure, since the CIR fallback is off).

  C4–C6 (PNG through `canvas.toDataURL` only; no SVG export in MolPad), and C8 and D (PubChem data).
- **Kekule Composer:** B and E. Also A6 and A18 pasted into the Composer, to confirm the stereo loss seen in Node, and to see whether auto-generated 2D coordinates come from the worker.

## 6. Weaknesses

- **JSME:** no source, so no fixes from outside. GWT 2.5.1 from 2013. Bugs found:
  - drops radicals
  - silently normalises charge-separated nitro
  - `reset()` doesn't leave reaction mode
  - `nocanonize` turns off canonical output entirely
  - 16 open issues, including "Missing stereo information" (2025-03-31)
  - no release since 2024.
- **Kekule.js:**
  - The core can't read SMILES or lay out 2D without about 8 MB of OpenBabel WASM, and that build won't load in Node without shims.
  - The CommonJS entry crashes in Node.
  - Stereo is lost on SMILES input, bracket-atom H counts are dropped on SMILES output, and reaction SMILES merge into one molecule.
  - It has no MW API and formulas aren't in Hill order.
  - Of 503 unit tests, 84 need a browser or the editor module to run.
  - It is actively maintained by essentially one author.
- **MolView (old):** not licensed for reuse since 2023.
  - It depends on PubChem for every SMILES, so unknown compounds, reactions and radicals fail or get changed.
  - MolPad's model has no radicals, H counts, arrows or text.
  - It uses centred double bonds only.
  - SMILES export drops H on charged, isotopic and stereo atoms.
  - It replaces `Array.prototype.find` with broken code.
  - Ketcher code from 2010 (AGPL).

## 7. Reproduce

```sh
# Kekule (needs the cloned repo's dist/)
node docs/landscape/opensource/scripts/kekule_suite.mjs <kekule>/dist --json out.json
# JSME (npm install jsdom@24 next to the script or globally)
node docs/landscape/opensource/scripts/jsme_suite.cjs <jsme-editor.github.io>/dist jsme.json
# MolView (calls PubChem; paces about 3 requests/s)
node docs/landscape/opensource/scripts/molview_suite.cjs <molview> jsme.json molview.json
node docs/landscape/opensource/scripts/ob_referee.mjs <kekule>/dist jsme.json molview.json
# Kekule unit tests, from <kekule>/unitTests
KEKULE_SRC=../src npx jasmine --config=spec/support/jasmine.json --helper=<abs>/kekule_jasmine_ob_helper.js './io/*Test.js'
```

## Lessons for Lone Pair

1. **Test hydrogen counts in bracket atoms on export.** Two of the three projects write `[N+]` for ammonium and `[13C]` for ¹³CH4, and in MolView's case `[C@@]` for every drawn stereocentre. Add A8, A11, A15 and A6 drawn by hand (not pasted) to Lone Pair's SMILES export tests, with an independent referee such as OpenChemLib or OpenBabel canonical SMILES, as in `ob_referee.mjs`.
2. **Don't pass stereo through a 0D molfile.** Kekule loses all SMILES stereo because its OpenBabel adapter goes SMILES → 0D molfile. Then a layout step invents stereo from geometry, which gave the wrong enantiomer for L-alanine. If Lone Pair lays out a parsed SMILES, carry parity through layout and assign wedges from it. Check A6, A7 and A18 with the canonical-SMILES comparison after every layout or Clean up change.
3. **Keep SMILES parsing and 2D layout local.** MolView can't open any compound PubChem lacks: no reactions, no new molecules, radicals turned into methane. Lone Pair already bundles OpenChemLib, and JSME shows the same choice works (OCL inside a single bundle, 4.4 s for a 282-atom peptide headless).
4. **Fail loudly on invalid input.** Kekule returns `null` and JSME gives an empty canvas for `xyz` and `C1CC`. Show the parser's message and position.
5. **Put the second line of a double bond on the ring side.** Kekule's `_decideEvenBondAlign` (add up neighbour sides, put the second line on the busier side; centre when crossed) is a simple rule worth comparing with Lone Pair's. MolPad's always-centred double bonds look wrong in rings at publication size.
6. **Reaction state must reset with the document.** JSME keeps reaction mode after `reset()`. Lone Pair's "new page" and paste paths should be tested with a reaction followed by a plain molecule.
7. **Command-pattern undo is the better model for a rich document.** Kekule's `Operation`/`OperationHistory` with `MergeNodesPreview`-style preview operations scales to arrows, text and glyphs. MolPad's 100 whole-molecule snapshots don't, and only work because its model is tiny.
8. **A headless harness pays off.** jsdom ran JSME's compiled GWT without a canvas. A Node script around Lone Pair's single HTML file, loaded in jsdom the same way, could run section A on every commit.
9. **Licensing:** JSME can be embedded (BSD binary) but not forked. Kekule is MIT and safe to borrow ideas or code from. MolView after June 2023 must not be copied, and its pre-2023 AGPL code (and Ketcher's `chem`) would make Lone Pair AGPL. ChemDoodle Web Components is GPL-3.0, so the same caution applies.
10. **Don't overwrite built-ins.** MolView's `Array.prototype.find` replacement is a reminder that a single-file app sharing a page with embeds or extensions should leave built-in prototypes alone.
