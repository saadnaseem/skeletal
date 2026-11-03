# Ketcher and Indigo (EPAM)

Studied 3 November 2026. Sources were shallow clones of `epam/ketcher` (master at `cca4ebd`, packages versioned `3.21.0-rc.1`) and `epam/Indigo` (master at `87f87e5`), plus the PyPI wheel `epam.indigo 1.46.0` and a clone of the `indigo-1.46.0` tag for its integration tests. In this document, paths that start with `packages/` are in the Ketcher repo, and paths that start with `core/` or `api/` are in the Indigo repo.

Ketcher is the editor, written in TypeScript and React. Indigo is the C++ cheminformatics toolkit behind it. Ketcher parses and writes only KET (its own JSON) and molfile V2000 itself. Everything else (SMILES, V3000, CDX/CDXML, InChI, layout, clean-up, aromatize, CIP, properties) goes to Indigo, either as a WASM build in a Web Worker ("standalone") or over HTTP to the Indigo service ("remote").

Ketcher keeps an unusually good internal knowledge base for AI agents and contributors, in `.memory-bank/` (`architecture.md`, `modules/editor-engine.md`, `modules/operations-history.md`, `modules/rendering.md`, `modules/serialization.md`, `formats/ket-2.0-specification.md`, `invariants.md`). It is the fastest way into the code, and the descriptions below were checked against the source.

---

## 1. Ketcher: how it is built

### 1.1 Monorepo layout

An npm-workspaces monorepo (root `package.json`, `"workspaces"`). It needs Node 24.20 or later (the `engines` field), because Jest transformers such as `packages/ketcher-core/textFileTransformer.ts` rely on Node's built-in TypeScript type stripping.

| Package | Role | Key entry points |
| --- | --- | --- |
| `packages/ketcher-core` | Domain model, editor engine for both modes, both renderers, serializers, StructService interface, remote HTTP service. No React. | `src/index.ts`, `src/application/ketcher.ts` (public facade), `src/application/ketcherBuilder.ts` |
| `packages/ketcher-react` | React UI for the small-molecule ("micro") editor: toolbars, dialogs, Redux store, hotkeys, the tool classes | `src/Editor.tsx`, `src/MicromoleculesEditor.tsx`, `src/script/editor/Editor.ts`, `src/script/ui/` |
| `packages/ketcher-macromolecules` | React + Redux Toolkit + MUI UI for the peptide/RNA/DNA ("macro") editor; lazily imported by ketcher-react | `src/Editor.tsx`, `src/state/common/editorSlice.ts` |
| `packages/ketcher-standalone` | Wraps the `indigo-ketcher` WASM in a Web Worker and registers it as the StructService | `src/infrastructure/services/struct/standaloneStructService.ts`, `indigoWorker.ts` |
| `example/`, `example-ssr/`, `demo/` | Host apps (Vite for dev, `react-app-rewired` for build) | `example/src/App.tsx` |
| `ketcher-autotests/` | Playwright end-to-end suite | |

### 1.2 Tech stack

- **Language:** TypeScript throughout. The micro editor (`packages/ketcher-react/src/script/`) is older code ported from JavaScript.
- **UI:** React 18/19 (`peerDependencies`), MUI 5, Less modules.
- **State:** two layers. The chemistry lives in mutable domain objects (`Struct`, `DrawingEntitiesManager`). UI state lives in Redux: classic `redux` + `redux-thunk` in ketcher-react (`src/script/ui/state/`), Redux Toolkit in ketcher-macromolecules.
- **Events:** the small `subscription` npm package (`Subscription`, `PipelineSubscription`) in `packages/ketcher-react/src/script/editor/Editor.ts` (about line 366: `elementEdit`, `bondEdit`, `zoomChanged`, `rgroupEdit` and so on). The macro editor builds its own event bus per instance in `packages/ketcher-core/src/application/editor/editorEvents.ts` (about 74 typed subscriptions, according to `.memory-bank/modules/editor-engine.md`).
- **Rendering:** Raphael 2.3 (SVG) for the micro editor, D3 v7 (SVG) for the macro editor. No canvas. The stated plan in `.memory-bank/modules/rendering.md` is to retire Raphael for D3.
- **Build:** Rollup for each package (`packages/ketcher-core/rollup.config.mjs`, `packages/ketcher-react/rollup.config.mjs`), `tsc-alias`, Ajv for KET schema validation (compiled ahead of time by `packages/ketcher-core/scripts/compile-ket-schema.cjs` into `src/domain/serializers/ket/compiledSchema`). Tests use Jest and Testing Library, plus Playwright for E2E.
- **Chemistry backend:** `indigo-ketcher@1.49.0-rc.1` (npm), built from Indigo's `api/wasm/indigo-ketcher/`.

### 1.3 Data model (micro mode)

`packages/ketcher-core/src/domain/entities/struct.ts`, `class Struct`, holds everything in `Pool<T>` maps (`pool.ts`: `class Pool extends Map<number, T>` with auto-increment ids):

- `atoms: Pool<Atom>`, `bonds: Pool<Bond>`, `halfBonds: Pool<HalfBond>`, `loops: Pool<Loop>`
- `sgroups: Pool<SGroup>` plus `sGroupForest: SGroupForest` (nesting)
- `frags: Pool<Fragment>` (connected components; carry the stereo flag and enhanced-stereo groups, `fragment.ts`, `enum StereoFlag`)
- `rgroups: Pool<RGroup>`, `rgroupAttachmentPoints`, `attachmentGroups`
- `rxnArrows`, `rxnPluses`, `multitailArrows`, `isReaction`
- `simpleObjects`, `texts`, `images`, `functionalGroups`, `highlights`

