# OpenChemLib and RDKit.js: two browser chemistry engines

Studied on 2026-11-03. Versions tested:

- **OpenChemLib (OCL) JS 9.25.2**, from npm `openchemlib`. It wraps the Java library at `github.com/actelion/openchemlib` (HEAD `1a8a896`) and the JS project at `github.com/cheminfo/openchemlib-js` (HEAD `cda8d58`).
- **RDKit.js 2026.09.1**, from npm `@rdkit/rdkit`. It is built from `github.com/rdkit/rdkit`, `Code/MinimalLib`, at tag `Release_2026_09_1`.

Lone Pair already bundles OCL 9.25.1 (see `package.json`). It does not ship RDKit. RDKit was only used as an outside cross-check, and that check is what found the y-axis bug (REVIEW.md item 14).

The sources were shallow-cloned into the session scratchpad, not into this repo. The edge-case script is saved at `docs/landscape/opensource/scripts/ocl_rdkit_suite.mjs`.

---

## 1. How each engine is built

| | OpenChemLib JS | RDKit.js (MinimalLib) |
|---|---|---|
| Source language | Java (`com.actelion.research.chem.*`, about 52 k lines in the core `chem/*.java` alone) | C++17 (`Code/GraphMol`, plus `Code/MinimalLib/minilib.cpp` and `jswrapper.cpp`) |
| Compile path | Java → **GWT 2.13** → JS. `scripts/build.js` copies the needed Java classes from the OCL repo and patches about 30 of them for GWT (`scripts/openchemlib/classes.js`, for example `changeInventorFragment` and `changeTorsionDB`). Emulated JRE classes live in `src/com/actelion/research/gwt/jre/java/...`. `gwt-api-exporter` then turns GWT output into an ES module (`lib/java/openchemlib.js`), and esbuild bundles `lib/index.js` into `dist/openchemlib.js`. | C++ → **Emscripten** (`emcmake cmake -DRDK_BUILD_MINIMAL_LIB=ON -DRDK_BUILD_FREETYPE_SUPPORT=ON -DRDK_BUILD_INCHI_SUPPORT=ON -DRDK_BUILD_COORDGEN_SUPPORT=ON ...`, in `Code/MinimalLib/docker/03_build.Dockerfile`) → WASM. The JS API comes from Embind declarations in `jswrapper.cpp`. Link flags include `-s MODULARIZE=1 -s EXPORT_NAME='initRDKitModule' -s ALLOW_MEMORY_GROWTH=1 -s MAXIMUM_MEMORY=4GB`. |
| JS-only parts | The CanvasEditor glue code is hand-written JS in `lib/canvas_editor/*.js` (toolbar, events, clipboard, cursors). `lib/extend/` adds JS helpers. | None. Everything goes through `Module.get_mol(...)` and the `JSMol` methods. |
| Shipped files | `dist/openchemlib.js`, 1.1 MB minified (342 KB gzip). `dist/openchemlib.debug.js` is 3.3 MB. `dist/resources.json` (1.3 MB) holds the torsion, force-field and predictor tables, loaded on demand through `Resources.register*`. | `RDKit_minimal.js` (108 KB) plus `RDKit_minimal.wasm`, 7.0 MB (2.4 MB gzip). |
| Loading | Synchronous ES import. Works under `file://`. | Asynchronous: `await initRDKitModule()`, then a WASM fetch. Under `file://`, the `.wasm` must be inlined as base64 or fetched with `locateFile`. |
| Memory | JS garbage collection | Manual: every `JSMol` must be `.delete()`d, or the WASM heap leaks. |

## 2. API surface

