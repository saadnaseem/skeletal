# Plan — 003-cdxml-fidelity

> Status: approved (user, 2026-11-04) · Last updated: 2026-11-04
> The **how & in what order**. Every task group cites requirement IDs; every requirement appears in at least one group.

## 1. Approach
**Brackets.** `treeToDoc` in `src/formats.js` reads only whole bracket pairs. Half-brackets (`Square`, `Curly`, `Round`) go to `skip('bracket')`. The change:

1. While walking the tree, half-brackets are collected as `{id, type, x, y0, y1}` from their BoundingBox (ChemDraw draws a half as a vertical line: both x values are equal), with their colour. `<bracketedgroup>` objects are collected as lists of `bracketattachment` `GraphicID`s.
2. After the walk, halves are paired: first by group (two attachments whose graphics are halves of the same kind), then the rest by geometry (FR-002): same kind, top and bottom within 1 pt, nearest partner to the side. Each pair becomes a normal Lone Pair bracket `{type, x, y, w, h}`, spanning both halves. Halves with no partner are counted with `skip('bracket')`, as today (FR-003).
3. Pairing happens before the existing corner-text step, so a charge, ‡ or repeat count attaches to the new pairs with no other change (FR-004).

**Bracket output (FR-005).** The CDXML writer emits each bracket as two `Square`/`Curly`/`Round` half-graphics (left half drawn bottom to top, right half top to bottom, as in the real files) plus a `<bracketedgroup>` with two `<bracketattachment GraphicID>`s. The CDX binary encoder and decoder learn two objects and two properties, taken from Open Babel's `chemdrawcdx.h`: `bracketedgroup` 0x8017, `bracketattachment` 0x8018, `BracketedObjectIDs` 0x0A27 (object id array) and `GraphicID` 0x0A2B (object id). `LipSize` (0x0A22) is written from the bracket's drawn lip. The reader still accepts whole pairs (`SquarePair`), so older Lone Pair files open as before.