`Atom` (`atom.ts`, `interface AtomAttributes`) stores `label`, `charge`, `isotope`, `radical`, `explicitValence`, `hCount`, `implicitH`, `stereoLabel` (enhanced stereo, e.g. `abs`, `&1`, `or1`), `stereoParity`, `cip`, `aam` (atom mapping), `rglabel`, `atomList`, `pseudo`, `alias`, `queryProperties`, `pp` (position, `Vec2`, in model units of bond length 1). `Bond` (`bond.ts`) has `type` (`Bond.PATTERN.TYPE`: SINGLE 1, DOUBLE 2, TRIPLE 3, AROMATIC 4, the query types 5 to 8, DATIVE 9, HYDROGEN 10, HAPTIC), `stereo` (`Bond.PATTERN.STEREO`: UP 1, CIS_TRANS 3, EITHER 4, DOWN 6, the molfile codes), `topology`, `reactingCenterStatus`, `cip`, and the ids of its two half-bonds `hb1`/`hb2`.

The half-bond is the key structure for rendering. `HalfBond` (`halfBond.ts`) is one direction of a bond, with `dir`, `norm`, `ang`, `p`, `loop`, and the sines and cosines to its left and right neighbours (`leftSin`, `rightCos`…). `Struct` rebuilds them and the ring list (`Loop`: `hbs`, `dblBonds`, `aromatic`, `convex`) after edits. Ring finding, double-bond side choice and bond trimming all read this cache.

`SGroup` (`sgroup.ts`) uses molfile types (`SGroup.TYPES`: SUP, MUL, SRU, MON, MER, COP, CRO, MOD, GRA, COM, MIX, FOR, DAT, ANY, GEN, plus queryComponent). Superatom classes (`SUPERATOM_CLASS`) mark functional groups, salts and monomers. Abbreviations are expanded or contracted S-groups, not separate entities.

**Macro mode** has a separate model: `DrawingEntitiesManager.ts` with `BaseMonomer` subclasses (`Peptide.ts`, `Sugar.ts`, `Phosphate.ts`, `RNABase.ts`, `Chem.ts`, `AmbiguousMonomer.ts`, `UnresolvedMonomer.ts`), `PolymerBond.ts`, `HydrogenBond.ts`, `MonomerToAtomBond.ts`, and also `CoreAtom`/`CoreBond`, so small molecules can sit next to monomers. `application/editor/MacromoleculesConverter.ts` converts between `Struct` and the drawing entities when the user switches modes. In `Struct`, monomers appear as `MonomerMicromolecule` S-groups.

### 1.4 Editor architecture

Two controllers that never run at once (a global flag picks which one gets DOM events):

- **Micro:** `packages/ketcher-react/src/script/editor/Editor.ts`, `class Editor implements KetcherEditor`. It owns the Raphael `Render`, the `ReStruct` view-model, the selection, the active tool and the undo stack (`historyStack: Action[]`, `historyPtr`, `HISTORY_SIZE = 32`, about lines 142 and 283).
- **Macro:** `packages/ketcher-core/src/application/editor/Editor.ts` (`CoreEditor`), with modes in `application/editor/modes/` (`FlexMode`, `SnakeMode`, `SequenceMode`; Sequence is the default) and `EditorHistory.ts`.

**Tools** (micro): one class per tool in `packages/ketcher-react/src/script/editor/tool/`: `atom.ts`, `bond.ts`, `chain.ts`, `template.ts`, `eraser.ts`, `select/`, `sgroup.ts`, `rgroupatom.ts`, `rgroupfragment.ts`, `apoint.ts`, `arrow/`, `reactionplus.ts`, `reactionmap.ts`, `charge.ts`, `rotate.ts`, `paste.ts`, `text.ts`, `simpleobject.ts`, `enhanced-stereo.ts`, `hapticBondTool.ts`, `create-monomer.ts`. Each implements `mousedown`/`mousemove`/`mouseup`/`click`/`dblclick` from the `Tool` interface (`Tool.ts`). Hit testing is `editor.findItem(event, types)` via `shared/closest.ts`.

**Actions and operations** (micro), in `packages/ketcher-core/src/application/editor/`:

- `operations/BaseOperation.ts`: every change is a `BaseOperation` with `type`, `priority` and a declared inverse class. `perform(restruct)` runs `execute`, marks the changed atoms and bonds dirty in `ReStruct`, and **returns the inverse operation**. That return value is the undo mechanism. There are about 90 types (`operations/OperationType.ts`), in subfolders `atom/`, `bond/`, `sgroup/`, `fragment.ts`, `rgroup/`, `rxn/`, `Text/`, `image/`, `multitailArrow/`, `stereoFlag/`.
- `actions/action.ts`, `class Action`: a list of operations. `perform()` sorts them by priority (bond-add before atom-delete, S-group hierarchy last), performs each, and collects the inverses into a new `Action`.
- `actions/*.ts`: factory functions that build Actions, such as `fromAtomAddition`, `fromBondAddition`, `fromChain`, `fromTemplateOnBondAction`, `fromFragmentDeletion`, `fromPaste`, `fromSgroupAddition`, `fromRotate`, `fromAromaticTemplateOnBond` (`aromaticFusing.ts`), `fromAtomMerge`.
- History: `Editor.update(action)` pushes onto the stack and drops the redo tail. `undo()` performs the stored Action and **replaces that slot with the returned inverse**. The macro side uses `Command` (`domain/entities/Command.ts`), whose operations implement `execute` and `invert` themselves. `EditorHistoryAction.ts` puts macro Commands on the same 32-step stack, so undo works across mode switches.

**Event flow:** DOM event on the SVG → `Editor` event handlers → `tool.mousedown(event)` → `editor.findItem` → the tool builds an `Action` with an `actions/*` factory → `editor.update(action)` → history push plus `render.update()` → `ReStruct.update` redraws only the dirty items → the `change` subscription fires → Redux and the toolbar update. A `renderComplete` window event fires after a 250 ms debounce (`application/render/notifyRenderComplete.ts`).

### 1.5 Rendering (micro, Raphael)

