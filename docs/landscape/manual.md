# Structure editor survey: the manual (November 2026)

This brings together a survey of 13 chemical structure editors and engines: how each is built, what each does, how each did on one shared edge-case suite, and what Lone Pair should take from them. The background reference (players, formats, conventions) is in [encyclopedia.md](encyclopedia.md). The test cases are in [test-suite.md](test-suite.md). The detail is in the per-project studies:

| Study | Covers | How it was studied |
| --- | --- | --- |
| [apps/chemdraft.md](apps/chemdraft.md) | ChemDraft 1.1.0 | Source (Apache-2.0), 14,733 tests run, browser preview build, CLI and MCP |
| [apps/octet.md](apps/octet.md), [apps/octet-site-demo.md](apps/octet-site-demo.md) | Octet Draw 1.0.29 | Source (Apache-2.0), tests run, dev build, the website's name demo in a browser |
| [apps/zoho-chemstudio.md](apps/zoho-chemstudio.md) | Zoho ChemStudio 1.1.3 | Help docs plus an unpacked (not installed) macOS package. **No hands-on tests** |
| [apps/moldraw.md](apps/moldraw.md) | MolDraw | Browser, hands-on, no account |
| [apps/molview-rcsb.md](apps/molview-rcsb.md) | MolView (old and new), RCSB chemical search | Browser fingerprinting only (terms not accepted) |
| [opensource/ketcher-indigo.md](opensource/ketcher-indigo.md) | Ketcher, Indigo 1.46 | Source, 1,812 Ketcher unit tests, Indigo integration tests, suite in Python |
| [opensource/openchemlib-rdkit.md](opensource/openchemlib-rdkit.md) | OpenChemLib 9.25, RDKit.js 2026.09 | Source, both test suites, two-engine diff in Node |
| [opensource/jsme-kekule-molview.md](opensource/jsme-kekule-molview.md) | JSME, Kekule.js 1.0.5, old MolView | Compiled or source code, headless runs in Node and jsdom |

The test scripts are in [opensource/scripts/](opensource/scripts/), with raw output in `opensource/scripts/results/`.

## 1. Headline findings

1. **Two serious open-source rivals appeared in 2026.** ChemDraft and Octet Draw are both Apache-2.0 desktop apps on **Tauri 2 + React 19 + TypeScript**, both built largely with coding agents, and both aim straight at ChemDraw (CDXML, ChemDraw shortcuts, pasting into Office). Neither runs in a browser for end users. That is still Lone Pair's open lane.
2. **Stereo is where editors break.** MolDraw loses the wedge on pasted L-alanine and draws cis-difluoroethene trans; its own E/Z Analyzer then disagrees with itself. Kekule.js loses all SMILES stereo and picks the wrong enantiomer. Old MolView writes every stereocenter as `[C@@]` without its H. Only Octet, ChemDraft (through RDKit), Indigo, RDKit, OpenChemLib and JSME kept stereo on every case.
3. **One bug affects Lone Pair today.** Molfiles with chiral flag 0, which is what RDKit writes, lose their absolute stereo when read by `OCL.Molecule.fromMolfile` at `src/app.js:1047`. The fix is checked: set the flag to 1 when wedges are present, or turn ESR AND groups back to ABS. See [opensource/openchemlib-rdkit.md](opensource/openchemlib-rdkit.md).
4. **Offline name-to-structure is solved, in two ways.** Octet: OPSIN compiled to JavaScript (about 380 KB gzipped of code, plus 6.9 MB of data), a refereed Wikidata dictionary (28,880 compounds, 1.63 MB gzipped) and fuzzy typo suggestions. Zoho: a 500,000-compound PubChem subset in SQLite with an FTS5 index (217 MB). The Octet approach fits a browser app if it loads only when needed.
5. **Being honest about predictions sets the leaders apart.** ChemDraft attaches method, version, the form of the structure, an uncertainty and a status to every number, and reads back every export to check it. Octet only shows a generated name if OPSIN parses it back to the same InChI. Zoho documents no method for its NMR, ADME or retrosynthesis.
6. **Everyone borrows the chemistry engine.** RDKit (ChemDraft, Zoho), Indigo (Octet, MolDraw, Ketcher) and OpenChemLib (Lone Pair, ChemDraft, JSME). No one writes their own canonicaliser.

