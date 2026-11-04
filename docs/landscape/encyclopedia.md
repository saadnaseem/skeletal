# The chemical structure editor landscape: reference

A reference to the field Lone Pair works in: who the players are, what parts every editor is built from, the file formats, the drawing conventions, and the hard problems. The per-app studies are in `apps/` and `opensource/`; how the apps compare is in [manual.md](manual.md).

## 1. The players

### 1.1 Commercial desktop
| Editor | Vendor | Notes |
| --- | --- | --- |
| ChemDraw | Revvity Signals (formerly PerkinElmer, CambridgeSoft) | The de facto standard in journals. CDX and CDXML are its formats. Professional costs $1,355 a year per person (list price, 19 October 2026, as quoted by Octet) |
| ChemSketch | ACD/Labs | Free edition for academics. `.sk2` format |
| Marvin | ChemAxon | Desktop (Java) and Marvin JS (web, often hosted, for example on RCSB). `.mrv` format |
| ChemStudio | Zoho | Free. Web (needs an account), Electron desktop (no account), and a Zoho Writer extension. See [apps/zoho-chemstudio.md](apps/zoho-chemstudio.md) |

### 1.2 Open-source desktop (new in 2026)
| Editor | License | Notes |
| --- | --- | --- |
| ChemDraft (chemdraft.ai) | Apache-2.0 | macOS and Windows. Tauri 2 with React 19. Plugin architecture, RDKit, OpenChemLib and IsoSpec inside, a trained pKa model, and an MCP server and CLI for AI assistants. See [apps/chemdraft.md](apps/chemdraft.md) |
| Octet Draw (octet.software) | Apache-2.0 | Mac, Windows and Linux. Tauri 2 with React 19, and Indigo WASM. ChemDraw shortcuts, CDX and CDXML, offline name to structure (OPSIN plus a dictionary). See [apps/octet.md](apps/octet.md) and [apps/octet-site-demo.md](apps/octet-site-demo.md) |

Both are a few weeks to five months old and were built largely with coding agents (Octet: 775 commits in 3 weeks; ChemDraft: 1,020 commits in 5 months).

### 1.3 Web apps
| Editor | Model | Notes |
| --- | --- | --- |
| MolDraw | Freemium (Pro tier) | React app, with Indigo in a worker. See [apps/moldraw.md](apps/moldraw.md) |
| MolView | Old app: source visible, license withdrawn in 2023. New app: closed, freemium (Paddle) | Strong on 3D. Needs PubChem to read any SMILES. See [apps/molview-rcsb.md](apps/molview-rcsb.md) |
| Lone Pair | Free, a single HTML file | This project |

### 1.4 Embeddable editor components
| Component | License | Engine | Notes |
| --- | --- | --- | --- |
| Ketcher | Apache-2.0 | Indigo (WASM or a remote service) | EPAM. The most widely embedded open web editor. See [opensource/ketcher-indigo.md](opensource/ketcher-indigo.md) |
| JSME | BSD-3, but only the compiled GWT output is public (no Java source) | Its own | Peter Ertl. Tiny and fast. Can be embedded but not forked. See [opensource/jsme-kekule-molview.md](opensource/jsme-kekule-molview.md) |
| Kekule.js Composer | MIT | Kekule.js (pure JavaScript) | Includes 3D and a chemistry toolkit. Has no SMILES reader of its own; that needs the 8 MB Open Babel WASM add-on |
| OpenChemLib CanvasEditor | BSD-3 | OpenChemLib (Java compiled with GWT) | Replaced the old StructureEditor in v8. Two canvases in a shadow DOM, 34 tools, and an `<openchemlib-editor>` web component. See [opensource/openchemlib-rdkit.md](opensource/openchemlib-rdkit.md) |
| ChemDoodle Web Components | GPL-3.0 or commercial | Its own | The old MolView uses it for 3D, crystals and spectra |
| Marvin JS | Commercial | ChemAxon | Often used through ChemAxon's hosted iframe |