`packages/ketcher-core/src/application/render/raphaelRender.ts` (`Render`: paper, viewBox, zoom) wraps `restruct/restruct.ts` (`ReStruct`). Each entity has a `Re*` wrapper (`reatom.ts`, `rebond.ts`, `reloop.ts`, `resgroup.ts`, `rerxnarrow.ts`, …) that owns a `visel` (Raphael paths plus bounding boxes). The update cycle in `ReStruct.update` is: recompute visible atoms → mark changed → clear their visels → rebuild half-bonds near changed atoms → re-find loops → `show` → clear marks. Z-order is a fixed layer map (background, selection plate, hovering, atoms, bond skeleton, warnings, data, indices). Primitive paths are in `render/draw.ts` (`bondSingleUp`, `bondSingleDown`, `bondDouble`, `bondAromatic`, `bondDative`, `bondHaptic`, `radicalBullet`, `bracket`, about 20 arrow shapes).

- **Label placement** (`restruct/reatom.ts`, `ReAtom.show`, about 1,900 lines). The element label is drawn first, and its bounding box (`rbb`) becomes the reference. The hydrogen count, isotope, charge, radical, explicit valence and atom-mapping number are then placed by adding to `leftMargin`/`rightMargin` around it (lines 628 to 730). `shouldHydrogenBeOnLeft()` (line 1614) puts H on the left when the only visible neighbour bond points right (`neighborDirX > 0`). For a lone atom it uses the element table's `leftH` flag (the H goes on the left for O, S, halogens and similar, giving `H2O`, `HCl`). `shouldDisplayHydrogen()` implements the `ShowHydrogenLabels` option (Off / Hetero / Terminal / TerminalAndHetero / On). Bonds are trimmed at labels by `getShiftedSegmentPosition()` (ray against the label box, `util.shiftRayBox`), called from `ReBond.bondRecalc()` (`rebond.ts` line 86).
- **Double-bond offset** (`rebond.ts`, `setDoubleBondShift()` line 1643, `selectDoubleBondShift()`, `selectDoubleBondShiftChain()`). A ring bond is shifted towards the inside of its ring (`-1` or `+1` by which half-bond has a loop). If the bond is in two rings, the ring that is a 6-ring, or has the higher double-bond density (`n2*d1` against `n1*d2`), wins. An acyclic bond counts substituents with `sin > 0.3` on each side and shifts towards the side with more. If both sides are equal it stays centred (`0`). `getBondDoublePath()` (line 1321) offsets both lines by `bondSpace/2 ± shift*bondSpace/2`, and shortens the inner line at each end by `getBondLineShift(cos, sin) = sin/(1-cos)` (line 1203), so the inner line meets the neighbouring bond's inner line at the angle bisector. Cis/trans "either" bonds (stereo 3) are drawn centred and crossed.
- **Wedges** (`getBondSingleUpPath`, `stereoUpBondGetCoordinates` line 1208): the wide end is not a fixed-width triangle. It is fitted to the bisector of the neighbouring bond at the wide end, with half-width `0.7·bondSpace/(cos(θ/2)+0.3)`, so the wedge edge meets the next bond cleanly. `getBondSingleDownPath` (line 1243) draws hashes with at least 4 lines, using `hashSpacingInPx × lineWidth` and recomputing the spacing on short bonds. Bold-stereo variants (`getBondSingleStereoBoldPath`, `getBondDoubleStereoBoldPath`) follow ACS "bold wedge next to bold bond" conventions. `findIncomingStereoUpBond` checks for chained wedges.
- **Aromatic circles** (`restruct/reloop.ts`): a loop counts as aromatic only when every bond in it has type AROMATIC (type 4). A circle at the ring centroid is drawn only when the ring is convex and `options.aromaticCircle` is on. Otherwise each aromatic bond is drawn as a solid line plus a dashed inner line (`getBondAromaticPath`, `draw.aromaticBondPaths`). The circle is skipped when the whole ring is inside a contracted S-group.
- **Units:** model coordinates use a bond length of 1. `Scale.modelToCanvas` (`domain/helpers/scale.ts`) multiplies by `options.microModeScale` (default 100 px). `application/render/options.ts` derives `bondSpace` (default `scale/7`, or `bondSpacing` as a percentage of `bondLength`), line width and `aromaticCircle: true` from the user settings.

The macro renderer (`application/render/renderers/`) uses D3. It has one renderer class per entity (`BaseMonomerRenderer` and its subclasses, `FlexModePolymerBondRenderer`, `SnakeModePolymerBondRenderer`, `sequence/` renderers) and a `RenderersManager` that a `Command` drives directly. Monomer shapes are `<symbol>` defs reused with `<use href>`.

### 1.6 Talking to Indigo

The interface is `packages/ketcher-core/src/domain/services/struct/structService.types.ts`. `StructService` has `info`, `convert`, `layout`, `clean`, `aromatize`, `dearomatize`, `calculateCip`, `automap`, `check`, `calculate`, `recognize` (Imago OCR, remote only), `getInChIKey`, `generateImageAsBase64`, `toggleExplicitHydrogens`, `calculateMacromoleculeProperties`. Calls are made with KET strings and options maps. `application/indigo.ts` (`class Indigo`) wraps it, serialising `Struct` to KET first.

- **Standalone:** `packages/ketcher-standalone/src/infrastructure/services/struct/standaloneStructService.ts` posts `{type: Command, data}` messages to a Web Worker (`indigoWorker.ts`), which loads `indigo-ketcher` (Emscripten, `MapStringString` options) and calls `indigo.convert`, `layout`, `clean2d`, `aromatize`, `calculateCip`, `check`, `calculate`, `render`. Results return asynchronously by message id. The npm package ships `indigo-ketcher-1.49.0-rc.1.wasm` at **11.4 MB** (7.3 MB in the `-norender` build without Cairo/FreeType), plus a 15 MB single-file JS build with the WASM inlined as base64.
- **Remote:** `packages/ketcher-core/src/infrastructure/services/struct/remoteStructService.ts` calls `POST {apiPath}/indigo/convert`, `/indigo/layout`, `/indigo/clean`, `/indigo/aromatize`, `/indigo/dearomatize`, `/indigo/calculate_cip`, `/indigo/automap`, `/indigo/check`, `/indigo/calculate`, `/indigo/render`, `/indigo/convert_explicit_hydrogens`, `/indigo/calculateMacroProperties`, and `imago/uploads` for OCR. The server is Indigo's `api/http/` (Python package `indigo_service`, with a `Dockerfile` and `docker-compose.yaml`).
- The WASM entry points are in Indigo's `api/wasm/indigo-ketcher/indigo-ketcher.cpp` (`EMSCRIPTEN_BINDINGS(module)`, line 1205): `version`, `convert`, `convert_explicit_hydrogens`, `aromatize`, `dearomatize`, `layout`, `clean2d`, `automap`, `check`, `calculateCip`, `calculate`, `pka`, `pkaValues`, `logp`, `molarRefractivity`, `calculateMacroProperties`, `render`, `reactionComponents`, `expand`.

