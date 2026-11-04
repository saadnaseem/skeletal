# MolDraw (moldraw.com): second pass

The first pass, a feature inventory, is in [../../PLAN.md](../../PLAN.md) section 1. This pass adds the tech stack and edge-case tests. **Tested:** 3 November 2026, in the browser, without an account.

## How it is built (from what the page loads)

| Layer | Finding |
| --- | --- |
| Build | Vite (`/assets/index-<hash>.js`, 1.17 MB main bundle) |
| UI | **React** (over 400 references in the bundle), `zod` for schema validation |
| Chemistry | A web worker, `moleculeEngineWorker-<hash>.js` (157 KB), that references **Indigo** and Ketcher, so the engine is most likely Indigo's WebAssembly build, loaded on demand. The main bundle also mentions RDKit and openchemlib a few times |
| 3D | three.js and NGL |
| Export | jsPDF, plus its own chemfig writer |
| Data | PubChem (name and CAS search), ChEMBL |
| Third parties | Google Analytics, a `piqo.js` analytics script on `data.moldraw.com`, and a Charla chat widget |
| Plugins | Globals such as `__moldrawIsPluginLoaded` and `__moldrawGetPluginState` point to a plugin system |

## How input works

- **Paste** (Ctrl/⌘+V) a SMILES string onto the canvas; it lands where the pointer is.
- The **search** box (magnifier) takes a name or CAS number and goes to PubChem.
- File menu: New, Open, Place, Save MolDraw file (`.moldraw`), Save as (Molfile, ChemDraw, images), Page setup, Rulers.

## Results

| ID | Input | Result | Notes |
| --- | --- | --- | --- |
| A5 | `c1cc[nH]c1` | **pass** | Pyrrole, drawn with an aromatic circle and NH |
| A6 | `C[C@H](N)C(=O)O` | **fail** | Drawn with no wedge or hash. The stereocenter is lost from the picture, so a user can't tell L- from D-alanine |
| A7 | `F/C=C\F` (cis, Z) | **fail** | Drawn trans. The app's own **E/Z Analyzer** then reports "E", while the small diagram inside that same dialog shows both F on the same side (Z). The drawing, the label and the dialog's diagram disagree |
| A10 | `CS(=O)(=O)C` | **pass** | Dimethyl sulfone, no valence warning |
| A14 | cubane | **partial** | A recognisable projection, with crossing bonds |
| A15 | ferrocene as `[Fe+2]` + two Cp⁻ | **fail** | The two rings are placed exactly on top of each other, with Fe drawn inside them; the parts can't be told apart |
| A16 | `CC(=O)Oc1ccccc1C(=O)O>>CC(=O)O` | **fail** | Nothing is drawn and there is no message. Reaction SMILES isn't accepted by paste |
| A19 | `C1CC` (unclosed ring) | **fail** | Drawn silently as propane. There is no error for the unclosed ring bond |

## Lessons for Lone Pair

- **Check that a pasted structure's stereo survives into the drawing.** MolDraw keeps neither the tetrahedral center (A6) nor the double-bond geometry (A7). Lone Pair's REVIEW.md item 14 was the same class of bug. A browser test that pastes each A-case and reads the drawing back through an independent toolkit catches it.
- **Several views of the same stereo must agree.** If an analyzer, the canvas and an export each work out E/Z or R/S in their own way, they will drift apart. Work it out once in the engine and show that one result everywhere.
- **Reject bad input with a message.** Both the unclosed ring and the reaction SMILES fail silently.
- **Disconnected parts need to be laid out apart.** Ferrocene written as ions shows the problem.