| Need | OpenChemLib JS | RDKit.js |
|---|---|---|
| Molecule object | `Molecule` (Java `StereoMolecule` → `ExtendedMolecule` → `Molecule`) | `JSMol`, from `RDKit.get_mol(input, detailsJSON)` |
| Native identifier | **IDCode**: `getIDCode()`, `getIDCodeAndCoordinates()`, `Molecule.fromIDCode()`. It is canonical, compact, and carries stereo and optional coordinates (`Canonizer.java`, `IDCodeParser.java`). | none (the canonical SMILES plays this role) |
| SMILES in | `Molecule.fromSmiles(s, {noCoordinates, noStereo})` (`SmilesParser.java`, `SmilesAtomParser.java`). Throws `SmilesParser: ...` on error. | `get_mol(s)`. Returns `null` on error. Older builds return a mol with `is_valid() === false`. |
| SMILES out | `toIsomericSmiles({createSmarts, includeMapping})` (`IsomericSmilesCreator.java`; the Java `MODE_KEKULIZED_OUTPUT` flag is not exposed in JS) | `get_smiles()`, `get_cxsmiles()`, `get_smarts()`, `get_kekule_form()` |
| Molfile | `toMolfile()` (V2000, `MolfileCreator.java`), `toMolfileV3()` (`MolfileV3Creator.java`), `Molecule.fromMolfile()` (`MolfileParser.java`, reads both versions) | `get_molblock()`, `get_v3Kmolblock()` (V3000 via details), `get_mol(molblock)` |
| Reactions | `Reaction.fromSmiles`, `fromRxn`, `toSmiles`, `ReactionEncoder`, `Reactor` | `get_rxn(smiles or rxnblock)`, `rxn.get_svg()`, `run_reactants` |
| 2D coordinates | `inventCoordinates()` (`coords/CoordinateInventor.java`, using `InventorFragment` and `InventorDefaultTemplateList`). `fromSmiles` runs it by default. | `set_new_coords(useCoordGen)`, `get_new_coords()`, `prefer_coordgen(bool)`, `generate_aligned_coords(template)`, `straighten_depiction()`, `normalize_depiction()` |
| 3D | `ConformerGenerator`, `ForceFieldMMFF94` (MMFF94, 94s, 94s+) | not in MinimalLib |
| Depiction / SVG | `toSVG(w, h, id, opts)` (`SVGDepictor.java` on top of `AbstractDepictor.java`). Text is `<text>`. | `get_svg(w, h)`, `get_svg_with_highlights(json)`, `draw_to_canvas*` (MolDraw2D). Text is drawn as `<path>` glyphs via FreeType. |
| Stereo perception | `ensureHelperArrays(Molecule.cHelperCIP)`, then `getAtomCIPParity` and `getBondCIPParity`. Parities come from `Canonizer`. ESR groups (`getAtomESRType`: Abs, And, Or). | `get_stereo_tags()` runs `assignStereochemistry(cleanIt, force, flagPossible)` plus the new `CIPLabeler` (`minilib.cpp:309`). Also `use_legacy_stereo_perception()`. |
| Rings / aromaticity | `getRingSet()` → `RingCollection`; `isAromaticAtom`; `AromaticityResolver.locateDelocalizedDoubleBonds` (kekulizes) | sanitization sets aromaticity (default RDKit model); `get_aromatic_form`, `get_kekule_form`, `convert_to_kekule_form` |
| Substructure | `SSSearcher`, `SSSearcherWithIndex`, `getIndex()` fingerprints | `get_qmol(smarts)`, `get_substruct_match(es)`, `SubstructLibrary` |
| MCS | `MCS` | `get_mcs_as_json`, `get_mcs_as_smarts`, `get_mcs_as_mol` |
| Descriptors | `getMolecularFormula()` (`MolecularFormula`, with `formula`, `relativeWeight`, `absoluteWeight`), `MoleculeProperties` (logP, logS, PSA, HBA/HBD, rotatable bonds), `DruglikenessPredictor`, `ToxicityPredictor`, `DrugScoreCalculator` | `get_descriptors()` returns about 40 values as JSON (`amw`, `exactmw`, `CrippenClogP`, `tpsa`, Lipinski counts, ...). **There is no molecular formula call.** |
| Fingerprints | `getIndex()` (SSS keys), `CanonizerUtil` hashes | Morgan, RDKit, pattern, MACCS, atom pair, topological torsion |
| InChI | **none** (Lone Pair adds `inchi-js`) | `get_inchi()`, `get_inchikey_for_inchi()` (the IUPAC library compiled in) |
| Extras | MMFF, conformers, `Mutator`, `TautomerHelper`, `MoleculeStandardizer`, NMR (no) | R-group decomposition, `molzip`, MMPA fragmentation, PNG metadata embedding, abbreviations (`condense_abbreviations`) |

## 3. The OCL editor component