### 1.7 File formats

`packages/ketcher-core/src/application/formatters/formatterFactory.ts` (`FormatterFactory.create`) chooses one of three strategies:

| Format | Who parses and writes | Where |
| --- | --- | --- |
| KET (v1 and v2 JSON, schema `domain/serializers/ket/schema.json`) | Ketcher | `domain/serializers/ket/ketSerializer.ts`, `toKet/*.ts`, `fromKet/*.ts`, spec in `.memory-bank/formats/ket-2.0-specification.md` |
| Molfile V2000 | Ketcher, unless the structure has query features, more than 999 atoms or bonds, or `dearomatize-on-load` is set, in which case Indigo | `domain/serializers/mol/molfile.ts` (`class Molfile`), `v2000.ts` (`parseAtomLine`, `parseBondLine`, `parsePropertyLines`), `parseSGroup.ts`, `molSerializer.ts` |
| SDF | Ketcher wrapper around Molfile | `domain/serializers/sdf/sdfSerializer.ts` |
| Molfile/Rxnfile V3000, RXN V2000, SMILES, CXSMILES, SMARTS, InChI, InChI AuxInfo, InChIKey, CML, CDXML, CDX (base64 and binary), RDF, FASTA, sequence (1- and 3-letter), IDT, Axolabs, HELM, BILN, monomer library | Indigo (`ServerFormatter` → `StructService.convert` → KET) | MIME types in `structService.types.ts` (`ChemicalMimeType`) |

On the Indigo side the parsers are in `core/indigo-core/molecule/src/`: `molfile_loader.cpp` (`molfile_loader_v2000.cpp`, `molfile_loader_v3000.cpp`), `molfile_saver.cpp`, `smiles_loader.cpp` (`smiles_loader_parsers.cpp`, `smiles_loader_stereo.cpp`), `smiles_saver.cpp`, `canonical_smiles_saver.cpp`, `molecule_cdxml_loader.cpp` (also reads binary CDX through `CDXReader`, constants in `molecule/CDXConstants.h`), `molecule_cdxml_saver.cpp`, `cml_loader.cpp`, `cml_saver.cpp`, `molecule_json_loader.cpp` and `molecule_json_saver.cpp` (KET), `ket_document_json_loader.cpp` (macro KET), `inchi_wrapper.cpp` (calls the bundled IUPAC InChI library), `sequence_loader.cpp`, `sequence_loader_helm.cpp`, `sequence_saver.cpp` (FASTA, IDT, HELM, AxoLabs), `molecule_name_parser.cpp` (simple name-to-structure), `molecule_auto_loader.cpp` (format sniffing). Ketcher has its own client-side sniffing in `formatters/identifyStructFormat.ts`.

### 1.8 Layout and clean-up

Ketcher has no 2D layout of its own. "Layout" (`ketcher.layout()` → `indigo.layout`) and "Clean" (`indigo.clean`) both call Indigo.

- **Layout:** `core/indigo-core/layout/src/molecule_layout.cpp` (`MoleculeLayout::make` → `_make` → `_makeLayout`, through `Metalayout` for several fragments and reactions). The graph work is in `MoleculeLayoutGraph`. It splits the graph into biconnected components (`BiconnectedDecomposer`), lays out each ring system, then attaches chains and substituents. Ring systems are first matched against template patterns (`_tryToFindPattern`, built from `layout/src/templates/molecules/*.mol` (36 cages and crowns) through `layout_patterns.inc`). The "smart" path (`molecule_layout_graph_smart.cpp`, `molecule_layout_graph_assign_smart.cpp`, used when the `smart-layout` option is on) handles fused and bridged systems by smoothing ring segments (`_segment_smoothing`, `_do_segment_smoothing_gradient`). Macrocycles go to a lattice search (`molecule_layout_macrocycles.cpp`, `MoleculeLayoutMacrocyclesLattice`). Refinement removes crossings and overlaps (`molecule_layout_graph_refine.cpp`, `_attachCrossingEdges`). Other parts: reaction and pathway layout (`reaction_layout.cpp`, `pathway_layout.cpp`), S-group brackets (`sgroup_bracket_layout.cpp`), haptic ligands (`haptic_layout.cpp`), monomer sequences (`sequence_layout.cpp`). Options: `layout-orientation`, `layout-max-iterations`, `layout-preserve-existing`, `layout-horintervalfactor`, `smart-layout` (`api/c/indigo/src/indigo_options.cpp` about line 417). Selective layout of only the selected atoms is supported (`_optimizeSelectedPartPlacement`).
- **Clean 2D:** `core/indigo-core/layout/src/molecule_cleaner_2d.cpp` (`MoleculeCleaner2d`). It is an iterative energy minimisation that pushes bond lengths and angles towards ideal values while keeping topology and stereo. It does not re-lay-out from scratch.

### 1.9 Macromolecules mode

This is now the bulk of recent Ketcher work. There are three layouts (Flex, free placement; Snake, wrapped rows; Sequence, a text-like editor with a caret, sense and antisense strands). A monomer library ships as KET (`ketcher.updateMonomersLibrary`, `replaceMonomersLibrary`). RNA presets (sugar + base + phosphate) are supported, and a Monomer Creation Wizard turns a drawn small molecule into a monomer template. Indigo does HELM, FASTA, IDT and AxoLabs conversion, sequence layout, and macro properties (`calculateMacroProperties`: mass, extinction coefficient, pI, hydrophobicity). Code: `packages/ketcher-macromolecules/src/`, `packages/ketcher-core/src/application/editor/modes/`, `application/render/renderers/sequence/`, `domain/entities/monomer-chains/`.