## 2. Tech stacks side by side

| App | Shell | UI | Rendering | Engine | Name → structure | Offline | License |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Lone Pair** | Browser, one HTML file (2.4 MB) | Vanilla JS, bundled with esbuild | SVG | OpenChemLib 9.25.1, IUPAC InChI (`inchi-js`, WASM) | PubChem (online) | Yes | MIT |
| ChemDraft | Tauri 2 (Rust) | React 19, Vite 7, pnpm monorepo (29 packages) | SVG | RDKit WASM (custom, 8 patches), OpenChemLib, IsoSpec, a GNN for pKa | OPSIN in a 47 MB Java runtime | Yes | Apache-2.0 |
| Octet Draw | Tauri 2 | React 19, Vite | Its own SVG | Indigo 1.46 WASM; its own CIP, namer, NMR and Clean up | OPSIN (TeaVM to JavaScript), dictionary, PubChem last | Yes (PubChem optional) | Apache-2.0 |
| Zoho ChemStudio | Electron 39 (desktop) or web | Zoho Lyte, jQuery | Raphaël (SVG), d3 | RDKit MinimalLib WASM | Local PubChem subset (500k) or PubChem | Desktop only | Proprietary, free |
| MolDraw | Browser | React, Vite | (canvas/SVG) | Indigo in a web worker | PubChem | No | Proprietary, freemium |
| MolView (new) | Browser | Rolldown/Vite chunks | MolPad (rewritten); Mol\* for 3D | — | PubChem | No | Proprietary, freemium |
| MolView (old) | Browser | Concatenated bundles | MolPad on canvas; GLmol, Jmol, ChemDoodle for 3D | None local; PubChem for all SMILES | PubChem | No | License withdrawn 2023 |
| Ketcher | Embeddable component | React (small molecules), D3 (macromolecules) | Raphaël SVG | Indigo (WASM in a worker, or remote) | — | Standalone build yes | Apache-2.0 |
| JSME | Embeddable component | GWT | Canvas | Its own | — | Yes | BSD-3 (binary only) |
| Kekule.js | Library and Composer | Pure JS | Canvas and SVG | Its own, plus Open Babel WASM for SMILES | — | Yes | MIT |
| OpenChemLib | Library and CanvasEditor | GWT JS (342 KB gzipped) | Canvas, `toSVG` | Its own | — | Yes | BSD-3 |
| RDKit.js | Library | Emscripten WASM (2.4 MB gzipped) | MolDraw2D SVG | RDKit | — | Yes | BSD-3 |
| RCSB search | Website | — | Marvin JS (ChemAxon, hosted iframe) | ChemAxon | — | No | Commercial |

## 3. Edge-case results

Each row is a case from [test-suite.md](test-suite.md). ✅ = pass, ⚠️ = partial, ❌ = fail, — = not run or not applicable. Engines were run headless; MolDraw in a browser; ChemDraft and Octet from their own source code. "MolView" here means the old app's code run headless. Zoho isn't in the table because it couldn't be tested.