### 1.5 Chemistry engines (toolkits)
| Toolkit | Language | Browser build | Strengths |
| --- | --- | --- | --- |
| RDKit | C++ | MinimalLib, Emscripten WASM (about 7–8 MB) | The reference toolkit: descriptors, InChI, depiction (MolDraw2D), fingerprints, 3D conformers |
| Indigo | C++ | WASM (Ketcher's `indigo-ketcher` build) | Formats, including CDX and CDXML, layout, reactions |
| OpenChemLib | Java | GWT JavaScript | Small, fast, and pure JavaScript (no WASM), with its own ID code |
| Open Babel | C++ | Unofficial WASM ports | Format conversion (more than 100 formats) |
| CDK | Java | None (server side) | Very complete; the base for many academic tools |
| OPSIN | Java | Compiled to JavaScript in Octet | IUPAC name to structure only |

## 2. The parts every editor has

The same parts recur in every editor studied, whatever the stack:

1. **Document model.** Atoms (element, charge, isotope, radical, implicit H, label or nickname, coordinates), bonds (order, stereo type, double-bond position), fragments, and non-chemical objects (arrows, pluses, text, brackets, shapes). The best models keep *drawing* objects apart from *chemical* objects and link them (an arrow knows its reactants).
2. **Chemistry engine.** Valence, implicit H, aromaticity, ring perception, stereo perception (CIP), canonical SMILES, InChI, formula and mass. Nearly everyone borrows one (RDKit, Indigo or OpenChemLib) rather than writing their own.
3. **Coordinate generation (layout).** The 2D layout of a structure made from SMILES, and Clean up. This is the hardest part to get looking good: fused rings, macrocycles, cages and stereo-preserving layout.
4. **Renderer.** Bond lines, double-bond offsets and shortening, wedge and hash geometry, label placement (which side the H goes on, CH₃ against H₃C), knock-outs where a bond meets a label, and aromatic circles. SVG (Raphaël, plain SVG) or canvas.
5. **Tool system.** Each tool is a state machine over pointer events (down, move, up) with hover targets (atom, bond or empty space). Hover hotkeys (point, then press a key) are the fastest way to work, and ChemDraw, ChemDraft, Octet and Zoho all have them.
6. **Undo and redo.** Either command objects (operations with inverses, as in Ketcher) or snapshots of the whole document. Snapshots are simpler and fast enough for small documents.
7. **Input and output.** Parsers and writers for each format (section 3), plus the clipboard, which on the desktop means native formats for Office.
8. **Analysis.** Formula, mass, isotope patterns, properties, NMR, pKa, names.
9. **Lookups.** PubChem, ChEMBL, RCSB, and local databases.
10. **Shell.** Browser, Electron, Tauri, a native app, or an iframe-embedded component.

## 3. File formats

| Format | Kind | Notes and pitfalls |
| --- | --- | --- |
| SMILES | Line notation | Aromaticity models differ between toolkits, so canonical SMILES only matches within one toolkit. Stereo is local (`@`, `@@`, `/`, `\`). `[nH]` is needed for pyrrole-type N |
| SMARTS | Query line notation | For substructure queries. Not a structure format |
| InChI and InChIKey | Identifier | IUPAC's C library is the only reference implementation. The standard InChI drops some stereo and tautomer detail. Keys are hashes and can't be turned back into structures without a lookup |
| Molfile V2000 | Connection table | Fixed column widths, a 999-atom limit, a chiral flag; stereo is given by wedges plus coordinates |
| Molfile V3000 | Connection table | No size limit, enhanced stereo (ABS, AND, OR), and S-groups |
| SDF | A list of molfiles | With data fields |
| RXN V2000 and V3000 | Reaction | Reactant and product molfiles; agents in V3000 |
| CDX | ChemDraw binary | Little-endian, tag and value, with coordinates in 1/65536 pt. Documented by the old CambridgeSoft SDK; Indigo has the most complete open reader |
| CDXML | ChemDraw XML | The same object tree as CDX. Keeps document style, fonts, nicknames and arrows: the exchange format for publication figures |
| CML | XML | Chemical Markup Language |
| MRV | Marvin XML | ChemAxon |
| KET | Ketcher JSON | Ketcher's native format |
| JME | JSME string | Compact |
| chemfig | LaTeX | For typesetting |
| PDB, mmCIF | 3D, biomolecules | |
| Native app files | `.moldraw`, `.zcxml`, ChemDraft documents, Octet documents | Each app saves its own superset |

Images: SVG (text as text or as paths), PNG (dpi metadata matters for Office), PDF (vector), EPS, EMF (the Windows clipboard).

## 4. Drawing conventions (publication style)

- **ACS Document 1996** (the ChemDraw default for ACS journals): 14.4 pt bonds, 0.6 pt lines, 2.0 pt bold bonds, 18% bond spacing, 10 pt Arial labels.
- **RSC, Wiley, Nature.** Each has a style sheet. Zoho ships ACS, RSC and Wiley presets; Lone Pair has ACS, RSC, Nature Reviews and Slides.
- **Labels.** Carbon is implied at vertices, and heteroatoms show their H. A label flips with the bond direction (OMe against MeO). Charges sit top right.
- **Stereo.** Wedges start narrow at the stereocenter. Hashes are parallel lines of increasing length. A wavy bond means unknown stereo. Enhanced stereo labels are written abs, &1 and or1.
- **Double bonds.** In a ring, the second line goes inside the ring and is shortened. In a chain, it is centred, or offset towards the side with more substituents.

## 5. The hard problems (where editors differ)

1. **Stereo round trips.** Drawing → engine → drawing. The y-axis direction, the parity conventions and the wedge choice all have to agree. Tests have to read the drawing back with an *independent* toolkit. MolDraw loses both tetrahedral and E/Z stereo on paste (see [apps/moldraw.md](apps/moldraw.md)); Lone Pair had a mirrored y-axis bug (REVIEW.md item 14).
2. **Layout of difficult structures.** Cages (cubane), macrocycles, organometallics (ferrocene), and disconnected ions.
3. **Aromaticity models.** RDKit, Indigo and OpenChemLib give different answers for some heteroaromatics, so the same molecule gets a different SMILES in each.
4. **Hypervalent atoms and charge-separated forms** (nitro, sulfoxide, ylides): valence checks that warn without getting in the way.
5. **Abbreviations.** OMe, Boc and Ph have to count in the formula, expand on export, and flip with direction.
6. **CDX and CDXML fidelity.** The real test is a scheme going ChemDraw → app → ChemDraw.
7. **Pasting into Office.** True size, vector, and editable on a later round trip.
8. **Name to structure offline.** OPSIN for systematic names, plus a dictionary for trivial and brand names, plus fuzzy matching for typos (Octet), or a lookup in a local PubChem subset (Zoho).
9. **Prediction honesty.** NMR, pKa and ADME numbers need their method and confidence shown. ChemDraft's *provenance* section is the best example.
