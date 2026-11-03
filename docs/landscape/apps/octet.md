# Octet Draw

Octet Draw (octet.software) is a free, Apache-2.0 desktop chemical drawing app for Mac, Windows and Linux, made by Sam Ellis (a Cambridge PhD student) with Claude. Source: https://github.com/SamChemMan/Octet-Draw. This report covers v1.0.29 (tag `v1.0.29`, released 2 November 2026). It is based on the source code, the project's check suite run in Node, the edge-case suite in `../test-suite.md` run against Octet's own modules, and a short look at the Vite dev build in a browser. The installers and the Tauri app were not run.

Studied on 3 November 2026. Clone: shallow, 50 commits, in the session scratchpad (`…/scratchpad/oss/octet/`). Suite script: [`../opensource/scripts/octet_suite.mjs`](../opensource/scripts/octet_suite.mjs).

## At a glance

| Item | Finding |
| --- | --- |
| Age | Repository created 14 October 2026. 775 commits in 20 days. First preview 16 October, 1.0.29 on 2 November. 24 releases. 62 stars, 11 forks, 10 open issues (all filed 3 November). |
| Authorship | One human committer (SamChemMan). Commits carry `Co-Authored-By: Claude Opus 5.5`. The repository has a `CLAUDE.md` that steers the agent, `OCTET_BRIEF.md` (product brief), and 19 decision records in `docs/decisions/`. |
| Shell | Tauri 2 (Rust, `src-tauri/`), one webview per drawing window. |
| Frontend | React 19, TypeScript 7 (`tsc`), Vite 8 (rolldown), Phosphor icons, IBM Plex Mono and Instrument Sans fonts. No state library: a hand-rolled `store()` (`src/store.ts`) and `useReducer`. |
| Chemistry engine | Indigo 1.46.0 as WASM (`indigo-ketcher`, the no-render build, 7.5 MB) for SMILES, InChI, MOL, layout, Crippen logP. Octet's own TypeScript for CIP labels, IUPAC naming, NMR, clean-up (a port of Indigo's cleaner), CDXML and CDX. |
| Name to structure | OPSIN 2.8.0 compiled from Java to JavaScript with TeaVM, plus Octet's tables, a 28,880-compound Wikidata dictionary, and rule-based readers for peptides and condensed formulas. PubChem online as a last step. |
| Native format | `.oct` = a CDXML document with Octet's JSON in a trailing comment, guarded by a hash. |
| Size of the code | About 44,000 lines of TypeScript outside the checks (lines are long: `src/Editor.tsx` is 680 KB in 8,504 lines), 15,000 lines of check files, 5,400 lines of Rust. |
| Tests | 90 `src/*.check.ts` files (plain `node:assert` scripts, about 3,500 asserts), 47 Rust `#[test]`s, a CI smoke test that starts the real app on three systems. |
| Privacy | No accounts, analytics or crash reporting. Update check on by default (GitHub). PubChem name lookup on by default when offline reading fails and the user presses Return. |

## How it is built

### Desktop shell

`src-tauri/` is a Tauri 2 app (`Cargo.toml`, edition 2024). The Rust side is small and does only what a webview cannot:

| Module | Job |
| --- | --- |
| `main.rs` | Window, menus, commands, single instance, open-file events. |
| `clipboard.rs`, `clipboard_windows.rs`, `clipboard_linux.rs` | Native clipboard with ChemDraw's types (see below). macOS through `objc2-app-kit` NSPasteboard, Windows through `windows-sys`, Linux through GTK. |
| `export.rs` | SVG to vector PDF (`svg2pdf` 0.13 + `pdf-writer`, fonts subset and embedded, CDXML in the PDF catalog `/Metadata`), PNG/TIFF/JPEG/GIF (`resvg`, `image`). Also reads CDXML back out of a PDF (`cdxml_from_pdf`). |
| `vector.rs` | Octet's own EMF and EPS writers from the `usvg` tree (text as glyph outlines). EMF carries the CDXML in a comment record; `cdxml_from_emf` reads it back. |
| `pubchem.rs` | Name lookup on PubChem PUG REST: fixed URL, 10 s timeout, 64 KB cap, the name in the POST body. |
| `update.rs` | `tauri-plugin-updater`, signed `latest.json` on GitHub Releases. |
| `recovery.rs`, `crashlog.rs`, `recent.rs`, `home.rs` | Autosave and recovery, a local crash log, the recent list and Home page data. |
| `feedback.rs` | Tester builds only: snapshot of the window plus a note, opened as a draft in the user's mail app. Removed from public builds by `OCTET_FEEDBACK=0`. |
| `smoke.rs` | `--features smoke`: CI starts the real app and opens a drawing window. |

The CSP in `src-tauri/tauri.conf.json` is `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; …`, so no remote scripts, no inline styles, and no `eval`. That constraint drove the choice of the TeaVM JavaScript build of OPSIN over the Wasm-GC build (decision 0002).

### Frontend and document model