| Case | What it checks | Indigo | OCL | RDKit | JSME | Kekule | MolView | ChemDraft | Octet | MolDraw |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A3/A17 | Kekulé and aromatic forms give the same canonical SMILES | ⚠️ only after aromatize | ✅ | ✅ | ✅ | — | — | ✅ | ✅ | — |
| A5 | Pyrrole `[nH]` | ✅ | ✅ | ✅ | ✅ | — | — | ✅ | ✅ | ✅ |
| A6 | L-alanine stays (S) | ✅ | ✅ | ✅ | ✅ | ❌ wrong enantiomer | ⚠️ `[C@@]` with no H on export | ✅ | ✅ | ❌ no wedge |
| A7 | Cis/trans kept | ✅ | ✅ | ✅ | ✅ | ❌ | — | ✅ | ✅ | ❌ drawn trans; analyzer contradicts itself |
| A8/A11 | Bracket H, isotope | ✅ | ⚠️ formula drops ¹³C | ✅ | ✅ | ❌ `[N+]`, `[13C]` | ❌ H dropped | ✅ | ✅ | — |
| A9 | Nitro kept as written | ✅ | ✅ | ✅ | ⚠️ rewritten as `N(=O)=O` | — | — | ✅ | ✅ | — |
| A10 | Sulfone | ✅ | ✅ | ✅ | ✅ | — | — | ✅ | ✅ | ✅ |
| A12 | Methyl radical | ✅ | ✅ | ✅ | ❌ radical lost | — | ❌ becomes methane | ❌ refused | ✅ | — |
| A14 | Cubane layout | ❌ atoms 0.43 bond lengths apart | ⚠️ crowded (0.67) | ✅ | — | — | — | ✅ | ✅ | ⚠️ crossing bonds |
| A15 | Ferrocene as ions | ✅ | ✅ | ⚠️ fragments crowded | — | — | — | ✅ | ✅ | ❌ rings stacked on each other |
| A16 | Reaction SMILES | ✅ | — | — | ✅ | ❌ merged into one molecule | ❌ PubChem only | ⚠️ not by paste | ✅ | ❌ ignored without a message |
| A19 | Invalid input gives a clear error | ✅ | ⚠️ invents radicals for bad aromatics | ✅ | ❌ empty, no error | ❌ `null`, no error | — | ✅ | ✅ | ❌ `C1CC` drawn as propane |
| A20 | 300-atom peptide | ✅ 2 ms layout | ✅ 0.3–2 s | ⚠️ 63 atoms stacked (CoordGen fixes it) | ✅ 4.4 s | ✅ | ❌ PubChem only | ⚠️ the end of the chain overlaps | ✅ | — |
| C7 | InChIKey for alanine | ✅ | — (no InChI) | ✅ | — | — | — | ✅ | ✅ | — |
| D1–D3 | Formula, mass, CIP | ✅ | ✅ | ✅ | — | — | — | ✅ | ✅ | — |

**Lone Pair itself hasn't been run against this suite yet.** Its engine is OpenChemLib, so the OCL column is a guide, but the drawing layer can add or remove problems, as MolDraw shows. Section 7 lists this as the first follow-up.

## 4. How they are built: patterns that recur