### 1.10 Public API for embedding

```tsx
<Editor staticResourcesUrl={url} structServiceProvider={new StandaloneStructServiceProvider()}
        errorHandler={...} buttons={hidden} disabledFunctionality={...}
        onInit={(ketcher) => { window.ketcher = ketcher; }} />
```

(`example/src/App.tsx`; props in `packages/ketcher-react/src/MicromoleculesEditor.tsx`, `EditorProps`.) The `Ketcher` facade (`packages/ketcher-core/src/application/ketcher.ts`) offers `getSmiles(isExtended)`, `getExtendedSmiles`, `getMolfile('v2000'|'v3000')`, `getRxn`, `getKet`, `getSmarts`, `getCml`, `getSdf`, `getRdf`, `getCDXml`, `getCDX`, `getInchi`, `getInChIKey`, `getFasta`, `getSequence`, `getIdt`, `getAxoLabs`, `setMolecule`, `setHelm`, `addFragment`, `layout`, `aromatize`, `dearomatize`, `calculate`, `setZoom`, `setMode`, `setSettings`, `exportImage`, `generateImage`, `recognize`, and the monomer library methods. Most getters are `async` because they go through Indigo. Change events come through `ketcher.editor.subscribe('change', handler)` (`Editor.subscribe`, used at about line 3577 of `script/editor/Editor.ts`). Several instances can share a page (`ketcherProvider.ts`, keyed by `ketcherId`). The common embedding pattern is an iframe plus `postMessage`, as `example/` shows.

---

## 2. Indigo: how it is built

- **Layout:** C++17, CMake (`CMakeLists.txt`, `CMakePresets.json`). `core/indigo-core/` holds `common/` (base containers, math, I/O, the Lzw/gzip helpers), `graph/` (graph algorithms, cycle bases, biconnected decomposition, automorphism and the canonical ordering), `molecule/` (about 150 source files: model, aromaticity, stereo, CIP, InChI, formats, valence, standardise, tautomers, fingerprints, properties such as Crippen logP, TPSA and pKa), `reaction/` (rxn formats, AAM), `layout/`. `core/render2d/` is a Cairo renderer to PNG, SVG and PDF (`render_internal.cpp`: `_determineDoubleBondShift` line 327, `_prepareLabels` line 1367; `render_internal_bonds.cpp`: `_prepareDoubleBondCoords` line 486, `_bondBoldStereo`).
- **APIs:** a C API (`api/c/indigo/src/indigo*.cpp`, options in `indigo_options.cpp`) wrapped by Python (`api/python`), Java, .NET, R, the WASM build (`api/wasm/indigo-ketcher`) and the HTTP service (`api/http`). Bingo (`bingo/`) is a chemical search cartridge for PostgreSQL, Oracle and SQL Server, plus Bingo-Elastic.
- **Key molecule classes:** `BaseMolecule` (`molecule/src/base_molecule.cpp`), `Molecule`, `QueryMolecule`, `MoleculeStereocenters` (`molecule_stereocenters.cpp`), `MoleculeCisTrans`, `MoleculeCIPCalculator` (`molecule_cip_calculator.cpp`), `AromatizerBase` / `MoleculeAromatizer` (`molecule_arom.cpp`), `MoleculeDearomatizer` (`molecule_dearom.cpp`), `MoleculeGrossFormula`, `MoleculeMass`.
- **Tests:** `api/tests/integration/` runs Python scripts and compares their stdout with reference files in `ref/`, in 25 groups (`basic`, `formats`, `layout`, `stereo`, `cano`, `inchi`, `arom`, `calc`, `ketcher`, `rendering`, …). C++ unit tests are in `core/indigo-core/tests/` (GoogleTest). Runner: `api/tests/integration/test.py -p <patterns> -t <threads>`.

---

## 3. Tests run

### 3.1 ketcher-core and ketcher-react unit tests

Ketcher needs Node 24.20 or later, and the machine had Node 20.15 (default) and 22.17 (nvm). Two blockers were found and worked around:

1. Under Node 20, every suite failed to load with `SyntaxError: Cannot use import statement outside a module` in `textFileTransformer.ts` (the Jest transformer is TypeScript run directly by Node). **Fix:** Node 22.17 with `NODE_OPTIONS="--experimental-strip-types"`.
2. 66 suites then failed with `Cannot find module './compiledSchema'`. The Ajv-compiled KET validator is generated by `npm run ajv` (a `prebuild`/`prestart` hook), which a test-only run skips. **Fix:** run `npm run ajv` first.

Install: `npm ci --ignore-scripts` from the root took 64 s (4,123 packages).

| Suite | Command | Result | Time |
| --- | --- | --- | --- |
| ketcher-core | `npx jest` (after `npm run ajv`) | **122 suites passed, 3 skipped; 1,211 tests passed, 12 skipped, 0 failed** | 66 s |
| ketcher-react, first try | `npx jest` | 58 of 80 suites failed: `Cannot find module 'ketcher-core'` (it imports the built `dist/`) | 14 s |
| ketcher-react, after `npm run build` in ketcher-core (Rollup, 33 s) | `npx jest` | **80 suites passed; 601 tests passed, 1 skipped, 0 failed** | 44 s |

Not run: ketcher-macromolecules and ketcher-standalone unit tests, the type checks (`test:types`), lint, and the Playwright E2E suite (it needs the example app built and served).

### 3.2 Indigo integration tests (wheel 1.46.0)

The PyPI wheel `epam.indigo` is at **1.46.0** (24 August 2026), while Ketcher master pins `indigo-ketcher 1.49.0-rc.1`. To compare like with like, I cloned the `indigo-1.46.0` tag, symlinked the wheel's `indigo/lib/darwin-aarch64` into `api/python/indigo/lib`, and ran `test.py -p basic,formats,layout,stereo,cano,inchi,arom,calc -t 8` (the pattern also matched three `rendering` tests). This took 3 min 18 s on an Apple Silicon Mac (macOS 14.2, Python 3.13.5).