- `src/main.tsx` → `App.tsx` → `Home.tsx` (recent drawings) or `Editor.tsx` (the whole editor in one 8,500-line component).
- The document is one immutable `Mol` object (`src/render.ts` types): `atoms` (label, `text` for abbreviations, `location` [x, y, z] in bond lengths with y up, charge, radical, isotope, CIP flags, map numbers, enhanced stereo, colours), `bonds` (`type` 1/2/3/4 aromatic/10 H-bond/14 quadruple, `stereo`, `display`), `arrows` (19 kinds incl. curved, fishhook, orbital, TLC), `captions` (rich text), `shapes`, `cycles`, `spectra`. Coordinates are in bond lengths, so the document style (ACS 1996 by default, `src/docstyle.ts`) sets points per bond at render time.
- Undo/redo (`Editor.tsx` lines 132–145): a `{ stack: Mol[], at }` reducer. Every edit pushes a whole new `Mol`; a `merge` key folds repeated edits (a slider drag) into one step. There is no cap on the stack, which issue #2 calls out ("unbounded undo history").
- Rendering is Octet's own SVG. `render()` in `src/render.ts` (178 KB) turns a `Mol` and a style into polygons, labels and boxes (`Drawing`); React draws them as SVG paths and `<text>`. `renderParts()` caches per structure so an edit re-renders only what changed. No canvas, no Ketcher, no Indigo rendering.

### Native file format

Decision 0004 and `src/oct.ts`: a `.oct` file is a full CDXML document (written by `src/cdxml.ts`) followed by `<!--Octet 1 <hash> <base64 of Octet's JSON>-->`. On open, a matching hash restores the JSON exactly; a missing or changed hash (ChemDraw edited it) falls back to reading the CDXML and reports what was lost. `.cdx` files Octet saves carry the same JSON in a user property (tag `0x4F43`). Old `.octet` JSON files still open. A setting makes `.cdxml` the default.

### CDX and CDXML

Octet does both formats itself; Indigo is not used for them (decision 0009), because Indigo dropped boxes, arrows, text and document settings in 25 of 35 real ChemDraw files.

- `src/cdxml.ts` (203 KB): a bounded XML parser (`parseXml`), `toCdxml(mol, style)` and `fromCdxml()`. The reader counts what it cannot hold in a `lost` map (hidden objects, annotations, unplaced atoms, odd bond displays) and the UI reports it.
- `src/cdx.ts` + `src/cdxtags.ts`: binary CDX is converted to and from the same XML tree, so one reader and one writer serve both. Header `VjCD0100`, both byte orders, nesting capped at 64, objects at a million. Text runs are written twice (Mac Roman legacy + UTF-8) as ChemDraw does.
- Claimed coverage (decision 0009): ChemDraw's own 50 template and stationery CDX files read and write back; 369,369 of 383,423 properties byte-identical. `scripts/cdxml-corpus.ts` round-trips Sam's 68 files (local only, not in the repository). Not yet checked: whether ChemDraw opens a CDX or `.oct` that Octet wrote.

### Clipboard to Office

`src-tauri/src/clipboard.rs` puts one item with several types, in ChemDraw's order. No plain text (ChemDraw would paste it as a caption, Word would paste it before the picture).

