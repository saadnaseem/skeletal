# MolView and RCSB PDB chemical search: second pass

The first pass is in [../../PLAN.md](../../PLAN.md) section 1. The source study of the old MolView is in [../opensource/jsme-kekule-molview.md](../opensource/jsme-kekule-molview.md). **Checked:** 3 November 2026.

## MolView

MolView now runs as **two apps**:

| | Old MolView (molview.org) | New MolView (app.molview.com) |
| --- | --- | --- |
| Years | 2012–2015. "Deprecated with only critical bug fixes" | 2024 to now |
| Source | The code is still on GitHub, but the license was withdrawn in June 2023 (commit `0ec05be6`; it was AGPL before). So it can be read but not reused | Closed |
| Sketcher | MolPad (`molview-molpad.min.js`), its own canvas sketcher, using Ketcher's 2010 AGPL library for file reading and writing | A rewritten MolPad (`molpad-<hash>.js`, `sketcher-<hash>.js`) |
| 3D | GLmol and Jmol. ChemDoodle Web Components (GPL-3.0) is used only as a 3D and crystal viewer and for spectra, not as the sketcher | **Mol\*** (`molstar-<hash>.js`) |
| Data | PubChem (`PubChemProps`, `ChemIdentifiers`). There is no local SMILES parser or 2D layout; every SMILES goes to PubChem | |
| Build | Grunt-style concatenated, minified bundles under `/build/` | **Rolldown**/Vite chunks (`rolldown-runtime`, `routing`, `store`, `actions`, `viewer`) |
| Business model | Free | Free core plus **premium** features, sold through **Paddle** (with ProfitWell metrics) |
| Accounts | None | Sign up and sign in, optional |
| Features the new app advertises | | A redesigned sketcher and viewer, live 3D sync while sketching, several structures side by side, Lewis structures and reaction diagrams |
| Kept only in the old app | Protein viewer; Jmol (MEP surfaces) | |

**Not tested hands-on.** Both apps ask you to accept their Terms and Conditions before use (closing the old app's popup counts as accepting). This survey doesn't accept terms on the user's behalf. To run the test suite, open app.molview.com, accept, and paste the A-cases.

**Lessons for Lone Pair:** live 3D sync while sketching is MolView's main selling point. Mol\* is the current standard web viewer for proteins, and 3Dmol.js (used by Zoho) is the lighter option for small molecules.

## RCSB PDB chemical search

- The sketcher is ChemAxon **Marvin JS**, served from ChemAxon's hosted service: an iframe from `marvinjs.chemicalize.com/v1/<license-id>/editor.html`, controlled from the page by `client.js` over `postMessage` (the `origin` parameter tells the iframe which page may talk to it).
- So RCSB doesn't host or build a sketcher. It rents one and reads back SMILES or a molfile.
- The query builder combines **Chemical Similarity** (structure, formula or component ID) with **Chemical Attributes** using AND.

**Lesson for Lone Pair:** the hosted-iframe-plus-postMessage pattern is the usual way to embed an editor into another site. If Lone Pair is ever offered as an embeddable editor, the API to copy is small: load a structure, get SMILES or a molfile, and an on-change event.