| Outcome | Count | Detail |
| --- | --- | --- |
| PASSED | 200 | |
| FAILED | 10 | Platform float and layout differences against references made on Linux x86-64: `basic/allenes.py` (a y coordinate mirrored, ±0.866), `formats/serialize_badmols.py` and `formats/rxn_to_cdxml.py` (last-digit rounding, 0.0884202 against 0.0884201), `formats/serialize_badrxns.py`, `formats/pathway.py`, `formats/pathway_ops.py` (KET coordinate drift), `layout/clean2d.py` (atom deltas 0.10 to 0.17 above the 0.01 tolerance), `layout/macrocycles.py` (deltas up to 1.73), `layout/selective_layout.py`, `layout/reaction_layout_and_clean2d.py` |
| ERROR | 6 | Missing Pillow in the venv (`ModuleNotFoundError: No module named 'PIL'`): `formats/cdxml.py`, `rendering/basic.py`, `rendering/render_layout.py`. An environment problem, not an Indigo bug |
| TODO | 1 | marked TODO upstream |

The layout failures matter for an editor builder. Indigo's layout and clean-up results depend on the platform's floating point, so the same input can give slightly different coordinates in WASM, on macOS arm64 and on Linux. Snapshot tests of coordinates need a tolerance.

### 3.3 Lone Pair edge-case suite against Indigo 1.46.0

Script: `docs/landscape/opensource/scripts/indigo_suite.py` (run with `indigo-venv/bin/python -I indigo_suite.py --json out.json`). For each case it loads the input with `loadMolecule` or `loadReaction`, records `canonicalSmiles()` (and the same after `aromatize()`), runs `layout()`, writes a molfile in V2000 and V3000 (`molfile-saving-mode`), reloads it and compares canonical SMILES, then records `grossFormula`, `molecularWeight`, `monoisotopicMass`, CIP (`addCIPStereoDescriptors` then KET `cip` fields), `IndigoInchi.getInchi`/`getInchiKey`, and a layout overlap metric: the smallest distance between two non-bonded atoms, in median bond lengths.

| ID | Input | Canonical SMILES | Molfile V2000/V3000 round trip | Formula | MW | Mono mass | CIP | InChIKey | Min contact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | `CCO` | `CCO` | same/same | C2 H6 O | 46.069 | 46.0419 | | LFQSCWFLJHTTHZ-UHFFFAOYSA-N | 1.73 |
| A2 | `c1ccccc1` | `c1ccccc1` | same/same | C6 H6 | 78.114 | 78.0470 | | UHOVQNZJYSORNB-UHFFFAOYSA-N | 1.73 |
| A3 | `C1=CC=CC=C1` | `C1C=CC=CC=1` (after aromatize: `c1ccccc1`) | same/same | C6 H6 | 78.114 | 78.0470 | | UHOVQNZJYSORNB-UHFFFAOYSA-N | 1.73 |
| A4 | `c1ccc2ccccc2c1` | `c1cccc2ccccc21` | same/same | C10 H8 | 128.174 | 128.0626 | | UFWIBTONFRDIAS-UHFFFAOYSA-N | 1.73 |
| A5 | `c1cc[nH]c1` | `c1ccc[nH]1` | same/same | C4 H5 N | 67.091 | 67.0422 | | KAESVJOAVNADME-UHFFFAOYSA-N | 1.62 |
| A6 | `C[C@H](N)C(=O)O` | `C[C@H](N)C(O)=O` | same/same | C3 H7 N O2 | 89.094 | 89.0477 | C2: S | QNAYBMKLOCPYGJ-REOHCLBHSA-N | 1.73 |
| A7a | `F/C=C/F` | `F/C=C/F` | same/same | C2 H2 F2 | 64.034 | 64.0125 | C2=C3: E | WFLOTYSKFUPZQB-OWOJBTEDSA-N | 1.73 |
| A7b | `F/C=C\F` | `F/C=C\F` | same/same | C2 H2 F2 | 64.034 | 64.0125 | C2=C3: Z | WFLOTYSKFUPZQB-UPHRSURJSA-N | 1.73 |
| A8 | `[NH4+].[Cl-]` | `[NH4+].[Cl-]` (2 components, N +1, Cl −1) | same/same | Cl H4 N | 53.489 | 53.0032 | | NLXLAEXVIDQMFP-UHFFFAOYSA-N | n/a |
| A9 | `C[N+](=O)[O-]` | `C[N+]([O-])=O` (kept charge-separated) | same/same | C H3 N O2 | 61.040 | 61.0164 | | LYGJENNIWJXYER-UHFFFAOYSA-N | 1.73 |
| A10 | `CS(=O)(=O)C` | `CS(C)(=O)=O` (no valence warning) | same/same | C2 H6 O2 S | 94.128 | 94.0089 | | HHVIBTZHLRERCL-UHFFFAOYSA-N | 1.41 |
| A11 | `[13CH4]` | `[13CH4]` (isotope 13) | same/same | C H4 | 17.0354 | 17.0347 | | VNWKTOKETHGBQD-OUBTZVSYSA-N | n/a |
| A12 | `[CH3]` | `[CH3]` (1 radical electron) | same/same | C H3 | 15.035 | 15.0235 | | WCYWZMWISLQXQU-UHFFFAOYSA-N | n/a |
| A13a | `C1CC1` | `C1CC1` | same/same | C3 H6 | 42.081 | 42.0470 | | LVZWSLJZHVFIQJ-UHFFFAOYSA-N | n/a |
| A13b | `C1CCCCC1` | `C1CCCCC1` | same/same | C6 H12 | 84.162 | 84.0939 | | XDTMQSROBMDMFD-UHFFFAOYSA-N | 1.73 |
| A13c | `C1CCCCCCCCCCC1` | `C1CCCCCCCCCCC1` | same/same | C12 H24 | 168.324 | 168.1878 | | DDTBPAQBQHZRDW-UHFFFAOYSA-N | 1.93 |
| A14 | `C12C3C4C1C5C2C3C45` | `C12C3C4C1C1C2C3C14` | same/same | C8 H8 | 104.152 | 104.0626 | | TXWRERCHRDBNLG-UHFFFAOYSA-N | **0.43** |
| A15 | `[Fe+2].c1cc[cH-]c1.c1cc[cH-]c1` | `[Fe+2].[cH-]1cccc1.[cH-]1cccc1` (3 components) | same/same | C10 H10 Fe | 186.035 | 186.0132 | | KTWOOEGAPBSYNW-UHFFFAOYSA-N | 1.62 |
| A16 | `CC(=O)Oc1ccccc1C(=O)O>>CC(=O)O` | `CC(=O)Oc1ccccc1C(O)=O>>CC(O)=O` (1 reactant → 1 product) | same/same (RXN) | | | | | | |
| A17a | `CC1=CC=CC=C1` | `CC1C=CC=CC=1` (after aromatize: `Cc1ccccc1`) | same/same | C7 H8 | 92.141 | 92.0626 | | YXFVVABEGXRONW-UHFFFAOYSA-N | 1.73 |
| A17b | `Cc1ccccc1` | `Cc1ccccc1` | same/same | C7 H8 | 92.141 | 92.0626 | | YXFVVABEGXRONW-UHFFFAOYSA-N | 1.73 |
| A18 | glucose | `OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O` | same/same | C6 H12 O6 | 180.156 | 180.0634 | C3 R, C7 R, C9 S, C11 S (= glucose C5 R, C2 R, C3 S, C4 S) | WQZGKKKJIJFFOK-GASJEMHNSA-N | 1.73 |
| A19a | `xyz` | error: `SMILES loader: 'x' specifier is allowed only for query molecules` | | | | | | | |
| A19b | `C1CC` | error: `SMILES loader: cycle 1 not closed` | | | | | | | |
| A20 | Ala₆₀ (`N[C@@H](C)C(=O)`×60 + `O`, 301 heavy atoms) | 900-character SMILES, all 60 centres kept | same/same | C180 H302 N60 O61 | 4282.755 | 4280.2374 | 60 × S | FQYOOMLMHBCLMO-UMDLTCKXSA-N | 1.73 |
| D1, D2 | caffeine `CN1C=NC2=C1C(=O)N(C(=O)N2C)C` | `CN1C(=O)C2=C(N=CN2C)N(C)C1=O` (after aromatize: `CN1C(=O)c2c([n]c[n]2C)N(C)C1=O`) | same/same | C8 H10 N4 O2 | 194.194 | **194.0804** | | RYYVLZVUVIJVGH-UHFFFAOYSA-N | 1.62 |
| C7 | InChIKey of A6 | `QNAYBMKLOCPYGJ-REOHCLBHSA-N`, matches the expected value | | | | | | | |
| D3 | CIP of A6 | S, matches the expected value | | | | | | | |