The old GWT `StructureEditor`, `StructureView` and `SVGRenderer` were **removed** in openchemlib-js v8. CHANGELOG.md, around line 335, says they "were using old and deprecated OpenChemLib java APIs". The replacement is **`CanvasEditor`**.

- **Model and logic.** These are the Java `GenericEditorArea` (`gui/editor/GenericEditorArea.java`, 3.6 k lines) and `GenericEditorToolbar`. The same generic code backs the Swing (`SwingEditorArea`) and JavaFX (`FXEditorArea`) editors in the Java library. GWT compiles it, and the JS side implements the `GenericDrawContext`, `GenericCanvas` and `GenericUIHelper` interfaces (`lib/canvas_editor/draw_context.js`, `editor_area.js`, `ui_helper.js`).
- **Drawing.** Two `<canvas>` elements sit inside a shadow DOM: a toolbar canvas and an editor canvas (`lib/canvas_editor/create_editor.js`). The molecule is painted through `GenericDepictor`, which uses the same `AbstractDepictor` as `toSVG`. There is no SVG DOM, so per-atom styling is not available.
- **Tools.** There are 34 buttons in two columns of 17 (`GenericEditorToolbar.java`, lines 46–79): clear, clean structure, undo, lasso/pointer, unknown parity, delete, single/up/down bonds, chain, 3/4/5/6/7 rings and an aromatic ring, + and − charge, C, N, O, F, Br, H, Si, P, S, Cl, I, a custom-atom dialog, zoom, an atom mapper (reactions), ESR (enhanced stereo groups) and text. Query features use `AtomQueryFeatureDialogBuilder` and `BondQueryFeatureDialogBuilder`.
- **Embedding.** `new OCL.CanvasEditor(div, {readOnly, initialMode: 'molecule' | 'reaction', initialFragment})`. It provides `setMolecule`, `getMolecule`, `setReaction`, `setOnChangeListener` and `destroy`. Alternatively, `OCL.registerCustomElement()` gives an `<openchemlib-editor>` web component (`lib/canvas_editor/init/canvas_editor_element.js`), with `idcode` and `fragment` attributes and `moleculeChanged()`.
- **Limits compared with Lone Pair.** There is no free-form scheme canvas, no curly arrows, no text styling, and no per-object styles. It is a query and structure sketcher, not a publication tool.

## 4. RDKit.js drawing (MolDraw2D)

- The code is in `Code/GraphMol/MolDraw2D/`: `MolDraw2D.cpp` (base), `MolDraw2DSVG.cpp`, `MolDraw2DJS.cpp` (canvas), `DrawMol.cpp` (layout of one molecule: bonds, labels, wedges, annotations), `DrawText*.cpp` (FreeType for SVG/JS, or the non-FT fallback) and `MolDraw2DHelpers.h` (the `MolDrawOptions` struct).
- **Options** are passed as JSON to `get_svg_with_highlights(json)`, `draw_to_canvas_with_highlights`, or `get_svg` with details. They are parsed in `MolDrawOptionsJSONParsers.cpp`. Useful keys: `width`, `height`, `bondLineWidth`, `fixedBondLength`, `addStereoAnnotation` (CIP labels), `addAtomIndices`, `explicitMethyl`, `legend`, `atomColourPalette`, `backgroundColour`, `clearBackground`, `highlightAtoms`, `highlightBonds`, `highlightAtomColors`, `comicMode`, `noFreetype`, `kekulize`, `wedgeBonds`, `useMolBlockWedging`, `prepareMolsBeforeDrawing`.
- **SVG output.** Every bond and atom glyph carries `class='bond-N atom-i atom-j'`. This lets Lone Pair map an SVG back to atoms. Text is drawn as paths, so nothing in the SVG is selectable or editable as text. An A6 SVG is 11.7 KB from RDKit and 3.3 KB from OCL.
- **`prepareMolsBeforeDrawing`** (default true) kekulizes the molecule, adds chiral Hs and wedges it. If the molecule has no coordinates, **every** `get_svg` call computes new 2D coordinates (see A20 timings below).

## 5. Chemistry handling

