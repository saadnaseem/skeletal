# Requirements — 003-cdxml-fidelity

> Status: approved (user, 2026-11-04) · Shipped 2026-11-04 (PR #39) · Last updated: 2026-11-04
> The **what & why**. Behaviour and constraints only.

## 1. Summary
Roadmap item 4 named two ChemDraw import problems. Checked on main b53c961 against four real ChemDraw files from the user's own work (thesis and presentation schemes: 3,757 atoms, 292 arrows, 15 brackets):

1. **Arrow direction is already right.** ChemDraw writes every arrow twice: as a modern `<arrow>` (Head3D/Tail3D) and as an older `<graphic ArrowType>` superseded by it. In all 292 pairs, the older form's BoundingBox starts at the arrow's head, which is how Lone Pair reads it. Nothing to fix; a test should pin it.
2. **Plain `Dash` and `Hash` bonds open as plain lines (confirmed), but none of the four real files uses them.** They use Wedge, WedgedHash and Wavy, which already open correctly. Lone Pair has no dashed or plain-hashed bond to map them to.
3. **New finding: ChemDraw's brackets are all dropped.** ChemDraw draws a bracket pair as two separate half-brackets (`BracketType="Square"`, `"Curly"`, `"Round"`), linked by a `<bracketedgroup>`. Lone Pair only reads whole pairs (`SquarePair` and so on), which ChemDraw doesn't write. So all 15 brackets in the real files were left out (the "Opened …" message does say so). 14 of them are 7 left-and-right pairs, each linked by a `<bracketedgroup>`; 1 is a lone curly brace.

After this change, ChemDraw's half-brackets open as Lone Pair bracket pairs, with their charge or repeat count. Plain dashed and hashed bonds become bond styles that open, draw and save.

## 2. Mission & roadmap link
- Mission principle 1, "Never be silently wrong", and principle 2, opening other programs' files faithfully.
- Roadmap: Phase 1, item 4. Its scope changes (arrows need no fix; brackets added), so the roadmap row is reworded at this gate.

## 3. User stories
### US-001: my ChemDraw brackets come through
As a chemist opening my ChemDraw scheme, I want the square and curly brackets around a complex or a repeat unit to open as brackets, not be left out, so I don't have to redraw them.

### US-002: dashed and hashed bonds keep their meaning
As a chemist drawing a transition state or a partial bond, I want a dashed bond (and ChemDraw's plain hashed bond) to open, draw and save as such, not as a plain line.

### US-003: brackets I save open in ChemDraw
As a chemist sending a Lone Pair drawing to a colleague who uses ChemDraw, I want my brackets saved the way ChemDraw writes them.

## 4. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-001 | WHEN a CDXML or CDX file has two half-brackets of the same kind (Square, Curly or Round) linked by a `<bracketedgroup>`, THE app SHALL open them as one bracket pair of that kind, enclosing the same area. | must |
| FR-002 | WHEN two half-brackets of the same kind face each other with the same top and bottom (within 1 pt) but no `<bracketedgroup>`, THE app SHALL pair them the same way. | should |
| FR-003 | A half-bracket that can't be paired SHALL still be left out and counted in the "Opened …" message, as today. | must |
| FR-004 | A short text at a paired bracket's top-right or bottom-right corner (a charge, ‡, or repeat count) SHALL attach to it, as it does today for whole pairs. | must |
| FR-005 | THE app SHALL save each bracket pair to CDXML and CDX as two half-brackets in a `<bracketedgroup>`, as ChemDraw writes them, and SHALL open its own saved files with the same brackets. | should |
| FR-006 | THE bond tool SHALL offer two more single-bond styles: **dashed** (a partial or forming bond) and **hashed** (a plain hashed bond, even width). They SHALL count as single bonds for formula, valence and H counts. | must |
| FR-007 | WHEN a CDXML or CDX bond has `Display="Dash"` or `Display="Hash"`, THE app SHALL open it as the dashed or hashed style, and SHALL write those styles back the same way. | must |
| FR-008 | Dashed and hashed bonds SHALL draw in the canvas, SVG, PNG and PDF, and SHALL be kept in saved projects. Formats with no such style (molfile, SMILES, CML, MRV) SHALL write them as plain single bonds. | must |
| FR-009 | The arrow direction of both ChemDraw arrow forms SHALL be pinned by tests using the real files' layout, with no change to how they are read. | must |

## 5. Non-functional requirements

| ID | Requirement | Threshold | Measured by |
|---|---|---|---|
| NFR-001 | No regression | unit, browser, `validate` pass; numbers no worse than `sdd/product/baseline.md` | CI + 3 local runs |
| NFR-002 | The four real files open with no brackets left out except the one lone curly brace | 14 of 15 half-brackets become 7 pairs; 1 left out | local check (files stay on this Mac, not committed) |
| NFR-003 | New bond styles are clear at normal zoom and in exports | review | manual check on the preview |

## 6. Constraints

| ID | Constraint | Source |
|---|---|---|
| CON-001 | The user's ChemDraw files are only read locally. They are not committed or uploaded; tests use small hand-written files with the same structure. | privacy |
| CON-002 | Offline, single file, no new dependencies. | mission principle 3 |
| CON-003 | Don't change how wedge, hashed wedge, wavy and bold bonds, or arrows, open and save. | scope |
| CON-004 | Old saved projects open unchanged; a project with the new styles opened in an older Lone Pair shows plain bonds (the sanitizer already falls back to `none`). | compatibility |

## 7. Interfaces & data
- Bond `stereo` gains two values: `dashed` and `hashed`. Saved projects keep them.
- CDXML/CDX bracket output changes from one `SquarePair`-style graphic to two half-brackets and a `<bracketedgroup>` (FR-005).

## 8. Edge cases

| Case | Expected | Req |
|---|---|---|
| Square half-brackets in a `<bracketedgroup>` around a complex, with "2–" at the top right | one square pair, sup "2–" | FR-001, FR-004 |
| Curly half-brackets in a group | one curly pair | FR-001 |
| A lone curly brace beside a column of text | left out, counted | FR-003 |
| Two half-brackets of different kinds, or different heights | not paired; both counted | FR-002, FR-003 |
| An old Lone Pair CDXML with `SquarePair` | opens as today | CON-003 |
| A ChemDraw file whose arrows have only the older `<graphic>` form (ChemDraw before 8) | head and tail as today | FR-009 |
| A dashed bond in a ring, exported to molfile | written as a single bond | FR-008 |
| Changing a dashed bond to double with the bond tool | becomes a plain double bond (styles are single-bond only, like wedges) | FR-006 |

## 9. Reuse

| What | Path | Used for |
|---|---|---|
| bracket pairs, corner text, `bracketGeom` | `src/formats.js` (`treeToDoc`, writer), `src/core.js` | FR-001, FR-004, FR-005 |
| bond styles (wavy, bold) in the bond tool and renderer | `src/app.js:2020`, `src/core.js:445` | FR-006, FR-008 |
| `Display` enum for CDX | `src/formats.js:195` | FR-007 |
| `hbond` dashed drawing | `src/core.js:435` | look of the dashed style |

## 10. Out of scope
- `Dash` and `Hash` on double bonds (ChemDraw's `Display2`), and other displays (`Dot`, `DashDot`, hollow and wavy wedges).
- Single brackets as a drawable Lone Pair object (the lone brace stays left out).
- Checking the saved brackets in ChemDraw itself, which isn't available here (see open questions).

## 11. Open questions
Resolved at the gate (user, 2026-11-04):
- Roadmap item 4 is rescoped: arrows pinned by tests only, ChemDraw bracket pairing added.
- FR-006: dashed and hashed are full drawable bond styles.

Still open: FR-005 can't be checked in ChemDraw here. If you have ChemDraw, opening one saved file before merge would confirm it (optional).