Layout took 0.0 to 2.0 ms per case (Ala₆₀: 2.0 ms; caffeine: 1.5 ms on its first call). All 24 loadable inputs survived both molfile round trips with the same canonical SMILES.

Findings:

- **Every expected value in A, C7 and D1 to D3 is met.** That includes the CIP labels, E/Z, isotope mass (A11 17.035), radical, charges, the hypervalent S, ferrocene as three ionic components, and a reaction. A19 inputs give clear error messages and no crash.
- **A3/A17: `canonicalSmiles()` does not normalise aromaticity.** Kekulé input gives `C1C=CC=CC=1` and aromatic input gives `c1ccccc1`. The test "same canonical SMILES for both" passes only after an explicit `aromatize()`. Ketcher calls aromatize as a separate step too. A Lone Pair comparison must normalise first.
- **Caffeine after `aromatize()` writes `[n]` in brackets** (`c2c([n]c[n]2C)`). Indigo treats the imidazole ring as aromatic and prints the pyridine-like `n` with explicit brackets. The result is valid but unusual, and other toolkits will not produce the same string.
- **Indigo's average-mass table is slightly different** (caffeine MW 194.194 against 194.19, ethanol 46.069). It uses IUPAC standard atomic weights to three decimals. The monoisotopic masses match the expected values exactly.
- **A14 cubane** lays out with a smallest non-bonded contact of 0.43 bond lengths. This is the usual flattened-cube picture, with crossing edges and atoms close together, not a perspective drawing. The 36 template molecules in `layout/src/templates/molecules/` do not include cubane.
- The 12-ring (A13c) is drawn as a lattice macrocycle with a minimum contact of 1.93, which is good.

---

## 4. License, maintenance and known issues

| | Ketcher | Indigo |
| --- | --- | --- |
| License | Apache-2.0 (`LICENSE`; `LICENSE-history`: v1 was AGPL-3.0, relicensed at v2) | Apache-2.0 |
| Owner | EPAM Systems (Life Sciences) | EPAM Systems |
| Created | Sep 2017 (GitHub) | Jun 2015 (GitHub; the code is older, from GGA Software) |
| Last commit | 3 Nov 2026 (the day of this study) | 3 Nov 2026 |
| Stars / forks | 930 / 262 | 415 / 135 |
| Open issues | 811 | 669 |
| Release cadence | A minor release about every 1 to 2 months, with patch releases for two lines at once: 3.11 and 3.12 (4 Mar 2026), 3.13 to 3.15 (23 Jun), 3.16 and 3.17 (13 Jul, patched 15 Jul and 31 Aug), 3.18.0 (2 Sep); 3.21 in rc | 1.37 to 1.40 (Feb 2026), 1.41 to 1.43 (May), 1.44 and 1.45 (Jul), 1.46.0 (24 Aug); 1.49 in rc |
| Packages | npm `ketcher-core`, `ketcher-react`, `ketcher-standalone`, `ketcher-macromolecules` | PyPI `epam.indigo`, Maven, NuGet, npm `indigo-ketcher`, plus the `api/http` service |

