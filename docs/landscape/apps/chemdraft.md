# ChemDraft: source study and edge-case run (3 November 2026)

ChemDraft (chemdraft.ai) is a free, Apache-2.0 desktop chemical drawing app for macOS and Windows by Jeremiah Gassensmith. Source: [jgassens/ChemDraft](https://github.com/jgassens/ChemDraft), studied at commit `8c27d48` (version 1.1.0, released 2 November 2026). The optional NMR predictor lives in [jgassens/ChemDraft-NMR-Plugin](https://github.com/jgassens/ChemDraft-NMR-Plugin) (v0.2.0, commit `46db9cc`).

I did not install the DMG or run the desktop app. Everything below comes from reading the code, running the test suite, running the headless CLI and the MCP server, and loading the browser build. The suite script is [`../opensource/scripts/chemdraft_suite.mjs`](../opensource/scripts/chemdraft_suite.mjs).

## At a glance

| Question | Answer |
| --- | --- |
| Desktop shell | **Tauri 2** (Rust, `apps/desktop/src-tauri`, about 62,600 lines of Rust). Not Electron. WKWebView on macOS, WebView2 on Windows |
| Frontend | React 19 + Vite 7 + TypeScript, Zod schemas throughout |
| Code size | About 197,000 lines of non-test TypeScript and 196,000 lines of tests, in 1,135 files. `apps/desktop/src/MainWindow.tsx` alone is 33,251 lines and `documentWorkflow.ts` 21,535 |
| Canvas | SVG (`page-svg-surface`) drawn by React, with all bond and label geometry in `packages/layout-engine` |
| Chemistry | A custom-patched RDKit MinimalLib WASM (Release_2026_03_3, 8 patches), OpenChemLib 9.22, unpatched IsoSpec 2.3.5 WASM, OPSIN 2.9.0 (Java), optional Orthonym (Python) for structure → name |
| Native format | `.chemdraft` = a CDXML file with the full native JSON document embedded, base64url, in hashed `objecttag`s |
| Agent surfaces | `chemdraft` CLI (10 subcommands), `chemdraft-mcp` stdio server (10 tools), an agent skill in `skills/chemdraft`, a gated in-app automation bridge |
| Tests | 14,733 Vitest tests in 616 files, plus `cargo test` |
| Activity | Repo created 29 May 2026; 1,020 commits, 997 of them by the owner; 232 merged PRs; 56 stars, 13 forks; 14 issues (9 open) |

## How it is built

### Monorepo

pnpm workspace (`pnpm-workspace.yaml`: `apps/*`, `packages/*`, `examples/plugins/*`), `packageManager: pnpm@10.12.1`. One app, `apps/desktop`, and 29 packages. `AGENTS.md` (a long rules file for AI and human contributors) assigns each package an "owns" and "must never" column. The main ones:

| Package | Role |
| --- | --- |
| `chem-core` | The document model: types, Zod schemas, patches, migrations, molfile V2000/V3000 writers (`src/molfile.ts`) |
| `layout-engine` | All molecule rendering maths (bond offsets, wedges, hashes, label layout), valence, atom-label grammar, layout repair (8,161-line `index.ts`) |
| `document-workflow-core` | Pure document builders shared by the app, CLI and MCP, so the canvas and an agent cannot disagree |
| `cdx-compat` | CDXML read/write, best-effort CDX read, unknown-object preservation (3,954 lines) |
| `export-engine` | SVG, PDF (jsPDF) and CDXML writers |
| `rdkit-adapter`, `ocl-adapter`, `isospec-adapter`, `chemistry-adapter` | Engines behind an engine-neutral contract |
| `analysis-core` | Pure property-suite contracts: interpretations, method contracts, classification, provenance |
| `plugin-api`, `plugin-host` | Public plugin SDK (shipped to plugin authors as tarballs) and the host that enforces it |
| `ketcher-adapter`, `editor-adapter` | A narrow Ketcher host for editing one selected molecule; Ketcher never owns the page |
| `shortcut-engine`, `toolset-registry`, `viewport-engine`, `art-engine`, `template-library`, `style-compat` | Shortcuts and conflicts, toolbar schemas, zoom/pan/ruler maths, arrows and freehand art, templates, `.cds` style import |
| `chemdraft-cli`, `chemdraft-mcp` | Headless surfaces |

`native/avogadro3d-sidecar` is a C++17 sidecar that links Avogadro Core for interactive 3D tugging (newline-delimited JSON over stdio). The 3D sidecar binary is committed; the OPSIN Java runtime is built per host.

### Document model and file format

`ChemDraftDocument` (schema `chemdraft.document.v1`) holds pages, each with an ordered object list: molecules (atoms with ids, element, x/y, charge, isotope; bonds with `fromAtomId`/`toAtomId`, order, display), text, arrows, brackets, tables, pictures, art. Every change is a patch (`applyPatches` in `chem-core/src/patches.ts`, ops such as `updateObject` and `setSelection`).

The save format is described in `docs/architecture/save-open-and-file-format.md`. A `.chemdraft` file is a valid CDXML document with the visible subset ChemDraft can express, plus five `org.chemdraft/*` objecttags: codec version, schema version, a SHA-256 of the native JSON, a SHA-256 of the canonicalised visible CDXML, and the native document itself. On open, if the visible-CDXML hash no longer matches (someone edited the file in another program), the app asks whether to import the edited visible part or restore the embedded document. This gives lossless ChemDraft-to-ChemDraft round trips while staying openable elsewhere.

### Canvas, tools and hover hotkeys

The page is one SVG surface. Every menu item, tool, shortcut and plugin action is a command in one registry (`apps/desktop/src/commands.ts`, `shortcut-engine`); command ids are value-encoded (`atom.sproutFragmentAtHoveredAtom.phenyl`), and `AGENTS.md §10` bans behaviour wired only in a click handler.

Hover hotkeys act on the atom or bond under the pointer: `1` grows a single bond, `2` over S or P adds =O, `9` over a full carbon adds isopropyl, `g` cyclopropyl (or a fused cyclopropane over a bond), `u` cyclobutyl, `z` an alkyne (or a fused cyclopentadiene over a bond), `Shift+G` cyclopentadienyl, `Shift+J` phenyl (`fragmentAtomDrawingHotkeys` in `commands.ts`, logic in `sproutHotkeys.ts`). A refusal is returned when an edit would make a valid atom invalid (`atom-no-free-valence`). A Preferences toggle swaps the whole keymap to a ChemDraw-compatible scheme, with case-sensitive hover keys there (`b` Br, `B` boron); see `docs/shipped/chemdraw-keybinding-scheme.md` and `keybindingScheme.ts`. Version 1.2 will make that scheme the default.

Tool palettes, panels and dialogs are all separate native windows (an "owner rule" in `AGENTS.md §12`). Only one in-viewport plugin surface is allowed: a draggable prompt box (permission `ui.canvas`).

### Undo and redo

Whole-document snapshots that share unchanged objects through the patch engine (`documentHistoryBudget.ts`). The limit is 100 steps, and also a size budget of 450,000 "weight units" (one per object, atom and bond), because a rotate-all on a 5,000-molecule page held about 18 MB per step. At least 5 steps are kept. Plugin and AI writes are one labelled undo entry each; undo restores recorded states and never re-runs a plugin.

### Layout and clean-up

SMILES depiction runs RDKit coordgen within a size guard (`MAX_COORDGEN_ATOMS = 80`, `rdkit-adapter/src/conformer.ts`) with OpenChemLib as fallback; `layout-engine/src/layoutRepair.ts` and `layoutQuality.ts` repair overlaps. `structure.cleanup2d` and `structure.cleanup3d` are the clean-up commands. Templates (36 large hosts such as cyclodextrins and cucurbiturils) are drawn from the repo's own coordinates.

### Plugin system

Described in `docs/architecture/plugin-runtime.md` and `docs/plugin-architecture/AUTHORING.md`.

- **Manifest**: `id`, `name`, `version`, `apiVersion` (currently `0.1.20`, caret-matched), `entry`, `permissions`, plus `license` and per-dataset `dataLicenses`. A plugin may import only `@chemdraft/plugin-api`; `tools/plugin-extract/boundary.test.ts` enforces it.
- **Permissions** (`plugin-api/src/index.ts`): 21 names such as `document.read`, `document.write`, `selection.read`, `analysis.write`, `ui.panel`, `ui.canvas`, `chemistry.compute`, `image.read`, `ml.inference`, `model.load`, `network.fetch`, `native.execute`, `assistant.run`. Eight are marked dangerous. The command context only contains the capability objects a manifest declared, so an undeclared capability is `undefined` rather than refused at call time.
- **Isolation**: analyzers run in per-plugin ES-module Web Workers (`PluginWorkerBridge.ts`) with a version handshake. Panels are data, not code: a `PluginPanelReport` of text, key-value, table and SVG sections, drawn by one renderer; SVG goes through an `<img>` data URL so scripts in it cannot run. A report can carry a `sourceFingerprint`, and the panel shows a "stale" banner when the structure changed.
- **Writes**: only through `documents.applyPatch` while the plugin's own command runs, and only to objects selected at the start or inserted by it. Image-recognition results (MolScribe) must go through a review window.
- **Install flow** (`plugins/installPluginPackage.ts`): pick a ZIP → verify its `.sha256` sidecar and every entry's CRC → parse the manifest → show identity and permissions → stage under `$APPDATA/installed-plugins/` → load it from the app's own origin → wait for the worker handshake → register, or roll back. Declared permissions are auto-granted and displayed; there is no signature check (the checksum is integrity only). Official plugins update from allowlisted GitHub release URLs with SHA-256 checks, checked daily.
- **Headless trust**: the CLI loads the NMR plugin only from a directory listed in `~/.config/chemdraft/trusted-plugins.json`, resolved from the OS account record rather than `$HOME` (`chemdraft-cli/src/pluginTrust.ts`).

One thing I noticed: `tauri.conf.json` sets `"csp": null`, and installed plugins are served from the app's own origin.

### Chemistry layer

**RDKit.** `packages/rdkit-adapter/vendor/RDKit_minimal.wasm` (7.7 MB) is a custom MinimalLib build. `vendor/BUILD.md` pins the commit and lists eight patches: ETKDGv3 3D embedding and MMFF/UFF optimisation exposed to JS (for Spin 3D, replacing a 45 s OpenChemLib embed with about 1 s), TPSA with S and P included, MolStandardize canonical tautomers (so 4- and 5-methylimidazole get one pKa), and interfragment non-bonded terms. The file caps patches at about ten as a "maintenance smell". Capabilities are probed by value, because an unpatched binary silently ignores extra arguments.

**Property suite.** About 68 methods per molecule (caffeine run: 62 ok, 4 unsupported, 1 partial, 1 not applicable): composition, average and monoisotopic mass, InChI and InChIKey, canonical SMILES, TPSA, Crippen logP and MR, H-bond counts, ring counts, kappa and chi indices, 16 adduct m/z values, an IsoSpec isotope envelope, Joback boiling point and critical constants, and ionizable sites with pKa.

**IsoSpec.** `packages/isospec-adapter` vendors the WASM unpatched and reads the abundance table from the binary. The rules require disclosing that its ¹³C abundance is 0.82% above CIAAW wherever a derived number shows.

**pKa model.** `rdkit-adapter/src/pkaGnn.ts` runs a small site-centred message-passing network in plain TypeScript (gather, scatter-add, matmul, ReLU; no ML runtime). Weights are `vendor/pka-model/site-pka-gnn.json` (4.5 MB): 3 layers, 96 hidden units, an ensemble of 4 whose spread gives the interval, calibrated by `interval-calibration.json`. An older 6 MB random-forest artifact (`site-pka-forest.json`) is still in the tree. Training is in Python in the same folder (`pka_gnn.py`, `pka_train.py`, `run_all.sh`) on about 12,100 per-site experimental labels from Dwar-iBond (Apache-2.0), QupKake (BSD-3), pKaCHU (CC BY 4.0) and the aqueous rows of D2A-pKa (CC BY 4.0). Folds are grouped by Bemis–Murcko scaffold. The header comment of `pkaModel.ts` records finding and fixing 1,462 labels that had been placed on the wrong atom. Reported figures: scaffold-held-out CV MAE 0.75 (predict-the-mean baseline 2.48); held-out external QupKake Novartis and literature sets, n = 398, MAE 1.16, RMSE 1.98 (`external-validation.json`); SAMPL6 blind set, MAE 0.49, RMSE 0.64 on 31 values. The result says how many ionization steps it finds and states the harsher counts as well.

**Name → structure.** `chemdraft name` checks the built-in templates first (exact match after case and Greek normalisation, never fuzzy), then OPSIN 2.9.0 running in a jlink-trimmed JRE (`scripts/build-opsin-runtime.mjs`, about 47 MB, built per host, never committed). **Structure → name** uses Orthonym, an optional Python engine that `uv` installs into app data with a hash-locked requirements file, only on request (`docs/architecture/naming-engine.md`).

**CDXML.** Tiered claims in `AGENTS.md §11`: tier A supported (atoms, bonds, charges, isotopes, radicals, wedges, E/Z, superatoms, basic R-groups, text, simple arrows), tier B only with fixtures, tier C preserve or approximate. CDX binary read is best-effort; CDX open/save is planned for 1.2.

**Export.** SVG and PDF from `export-engine` (jsPDF with standard fonts; DejaVu and Noto font chunks for wider coverage), PNG through resvg in the CLI and a native raster path in the app, CDXML, MOL V2000 (V3000 only when dative bonds force it), SDF and SMILES. Copy As offers SMILES, InChI, InChIKey, CDXML, MOL, MOL V2000, SVG and PNG. **Every chemical-file export re-reads what it wrote and fails if the canonical SMILES differs from the input's**; radicals and query bonds are refused rather than changed.

### Provenance

`packages/analysis-core` defines the contract every number carries (`provenance.ts`, `classification.ts`, `methodContract.ts`):

- A run records `schemaVersion: chemdraft.analysis.v1`, an FNV-1a hash of the source, each **interpretation** (whole input, explicit-H policy, isotope policy, tautomer policy, aromaticity model, and a ledger of transformations such as desalting), and each **engine with its version and SHA-256 of the WASM**.
- Each result has `methodId`, `methodVersion`, `interpretationId`, a classification (`derivation` such as graph-derived, fragment-rule or database-lookup; `claim` such as composition or prediction; flags `conventionDependent`, `experimentallyCalibrated`, `trainedOnExperimentalData`), conventions as text, a list of uncertainties, an applicability verdict, and coded warnings tied to the results they affect.
- Status is `ok`, `partial`, `unsupported`, `not-applicable` or `not-requested`: "unavailable" and "not asked for" look different. A method outside its domain returns `unsupported`, not a fallback number.
- Methods run on the structure as drawn. If one needs a neutral or desalted form, it gets a derived interpretation, and per-atom results are mapped back to the drawn atoms (the pKa ladder does this).

Aspirin's Crippen logP, for example, comes back as `rdkit.crippen-logp` v1.0.0, `fragment-rule`/`prediction`, with the convention "Wildman–Crippen atom-contribution model", and the engine line `rdkit-minimallib-wasm 2026.03.3` with two SHA-256 hashes.

### CLI, MCP server and agent skill

| Surface | What it exposes |
| --- | --- |
| `pnpm -s chemdraft` (`packages/chemdraft-cli`) | `render`, `document`, `render-document`, `grid`, `reaction`, `analyze`, `name`, `stereo`, `nmr`, `export`. JSON Lines on stdout, progress on stderr; exit 0/1/2. Input caps: 5,000 characters, 500 heavy atoms, 500 jobs. Output paths must be relative with no `..`. `--style document` gives fixed ACS-like geometry (14.4 pt bonds, Arial 10 pt) in points |
| `chemdraft-mcp` (stdio) | `build_document`, `render_document`, `render_structure`, `render_grid`, `render_reaction`, `analyze_structure`, `name_to_structure`, `check_stereo`, `predict_nmr`, `export_structure` (listed live with `tools/list`). It calls the CLI modules in-process, writes to a fresh per-call directory, and caps payloads at 5 MB |
| `skills/chemdraft` | `SKILL.md` plus references (drawing, analysis, files, NMR, plugins, recipes, setup). Its two rules: never hand-draw a molecule or recall a name, and never quote a number from memory when ChemDraft computes it. `tools/agent-skill/chemdraftSkill.test.ts` keeps it in step with the CLI and MCP; `tools/agent-skill/stress/` holds graded agent cases |
| In-app | An assistant plugin can drive the open document over an MCP bridge through Tauri (`apps/desktop/src/assistant/assistantMcpEngine.ts`); each AI request is one undo entry. `window.__CHEMDRAFT_AGENT__` is a gated test bridge |

### NMR plugin

HOSE-code lookup over statistics from the NMRShiftDB2 NMReDATA export (`src/providers/ocl/nmrshiftdb2.database.json`, 6.7 MB, built with OpenChemLib), with additive-rule estimates flagged where no fragment matches. Code is MIT; the data is labelled with the ODbL-derived nmrshiftdb2 licence in every result. ¹H multiplicities and J values are first-order estimates and labelled so; stick height is the number of equivalent nuclei, not an integral; it never invents a shift, and it warns about possibly diastereotopic CH₂ or methyl groups. It depends on the SDK through vendored tarballs (`vendor/chemdraft-plugin-api-0.1.0.tgz`).

### Tests, CI and releases

- **Tests**: Vitest at the root (`vitest.config.ts`), jsdom DOM tests named `*.dom.test.ts(x)`, "real engine" tests named `*.real.test.ts` that load the vendored WASM, plus `cargo test`, `fmt` and `clippy -D warnings`.
- **CI** (`.github/workflows/ci.yml`): Linux (types, Vitest, web build), macOS (Rust fmt, clippy, tests), Windows (all of it), and a check that the build stamp was bumped. `pages.yml` deploys the site.
- **macOS releases**: Sparkle 2.9.4 through `tauri-plugin-sparkle-updater` 0.2.4. The feed is `appcast.xml` on `main`, signed with Ed25519 (the private key lives in the owner's Keychain). Signing and notarisation are local.
- **Windows releases**: built only in `windows-release.yml` on a GitHub runner as an NSIS installer. SignPath Authenticode signing is wired in but still awaiting approval (the 1.1.0 installer is unsigned), then `tauri signer` signs it for `tauri-plugin-updater` and `latest.json`.
- **Release notes** are long and specific, including known limitations.

### Roadmap (`ROADMAP.md`)

- **1.1.1** (early November): fixes, including Spin 3D on macOS 11–15, plus a "Vibe Code Your Own Plugin" guide.
- **1.2** (late November): CDX open/save, PubChem and Reaxys search, a larger name dictionary, ChemDraw keys as default (W / Shift+W wedges), Avogadro-style typed group shortcuts (`c1`, `ph`, `cn`), more abbreviations, polymer brackets, arrow-key nudging, warn-instead-of-refuse on valence, an Intel Mac build, and Windows signing.
- **Later in 1.x**: custom shortcuts, Linux, Avogadro integration, several windows.
- **2.0** (early 2027): a redesign, a docked ribbon, and editing inside Word and PowerPoint.

## What I ran

Node 24 is pinned but not installed here; I used Node 22.17.0 with `corepack pnpm@10.12.1 install --frozen-lockfile` (16.6 s). JDK 11 is present.

| Step | Result |
| --- | --- |
| Full Vitest run (`npx vitest run`, 752 s) | **14,645 passed, 38 failed, 50 skipped** of 14,733 (27 of 616 files failed) |
| Rerun of the 27 failing files alone | **1,144 passed, 5 failed**. The other 33 were timeouts (`Test timed out in 5000ms`, 24 cases) because I ran the edge-case suite at the same time |
| The 5 remaining failures | All come from Node 22 rather than ChemDraft. `pluginUpdates.test.ts`: `ReferenceError: URLPattern is not defined` (global only from Node 23.8+). Four PDF tests in `export-engine`: `expected '80 °C ± 0.5 × 2, µL, é  '` to equal `'… é € Œ'`, because Node 22's `TextDecoder("windows-1252")` decodes 0x80 and 0x8C as Latin-1 (I checked: it returns an empty string) |
| `vite build` (browser build) | Built in 46 s. `dist/` is 74 MB; the main chunk is 16.2 MB (5.7 MB gzip) and the analysis chunk 4.2 MB |
| Browser preview (`vite` dev server on **127.0.0.1:5199**) | Loaded, showing the menu bar, the floating Main and Art palettes, the rulers and the page (window title "Untitled — ChemDraft — chemdraft [main]"). 250 resources, about 21.5 MB decoded. **Stopped**; port 5199 confirmed closed |
| CLI | Works through `tsx` (`pnpm -s chemdraft …`). About 6.7 s cold for one `analyze`; about 0.3–0.6 s per command when called in-process |
| MCP server | Started on stdio; `initialize` and `tools/list` returned the 10 tools |
| Name → structure | **Blocked**. `scripts/build-opsin-runtime.mjs` fails with JDK 11 (`Error: Invalid compression level zip-9`; `jlink --compress zip-9` needs JDK 21+). Without the runtime, `name --name caffeine` returns `OPSIN engine is unavailable: missing bundled Java executable…`. Even "aspirin" was not found in the built-in templates, so common names depend on OPSIN |
| Not attempted | The Tauri/Rust build, the DMG, the GUI app |

## Edge-case results

The script calls the CLI's exported `runCli` in-process: `document` builds the native document (the SMILES-paste path), `export` writes SMI and MOL, `analyze` gives formula and masses, and `stereo` gives CIP labels. MOL files are read back with ChemDraft's own molfile reader (`parseMolfileGraph`) and its vendored RDKit. Geometry checks run on the native document's coordinates: bond-length spread, bond crossings, and non-bonded atom pairs closer than half a bond. Raw output is in `results.json`, written to the script's output folder.

### A. SMILES input and round trip

| ID | Result | Notes |
| --- | --- | --- |
| A1 `CCO` | **pass** | C2H6O, 46.069; SMI out `CCO`; MOL V2000 reads back the same |
| A2 benzene | **pass** | `c1ccccc1`, C6H6 |
| A3 Kekulé benzene | **pass** | Same canonical SMILES as A2 |
| A4 naphthalene | **pass** | C10H8, 128.174 |
| A5 pyrrole | **pass** | `[nH]` kept through SMI and MOL |
| A6 L-alanine | **pass** | `C[C@H](N)C(=O)O` kept; `stereo` reports C1 = S; the MOL chiral flag is set |
| A7 E/Z difluoroethene | **pass** | `F/C=C/F` → E, `F/C=C\F` → Z, kept apart through SMI and MOL |
| A8 `[NH4+].[Cl-]` | **pass** | Both ions and charges kept (one molecule object with two components); ClH4N |
| A9 nitro | **pass** | Charge-separated form kept as written, not normalised |
| A10 dimethyl sulfone | **pass** | No valence error; canonical `CS(C)(=O)=O` |
| A11 `[13CH4]` | **pass** | Formula `[13C]H4`, monoisotopic 17.0347; isotope kept in SMI and MOL. The drawn label was not checked visually |
| A12 `[CH3]` radical | **fail (refused, clearly)** | Every drawing and export path refuses it: "Atom 1 carries 1 radical electron; ChemDraft cannot yet draw this radical without risking chemical identity." `analyze` still works (CH3, 15.035) |
| A13 rings of 3 to 12 | **pass** | Regular polygons: all bond lengths equal, no crossings, closest non-bonded pair 1.41 to 1.93 bond lengths |
| A14 cubane | **pass** | Drawn as a perspective cube (bond lengths 0.63 to 1.0 of the median). The two back-edge crossings are drawn with gaps, and no atoms overlap |
| A15 ferrocene | **pass** | Accepted as three ionic components with charges, and round-trips |
| A16 reaction SMILES | **pass (reaction command)** | `chemdraft reaction --rxn` gives reactant, arrow and product. The SMILES-to-document path rejects `>>` with an OpenChemLib "unexpected character" error, so a reaction is not a single paste through that route |
| A17 toluene, two spellings | **pass** | Both give `Cc1ccccc1` |
| A18 glucose | **pass** | The four specified centres kept through SMI and MOL; the anomeric C, unspecified in the input, is reported as `unspecified` |
| A19 `xyz`, `C1CC` | **pass** | Exit 1 with specific messages from both engines, for example "SmilesParser: dangling ring closure: 1; position:4". No crash |
| A20 Ala₆₀ (301 heavy atoms) | **partial** | Fast: document in 2.1 s, SVG in 1.9 s, with stereo kept through export. But the layout spirals and the last 15 or so residues collapse into a pile: 403 non-bonded atom pairs closer than half a bond, and 2 crossings. A rendered PNG confirms overlapping wedges and O labels |

### C. Interoperability (selected)

| ID | Result | Notes |
| --- | --- | --- |
| C1 V2000 round trip | **pass** | L-alanine, (Z)-difluoroethene and glucose all read back with the same canonical isomeric SMILES; the CLI also verifies this before writing |
| C2 V3000 | **partial** | `chem-core`'s `moleculeToMolfileV3000` writes valid V3000 (`M  V30 BEGIN CTAB`, `COUNTS 6 5 0 0 1`) that reads back with the same stereo, and Copy As MOL in the app uses it. But the CLI and MCP `export --format mol` write V2000 unless the molecule has a dative bond, with no flag to ask for V3000 |
| C5 SVG | **pass** | Valid SVG. Text is kept as `<text>` elements (8 in aspirin, no outlined glyphs). Fit style is sized in px; `--style document` in pt, so it inserts at physical size |
| C7 InChIKey for A6 | **pass** | `QNAYBMKLOCPYGJ-REOHCLBHSA-N`; InChI `…/t2-/m0/s1`, from RDKit's bundled InChI. `AGENTS.md` notes the InChI 1.07.3 licence terms are still unconfirmed for redistribution |

### D. Analysis

| ID | Result | Notes |
| --- | --- | --- |
| D1 caffeine formula and MW | **pass** | C8H10N4O2, 194.194 |
| D2 caffeine exact mass | **pass** | 194.08037556 |
| D3 CIP on A6 | **pass** | S (computed with OpenChemLib parity on RDKit's molfile) |
| D4 ethyl acetate NMR | **pass** | ¹H: 4.23 q (2H, J 7), 2.06 s (3H), 1.30 t (3H). ¹³C: 170.7, 61.2, 20.8, 14.18. All `hose-fragment` matches at sphere 2–3 with 201 to 1,303 reference shifts each; no warnings; 3.2 s including plugin load. Run through `runNmrCommand` with a trust file passed as an option, so nothing was written to `~/.config` |
| D5 aspirin properties | **pass** | logP 1.31 (RDKit Wildman–Crippen), TPSA 63.6, carboxylic acid pKa **3.66, interval 3.39–3.94** (`basis: experimentally-trained-model`; measured value about 3.5). Every value carries method id, version, conventions, interpretation and engine hashes. One oddity: the pKa method (`dimorphite.ionizable-sites` v2.6.0) is classified `derivation: database-lookup`, although the value comes from the trained network |

Summary: of the 29 rows above, 26 pass, 2 are partial (A20 layout, C2 V3000 from the headless tools) and 1 fails (A12 radicals, refused by design). A16 passes through the reaction command but not through a SMILES paste.

## Maturity

- **Age and cadence.** Repository created 29 May 2026. Commits came in bursts (145 in the week of 14 June, 113 in the week of 5 July, 104 in the week of 20 September) and have run at a steady 25 to 55 a week since October. Releases: 0.3.2 to 0.3.9 between August and early October, 1.0.0 on 20 October, 1.1.0 on 2 November.
- **Contributors.** 997 of 1,020 commits are the owner's, many of them written with coding agents (there is a `claude` contributor and `tools/codex-prompts`). External PRs come from six or so students and contributors (compound layouts, rings, orbitals, text editing), credited by name in the release notes.
- **Issues.** Only 14 issues in total; feedback seems to arrive by other routes (Help ▸ Report a Bug). The open ones: Linux (#304), docked toolbars (#301), Avogadro hotkey conventions (#300), the double-bond default (#251), keyboard shortcuts (#250), Windows code signing (#166), and confidentiality of proprietary molecules (#306), which is unanswered so far.
- **Known bugs** (1.1.0 notes and roadmap): Spin 3D may not start on macOS 15 or earlier; Ctrl+S does nothing inside a text box; copying right after undoing an E/Z change can be incomplete; the Windows installer is unsigned; there is no Intel Mac build; plugin dropdowns open dark.
- **Engineering discipline is high**: written invariants, boundary tests, value-probed engine capabilities, honest-claims rules for NMR and pKa, and release notes that list their own limitations. The cost is very large files (`MainWindow.tsx` at 33,000 lines) and a rules file most contributors will not read in full.

## Lessons for Lone Pair

### Worth borrowing

1. **Check every export by reading it back.** ChemDraft re-reads each MOL, SDF, SMILES or CDXML file it writes and fails the export if the canonical SMILES changed. Lone Pair already has RDKit and InChI in the page, so a "wrote what you drew" check before each structure-file download would be cheap.
2. **A result contract for every number.** Method id and version, interpretation (as drawn, desalted, neutralised), conventions, uncertainty, and statuses that separate `unsupported` from `not-requested`. Lone Pair's analysis block, pKa and BDE tools would gain from a small `{value, method, source, interval, status}` record that also travels into copied text.
3. **Refuse rather than degrade, with a specific message.** For example, "RDKit could not canonicalize; OpenChemLib: dangling ring closure at position 4." Lone Pair should keep its radicals, but adopt this message style for invalid input.
4. **Embed a lossless copy in the interchange file.** A `.chemdraft` file is valid CDXML plus a hashed native payload, and the app notices when another program edited the visible part. Lone Pair's CDXML export could carry its JSON the same way, so a ChemDraw round trip does not lose Lone Pair-only objects.
5. **A headless entry point and an agent skill.** One CLI built on the same document functions as the canvas, with JSON Lines output, an MCP wrapper, and a skill that tells agents never to hand-draw a molecule. Lone Pair could expose its core through a small Node or `?api` entry point.
6. **Hover-key coverage.** Fragment sprouts (`g`, `u`, `z`, `Shift+J`), `2` for =O on S and P, `9` for isopropyl, and a one-click ChemDraw-compatible keymap. The 1.2 plan to share Avogadro's `c1`/`ph`/`cn` typed shortcuts is a convention worth agreeing on early.
7. **Bound undo by memory, not just step count**, as `documentHistoryBudget.ts` does.

### Where ChemDraft is ahead

- A real plugin platform: manifest, permissions, worker isolation, declarative panels, checksummed install with rollback, and daily signed updates.
- The pKa model's documentation: training sources and licences, scaffold-grouped CV, external and blind-set figures, intervals from an ensemble, and an audit trail of fixed labelling errors.
- The NMR predictor's honesty rules: no invented shifts, equivalence and diastereotopicity warnings, and the data licence in every result.
- Test depth (14,700 tests, three-OS CI) and release engineering (Sparkle, Tauri updater, Authenticode pipeline).
- Spin 3D with ETKDG conformers and an Avogadro-backed native sidecar.

### Where Lone Pair is ahead

- **It runs in a browser from one file, with no install.** ChemDraft is a desktop download (macOS Apple Silicon and Windows only, no Linux or Intel Mac yet), and its browser build is a 74 MB developer preview.
- **Radicals** draw and export in Lone Pair; ChemDraft refuses `[CH3]` everywhere except `analyze`.
- **More formats**: CDX open and save (ChemDraft's is planned for 1.2), V3000, RXN, CML, MRV, chemfig and 3D formats from the UI, and official IUPAC InChI as WASM.
- **Name → structure without Java**: ChemDraft needs a per-host 47 MB JRE (which would not build here with JDK 11), and even "aspirin" needs OPSIN.
- **Large-molecule layout**: ChemDraft's 301-atom peptide overlapped badly. This is worth running against Lone Pair's own layout to confirm the lead is real.
- **Built-in teaching and spectroscopy tools** (NMR solving guide, MS/MS fragments, solvent tables, BDE) with no plugin install.
- **Privacy is simple to state**: everything in one offline page. ChemDraft's issue #306 asks exactly this question and has no answer yet.