| | macOS | Windows | Linux |
| --- | --- | --- | --- |
| Picture | `com.adobe.pdf`: vector PDF at true size, fonts embedded, CDXML in `/Metadata` | `CF_ENHMETAFILE` (Octet's own EMF, vector, CDXML in a comment) + `CF_DIB` bitmap | `image/png` + `image/svg+xml` |
| CDX | `com.perkinelmer.chemdraw.cdx-clipboard`, `com.revvity…`, `com.cambridgesoft.cdx` | "ChemDraw Interchange Format" | `chemical/x-cdx` |
| CDXML | `com.perkinelmer.cdxml`, `com.revvity.cdxml`, `com.cambridgesoft.cdxml` | "CDXML" | `chemical/x-cdxml` |
| Molfile | `com.mdli.molfile` (length-prefixed lines) | "MDLCT" | `chemical/x-mdl-molfile` |
| SMILES | `org.opensmiles.smiles` (NUL-terminated) | "SMILES" | `chemical/x-daylight-smiles` |
| Octet | `io.github.samchemman.octet.json` | `application/x-octet+json` | `application/x-octet+json` |

The EMF on Windows arrived in 1.0.28 ("Vector picture on the Windows clipboard"); decision 0011 still says PNG + DIB and is out of date. Because the CDXML rides inside the PDF or EMF, a picture copied back out of Word pastes into Octet (and ChemDraw, on the Mac) as an editable structure. Paste reads, in order: Octet JSON, CDXML, CDX, molfile, SMILES, CDXML in a PDF or EMF, text, then pictures. Neither Windows nor Linux has been tested by hand with Office (decision 0011, "Risks to check").

SVG export (`standaloneSvg` in `src/export.ts`) serialises the live `<svg>` of the canvas, so SVG text stays `<text>` (font named, not outlined). The PDF embeds subset fonts; EMF and EPS draw text as glyph outlines.

### Tools and ChemDraw's shortcuts

The tool palette is in `src/tools.tsx`; the key map in `src/keys.ts`. Each action has a place (over an atom, over a bond, anywhere), so one key does different things in different places, as in ChemDraw 22.2's hotkey table. Users can rebind every action, and the Actions panel's own commands can take keys too.

| Key | Over an atom | Over a bond | Anywhere |
| --- | --- | --- | --- |
| c, h, n/w, o/q, s, p, f, l/⇧C, b, i, ⇧B, ⇧S, ⇧L | C, H, N, O, S, P, F, Cl, Br, I, B, Si, Li | c: centre double bond; h: hashed wedge; l: second line left; b: bold; f: bond to front | |
| m, e, ⇧P, ⇧A, ⇧O, ⇧E, ⇧F, ⇧N, ⇧Z, ⇧M, ⇧Q, ⇧H, y/⇧Y, d, r, x | Me, Et, Ph, Ac, OMe, CO2Me, CF3, NO2, N3, MgBr, Fmoc, Cbz, Boc, D, R, X | d: dashed; r: second line right; y: wavy; ⇧H: hashed; ⇧D: dashed double; ⇧B: bold double | x: Bond tool; e: Arrow tool; ⇧E: Symbols; t: Text |
| 1, 0, 2, 3/a, 4, 5, 6, 7, 8, 9 | Add bond (zig-zag), bond the other way, acetyl or C=O, phenyl, wedged Me, hashed Me, cyclohexyl, cyclopentyl, =CH2, two methyls | 1/2/3: single/double/triple; 4–8: fuse 4- to 8-ring; a: fuse benzene; 9/0: fuse chair either way | |
| v, u, z, k, ⇧K, j, ⇧J | cyclopropyl, cyclobutyl, alkyne, sulfonyl, t-Bu, η5-Cp, η6-phenyl | v: fuse cyclopropane; z: fuse cyclopentadiene; w: wedge | j: Benzene tool; ⇧J: Cyclopentadiene tool |
| + / − | charge up / down | | |
| Return, !, >, ., ', /, =, g | label, new label, sprout and label, attachment point, atom number, properties, nickname, select here | / : bond properties | g: TLC tool (anywhere) |
| space, ⇧X, ⇧T, ⇧G, [, ] | | | Select, Chain, Bracket, Orbital tools; eraser size |
| arrows, ⇧arrows, ⌥↑/↓, ⌥←/→, ⌥⇧arrows | | | nudge 1 pt / 10 pt, rotate 15° / 1°, tilt 12° in 3D |
| ⌘ arrows | | | reaction arrow plus a copy of the selection in that direction (ChemDraw's reaction shortcut) |

Issue #10 reports that pressing W or H over an existing stereo bond does not flip its direction, which ChemDraw does.

### Clean-up and layout

- New structures (SMILES, names) are laid out by Indigo (`ind.layout(…, "ket")` in `parseStructure`, `src/chem.ts`).
- Clean Up Structure is `src/clean2d.ts`: a TypeScript port of Indigo's `MoleculeCleaner2d` (Apache-2.0, credited in the header) with changes. Gradients are central differences, only local energy terms are summed (Indigo recomputed the whole energy per atom, O(N³) per round), close atoms are found through a grid, steps follow conjugate gradients near the end, and ring angles aim at the regular polygon of their ring size rather than 120°. `cleanUp()` in `chem.ts` then rescales to the structure's own bond length, re-centres, and levels the result as ChemDraw does (bottom ring bond level, or bonds on 30° multiples).
- `src/clean3d.ts`, `src/perspective*` and `src/axial.ts` handle chairs, Newman projections and axial chirality. Structures drawn in perspective are left alone by Clean Up.
- Known weak spots from the issues: cycloalkynes are forced linear and distorted (#11); taxol and strychnine from Name to Structure come out with atoms on bonds (#9). The taxol case reproduced in the dev build: the structure is right (C47H51NO14, 853.92) but the layout triggers several "C16 is very close to a bond" warnings, and every stereocentre shows an "abs" enhanced-stereo flag.

### Catalytic cycles "in one step"

`src/cycle.ts`, driven by `cycleAction("make")` in `Editor.tsx` (about line 3299) and the Actions panel's "Make a catalytic cycle" (shown when two or more structures are selected).

1. Take each selected connected structure (`fragments()`), compute its ink-box centre, and the mean of those centres as the cycle's centre.
2. `orderAround()` sorts the structures clockwise from 12 o'clock by angle about that centre, so the order is the one the user drew them in on the page.
3. `spreadCycle()` picks a radius so no two intermediates come within about two bond lengths: `R = max(2.5, (2·size + 2) / (2·sin(π/n)))` bond lengths, where `size` is the largest half-diagonal. Each intermediate is moved to an even angle on that circle.
4. The cycle is stored as data (`Mol.cycles`: centre, radius, direction, node atom lists, optional angles, gap, scale, colour). Arrows are never stored. `layoutCycles()` recomputes them on every render: for each step it walks along the circle from one node's angle to the next in 0.01 rad steps until it leaves each intermediate's ink box plus a 6 pt gap, then emits a curved arrow whose `bend` puts its middle on the circle. Reagents in and products out are captions or structures tied to a step and side, drawn as side arrows; a reagent and product on the same step merge into one pass-through swoop of fixed length (1.3 bond lengths each side).

So "one step" means select, click, done; the arrows then follow the intermediates when they are edited or moved. Actions also offer tidy, reverse, centre label, reagent in, product out and ungroup. A separate Cycle tool draws a circle first and lets the user drop intermediates on it.

### Command palette and Actions panel

- `src/CommandPalette.tsx` (⌘K): every command, tool, template and setting by name with its shortcut, ranked by a hand-written fuzzy score (whole name, prefix, word prefix, substring, then letters in order with bonuses for word starts). Recent commands are kept in `localStorage`. A typed name, abbreviation or SMILES becomes a "Draw …" command once typing pauses, so the palette doubles as Name to Structure.
- `src/Actions.tsx`: a dock in the bottom right whose content follows the selection. It shows what the selection is (formula, mass), what is wrong with it (problems from `src/check.ts`, each with a fix and a "Show" button), then actions likeliest first (Clean up, Convert structure to name, R/S, ¹H, ¹³C, Search Reaxys/PubChem, colours, align, make cycle…). Long lists fold into icon buttons. Every action is also in a menu or has a key.

### Name to structure

`src/names.ts` `nameToSmiles()` and `src/dictionary.ts`, in this order (decision 0015):

1. The user's own names (Settings > dictionary).
2. `src/common.ts` (515 reagent and abbreviation entries: THF, K2CO3, Pd(PPh3)4) and `src/drugs.ts` (305 drug names with SMILES).
3. Dictionary names OPSIN misreads, marked `!` (2,208 names, e.g. tropicamide).
4. OPSIN 2.8.0 in JavaScript (`src/vendor/opsin/opsin.js`, 1.57 MB; `opsin-data.bin`, 6.9 MB of OPSIN's XML resources and prebuilt automata). `tools/opsin/build.sh` rebuilds it with TeaVM 0.16.0; five Java classes are replaced (resource reader, a mini XML reader, automaton loader, a log4j stub) and OPSIN's data is patched for a few retained names. About 150 ms to load and 0.5 ms a name in JavaScriptCore (decision 0002). Then OPSIN again on a tidied name (catalogue quirks such as `meso-tetra…porphyrin`).
5. The dictionary `data/names/dictionary.tsv.gz` (1.63 MB gzipped, 4.05 MB of text): 28,880 compounds, 67,602 names (English and German labels and aliases, single-ingredient brand names), 27,031 CAS numbers with the check digit verified, and an InChIKey for each. Built by `scripts/build-dictionary.ts` from Wikidata (CC0), limited to compounds with an article in one of ten large Wikipedias, and refereed against PubChem (names that are short, codes or English words stay only if PubChem agrees; shared names go to PubChem's pick). On 200 random names: 181 exact, 9 other stereo, 6 salt/parent, 4 tautomer, none wrong.
6. Condensed formulas (`src/condensed.ts`: CH3CH2OH, PhCH2OH, Me3SiCl; a molecular formula such as C2H6O is refused), peptide sequences (`peptideName()`: three-letter codes with H-/Ac- and -OH/-NH2 caps, D- prefixes, turned into an OPSIN name such as N-acetyl-L-alanyl-glycine), "alpha alanine".
7. Salts ("sertraline hydrochloride"), adducts and hydrates ("CuSO4·5H2O"), mixtures with ratios, and lists of up to 20 names.
8. SMILES or InChI, only when the text looks like SMILES (`looksLikeSmiles()`), because Indigo reads "aspirin" as a SMARTS of S, P and query atoms.
9. Online, only after Return and only with Settings > Online search on (the default): PubChem PUG REST by name or InChIKey, through `src-tauri/src/pubchem.rs`. More than one CID is refused.

Spelling mistakes are not read silently. `suggestName()` offers a near name: the shortest completion of a known name, else the closest name by edit distance (1 mistake up to 5 letters, 2 up to 12, 3 beyond) from OPSIN's 6,701-name list plus the dictionary's trigram index, else any OPSIN-readable string one keystroke away (swaps first). The editor previews the suggested structure under the field and Tab accepts it; the website demo (`web/namedemo.ts`) applies it and labels the result "Spelling fixed". A bad CAS check digit gets its own message ("Not a CAS number. The last digit must be 2.").

### Structure to name

Octet's own namer, not a port: `src/namer.ts` (225 KB) plus `namer-hetero.ts`, `namer-multiplicative.ts`, `namer-maingroup.ts`, `fusion.ts` (fused ring names), `complexes.ts` (coordination compounds, κ and η terms), `vonbaeyer.ts`, `cip.ts` (Octet's own CIP labeller, decision 0013, which replaced Indigo's after it mislabelled 100 of 300 structures in a CIP validation suite). It follows the IUPAC 2013 recommendations.

Every name goes through `checkedName()` (`src/naming.ts`): the name is parsed back with OPSIN and must give the same standard InChI as the drawing, or it is not shown. When the namer has nothing, Octet falls back to a known name keyed by InChI (`src/nameindex.json`, 616 entries such as morphine or adamantane), then the coordination-compound namer. So the namer may say nothing but should never say something wrong.

### NMR prediction

`src/nmr.ts`, decision 0006. HOSE codes up to six spheres, computed on Octet's own molecular graph by the same code that built the table, looked up in `data/nmr/shifts.bin.gz` (6.3 MB): median shift, standard deviation and count per code hash for ¹H and ¹³C, from measured spectra in nmrshiftdb2 (the nmrshiftdb2 Database License, ODbL-style share-alike, kept in its own folder). Lookups fall back to shorter codes. ¹³C has solvent-specific tables. ¹H multiplicities come from fixed J values (aromatic ortho 8 Hz, vinylic 12 Hz, sp³ vicinal 7 Hz, meta 2 Hz); OH/NH/SH are broad and vanish in D₂O and CD₃OD. Each signal is rated good/medium/rough by sphere count and spread, and `acsText()` writes an ACS-style line. Held-out accuracy (`scripts/nmr-table.ts --test`): ¹³C mean absolute error 2.27 ppm (median 0.90), ¹H 0.25 ppm (median 0.09).

Other predicted properties (`src/props.ts`): tPSA (Ertl), Joback group contributions (Tb, Tm, Tc, Pc, Vc, ΔHf, ΔGf), ESOL logS, Henry's law, and pKa by functional group from Dimorphite-DL's site table. logP and molar refractivity come from Indigo (Wildman–Crippen). There is also a mass spectrum panel (`src/MassSpec.tsx`, isotope patterns, fragment cuts) and measured spectra import (JCAMP-DX, `src/jcamp.ts`).

### Tests and CI

- `npm test` = `tsc --noEmit -p .` then `scripts/checks.mjs`, which runs every `src/*.check.ts` as its own Node process (Node 24's built-in type stripping; no test framework) and reports "N of 90 check files pass". Checks print to stdout, which the runner discards; failures show on stderr.
- Many checks are corpus checks: `namer.check.ts` names structures and requires OPSIN to read each name back to the same InChI; `dictionary.check.ts` checks names against PubChem's InChIKeys; `cip.check.ts` runs a CIP validation set; `cdxml.check.ts` and `cdx.check.ts` round-trip every object type and hostile files.
- Some checks assert speed (for example "paclitaxel under 5 ms", "no suggestion takes 20 ms", "a 1,000-atom chain under 1000 ms"). These fail on a loaded machine (below).
- `.github/workflows/check.yml`: on every push, Ubuntu 22.04, Node 24: `npm ci`, `npm test`, `cargo test`, `npm audit`, `cargo audit`; plus a smoke job on Windows, Ubuntu and macOS that builds `tauri build --debug --features smoke` and starts the real app under a 300 s timeout. `platforms.yml` exercises clipboard and menu keys on Windows and Linux runners.

### Release and signing

`.github/workflows/release.yml` builds every installer on GitHub Actions (`tauri-action`); nothing is built on a personal machine. Each signing secret is optional and the build degrades to unsigned.

- Mac: Developer ID certificate, hardened runtime, notarised and stapled; the workflow also notarises the `.dmg` itself with `xcrun notarytool` (since 1.0.26/1.0.27). Universal binary, 32 MB.
- Windows: not signed yet. The workflow supports either a `.pfx` or a `WINDOWS_SIGN_COMMAND` (it installs `trusted-signing-cli` for Azure Trusted Signing). The code-signing page at octet.software/code-signing.html uses the wording of SignPath Foundation's required policy (team roles, "will not transfer any information … unless specifically requested"), which suggests an application for free OSS signing. Installers: NSIS `.exe` (15 MB), an offline `.exe` with WebView2 bundled (233 MB), `.msi`.
- Linux: `.deb`, `.rpm`, AppImage (95 MB).
- Updates: minisign signatures (`.sig`) and `latest.json`, verified against the public key in `tauri.conf.json`.
- `.npmrc` sets `ignore-scripts=true`; GitHub Actions are pinned by commit SHA.

### Telemetry and network

No analytics, no crash reporting, no licence check, no account. Network use (README "Privacy", decision 0008, 0010, 0015):

| What | When | Default |
| --- | --- | --- |
| Update check (GitHub) | On launch | On (Settings > General > Updates) |
| Search Reaxys / Search PubChem | Only when pressed; opens the browser with the structure in the URL | Offered (Settings > Import and export > Online search) |
| PubChem name lookup | Only when the user presses Return on text nothing offline reads | On, same Online search switch |

The README's Privacy section and the code-signing page list the update check and the two browser searches but not the PubChem name lookup, which decision 0015 added on 27 October.

## Running it

### Install

`npm ci` with the system Node 20.15 finished with 0 vulnerabilities, but skipped rolldown's native binding (`@rolldown/binding-darwin-arm64`), so Vite would not start until it was installed by hand (`npm install --no-save @rolldown/binding-darwin-arm64@1.2.14`). The checks need Node 24 type stripping; Node 22.17 worked with `--experimental-strip-types`.

### Type check and check files

Node 22.17, `NODE_OPTIONS="--experimental-strip-types --no-warnings"`, Apple silicon Mac. While the full run went, the edge-case suite also ran, and later a Rust build, so the machine was loaded.

| Step | Result |
| --- | --- |
| `tsc --noEmit -p .` | pass, 7 s |
| `node scripts/checks.mjs` (full run) | **82 of 90 check files pass**, 11 min |
| The 8 failures run again, one at a time | 7 pass. `access.check.ts` failed once more and passed twice (flaky) |
| `cargo test --manifest-path src-tauri/Cargo.toml` | **46 passed, 0 failed, 1 ignored** (`pubchem_answers`, which needs the network). Build 3 min 16 s, tests 19 s |

All 8 failures in the full run were timing asserts, or a deadline-bound optimisation stopping early:

```
access.check     what the hotspot says: 1.99 ms on four times the drawing, 14.3 times as long
cip.check        paclitaxel under 5 ms
clean3d.check    500 atoms in 10487 ms
cleanup-geometry p-terphenyl, drawn by hand at 200%: a second Clean Up moves nothing (7.1e-5 bond lengths)
cleanup.check    a 1,000-atom chain took more than 1000 ms
dictionary.check no suggestion takes 20 ms
edit.check       Group took 143.313541 ms
layout.check     a carbon with 166 phenyls (997 atoms) took more than 2000 ms
```

No check failed on a wrong chemical answer.

### Dev build in a browser

`npx vite --port 1420` served the editor at http://localhost:1420/ (it is the Tauri dev URL; outside Tauri the page uses the browser clipboard and has no native menus). It opened to a "what shall we call you?" prompt (skipped), then a new drawing with a coach tip, the left tool bar, and the Actions dock. Typing "asprin" in Convert name to structure showed "aspirin  Tab" under the field and previewed aspirin's structure. "taxol" drew paclitaxel with the overlaps and "abs" flags described above. The server was stopped at the end.

## Edge-case suite

Run with `OCTET=… node --experimental-strip-types --no-warnings docs/landscape/opensource/scripts/octet_suite.mjs`. It loads Octet's own modules in Node with the browser stand-ins `src/chem.check.ts` uses, so every result is Octet's code path, not a reimplementation. Loading Indigo, OPSIN, the dictionary and the NMR table took 4.0 s (idle machine). Nothing in the suite used the network: PubChem lives in the Rust side, which Node cannot reach. Sections B and E need the GUI and were not run.

### A. SMILES input and round trip

| ID | Result | Notes |
| --- | --- | --- |
| A1 | pass | CCO, C2H6O, 46.07 |
| A2 | pass | Read with `dearomatize-on-load`, so drawn Kekulé; SMILES out `C1C=CC=CC=1` |
| A3 | pass | Same canonical SMILES as A2 |
| A4 | pass | C10H8, 128.17 |
| A5 | pass | `[nH]` kept: C4H5N, SMILES out `C1=CNC=C1` |
| A6 | pass | (S) by Octet's CIP labeller; SMILES out `C[C@@H](C(O)=O)N` (same centre) |
| A7 | pass | E and Z kept apart (`F/C=C/F`, `F/C=C\F`) |
| A8 | pass | Two fragments, +1 and −1 |
| A9 | pass | Kept charge-separated, `C[N+]([O-])=O` |
| A10 | pass | No valence error |
| A11 | pass | Isotope 13 kept, MW 17.04, exact mass 17.0347 |
| A12 | pass | Radical kept; SMILES out is CXSMILES `[CH3] \|^1:0\|` |
| A13 | pass | 3- and 12-rings, no overlapping atoms (Indigo layout) |
| A14 | pass | Cubane laid out with no atoms closer than 0.3 bond (coordinates only; not inspected by eye) |
| A15 | pass | Accepted as Fe²⁺ and two Cp⁻ ions. Octet draws metallocenes as sandwiches only from names or the j key |
| A16 | pass | One arrow, reactant and product. `toSmiles` gives the molecules dot-joined; reaction SMILES needs `toReaction()` with steps |
| A17 | pass | Same SMILES for both |
| A18 | pass | Four stereocentres kept (R,R,S,S); the anomeric centre is unspecified in the input |
| A19 | pass | `xyz` fails `looksLikeSmiles()`, so the app treats it as a name and finds none; `C1CC` goes to Indigo, which throws "cycle 1 not closed". The editor shakes the field; no crash |
| A20 | pass | 48-residue peptide, 313 heavy atoms: layout 322 ms, `render()` 130 ms, no overlapping atoms. The limit is 1,000 atoms and 20,000 SMILES characters |

### C. Interoperability

| ID | Result | Notes |
| --- | --- | --- |
| C1 | pass | V2000 out and back: same InChI, still (S) |
| C2 | pass | Valid V3000 (`M  V30 BEGIN CTAB`), reimports to the same InChI |
| C3 | partial | No ChemDraw-made file was available (Lone Pair's `tests/` has none; Octet's corpus is private). Octet's own CDXML of A16 plus a caption read back with nothing lost, and its CDX (2.8 KB) read back the same. An Indigo-written CDXML of caffeine with a hand-added ChemDraw `<graphic>` + `<arrow>` and `<t>` text read with 14 atoms, the same InChI, the text, and two arrows (the pair is not merged without `SupersededBy`). Indigo's `convert()` CDXML, which has no `p=` coordinates, loads as 0 atoms with `lost: {atom: 14, bond: 15}` |
| C5 | n/a in Node | SVG is made by serialising the live canvas (`standaloneSvg`, needs a DOM). From the code: text stays `<text>` in SVG; PDF embeds subset fonts; EMF and EPS draw glyph outlines |
| C7 | pass | `QNAYBMKLOCPYGJ-REOHCLBHSA-N` |
| C8 | pass | caffeine (OPSIN) and aspirin (`drugs.ts`) give the right InChIKeys |
| C9 | pass | "(2S)-2-aminopropanoic acid", checked by OPSIN read-back |

### D. Analysis

| ID | Result | Notes |
| --- | --- | --- |
| D1 | pass | C8H10N4O2, 194.19 |
| D2 | pass | 194.0804 |
| D3 | pass | S |
| D4 | pass | ¹H 3 signals: 4.10 (q, 2H), 1.97 (s, 3H), 1.20 (t, 3H); ¹³C 4 signals: 170.7, 60.4, 21.0, 14.4. Literature (CDCl₃): 4.12, 2.05, 1.26; 171.1, 60.5, 21.0, 14.2. ACS text: "¹H NMR (400 MHz, CDCl₃) δ 4.10 (q, J = 7.0 Hz, 2H), 1.97 (s, 3H), 1.20 (t, J = 7.0 Hz, 3H)." |
| D5 | pass | Aspirin: logP 1.31 (Wildman–Crippen via Indigo), MR 44.71, tPSA 63.60 Å² (Ertl), carboxylic acid pKa 3.46 (Dimorphite-DL site table), Joback Tb 641 K |

### Name to structure stress set

All offline (no network used). "Via" is the step that read it.

| Input | Result | Via | Notes |
| --- | --- | --- | --- |
| caffeine | pass | OPSIN | RYYVLZVUVIJVGH-UHFFFAOYSA-N; named back as 1,3,7-trimethyl-3,7-dihydro-1H-purine-2,6-dione |
| aspirin | pass | `drugs.ts` | BSYNRYMUTXBXSQ-UHFFFAOYSA-N; named back 2-(acetyloxy)benzoic acid |
| Tylenol | pass | dictionary (Wikidata brand) | paracetamol, RZVAJINKPMORJF-UHFFFAOYSA-N |
| asprin | pass (by suggestion) | `suggestName()` | `nameToSmiles` gives nothing; the suggestion is "aspirin", which the editor previews and Tab accepts (seen in the dev build) |
| 50-78-2 | pass | dictionary CAS | aspirin |
| BSTFJNMPWXRSBF-UHFFFAOYSA-N | pass (correct refusal) | none | Not in the dictionary. PubChem has no CID for it either (checked separately), so the online step would also fail. In the app, Return would send it to PubChem |
| 2-acetoxybenzoic acid | pass | OPSIN | aspirin |
| (2S)-2-aminopropanoic acid | pass | OPSIN | L-alanine, REOHCLBHSA |
| Ac-Ala-Gly-OH | pass | peptide rule → OPSIN | C7H12N2O4, `CC(=O)N[C@@H](C)C(=O)NCC(=O)O` |
| CH3CH2OCH2CH3 | pass | `condensed.ts` | diethyl ether; named back "ethoxyethane" |
| taxol | pass (structure) / partial (drawing) | dictionary | paclitaxel, C47H51NO14, RCINICONZNJXQF-MZXODVADSA-N, full IUPAC name back. The 2D layout overlaps (issue #9) |
| tetrakis(triphenylphosphine)palladium(0) | pass | `common.ts` | C72H60P4Pd, named back the same |
| 1,2,3,4-tetrahydronaphthalene | pass | OPSIN | tetralin |
| trans-but-2-enedioic acid | pass | OPSIN | fumaric acid; named back (2E)-but-2-enedioic acid |
| flurbonium xyz | pass (clean refusal) | none | No structure, no suggestion. In the app, Return would query PubChem (on by default) |
| extra: 50-78-3 | pass | CAS check | Refused with "Not a CAS number. The last digit must be 2." |
| extra: acetaminophin | pass (by suggestion) | `suggestName()` | acetaminophen |
| extra: Advil | pass | dictionary | ibuprofen |

## Maturity and known bugs

The project is three weeks old and moves fast (775 commits, 24 releases, several a day). Decision records are dated and specific, and many end with "Risks to check" that admit what has not been tested: ChemDraw opening an Octet-written CDX or `.oct`, Office on Windows and Linux. The ten open issues were all filed on 3 November, the day after 1.0.29 went public:

| # | Title | Area |
| --- | --- | --- |
| 12 | Unwanted deletions when deleting a single item (text boxes in a ChemDraw import) | edit |
| 11 | Cycloalkynes have odd behaviour with Clean up structure | layout |
| 10 | W/H over a stereo bond does not change its direction | keys |
| 9 | Name to structure for complex molecules (taxol, strychnine) gives warnings and poor layout | layout |
| 8 | Exporting the full page, not the selection | export |
| 7 | Hash spacing and wedge connections | render |
| 6 | Adding cyclopentadiene with "j" gives the wrong result | keys |
| 4 | Ribbon not loading in a new sheet after closing the previous one | UI |
| 3 | Chair angle and chair linking | enhancement |
| 2 | An AI-assisted static review: concurrent saves sharing temp names, MW of multi-component formulas, races in the recent list, unbounded undo and caches | code review |

Recent commits include "Remove decompiling notes from the public repository"; `CLAUDE.md` and `docs/licence.md` set rules for what may come from studying ChemDraw (facts such as tag tables, never code), and the CDX tag table is described as generated from research notes on ChemDraw's file-format library and the public CDX spec.

## Lessons for Lone Pair

1. **Put the CDXML inside the picture.** Octet's PDF on the Mac and EMF on Windows carry the drawing's CDXML (PDF catalog `/Metadata`; an EMF comment record), so a picture pasted into Word and copied back out is still an editable structure. Lone Pair copies a PNG. A browser cannot write PDF or EMF to the clipboard, but it can put `image/svg+xml` and `text/html` with an embedded `<svg>` carrying CDXML in a `<metadata>` element, and read it back on paste. Worth a spike.
2. **Mirror ChemDraw's clipboard type names.** The table above (CDX, CDXML, MDLCT, SMILES with NUL) is the fruit of real research and is in an Apache-2.0 file (`src-tauri/src/clipboard.rs`). A browser can only write web custom formats (`web chemical/x-cdxml`), so Lone Pair cannot talk to ChemDraw this way, but the list says which formats matter if a desktop wrapper ever appears.
3. **A checked name or no name.** `checkedName()` parses every generated name back with OPSIN and compares standard InChIs. Lone Pair should apply the same gate to any name it shows, whatever generates it.
4. **OPSIN runs offline in a browser.** TeaVM gives an `eval`-free ES module (1.57 MB, about 380 KB gzipped) plus a 6.9 MB data pack. That is heavy for a 2.4 MB single file, but it could load lazily the first time the name field opens, or be an optional add-on, and it would remove Lone Pair's dependence on PubChem for systematic names. Octet's `tools/opsin/` shows the five classes to replace.
5. **A small, refereed dictionary beats a big one.** 28,880 compounds from Wikidata, limited to compounds with Wikipedia articles and checked against PubChem, cover brand names, trivial names, CAS numbers and InChIKeys in 1.63 MB gzipped. Its build script (`scripts/build-dictionary.ts`) and its rules for ambiguous names (codes, short names, English words) are a ready recipe. Lone Pair could ship a smaller slice (top 5,000 compounds) inside the file.
6. **Suggest, do not silently correct.** Octet shows the corrected name and its structure but makes the user press Tab; the CAS check digit gets its own message. Lone Pair's lookup should do the same before going online.
7. **Name reading order matters.** Octet refuses to read a word as SMILES unless it looks like SMILES, because Indigo reads "aspirin" as SMARTS. Lone Pair has the same risk with any engine that accepts SMARTS; `looksLikeSmiles()` is a 15-line rule worth copying.
8. **Catalytic cycles as data.** Storing the cycle (centre, radius, node atom lists) and deriving the arrows on every render keeps the arrows fitted as intermediates change. The algorithm is simple: order by angle, radius from `n` and the largest box, walk the arc until clear of each box plus a gap. Lone Pair could add it in a few hundred lines.
9. **The Actions panel is the discoverability layer.** A dock that shows formula, problems with fixes, then likely actions for the current selection gives new users a path without hiding ChemDraw's keys from experts. Lone Pair's right-click menu holds similar actions; a selection-driven panel would surface them.
10. **HOSE-code NMR is cheap.** A 6.3 MB table of medians from nmrshiftdb2 gives ¹³C MAE 2.3 ppm and ¹H 0.25 ppm, and gave sensible ethyl acetate shifts. Note the share-alike data licence (kept in its own folder). Compare with Lone Pair's estimates on the same held-out set before changing anything.
11. **Speed asserts are fragile.** All 8 of Octet's check files that failed on a busy laptop failed on timing, and 7 passed when run again alone. If Lone Pair adds performance checks, give them a separate, opt-in job.
12. **Keep privacy text in step with features.** Octet's README and code-signing page omit the PubChem name lookup that is on by default. Lone Pair's README names its online lookups; keep a single list and point every page at it.
13. **Where Lone Pair still leads:** it runs in any browser with no install, works on phones (Octet has no web or mobile app and its brief rules them out), and has offline save as a single HTML. Octet's Windows build is not code-signed yet, and its Windows and Linux clipboard paths have not been tried by hand with Office.