| Topic | OpenChemLib | RDKit |
|---|---|---|
| **Implicit H** | It never stores H counts. They are derived from valence (`getImplicitHydrogens`, `getAllHydrogens`). Explicit H atoms sort after heavy atoms (`getAtoms()` vs `getAllAtoms()`). | It stores `impHs` and `noImplicit` per atom. `get_mol` adds no H. `add_hs`/`remove_hs` are separate calls, and `get_molblock` writes heavy atoms only. |
| **Aromaticity** | Aromatic only when a ring's π system really delocalizes (6-ring and 5-ring heteroaromatics). Caffeine's pyrimidinedione ring is **not** aromatic. SMILES output therefore mixes cases: `C[n]1c(C(N(C)C(N2C)=O)=O)c2nc1`. | The RDKit model (Hückel 4n+2 over fused systems, with exocyclic C=O counted). Caffeine is fully aromatic: `Cn1c(=O)c2c(ncn2C)n(C)c1=O`. MDL and simple models exist in C++ (`MolOps::setAromaticity`) but are not exposed in JS. |
| **Kekulization failure** | Lenient. `AromaticityResolver` assigns radicals when it cannot place double bonds: `c1cccc1` → `[CH]1C=CC=C1`, and `c1ccc[nH]c1` → `[CH]1C=CNC=C1`. No error is raised. | Strict. `c1cccc1`, `n1cccc1` and `c1ccc[nH]c1` all return `null` ("Can't kekulize mol"). `get_mol(s, '{"kekulize":false}')` or `'{"sanitize":false}'` gets around this (both return `c1cccc1` unchanged, verified). |
| **Hypervalent atoms** | Accepted if within `getMaxValence`. `CS(=O)(=O)C` and `F[Cl](F)F` are accepted, and so is the nonsense `C[Si](C)(C)(C)(C)C`. | Uses a valence table. Sulfone is accepted. `F[Cl](F)F` (ClF3, a real compound) and hexavalent Si are both **rejected**. `C[N](=O)=O` is normalised to `C[N+](=O)[O-]` (OCL does the same). |
| **Radicals** | `setAtomRadical` (S, D or T states). A `[CH3]` read from SMILES gets a doublet. | `nRad` per atom. `[CH3]` gives 1 radical electron. |
| **Isotopes** | `setAtomMass`. `MolecularFormula.formula` **drops the isotope** (`[13CH4]` → `CH4`), but its weights are right (17.035). | `isotope` per atom. Masses are right. JS has no formula call to show the label. |
| **Stereo** | Parity is computed from coordinates plus up/down bonds (`Canonizer`). ESR groups are first-class. Molfile chiral flag 0 means "racemic" (see pitfalls). | Tags come from SMILES `@`/`@@` or molblock wedges. The new CIPLabeler is used, and `"?"` is shown for possible but unspecified centers (the glucose anomeric C in A18). |
| **Mass tables** | `relativeWeight` uses H = 1.00794. `getMolweight()` returns a **rounded integer**, a trap. | `amw` uses IUPAC conventional weights (H = 1.008). |

## 6. Test runs

### 6.1 openchemlib-js own suite

The full `npm test` runs `npm run build` first. That needs a GWT 2.13 SDK at `config.json:gwt` and the Java sources, so it was not attempted. Instead, the prebuilt npm `dist/` (9.25.2, the same version as the repo HEAD) was copied into the clone, and the package `imports` map (`#lib` → `./dist/openchemlib.js`) was pointed at it. Two fixes were needed:

1. On Node 20.15, the native rolldown binding was missing (an npm optional-dependency bug). Installing `@rolldown/binding-darwin-arm64` fixed it.
2. Four test files failed on Node 20.15 with `process.getBuiltinModule is not a function`, because `Resources.registerFromNodejs` needs Node ≥ 20.16 or 22.3. Switching to Node 22.17 fixed this.

Results on Node 22 with the default 5 s timeout: 4 conformer and predictor tests timed out under 39 parallel workers. With `--testTimeout=60000`:

```
Test Files  39 passed (39)
     Tests  246 passed (246)     Duration 35 s
```

`tsc --noEmit` also passes. ESLint and Prettier were not run.

### 6.2 RDKit MinimalLib suite

`Code/MinimalLib/tests/tests.js` from **master** fails against the 2026.09.1 npm build at `test_add_chiral_hs` (`assert(molblock.includes("4  9  1  1"))`). The master tests expect newer behaviour than the release has. The same file from tag `Release_2026_09_1` was run with `require('../build/dist/RDKit_minimal.js')` repointed to the npm package. It also needed `GraphMol/test_data/compounds.smi` and two colchicine PNGs from the tag.