Both are very active and developed by a funded in-house team. Most issues are filed by EPAM QA staff as detailed reproduction tickets, which is why the open counts are high. Open issues relevant to building an editor (searched with `gh search issues`):

- Rendering polish that is still open: `epam/ketcher#7214` CIP labels overlap under the ACS style; `#4702` stereo labels overlap the structure; `#8037` attachment-point labels overlap bonds after layout; `#10645` the aromatic circle can't be an ellipse; `#10647` "up and bold" single, double and aromatic bonds are not implemented yet; `#1682` (open since 2022) the wavy "undefined stereo" bond is drawn plain instead of wedged-wavy.
- Undo: `#12213` undo does not cover the create-monomer operation; `#3922` the macro undo and redo buttons don't grey out. The shared 32-step history cap is hard-coded (`HISTORY_SIZE = 32; // put me to options`).
- Indigo stereo and format bugs: `epam/Indigo#366` stereo bonds flip when the stereo-centre type is applied (open since 2021); `#3939` no error for impossible wedge arrangements; `#3714` SMARTS export reverses stereo bonds; `#3970` CXSMILES data S-group bound to the wrong atoms; `#3580` the convert API returns extended SMILES when plain SMILES was asked for; `#3991` SMILES error messages cut off at `%`.
- Layout: `epam/Indigo#4022` and `#4023` (S-group bracket layout not computed), `#4006` (circular layout of bases).

Structural weaknesses an editor builder should know about:

1. **Weight:** the chemistry engine is 7.3 to 11.4 MB of WASM (15 MB as single-file JS), plus React, MUI, Redux, Raphael and D3. Every SMILES, InChI or CDXML export is an async round trip to a worker.
2. **Two editors, two renderers, two history models** (Raphael with Action, D3 with Command), bridged by a converter and a global "which editor is live" flag that the team itself calls a bad pattern.
3. **No in-JS chemistry:** without Indigo, Ketcher cannot aromatize, lay out, compute CIP or even read SMILES. If remote mode is down, most of the menus fail.
4. The micro editor is old JavaScript-style code (`ReAtom.show` is about 1,900 lines).

---

## 5. Lessons for Lone Pair

**Borrow:**

- **The half-bond cache.** Store each bond's two directions with `dir`, `norm`, the neighbour sines and cosines, and the ring (`loop`) id, and rebuild only around changed atoms. Double-bond side choice, inner-line trimming (`sin/(1-cos)`), wedge-end fitting and label clipping all become simple reads.
- **The double-bond side rule** (`selectDoubleBondShift`): prefer the ring, then the 6-ring, then the ring with more double bonds; for chains, count substituents with `sin > 0.3` on each side; centre when they are equal. It is short, it can be tested, and it matches ChemDraw closely.
- **Wedge wide ends fitted to the neighbour bisector** (`stereoUpBondGetCoordinates`) instead of a fixed-width triangle, and hashes with a minimum of 4 lines whose spacing is recomputed on short bonds.
- **Self-inverting operations:** each `perform()` returns its inverse, Actions sort their operations by priority, and undo swaps the stack slot for the inverse. Lone Pair could use this instead of whole-document snapshots if memory or speed becomes a problem with large drawings.
- **Aromatic-circle rule:** draw the circle only when every ring bond is aromatic and the ring is convex. Otherwise draw dashed inner lines.
- **Format routing:** a small factory that sends each format to the "local fast path" (KET and V2000 in JS) or the heavy engine, with explicit rules for when to escalate (query features, more than 999 atoms needs V3000, dearomatise-on-load).
- **The `.memory-bank/` pattern:** one owner file for each fact, invariants with ids, and features described without code names. It suits Lone Pair's docs/ folder and agent-assisted work.
- **The Indigo Python wheel as a test oracle.** It installs in seconds, and `indigo_suite.py` gives canonical SMILES, InChIKey, CIP and masses to compare Lone Pair's OpenChemLib output against.

**Avoid:**

- **Shipping Indigo WASM in the single file.** At 7 to 11 MB it would roughly quadruple or quintuple Lone Pair's 2.4 MB page, and OpenChemLib already covers SMILES, molfile, layout, CIP and InChI-like canonicalisation. Reach for Indigo only for things OCL lacks, through an optional lazy-loaded worker or as a test oracle.
- **Two parallel editing models.** Ketcher's micro/macro split doubled its renderers and history code. Keep a single model with a single history.
- **Comparing canonical SMILES without normalising aromaticity first** (A3/A17 above), and coordinate snapshot tests without tolerances (Indigo's own layout tests fail across platforms).
- **A hard-coded, small undo cap** (32 steps, shared across modes).
- **Letting labels and stereo annotations overlap bonds** (`#7214`, `#4702`, `#8037`). Ketcher places labels only relative to the atom's own label box. A final collision pass that moves CIP and attachment labels away from bonds would avoid the issues Ketcher still has open.

---

## Appendix: reproduction

```sh
S=<scratchpad>/oss
git clone --depth 1 https://github.com/epam/ketcher.git $S/ketcher
git clone --depth 1 https://github.com/epam/Indigo.git  $S/indigo
cd $S/ketcher && npm ci --ignore-scripts
cd packages/ketcher-core && npm run ajv && NODE_OPTIONS=--experimental-strip-types npx jest   # Node >= 22.6
NODE_OPTIONS=--experimental-strip-types npm run build
cd ../ketcher-react && NODE_OPTIONS=--experimental-strip-types npx jest

python3 -m venv indigo-venv && indigo-venv/bin/pip install epam.indigo   # 1.46.0
indigo-venv/bin/python -I docs/landscape/opensource/scripts/indigo_suite.py --json out.json

git clone --depth 1 --branch indigo-1.46.0 https://github.com/epam/Indigo.git $S/indigo-1.46.0
ln -s <venv>/lib/python3.13/site-packages/indigo/lib $S/indigo-1.46.0/api/python/indigo/lib
cd $S/indigo-1.46.0/api/tests/integration
<venv>/bin/python test.py -p basic,formats,layout,stereo,cano,inchi,arom,calc -t 8 -o out
```