### 4.1 Document model and file format
- **A native file that is also CDXML.** ChemDraft (`.chemdraft`) and Octet (`.oct`) both save valid CDXML with their full native JSON embedded and hashed. ChemDraw can open the file, and the app notices if another program edited the visible part. This is the best idea in the survey for staying ChemDraw-compatible without losing data.
- **Id-keyed maps** of atoms, bonds, half-bonds, rings and S-groups (Ketcher's `Struct`). Half-bonds hold each bond's direction and its neighbours' angles, which makes double-bond placement, wedge fitting and label clipping cheap.

### 4.2 Undo
| Approach | Who | Notes |
| --- | --- | --- |
| Operations that return their own inverse | Ketcher (32-step cap), Kekule | Scales to rich documents |
| A patch for each edit, capped at 100 steps or a memory budget | ChemDraft | Best of both |
| Whole-document snapshots | MolPad (100), Lone Pair | Simple; fine while documents stay small |

### 4.3 Rendering rules worth copying
- **Double-bond side** (Ketcher's `selectDoubleBondShift`): ring first, then a 6-ring, then the ring with more double bonds. In a chain, put it on the side with more substituents, or centre it if they're equal.
- **Wedge wide ends** fitted to the bisector of the neighbouring bonds, not a fixed triangle. Hashes have at least 4 lines.
- **Aromatic circle** only if every ring bond is aromatic and the ring is convex.
- **A final collision pass** for CIP and attachment-point labels. Ketcher's open issues #7214, #4702 and #8037 come from not having one.

### 4.4 Engine use
- Send the light formats to a fast local path and the heavy ones to the engine (Ketcher's format router).
- **Read every export back** and compare canonical SMILES (ChemDraft).
- **Normalise aromaticity before comparing SMILES** (Indigo's A3/A17).
- **Mind the y-axis.** OCL's y points down; molfiles and RDKit point up.

### 4.5 Clipboard into Office
| App | macOS | Windows | Linux |
| --- | --- | --- | --- |
| Octet | Vector PDF with CDXML embedded | EMF with CDXML, plus a bitmap | PNG and SVG |
| Octet (all platforms) | Also puts CDX, CDXML, MDLCT and SMILES on the clipboard under ChemDraw's type names (`src-tauri/src/clipboard.rs`) | | |
| Lone Pair | High-resolution PNG | Same | Same |

A browser can't write PDF or EMF to the clipboard, but it can write `image/svg+xml` and `text/html` carrying CDXML inside the SVG's `<metadata>`. That is worth a spike.

### 4.6 Extensibility and AI
- **ChemDraft's plugins:** a manifest with 21 permissions, one Web Worker per plugin, panels described as data, and a checksummed ZIP install with rollback. There is no signature check, and the CSP is off.
- **ChemDraft for AI assistants:** a CLI with 10 subcommands and JSON output, an MCP server with 10 tools, and an agent skill kept in step with both by a test. The skill tells assistants never to draw molecules by hand or quote chemistry numbers from memory.
- MolDraw has an AI chat and image-to-structure (Pro). Zoho and Octet have no AI features.

### 4.7 Release engineering
| App | Signing | Updates |
| --- | --- | --- |
| ChemDraft | Mac notarized; Windows unsigned (Authenticode pipeline ready) | Sparkle on Mac, Tauri updater on Windows |
| Octet | Mac notarized; Windows unsigned | — |
| Zoho | — | `electron-updater` from Zoho's file server |

## 5. Features and UI

### 5.1 Workflow and UI patterns
| Pattern | Where | Notes |
| --- | --- | --- |
| **Hover hotkeys** (point at an atom or bond and press a key) | ChemDraft, Octet (ChemDraw keymap), Zoho (1/2/3 for bond order, Enter for an abbreviation) | The fastest way to draw. A ChemDraw-compatible keymap is expected now |
| **Command palette** (⌘K) | Octet | Every action, one search away |
| **Actions panel that follows the selection** | Octet (dock), MolDraw (floating bar plus Actions menu) | Formula, problems with a fix for each, and likely next steps |
| **Paste SMILES at the pointer**, and a pasted list laid out as a grid | ChemDraft, MolDraw | |
| **Document tabs**, dialogs in their own windows | ChemDraft, MolDraw | |
| **Toolbars you can rearrange** | ChemDraft | |
| **Team workspace** with roles and a trash you can restore from | Zoho web | |
| **Embedding in a word processor** | Zoho Writer extension | |
| **Live 3D synced with the sketch** | MolView (new) | |

### 5.2 Analysis features
| Feature | Lone Pair | ChemDraft | Octet | Zoho | MolDraw |
| --- | --- | --- | --- | --- | --- |
| ¹H and ¹³C NMR | Yes | Plugin (nmrshiftdb2 statistics) | Yes (HOSE codes; ¹³C error 2.27 ppm, ¹H 0.25 ppm) | Yes, with a solvent choice (method not documented) | Yes |
| pKa | Yes | GNN; error 0.75 on held-out scaffolds, 0.49 on SAMPL6; with intervals | — | — | Yes |
| Isotope pattern and m/z | Yes | IsoSpec | — | — | — |
| Properties (logP, TPSA and so on) | Some | About 68 | — | ADME report | Yes |
| Structure to name | PubChem | — | Its own IUPAC 2013 namer, checked by reading the name back with OPSIN | Yes | — |
| Stoichiometry table | No | — | — | Yes | Yes |
| Retrosynthesis | No | — | — | Yes (method not documented) | — |
| Catalytic cycles in one step | No | — | Yes | — | — |
| 3D | Yes | Spin 3D (ETKDG) | Planned ("Octet Model") | 3Dmol.js | Yes |

### 5.3 Who uses these, and for what
| User | Main jobs | Who serves them best now |
| --- | --- | --- |
| Synthetic chemist writing a paper | ACS-style schemes, CDXML to journals, pasting into Word | ChemDraw; then Octet and ChemDraft. Lone Pair in the browser |
| Teacher and student | Quick drawings, mechanisms, quizzes, no install | Lone Pair, MolDraw, MolView |
| Analytical chemist | NMR and MS prediction, isotope patterns | ChemDraft, Lone Pair |
| Medicinal chemist | Properties, pKa, ADME, database searches | ChemDraft, Zoho |
| Developer embedding an editor | A component with an API | Ketcher, Marvin JS, JSME |
| Using an AI assistant | Drawing and computing through tools | ChemDraft (MCP, CLI, skill) |

## 6. Where Lone Pair stands

**Ahead:**
- It's the only one that runs from a single HTML file in any browser, phones included, with no install or account.
- It writes the most formats: CDX and CDXML both ways, V3000, RXN, CML, MRV, JME, chemfig, EPS and vector PDF.
- It has official IUPAC InChI as WASM, offline.
- It draws and exports radicals (ChemDraft and JSME can't).
- Its teaching and spectroscopy tools are built in, with no plugins.
- Its privacy is simple to explain.

**Behind:**
- No offline name-to-structure.
- The clipboard carries a PNG with no editable structure inside.
- Its numbers have no provenance or uncertainty attached.
- Exports aren't read back to check them.
- No command palette, hover-key coverage short of ChemDraw's, no stoichiometry table or catalytic cycles.
- Test depth: ChemDraft has 14,700 tests.

## 7. Recommended work for Lone Pair, in priority order

1. **Fix the molfile chiral-flag import** at `src/app.js:1047`, with a test that reads RDKit's alanine molfile and expects (S). *Small; a real correctness bug.*
2. **Run this suite on Lone Pair itself.** Load the HTML in jsdom, as JSME was run headless, and check the results against Indigo or RDKit as a referee (`opensource/scripts/indigo_suite.py`, `ocl_rdkit_suite.mjs`). Include hand-drawn A6, A8, A11 and A15 for the export path.
3. **Warn when OpenChemLib invents radicals** on SMILES it can't kekulize. Build the displayed formula from the atoms so isotopes show.
4. **Read each export back** and compare canonical SMILES before the download.
5. **A result record** `{value, method, version, interval, status}` for NMR, pKa and BDE, carried into copied text.
6. **Offline name-to-structure, loaded when first needed:** a slice of a refereed dictionary (the top 5,000 to 20,000 compounds) inside the file, with OPSIN as an optional extra. Suggest typo corrections instead of applying them, and only show names that read back to the same structure.
7. **CDXML inside copied SVG and HTML on the clipboard** (a spike), and **embed Lone Pair's JSON inside its CDXML export** (as ChemDraft and Octet do).
8. **Command palette, Actions panel, more hover keys** (ChemDraw keymap).
9. **Stoichiometry table, catalytic cycles** (Octet's algorithm is a few hundred lines), and templates for cages (cubane, adamantane, norbornane).
10. **Optional:** an embeddable API (load a structure, get SMILES or a molfile, an on-change event), and a CLI or MCP entry point.

## 8. What wasn't covered

- **Zoho ChemStudio** wasn't tested hands-on. The web app needs an account, and running its unpacked code was blocked. Install the desktop app (no account needed) and work through the suite.
- **MolView** (old and new) wasn't tested in the browser, because both ask you to accept their terms first.
- **B-section drawing tests** (B1–B15) and E-section checks were done only partly, in the apps that were opened in a browser. Most need someone at the screen.
- **ChemDraw** itself wasn't re-tested; it remains the reference point from [../PLAN.md](../PLAN.md).
- Name-to-structure in ChemDraft didn't run here (it needs JDK 21+; this machine has JDK 11).
- Test runs used Node 22.17, where some projects wanted Node 24. The few failures this caused are recorded in each study.

## 9. Licensing notes for borrowing

| Source | Can code be reused? |
| --- | --- |
| ChemDraft, Octet, Ketcher, Indigo | Yes, Apache-2.0 (keep the notices) |
| OpenChemLib, RDKit | Yes, BSD-3 |
| Kekule.js | Yes, MIT |
| JSME | Embed the binary only; no source |
| nmrshiftdb2 data (used by Octet and ChemDraft) | Share-alike: keep it in its own folder with its license |
| MolView after June 2023 | No. Before 2023: AGPL, which would make Lone Pair AGPL |
| ChemDoodle Web Components | GPL-3.0: same caution |
| Zoho, MolDraw, Marvin JS | No (proprietary). Ideas only |