```
2026.09.1
Tests finished successfully        (73 test functions, all feature gates on: SubstructLibrary, rxn, MMPA, MCS, RGD, molzip; 6 s)
```

### 6.3 Lone Pair edge-case suite (section A plus C7, D1–D3)

To reproduce, run `ENGINES_DIR=<folder with node_modules> node docs/landscape/opensource/scripts/ocl_rdkit_suite.mjs --json out.json`. Each case runs in both engines.

- **Canonical SMILES:** each engine's own.
- **Mol RT:** write a V2000 molfile, read it back, and compare canonical SMILES.
- **Layout:** the smallest non-bonded atom–atom distance divided by the median bond length, from each engine's own 2D coordinates. Below about 0.5 means visible crowding, and 0 means atoms sit on top of each other.
- **Cross-engine:** the OCL SMILES, the OCL molfile read into RDKit, and the RDKit molfile read into OCL, all re-canonicalised by RDKit and compared with RDKit's own SMILES.

| ID | Input | OCL canonical SMILES | RDKit canonical SMILES | Formula (OCL / RD) | MW OCL / RD | Exact mass | CIP / EZ | Layout OCL / RD | Cross-engine |
|---|---|---|---|---|---|---|---|---|---|
| A1 | `CCO` | CCO | CCO | C2H6O | 46.07 / 46.07 | 46.0419 | – | 1.73 / 1.73 | agree |
| A2 | `c1ccccc1` | c1ccccc1 | c1ccccc1 | C6H6 | 78.11 | 78.0470 | – | 1.73 / 1.73 | agree |
| A3 | `C1=CC=CC=C1` | c1ccccc1 (= A2) | c1ccccc1 (= A2) | C6H6 | 78.11 | 78.0470 | – | ok | agree |
| A4 | naphthalene | c1ccc(cccc2)c2c1 | c1ccc2ccccc2c1 | C10H8 | 128.17 | 128.0626 | – | ok | agree |
| A5 | `c1cc[nH]c1` | c1c[nH]cc1 | c1cc[nH]c1 | C4H5N | 67.09 | 67.0422 | – | 1.62 / 1.62 | agree, [nH] kept |
| A6 | L-Ala | C[C@@H](C(O)=O)N | C[C@H](N)C(=O)O | C3H7NO2 | 89.09 | 89.0477 | S / S | ok | **DISAGREE: RD molfile → OCL loses stereo** |
| A7a | `F/C=C/F` | F/C=C/F | F/C=C/F | C2H2F2 | 64.03 | 64.0125 | E / E | ok | agree |
| A7b | `F/C=C\F` | F/C=C\F | F/C=C\F | C2H2F2 | 64.03 | 64.0125 | Z / Z | ok | agree |
| A8 | `[NH4+].[Cl-]` | [NH4+].[Cl-] | [Cl-].[NH4+] | **H4NCl** / ClH4N | 53.49 | 53.0032 | – | – | agree, 2 fragments, charges kept |
| A9 | nitro | C[N+]([O-])=O | C[N+](=O)[O-] | CH3NO2 | 61.04 | 61.0164 | – | ok | agree, charge-separated kept |
| A10 | `CS(=O)(=O)C` | CS(C)(=O)=O | CS(C)(=O)=O | C2H6O2S | **94.13 / 94.14** | 94.0088 | – | 1.00 / 1.41 | agree, no valence error |
| A11 | `[13CH4]` | [13CH4] | [13CH4] | **CH4** / H4[13C] | 17.04 | 17.0347 | – | – | agree |
| A12 | `[CH3]` | [CH3] | [CH3] | CH3 | **15.03 / 15.04** | 15.0235 | 1 radical each | – | agree |
| A13 | `C1CC1`, `C1CCCCCCCCCCC1` | same as input | same as input | C3H6, C12H24 | 42.08, 168.32 | ok | – | 12-ring 1.73 / 1.93 | agree |
| A14 | cubane | C12C3C4C5C3C1C5C24 | C12C3C4C1C1C2C3C41 | C8H8 | 104.15 | 104.0626 | – | **0.67** / 1.41 | agree |
| A15 | ferrocene (ionic) | [cH-]1cccc1.[cH-]1cccc1.[Fe+2] | [Fe+2].c1cc[cH-]c1.c1cc[cH-]c1 | C10H10Fe | 186.03 | 186.0132 | – | 1.40 / **0.72** | agree, accepted |
| A16 | aspirin `>>` AcOH | CC(Oc1ccccc1C(O)=O)=O>>CC(O)=O | parsed by `get_rxn`, SVG 15 KB | – | – | – | – | – | both parse 1 reactant, 1 product |
| A17 | `CC1=CC=CC=C1`, `Cc1ccccc1` | Cc1ccccc1 for both | Cc1ccccc1 for both | C7H8 | 92.14 | 92.0626 | – | ok | stable in both |
| A18 | glucose | OC[C@H]([C@H]([C@@H]([C@H]1O)O)O)OC1O | OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O | C6H12O6 | 180.16 | 180.0634 | 2R 6R 8S 10S / same **+ 4?** | ok | agree, all 4 centers kept |
| A19 | `xyz`, `C1CC` | throws `unknown element label`, `dangling ring closure: 1; position:4` | `null`, no message | – | – | – | – | – | both reject; only OCL says why |
| A20 | 40-residue peptide, 302 heavy atoms | 708 chars | 697 chars | C202H313N45O55 | **4251.97 / 4251.99** | 4249.3079 | 36 S / 36 S | 1.00 / **0.00** | agree |
| D1–D3 | caffeine | `C[n]1c(C(N(C)C(N2C)=O)=O)c2nc1` | `Cn1c(=O)c2c(ncn2C)n(C)c1=O` | C8H10N4O2 ✓ | 194.19 ✓ | 194.0804 ✓ | – | 1.62 / 1.62 | agree as structures |
| C7 | InChIKey of A6 | **not available** | `QNAYBMKLOCPYGJ-REOHCLBHSA-N` ✓ | | | | | | |

