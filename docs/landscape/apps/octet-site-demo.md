# Octet Draw: the website's name-to-structure demo (browser test, 3 November 2026)

The demo box on octet.software runs the same name-to-structure code as the app, entirely in the browser. The source study is in [octet.md](octet.md).

## What loads

Watching the network while the demo runs shows no API call per lookup. On first use the page fetches, from `octet.software/n2s/`:

| File | What it is |
| --- | --- |
| `namedemo.js` | The demo's own code |
| `opsin-*.js`, `opsin-data-*.js`, `opsin-data-*.bin` | OPSIN (the IUPAC name parser), compiled to JavaScript, with its grammar data |
| `indigo-ketcher-norender-1.46.0-*.wasm` | Indigo, the Ketcher 1.46 WebAssembly build without its renderer |
| `dictionary.tsv-*.gz` | A gzipped name → structure dictionary |
| `names-*.js`, `names-*.txt`, `nameindex-*.js` | A name list and its search index (used for spelling correction) |
| `drugs-*.js` | Brand and drug names |
| `abbreviations-*.js` | Abbreviations |

So the design is: dictionary and drug list first, OPSIN for systematic names, fuzzy matching against the name index for typos, and Indigo for SMILES, InChI and layout. Every name tested here resolved offline. The app (not the demo) falls back to PubChem online as a last step; see [octet.md](octet.md).

## Results

| Input | Result | Notes |
| --- | --- | --- |
| `asprin` | **pass** | "aspirin" is offered as a suggestion (Tab accepts it), and aspirin is drawn |
| `Tylenol` | **pass** | Paracetamol |
| `50-78-2` (CAS) | **pass** | Aspirin |
| `taxol` | **pass** | Paclitaxel drawn. Its layout has crowding where the benzoate meets the oxetane |
| `Ac-Ala-Gly-OH` | **pass** | Peptide shorthand works. Whether Ala is drawn as L could not be read at the demo's size |
| `trans-but-2-enedioic acid` | **pass** | Fumaric acid, E geometry |
| `tetrakis(triphenylphosphine)palladium(0)` | **pass** | Drawn with four P–Pd bonds; the phenyl rings overlap |
| `BSTFJNMPWXRSBF-UHFFFAOYSA-N` | **pass** | Red outline, nothing drawn. This key was a mistake in the test set: it isn't aspirin's (aspirin's is `BSYNRYMUTXBXSQ-UHFFFAOYSA-N`), and it has no PubChem entry, so finding nothing is correct. The source study confirms the behaviour |
| `flurbonium xyz` (nonsense) | **pass, but silent** | Red outline and nothing drawn. There is no message saying why |

## Notes for Lone Pair

- An offline name-to-structure stack is practical in the browser: OPSIN as JavaScript plus a compressed dictionary. Lone Pair now goes to PubChem for names; this would make the common cases work offline.
- Offering a correction for a typo, rather than silently matching, keeps the user in control.
- A failed lookup should say why. A red outline alone leaves the user guessing.
