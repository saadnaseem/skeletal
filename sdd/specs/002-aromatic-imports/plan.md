# Plan — 002-aromatic-imports

> Status: approved (user, 2026-11-04) · Last updated: 2026-11-04
> The **how & in what order**. Every task group cites requirement IDs; every requirement appears in at least one group.

## 1. Approach
OpenChemLib reads a molfile's type-4 bonds as "delocalized" (bond type 8, order 1) and never gives them alternating double bonds. `fromOCL` then draws them as single bonds. ChemDraw, CML and Marvin files already avoid this: their readers mark aromatic bonds as order 1.5 and call `kekulize(atoms, bonds)` in `src/formats.js`. This plan sends molfile bonds through that same function (CON-001):

1. **`fromOCL` marks delocalized bonds.** A bond whose OCL type is `cBondTypeDelocalized` gets order 1.5 instead of 1. Only molfiles produce this type (OCL resolves SMILES and InChI rings itself), so SMILES is untouched (CON-003). This is checked by a unit test that runs every template and example through `fromOCL` and finds no 1.5 bonds.
2. **`molfileMol` reads the hydrogen counts itself.** OCL ignores the molfile's hydrogen-count field. Probed: a pyrrole N with `hhh`=2 ("one H") gets 0 implicit H, the same as with no count. The count also turns the molecule into a query fragment. So `molfileMol` reads the V2000 atom-block `hhh` column (value n+1 means n H; 1 means none) and V3000 `HCOUNT=`, and returns them by atom index. `kekulize` already takes an explicit count as `atom.h`, as ChemDraw's "NH" labels give it. An H drawn as its own atom already counts, because it is a non-aromatic neighbour.
3. **`kekulize` says what it couldn't do.** It returns the atoms that needed a double bond and got none (today it returns nothing). It is exported from FORMATS as `FORMATS.kekulize`. ChemDraw and CML/MRV keep calling it as before.
4. **A shared fragment step in `core.js`.** `kekulizeFragment(f, hcount)` copies `hcount` onto the fragment atoms as `h`, gives them temporary ids (fragment atoms have id 0 and bonds use indices, as in spec 001's `overValent`), calls `FORMATS.kekulize`, writes the orders back, removes `h`, and returns the number of rings with an unmatched atom (connected aromatic systems, so naphthalene counts once).
5. **The molfile branch of `tryLoadText` refuses (FR-003).** After `molToFragment`, it calls `kekulizeFragment`. If any ring is left, it throws a `user` error. Like the SMILES refusal it has no `kind`, so there is no Insert anyway, and paste and file open show it as a toast with the reason. The valence check (spec 001) runs after kekulizing, so it sees real double bonds (CON-003).
6. **Document files count instead (FR-004).** The ChemDraw (CDXML and CDX) and CML/MRV readers put the count from `kekulize` on the result as `unkekulized`. `insertForeign` adds it to the "Opened …" toast, next to the spec 001 too-many-bonds count.

Messages (NFR-002):
- Molfile refused: "This molfile has an aromatic ring that can’t alternate single and double bonds, so it isn’t drawn. A ring N–H needs its H: draw it, or set the N’s hydrogen count to 1."
- Document opened: "Opened x.cdxml. 1 aromatic ring couldn’t be given alternating double bonds; a ring N–H may be missing its H".

- **Rationale:** one converter for every format, so a pyrrole from a molfile and a pyrrole from ChemDraw give the same drawing. The change sits at the two places that already handle aromatic bonds (`fromOCL`, `kekulize`), not in each import route. `.mol`, `.sdf` first record, paste and the dialog all reach the same molfile branch.
- **Rejected:** rewriting type-4 bonds in the molfile text before OCL reads it. That needs a second matcher and a second molfile parser, against CON-001.
- **Rejected:** RDKit or another kekulizer. It would be a new dependency (CON-002), and OCL's JS build has no such call.

## 2. Constitution compliance
- Plain JS in the existing globals style. Tests follow the existing patterns: `node --test` with `load.mjs`, which already loads `formats.js`, and pytest + Playwright with `conftest.py`.
- No new dependencies; works offline. Deviation: none.

## 3. Files to touch
| Action | Path | Reason |
|---|---|---|
| modify | `src/formats.js` | `kekulize` returns its unmatched atoms; export it; CDXML/CDX and CML/MRV results carry `unkekulized` |
| modify | `src/core.js` | `fromOCL`: delocalized → 1.5; `molfileMol`: read `hhh` / `HCOUNT=`; new `kekulizeFragment` |
| modify | `src/app.js` | molfile branch of `tryLoadText`: kekulize, refuse; `insertForeign`: ring count in the toast |
| create | `tests/unit/aromatic_imports.test.mjs` | type-4 molfiles (V2000 and V3000) against SMILES formulas, hcounts, wedges, refusal counts, Kekulé files unchanged, SMILES never 1.5 |
| create | `tests/e2e/test_aromatic_imports.py` | dialog, paste, `.mol`, `.sdf`; refusal message with no Insert anyway; CDXML count; valence check still runs |
| modify | `README.md` | one sentence under Import |
| modify | `dist/lonepair.html` | rebuilt (committed with each change, per repo convention) |
| modify | `sdd/product/roadmap.md`, `sdd/product/decisions.md` | status; anything noticed |

## 4. Data & contract changes
- Schema: none. Saved files and export formats are unchanged.
- `kekulize(atoms, bonds)` now returns an array of atom ids (empty when every ring alternates). Existing callers ignore the return value.
- `FORMATS.read('cdxml'|'cdx'|'cml'|'mrv')` results gain `unkekulized` (a number, omitted when 0).
- `molfileMol(txt)` returns `{mol, asDrawn, hcount}`, with `hcount` a Map from atom index to H count, only for atoms whose file gives one.
- Rollback: revert the PR. There is no data to migrate.

## 5. Task groups
Order: logic → interface → integration → docs. Every group ends with `npm run build && npm test` green. Groups that touch UI also run `npm run test:e2e`.

### TG-01: `kekulize` reports, and the molfile pieces   [M]   [satisfies: FR-001, FR-002, FR-005, CON-001, CON-003]
- **Objective:** a fragment from a type-4 molfile can be converted to alternating bonds, with the file's H counts, and tells you which rings failed.
- **Inputs:** `kekulize` (`src/formats.js:298`), `fromOCL` and `molfileMol` (`src/core.js`), the probe molfiles from requirements §8.
- **Outputs:** the four changes in §1 steps 1–4. Unit tests come first, named after the requirement IDs:
  - benzene, pyridine, naphthalene, furan, thiophene, and indole and pyrrole with an N H count, in V2000 and V3000: formula equals the SMILES formula;
  - pyrrole with the N–H drawn as an H atom: C4H5N;
  - pyrrole with no H count, and a C5 ring: 1 ring reported;
  - charges, isotopes, coordinates and a substituent wedge survive;
  - a Kekulé molfile gives the same fragment as before;
  - no template or example SMILES gives a 1.5 bond from `fromOCL`;
  - the existing CDXML kekulize test still passes.
- **Acceptance:** the new tests pass, and all 196 existing unit tests still pass.
- **Verify:** `npm test`
- [x] complete (2026-11-04): `npm test` 207 pass / 0 fail (196 + 11 new). Two changes beyond the plan, both in `decisions.md`: `kekulize` now finds the matching that leaves fewest atoms unmatched (its first-found match left furan's carbons wrongly paired), and `fromOCL` skips its dative-bond step on atoms with aromatic bonds (phenylboronic acid's C–B bond became dative). The H-count column is blanked before OpenChemLib reads it (the plan's fallback, done up front), so the file isn't read as a query.

### TG-02: molfile inserts kekulize, or refuse   [M]   [satisfies: FR-001, FR-003, CON-003]
- **Objective:** every molfile route draws alternating bonds, and refuses a ring that can't alternate.
- **Inputs:** the molfile branch of `tryLoadText`; `readSmiles`'s refusal.
- **Outputs:** `kekulizeFragment` before `checkValence`; the FR-003 message as a `user` error with no `kind`. Browser tests come first:
  - dialog, paste, `.mol` and `.sdf` give C6H6 for a type-4 benzene;
  - type-4 pyrrole with no H: refused, nothing inserted, the message shown, `#smForce` hidden; a toast for paste and file;
  - a type-4 molfile that is also over-valent still gets the spec 001 refusal with Insert anyway;
  - undo after a type-4 insert removes it in one step.
- **Acceptance:** the new e2e tests pass; the full e2e suite passes.
- **Verify:** `npm run build && npm test && npm run test:e2e`
- **Depends on:** TG-01
- [x] complete (2026-11-04): unit 207 pass; e2e 777 passed, 3 skipped, 7 xfailed, 0 failed (764 + 13 new)

### TG-03: document files count rings that can't alternate   [S]   [satisfies: FR-004, FR-005]
- **Objective:** a ChemDraw, CML or Marvin file with such a ring opens as today, and says so.
- **Outputs:** `unkekulized` on the CDXML/CDX and CML/MRV results; the count in `insertForeign`'s toast. Tests:
  - unit: `FORMATS.read` gives `unkekulized: 1` for a CDXML and a CML five-membered aromatic ring with no N–H, and omits it for benzene;
  - e2e: opening that `.cdxml` gives the drawing and a toast with "1 aromatic ring"; a benzene `.cdxml` toast doesn't mention rings.
- **Acceptance:** the tests pass; the existing CDXML/CML tests still pass.
- **Verify:** `npm run build && npm test && npm run test:e2e`
- **Depends on:** TG-01

### TG-04: docs, full regression and preview QA   [S]   [satisfies: NFR-001, NFR-002, FR-005]
- **Objective:** prove nothing else broke, and that the messages read well.
- **Outputs:** README sentence; roadmap status; rebuilt `dist/lonepair.html`.
- **Steps:**
  1. Run the full bar 3 times: unit, e2e (Chromium), `validate`, and e2e in WebKit (`LONEPAIR_BROWSER=webkit`; logged ⚠ if it still can't launch locally, as in spec 001).
  2. Compare against `baseline.md`.
  3. Push, open the PR, wait for CI.
  4. On the branch preview, by hand: paste a type-4 benzene and pyrrole, open a type-4 `.sdf`, and open a CDXML pyrrole with no N–H.
- **Acceptance:** everything in `validation.md` is ticked.
- **Depends on:** TG-02, TG-03

## 6. Coverage check
| Requirement | Task group(s) |
|---|---|
| FR-001 | TG-01 (unit), TG-02 (routes) |
| FR-002 | TG-01 |
| FR-003 | TG-02 |
| FR-004 | TG-03 |
| FR-005 | TG-01 (molfile), TG-03 (document files), TG-04 (regression) |
| NFR-001, NFR-002 | TG-04 |
| CON-001 | TG-01 |
| CON-002 | §2 (no dependency added) |
| CON-003 | TG-01 (SMILES never 1.5), TG-02 (valence check still runs) |

Orphan requirements: none · Orphan task groups: none

## 7. Parallelization
- Independent: TG-03 can run after TG-01, alongside TG-02. We do them in order anyway (one at a time).
- Sequential: TG-01 → TG-02 → TG-04.

## 8. Risks
| Risk | Likelihood | Impact | Mitigation | Early signal |
|---|---|---|---|---|
| Real type-4 pyrrole and indole files carry no H count, so they are refused | medium | a valid file is refused | the message says how to fix it; this matches SMILES; log real-file reports, and revisit (e.g. "Insert as drawn") if they come | user reports, preview check |
| `hhh` makes OCL treat the molecule as a query fragment (probed), which may change implicit-H display elsewhere | medium | odd H labels | TG-01 test compares the drawn H count with the SMILES one; if it differs, strip `hhh` from the text before OCL reads it, after we've read it | TG-01 unit tests |
| `fromOCL`'s dative-bond step uses OCL's implicit-H counts, which are computed with delocalized bonds | low | a stray dative bond next to B or a metal | test a type-4 phenylboronic acid in TG-01 | TG-01 unit tests |
| `kekulize`'s 20 000-step budget runs out on a large aromatic system, giving a false count | low | a wrong refusal | test a 6-ring fused system (coronene-sized) in TG-01; if it fails, count only when the search finished | TG-01 unit tests |
| RXN files contain `M  END` and reach the molfile branch | low | unchanged behaviour (out of scope) | none; noted in `decisions.md` | — |

## 9. Rollout
- No feature flag. The PR runs CI, and its Cloudflare preview is checked by hand (TG-04).
- After merge: gstack `/canary` on lonepair.app. The daily scheduled health check also covers it.
- Rollback trigger: any Kekulé molfile or ChemDraw file opening differently, or any CI/canary regression → revert the PR.