The molfile round trip within each engine returned the same canonical SMILES for every case in both engines.

Extra probes (the `extras` block at the end of the script):

| Probe | OCL | RDKit |
|---|---|---|
| `c1cccc1`, `n1cccc1`, `c1ccc[nH]c1` (unkekulizable) | accepted as radicals `[CH]1...` | rejected (`null`) |
| `F[Cl](F)F` | accepted | rejected |
| `C[Si](C)(C)(C)(C)C` | accepted | rejected |
| RDKit V2000 molblock of A6 read by OCL | `CC(C(O)=O)N` (ESR type And). With the chiral flag set to 1: `C[C@@H](C(O)=O)N` | – |
| y-axis | internal y of the N in A6 = **+1.5**, molfile y = **−1.5**. Internal y points down and is flipped on molfile IO (`MolfileParser.java:308` `addAtom(x, -y, -z)`) | molfile y points up, the same as the file |

**A20 timing.** The machine was loaded by parallel jobs, so the ranges below come from three runs.

| Step | OCL | RDKit |
|---|---|---|
| Parse SMILES | 6 ms (`noCoordinates`) | 6–28 ms |
| 2D coordinates | 0.3–2.2 s (inside `fromSmiles`) | 1.2–2.0 s native, 1.5–4.0 s with CoordGen |
| SVG, coordinates already present | 0.1–0.8 s | 0.02–0.18 s |
| Naive path (`get_molblock` + `get_svg` on a mol without coordinates; each one lays out again) | – | 2.5–9.5 s |
| Layout result | clean (0 atom pairs closer than 0.4 Å) | **native depictor: 156 atom pairs overlapping** (63 of 302 atoms share exact coordinates). CoordGen: clean. |
| First call in process (cold) | 0.8–3.6 s for A1 (GWT init) | 0.15–0.7 s (WASM init) |

### 6.4 Disagreements and who is right