**Dashed and hashed bonds.** Bond `stereo` gains `dashed` and `hashed`:
- `sanitizeDoc` allows them (`src/core.js:143`).
- The renderer (`src/core.js`, beside `wavy` and `bold`) draws `dashed` as a dashed line, using the hydrogen-bond dash at full line width but with longer dashes so the two look different, and `hashed` as even-width hash marks (the `hash` wedge's marks with a fixed half-width). Canvas, SVG, PNG and PDF all use this renderer.
- The bond tool gets two entries next to Wavy and Bold (`src/app.js:2020`), with icons in the same style.
- Chemistry: `toOCL` only maps `wedge`/`hash`, so the new styles already count as plain single bonds for formula, valence, H counts, SMILES and molfile (FR-006, FR-008). A test pins this.
- CDXML/CDX: `Display="Dash"` ↔ `dashed`, `Display="Hash"` ↔ `hashed` in the reader and writer (FR-007).
- Changing order (the 1/2/3 keys, the double-bond tool) already resets `stereo` to `none`; the mirror and clean-up code only touches `wedge`/`hash`. Both are pinned by tests.

**Arrows (FR-009).** No code change. Two tests built like the real files: a modern `<arrow>` with its superseded `<graphic>` (one arrow, head at Head3D), and an old file with only the `<graphic ArrowType>` (head at the BoundingBox's first point).

- **Rationale:** the halves become Lone Pair's existing bracket object, so drawing, editing, export and the corner labels need no new code. The bond styles follow `wavy` and `bold` exactly.
- **Rejected:** a new "single bracket" object to keep halves as they are. It is more code, and nothing in Lone Pair would use a lone half except to show it.
- **Rejected:** mapping `Dash` to the existing hydrogen-bond kind. A hydrogen bond doesn't count toward valence, so atoms would gain an H.

## 2. Constitution compliance
- Plain JS in the existing globals style. Tests follow the existing patterns: `node --test` with `load.mjs`, and pytest + Playwright with `conftest.py`.
- No new dependencies. The CDX constants are numbers copied from the published header. Deviation: none.
- CON-001: the user's ChemDraw files are read only by a local check script in the scratchpad. Test fixtures are hand-written.

## 3. Files to touch
| Action | Path | Reason |
|---|---|---|
| modify | `src/formats.js` | half-bracket pairing; bracketedgroup read and write; CDX objects and properties; `Dash`/`Hash` display |
| modify | `src/core.js` | sanitizer values; render `dashed` and `hashed` |
| modify | `src/app.js` | two bond-tool entries |
| modify | `tests/unit/brackets.test.mjs` | the existing "single brackets are reported" test changes: a grouped pair now opens |
| create | `tests/unit/cdxml_fidelity.test.mjs` | pairing, groups, corner text, round trip (CDXML and CDX), bond styles, chemistry, arrows |
| create | `tests/e2e/test_cdxml_fidelity.py` | open a CDXML with grouped brackets; draw dashed and hashed bonds; export SVG/PNG; save and reopen |
| modify | `README.md` | bond styles and ChemDraw brackets |
| modify | `dist/lonepair.html` | rebuilt (committed with each change, per repo convention) |
| modify | `sdd/product/roadmap.md`, `sdd/product/decisions.md` | status; anything noticed |

## 4. Data & contract changes
- Bond `stereo`: adds `dashed` and `hashed`. An older Lone Pair opening a new project shows them as plain bonds (the sanitizer falls back to `none`), per CON-004.
- CDXML/CDX bracket output: two halves plus a `<bracketedgroup>` instead of one pair graphic.
- Rollback: revert the PR. Projects saved with the new styles still open in the old version, as plain bonds.

## 5. Task groups
Order: logic → interface → integration → docs. Every group ends with `npm run build && npm test` green. Groups that touch UI also run `npm run test:e2e`.

### TG-01: ChemDraw half-brackets open as pairs   [M]   [satisfies: FR-001, FR-002, FR-003, FR-004, NFR-002, CON-003]
- **Objective:** a CDXML or CDX file's grouped or facing half-brackets open as Lone Pair bracket pairs.
- **Inputs:** `treeToDoc` (`src/formats.js`), the real files' structure (from the probe), `tests/unit/brackets.test.mjs`.
- **Outputs:** collection and pairing in `treeToDoc`; CDX decode of 0x8017/0x8018/0x0A27/0x0A2B. Unit tests come first:
  - grouped Square halves give one square pair spanning both; grouped Curly and Round likewise;
  - facing halves with no group pair up; halves of different kinds or heights don't, and are counted;
  - a lone half is counted, and nothing else changes;
  - "2–" at the pair's top right becomes its `sup`;
  - `SquarePair` from an older Lone Pair file opens as today;
  - the same file as CDX (encoded by the test) gives the same result.
- **Local check (not committed):** the four real files give 7 pairs and 1 bracket left out, and everything else they open (atoms, bonds, arrows, texts) is unchanged.
- **Acceptance:** the new tests pass; all existing unit tests pass (the brackets test updated for the new behaviour).
- **Verify:** `npm test`, plus the local check script.
- [x] complete (2026-11-04): `npm test` 216 pass / 0 fail (209 + 7 new; `import_fidelity` compares skipped counts without key order, since unpaired halves are now counted after the walk). Local check: the four real files give 7 pairs (6 square, 1 curly) and 1 bracket left out; atoms, bonds, arrows and texts unchanged.

### TG-02: brackets save as ChemDraw writes them   [S]   [satisfies: FR-005]
- **Objective:** CDXML and CDX output uses half-brackets and a `<bracketedgroup>`.
- **Outputs:** the writer change; CDX encode of the new objects and properties. Unit tests: a drawing with square, curly and round brackets (one with a sup and sub) round-trips through CDXML and CDX with the same brackets and labels; the CDXML text has two `Square` graphics and one `bracketedgroup` with two attachments pointing at them.
- **Acceptance:** the tests pass; all existing format tests pass.
- **Verify:** `npm test`
- **Depends on:** TG-01
- [x] complete (2026-11-04): `npm test` 218 pass / 0 fail; e2e bracket and import/export files pass. `LipSize` is not written (ChemDraw's unit for it is unclear; ChemDraw uses its default). The existing unit and e2e brackets tests now expect half-brackets instead of `SquarePair`.

### TG-03: dashed and hashed bond styles   [M]   [satisfies: FR-006, FR-007, FR-008, CON-004]
- **Objective:** two new single-bond styles that draw, save and round-trip through ChemDraw.
- **Outputs:** sanitizer, renderer, bond-tool entries, `Dash`/`Hash` read and write. Tests come first:
  - unit: a project with both styles survives `sanitizeDoc`; the SVG has a dashed path for `dashed` and evenly spaced marks of equal length for `hashed`; formula, SMILES and molfile match the same drawing with plain bonds; CDXML and CDX `Display="Dash"`/`"Hash"` open as the styles and write back; an unknown style in a project still falls back to `none`;
  - e2e: choose each style in the bond tool and draw a bond; it renders, survives save and reopen and undo; pressing 2 on it makes a plain double bond; SVG and PNG export run with no errors.
- **Acceptance:** the new tests pass; the full e2e suite passes.
- **Verify:** `npm run build && npm test && npm run test:e2e`
- [x] complete (2026-11-04): unit 222 pass; e2e 782 passed + the toolbar-count test updated to 51 (it failed only on the count), 3 skipped, 7 xfailed, 0 failed

### TG-04: arrows pinned   [S]   [satisfies: FR-009]
- **Objective:** the arrow direction the real files showed is held by tests.
- **Outputs:** two unit tests in `cdxml_fidelity.test.mjs` (modern arrow with its superseded graphic gives one arrow, head at Head3D; graphic-only arrow gives head at the BoundingBox's first point). No source change.
- **Verify:** `npm test`
- [x] complete (2026-11-04): `npm test` 224 pass / 0 fail; no source change

### TG-05: docs, full regression and preview QA   [S]   [satisfies: NFR-001, NFR-003]
- **Objective:** prove nothing else broke, and that the new styles look right.
- **Outputs:** README sentences; roadmap status; rebuilt `dist/lonepair.html`.
- **Steps:**
  1. Run the full bar 3 times: unit, e2e (Chromium), `validate`, and e2e in WebKit (logged ⚠ if it still can't launch locally).
  2. Compare against `baseline.md`.
  3. Push, open the PR, wait for CI.
  4. On the branch preview, by hand: draw both new styles and look at them at 100% and zoomed in, in light and dark; export SVG, PNG and PDF; open a hand-written CDXML with grouped brackets and a charge.
  5. Optional, for the user: open one CDXML saved from the preview in ChemDraw (FR-005).
- **Acceptance:** everything in `validation.md` is ticked.
- **Depends on:** TG-01 … TG-04
- [x] complete (2026-11-04): Chromium bar ×3 green; WebKit can't launch locally (logged); preview checks pass; PR #39, CI 3/3

## 6. Coverage check
| Requirement | Task group(s) |
|---|---|
| FR-001, FR-002, FR-003, FR-004 | TG-01 |
| FR-005 | TG-02 (and TG-05 step 5, optional) |
| FR-006, FR-007, FR-008 | TG-03 |
| FR-009 | TG-04 |
| NFR-001 | TG-05 |
| NFR-002 | TG-01 (local check) |
| NFR-003 | TG-05 |
| CON-001 | §2 (local script only) |
| CON-002 | §2 |
| CON-003 | TG-01 (`SquarePair` still opens), TG-04 (arrows), existing wedge/wavy/bold tests |
| CON-004 | TG-03 |

Orphan requirements: none · Orphan task groups: none

## 7. Parallelization
- Independent: TG-03 and TG-04 don't touch the bracket code and could run beside TG-01/TG-02. We do them in order anyway (one at a time).
- Sequential: TG-01 → TG-02; everything → TG-05.

## 8. Risks
| Risk | Likelihood | Impact | Mitigation | Early signal |
|---|---|---|---|---|
| ChemDraw doesn't read the half-brackets Lone Pair writes as a pair | low | brackets open in ChemDraw as two lone halves (still drawn) | the output copies the real files' structure attribute for attribute; optional check by the user in ChemDraw | user check, reports |
| Wrong CDX tag numbers for the group objects | low | CDX files lose the group (geometry pairing still pairs them) | numbers from Open Babel's header; a CDX round-trip test | TG-02 unit tests |
| A real half-bracket is drawn slightly slanted (x values differ) | low | not paired | use the BoundingBox centre and allow 1 pt of slant; the real files' halves are exactly vertical | local check |
| The dashed style looks like a hydrogen bond | medium | confusion | longer dashes and full line width; checked by eye on the preview | TG-05 manual check |
| The bracket area changes slightly (ChemDraw's lip vs Lone Pair's) | medium | cosmetic | the pair spans the halves' x and y exactly; lip drawn by Lone Pair's own rule | local check, preview |

## 9. Rollout
- No feature flag. The PR runs CI, and its Cloudflare preview is checked by hand (TG-05).
- After merge: a check on lonepair.app, plus the daily scheduled health check.
- Rollback trigger: any ChemDraw file opening with fewer objects than before, or any CI regression → revert the PR.
