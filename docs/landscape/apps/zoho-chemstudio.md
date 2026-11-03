# Zoho ChemStudio

**Vendor:** Zoho Corporation. **Price:** free (web and desktop). **License:** proprietary, closed source. **Surveyed:** 3 November 2026, desktop version 1.1.3 for Apple silicon.

## How this was studied

ChemStudio is closed source, so there is no code to read. Sources used:

1. Zoho's product pages and help articles (Overview, Drawing in ChemStudio, Chemical analysis tools, Export options, Desktop app).
2. The macOS installer (`ZohoChemStudio.pkg`, 342 MB, from `files-accl.zohopublic.com`), unpacked without installing. Only its structure was looked at: the file list, the package manifest, library names and version strings, the Electron bridge names, and the schemas of the bundled databases. No Zoho code was copied into this survey.

**Not done:** hands-on tests. The web app needs a Zoho account, which this survey could not create. The desktop app is a GUI that couldn't be driven here, and running its unpacked web code in a browser was blocked by the permission check. The test-suite rows below are therefore marked **untested**, except where the docs or the bundle answer them. To fill them in, install the desktop app (no account needed) and work through [test-suite.md](../test-suite.md).

## Where it runs

| Surface | Account | Offline | Notes |
| --- | --- | --- | --- |
| Web app | Zoho account required. The first sign-in makes you create or join a **team**, and every drawing lives in a team space (Admin and Member roles) | No | Dashboard with recent files, projects, favourites and a recoverable trash |
| Desktop (Windows, macOS arm64 and x64, Linux .deb) | Not required ("No browser, internet access, or login required") | Yes | Opens ChemDraw and ChemSketch files |
| Zoho Writer extension | Zoho account | No | Draw in ChemStudio, insert into a Writer document as an image, and edit it later |

## How it is built (from the desktop package)

| Layer | What is there |
| --- | --- |
| Shell | **Electron 39.2.7**. App version 1.1.3. Entry `js/main.js` loads `chemstudio/html/documentinit.html` |
| Updates | `electron-updater` 6.6.2 with a generic provider on Zoho's file server (`app-update.yml`) |
| UI framework | **Lyte**, Zoho's in-house component framework (`chemstudio_lyte_min_all.js`, `ob_lyte_min_all.js`, `lyte-ui-api.css`). jQuery and jQuery UI are also bundled |
| Editor code | One minified bundle, `chemstudio-min-all.js` (2.9 MB) |
| Rendering | **Raphaël** (SVG) for the 2D canvas; **d3**; **canvg** (SVG to canvas, for raster export) |
| Chemistry engine | **RDKit MinimalLib** (`RDKit_minimal.wasm`, 7.9 MB). No sign of OpenChemLib, Indigo or OPSIN |
| 3D | **3Dmol.js** (WebGL), loading proteins from RCSB (`files.rcsb.org`, `mmtf.rcsb.org`) |
| Charts | Chart.js (most likely for the NMR spectrum plots) |
| Rich text | Zoho's RTE library 1.3.5, for text boxes |
| Native code | `better-sqlite3` 12.6.2 (unpacked from the asar, since it is a native module) |
| Bridge to the page | `contextBridge` exposes `electronChem`, `electronClipboard`, `electronDirty`, `electronFS`, `electronFile`, `electronMenu`, `electronRename` and `electronShell`. Unsaved-change tracking is pushed to the main process as it happens, so the close handler can check it without waiting (the code comment says this avoids Linux window managers reporting "not responding") |
| Online calls | PubChem PUG REST (`/rest/pug/compound/cid/`), RCSB for 3D proteins, and Google Scholar or Patents (opened in a browser tab) |

### The bundled databases: offline names and search

Most of the installer's size is two gzipped SQLite files:

| File | Size (gzipped) | Contents |
| --- | --- | --- |
| `chem_search_500k.db` | 81 MB | Table `chem` (500,000 rows: PubChem `cid`, `smiles`, `iupac`, `title`, `inchikey`, indexed on InChIKey) and table `names` (1,166,690 synonyms) with an **FTS5** full-text index |
| `chem_fingerprint_500k.db` | 136 MB | Table `fps` (499,456 rows): an RDKit fingerprint and an RDKit pattern fingerprint per CID, as blobs |

The CIDs are PubChem's (2244 is aspirin, 2519 caffeine, 36314 paclitaxel, with isomeric SMILES), from 1 to 564,986. So the desktop app's name-to-structure is a lookup in this PubChem subset rather than a name parser, and similarity and substructure search run locally: the pattern fingerprint screens, then RDKit confirms the match. A name outside these 500k compounds, or a new systematic name, can't be found offline. A full-text query for "tylenol" returned nothing, so brand names may be missing from the synonyms.

## Features (from the docs)