1. **A6 cross-engine stereo (RDKit molblock read by OCL).** RDKit writes the V2000 chiral flag as 0. OCL reads flag 0 with wedges as "racemic / relative" (ESR And group), and its isomeric SMILES then drops the center. *OCL follows the MDL meaning of the flag. RDKit ignores the flag on read and does not set it on write.* In practice this is a real data-loss path. Lone Pair reads any molfile with `OCL.Molecule.fromMolfile` (`src/app.js:1047`), so a molfile from RDKit, and many other tools, will lose absolute stereo unless the flag is handled. OCL's Java `MolfileParser.setAssumeChiralTrue` exists, but it is not exposed in the JS `FromMolfileOptions`.
2. **Caffeine aromaticity (D1).** OCL leaves the pyrimidinedione ring non-aromatic. RDKit makes both rings aromatic. Both are internally consistent, and the structures agree after re-canonicalisation. RDKit matches the Daylight/PubChem convention that most other tools expect. OCL's choice is more defensible chemically, but it will affect aromatic SMARTS hits and "aromatic ring" counts.
3. **Unkekulizable aromatic input.** OCL silently produces radicals. RDKit refuses. *RDKit is right*: the test suite's A19 philosophy is "a clear error". With OCL, Lone Pair should detect the radicals that `fromSmiles` invents and warn.
4. **Hypervalent halogens and Si.** RDKit wrongly rejects ClF3, a real molecule. OCL wrongly accepts neutral hexavalent Si. Neither engine is right in both cases.
5. **Formula strings.** OCL drops isotopes (`[13CH4]` → `CH4`), which is wrong for a label. It also does not follow Hill order when there is no carbon (`H4NCl` instead of `ClH4N`). RDKit JS has no formula function at all, so the RDKit column comes from the script's own Hill code built on `get_json()`.
6. **Average MW, in the second decimal place.** This comes from different weight tables. With IUPAC conventional weights (H 1.008, S 32.06), dimethyl sulfone is 94.13, so *OCL is right* there. The A20 peptide is 4251.99, so *RDKit is right* there. Methyl radical: 15.035 either way, within rounding. Exact masses agree to 4 decimals everywhere.
7. **Layout.** For cubane, OCL crowds atoms (0.67 bond lengths) and RDKit is clean. For ionic ferrocene, RDKit crowds the fragments (0.72) and OCL is clean. For the 300-atom peptide, *RDKit's default depictor collapses atoms onto each other*, while OCL and RDKit+CoordGen are clean.
8. **Error reporting (A19).** Both reject. OCL gives a message with a position. RDKit JS returns `null` unless `set_log_capture` is used.
9. **A18 anomeric carbon.** RDKit marks it `?` (possible but unspecified). OCL says nothing. *RDKit is more informative.* Both are correct about the four specified centers (D-glucose: C2 R, C3 S, C4 S, C5 R).

## 7. License, maintenance, pitfalls

| | OpenChemLib (Java) | openchemlib-js | RDKit |
|---|---|---|---|
| License | BSD-3-Clause (Actelion/Idorsia copyright, `LICENSE`). GitHub shows it as "NOASSERTION" because of the custom header. | BSD-3-Clause | BSD-3-Clause |
| Activity (GitHub API, 2026-11-03) | last push today; 68 commits in the last 90 days; 15 open issues | last push today; 7 commits in 90 days, but monthly releases (9.25.0 on Aug 14, 9.25.1 on Oct 5, 9.25.2 on Oct 27); 28 open issues | last push today; ≥100 commits in 90 days; releases twice a year (2026.09.1 on Oct 3) |
| Maintainers | Thomas Sander (Idorsia), effectively a single maintainer | Zakodium / cheminfo (Michaël Zasso, Luc Patiny) | Greg Landrum plus a large community; MinimalLib mainly Paolo Tosco |

**Pitfalls**

- **The y-axis.** OCL's internal coordinates point down, like the screen. Molfiles point up, and OCL flips y in `MolfileParser` and `MolfileCreator`. Feed OCL screen coordinates directly. Never negate them (REVIEW.md item 14). RDKit coordinates are molfile-style, with y up, so a canvas renderer must negate y when it reads RDKit coordinates.
- **Coordinate units.** OCL's average bond length is about 1.0 (`getAverageBondLength`; SMILES-invented coordinates use 1.0). RDKit uses 1.5 Å. Scale before you mix coordinates from the two engines.
- **Chiral flag.** See 6.4 (1). Write flag 1 when stereo is absolute, and on import treat flag 0 with wedges as absolute unless the user says otherwise.
- **`getMolweight()` is an integer.** Use `getMolecularFormula().relativeWeight`.
- **Implicit H.** OCL drops explicit H atoms into "all atoms" after `ensureHelperArrays`, so atom indices change if you add H after building. RDKit `get_molblock` omits H unless you call `add_hs` first.
- **Kekulization.** RDKit's `get_mol` returns `null` for aromatic SMILES it cannot kekulize. Retry with `{"kekulize":false}` or `{"sanitize":false}` to show a partial structure with a warning.
- **RDKit memory.** Each `get_mol` allocates on the WASM heap. Wrap calls in `try/finally { mol.delete() }`.
- **RDKit coordinates and SVG.** If a mol has no coordinates, each `get_svg` or `get_molblock` lays it out again (seconds for large molecules). Call `set_new_coords()` once, and use `prefer_coordgen(true)` for macrocycles, peptides and large molecules.
- **OCL on Node.** `Resources.registerFromNodejs` needs Node ≥ 20.16. Under parallel tests, the conformer and MMFF tests exceed 5 s.
- **RDKit master tests vs npm.** The tests on master go ahead of the npm release. Pin to the release tag.

---

## Lessons for Lone Pair

1. **Keep OCL as the engine.** It is a third of RDKit's size (342 KB vs 2.4 MB gzip), it loads synchronously (good for a single offline file), it lays out large molecules cleanly, and it already provides MMFF and conformers. RDKit adds InChI (Lone Pair already has `inchi-js`), a Daylight-style aromaticity model, strict sanitization and better fingerprints. That is not enough to justify a 7 MB WASM inside one HTML file.
2. **Fix the chiral-flag import hole.** RDKit-written molfiles (and others with flag 0) lose absolute stereo through `OCL.Molecule.fromMolfile` in `src/app.js:1047`. Either set the flag to 1 in the counts line before parsing when wedges are present, or convert ESR And groups back to Abs, and tell the user. Add a test that reads `RDKit.get_mol('C[C@H](N)C(=O)O').get_molblock()` and expects (S). Also confirm that Lone Pair's own `toMolfile()` export keeps writing flag 1, as OCL does now.
3. **Warn on invented radicals.** After `Molecule.fromSmiles`, compare the radical count against the input. If the input had no radicals and OCL created some, show the A19-style error ("aromatic ring could not be kekulized"), not a silent diradical.
4. **Don't trust OCL's formula string for isotopes or non-carbon Hill order.** Build the displayed formula from atoms, with isotope labels (¹³C), as the script's `hill()` does.
5. **Keep the y-axis rule written down, with a test.** OCL is y-down, molfile and RDKit are y-up. The item-14 regression test is the right guard. Add a second guard: if RDKit is ever used for a cross-check, negate y when reading its coordinates.
6. **Use RDKit (or Open Babel) as an offline oracle in CI, not in the bundle.** The suite script shows how cheap a two-engine diff is: 25 cases in seconds. It caught the stereo flag issue and two layout weaknesses. Run it in `tests/` against the bundled OCL version (9.25.1 today; the npm latest is 9.25.2).
7. **For big molecules, time layout, not parsing.** Both engines parse a 300-atom peptide in milliseconds. 2D layout takes 0.3–2 s in OCL. If A20 matters, run `inventCoordinates` in a worker, or reuse the coordinates OCL already invented in `fromSmiles` and never lay out twice.
8. **Cubane-type cages crowd atoms in OCL** (0.67 bond lengths). A small cage-template list (cubane, adamantane, norbornane), applied before `inventCoordinates`, would fix the A14 case. RDKit's templates handle it.
9. **Report aromaticity as a model, not a fact.** Caffeine shows one aromatic ring in OCL and two in RDKit. If Lone Pair shows "aromatic rings" or exports aromatic SMILES, say which model it uses, or offer Kekulé SMILES for interchange (OCL JS does not expose Java's `IsomericSmilesCreator.MODE_KEKULIZED_OUTPUT`, so this needs a small wrapper or Lone Pair's own writer).
10. **The OCL CanvasEditor is not a model for Lone Pair's UI.** It has no scheme canvas, arrows or text styling, and it renders to canvas without SVG. The parts worth borrowing are its tool set (the ESR tool, atom mapper, query-feature dialogs) and the fact that toolbar and editor share one depictor with `toSVG`.