### Drawing
- Click to place C; pick H, O, C or the periodic table for other elements. Drag between atoms for a bond.
- Hover an atom and type a symbol to replace it; hover a bond and press 1, 2 or 3 for single, double or triple. Wedge and hashed bonds are in the Bond tool.
- **Hover and press Enter** on an atom to add an abbreviation (Me, Et, Ph, CF₃); it stays chemically linked.
- Drag one molecule onto another to merge fragments. **Substructure drag** moves part of a molecule and leaves the rest fixed.
- Charges, radicals, lone pairs, curved arrows, and an aromatic display toggle.
- Enhanced stereo groups (ABS, OR, AND), and R/S labels.
- **Clean Up Structure.**
- **Document standards:** ACS, RSC and **Wiley** presets that set bond length, line widths, fonts and spacing. Bond, atom, text and object settings per selection.
- **Markush structures:** R-group labels, brackets for variable regions, atom and bond lists.
- Group, ungroup, and **"group with integral"**, which locks the grouped structure against edits.
- An orbital drawing page (`zcorbital.html`).
- Templates library.

### Analysis
- **Molecular information** from the right-click menu: name, formula, molecular weight.
- **IUPAC name generation** (structure to name).
- **¹H and ¹³C NMR shift prediction** with a solvent choice, as an assignment list and a spectrum referenced to TMS, printable. It needs a selected structure. The prediction method isn't documented.
- **ADME report** from a SMILES string (absorption, distribution, metabolism, excretion, drug-likeness). The method isn't documented.
- **Stoichiometry table** for a selected reaction: masses, moles, volumes, expected yield, editable.
- **Synthesis** (breaks a structure into fragments) and **Retrosynthesis** (suggests precursors). Neither the method nor its limits are documented.
- **Equation balancing.**
- **Search:** PubChem similarity, substructure and superstructure; Google Scholar and Google Patents by SMILES. Note that several of these dialogs ask you to type a SMILES rather than taking the drawing.

### Files
- **Native format:** `.zcxml`.
- **Open:** MOL, SMILES, InChI, CAS numbers and names; ChemDraw and ChemSketch files (desktop).
- **Save as:** SMILES, SMARTS, InChI, PNG, BMP, GIF, SVG, CML, CDXML, PDB, Molfile, SDfile. The marketing page also lists CDX. PDF comes from Print.
- The help article on exports refers to "Password-protected exports above", but no such section is on the page.

### Security and compliance (web)
Help articles on encryption, GDPR readiness and HIPAA. Data sits in Zoho's cloud under team permissions.

## Test-suite results

| Area | Result | Source |
| --- | --- | --- |
| A1–A20 (SMILES) | **Untested** | RDKit MinimalLib parses SMILES, so A1–A18 should behave as RDKit does (see [../opensource/openchemlib-rdkit.md](../opensource/openchemlib-rdkit.md)). How the editor draws the result is unknown |
| B1–B15 (drawing) | **Untested** | |
| C1, C2, C5, C6 | Partly answered | Molfile, SVG and PNG are listed. V3000 isn't mentioned |
| C3 (open CDXML) | Claimed | "Work on your existing ChemDraw and ChemSketch files" |
| C8 (name to structure) | Claimed | Offline: a lookup in the 500k PubChem subset. Online: PubChem |
| C9 (structure to name) | Claimed | "IUPAC name generation" |
| D4 (NMR) | Claimed | ¹H and ¹³C with a solvent choice |
| D5 (properties) | Claimed | Formula and MW from the right-click menu; ADME report |
| E1 (account) | Web: required. Desktop: not required | Docs |
| E2 (offline) | Desktop: yes | Docs and bundle |
| E3 (save) | Web: cloud, team space with trash. Desktop: `.zcxml` files with unsaved-change tracking | Docs and bundle |
| E8 (AI) | None advertised | |

## Lessons for Lone Pair

- **Offline names, done by lookup.** A trimmed PubChem subset with an FTS5 index answers most name and CAS lookups without the network. Zoho's costs 217 MB gzipped, too much for a single HTML file. A list of the 10,000–20,000 most-looked-up compounds (names plus SMILES) would be about 1–2 MB gzipped and cover most teaching and lab use. Octet's approach (OPSIN in JavaScript plus a dictionary) covers systematic names as well; see [octet-site-demo.md](octet-site-demo.md).
- **Local substructure search** with RDKit pattern fingerprints as a screen is a clean design, if Lone Pair ever ships a local library.
- **Wiley preset.** Lone Pair's REVIEW.md says no published Wiley values could be found. Zoho ships one; once someone installs the app, its Document Settings would show the numbers to compare.
- **Hover + Enter for abbreviations** and **hover + 1/2/3 for bond order** are fast. Check which Lone Pair already has.
- **"Group with integral"** (a locked group) is useful for finished schemes, and cheap to add.
- **Stoichiometry table** and **Markush** are on Lone Pair's missing list; ChemStudio has both.
- **Where Lone Pair is ahead:** no account on the web, a single file, documented methods (Zoho documents none for NMR, ADME or retrosynthesis), more export formats (CDX, V3000, RXN, JME, chemfig, EPS and vector PDF), and the analysis tools take the drawing directly instead of asking for a typed SMILES.
