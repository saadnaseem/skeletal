# Code and usability review

Review of Skeletal v1.0.0 (about 3,200 lines of JavaScript across 5 source files). It covered static analysis, unit tests, browser tests, a held-out accuracy check and a hands-on usability walkthrough on desktop and mobile viewports.

## Summary

| Check | Result |
| --- | --- |
| ESLint (no-undef, no-redeclare, no-dupe-keys and others) | 0 errors; 19 warnings, all unused catch variables or locals |
| Unit tests (`npm test`) | 82 passed |
| Browser tests (`npm run test:e2e`) | 19 passed |
| Held-out accuracy (`npm run validate`) | ¹H MAE 0.08 ppm; ¹³C MAE 0.7 ppm; pKa MAE 0.4 |
| Build size | 1.29 MB, single file |
| Render time, 200-atom structure | under 120 ms per full redraw (asserted in tests) |

The review found two security issues, four correctness bugs and five usability gaps. All of them are fixed in this version and covered by new tests where that made sense.

## Fixed during review

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| 1 | **High (security)** | Loaded files (JSON, saved HTML, the data embedded in PNG/SVG exports, autosave) were inserted into SVG markup without validation. A crafted file could set `"color": "\"/><img onerror=…>"` and run script. | New `sanitizeDoc()` in `core.js` whitelists fields, coerces numbers, validates colors against `#rgb`/`#rrggbb` and clamps enums. It runs on every load path. Unit and browser tests use real injection payloads. |
| 2 | Medium (security) | The sanitizer's first version accepted `style: "__proto__"`, because `PRESETS[key]` reads up the prototype chain. The unit test caught this. | Changed to `Object.hasOwn(PRESETS, …)`. |
| 3 | Medium | **Save project (.html)** copied the live DOM. When hosted, elements injected by the host page could end up in the saved file. | The save now keeps only the app's own elements (marked `data-sk`) and its top-level containers. |
| 4 | Medium (correctness) | ¹H NMR: the "conjugated ketone" bonus also fired for plain ketones, because the C=O oxygen counted as a π neighbour. Acetone CH₃ came out at 2.52 ppm instead of 2.17. The held-out set caught this. | Only carbon neighbours are checked now. Regression tests added for acetone and butan-2-one. |
| 5 | Low (correctness) | pKa cards hid the pKaH of anilines whenever the N also had an acidic N–H. | The basic-site value is always shown for nitrogen. |
| 6 | Low | A missed eraser click, or a new text box cancelled with Esc, still added an undo step, so Undo then appeared to do nothing. | No undo entry is recorded unless something changes. Browser test added. |
| 7 | Low | When browser storage filled up (versions make projects large), autosave failed silently. | A one-time warning now tells the user to save the project as HTML. |
| 8 | Usability | There was no way to start a fresh project. | A **New project** button was added, with a prompt to save first. Browser test added. |
| 9 | Usability | Atom labels and text could only be edited by double-clicking, which doesn't exist on touch screens. | Press and hold now opens the label or text editor on touch devices. |
| 10 | Usability | Several gestures weren't documented in the app: double-click to edit a label, Shift + Enter for a new line. | Added to the in-app Shortcuts list and the README. |

## Open items (recommended next steps)

**Code structure**
- The scripts share one global scope (more than 150 top-level names) and depend on load order. The next refactor should convert them to ES modules bundled by esbuild. The build already uses esbuild, so this is mostly mechanical.
- `app.js` is 1,500 lines and mixes interaction, dialogs and export. Natural splits: `tools.js`, `export.js`, `project.js`, `dialogs.js`.
- Every pointer move rebuilds the index and re-renders the whole SVG. This is fine up to a few hundred atoms. For large schemes, cache label layouts and redraw only what changed.

**Accuracy**
- The pKa and BDE reference sets in `tests/unit` overlap the compounds used to tune the rules, so they act as regression tests, not validation. `scripts/validate.mjs` holds the separate held-out set. Grow it before changing rules.
- Known larger errors:
  - Saturated-ring γ-carbons in ¹³C: cyclohexanone C4 is 6.3 ppm off.
  - Doubly activated C–H acids with different groups: deoxybenzoin 2.7 units, ethyl acetoacetate 1.6 units.
  - N-methylmorpholine: +0.7 units.

**Usability**
- Clicking a structure with the Select tool selects the whole fragment, but dragging an unselected atom moves only that atom. This matches ChemDraw but surprises new users; a short first-run hint would help.
- Pressing Delete with nothing selected deletes the item under the cursor. Consider requiring a selection, or making it an option.
- Tool buttons rely on hover tooltips, which touch users never see. Labels in a long-press menu, or a "?" overlay, would help.
- The side panel is long (Analysis, Text, Project, Export, Style, Templates, Shortcuts). Collapsible sections, remembered between sessions, would cut scrolling.
- Undo history lives in memory only and resets on reload. Versions are the durable safety net and should be mentioned there.
- Accessibility: the canvas can't be used from the keyboard alone, and dialogs don't trap focus. The tool buttons do have proper labels and pressed states.

**Robustness**
- Copying to the clipboard inside a sandboxed frame falls back to a right-click dialog. This works, but it's an extra step on some hosts.
- Whole-document PNGs of large posters are capped at about 120 megapixels, with lower dpi reported to the user. Vector PDF has no such limit.

## How to reproduce

```bash
npm install && npm run build
npm test && npm run validate
pip install -r requirements-dev.txt && python -m playwright install chromium && npm run test:e2e
```

## Second review (October 2026)

An independent pass: fresh install, unit and browser tests, and hands-on use on desktop and phone viewports.

### Fixed in this pass

| # | Finding | Fix |
| --- | --- | --- |
| 11 | `npm test` found no files on Node 20, the documented minimum. The quoted glob is only expanded by Node 21+, and CI runs Node 22, so it never showed up there. | The script now passes the `tests/unit/` folder, which works on Node 20 and later. |
| 12 | There was no way to line structures up or space them evenly. In ChemDraw this is a routine last step before a scheme goes into a paper. | New **Align** menu: left, center, right, top, middle and bottom alignment, equal spacing across or down, and **Scheme row** (align middles, then space evenly). Compound numbers and curly arrows move with their structure. Two browser tests added. |
| 13 | Found while adding #12: **Save project (.html)** keeps only the top-level elements it knows by id, so any new top-level element is silently dropped, and the reopened file breaks. The existing round-trip test caught this. | The Align menu is on the list. Anyone adding a new top-level element needs to add it there too. |

### Done in the follow-up pass

| # | Item | What changed |
| --- | --- | --- |
| 1 | Groups | Ctrl+G and Ctrl+Shift+G, also in the Align and right-click menus. Clicking any member selects the whole group, and Align treats it as one piece. |
| 2 | Fixed-gap spacing | A **Gap** field in the Align menu, in bond lengths and remembered per browser. |
| 3 | Smart guides | Dragging a selection snaps it to other pieces within 6 screen px. A center-to-center match wins over an edge match. Alt turns snapping off. |
| 4 | Delete with no selection | It no longer erases the item under the cursor. It shows a hint instead. |
| 5 | Arrow-key nudges | A run of nudges is one undo step. |
| 6 | Long side panel | Each section folds, and the folded state is remembered. |
| 13 | Fragile save whitelist | **Save project (.html)** now keeps every top-level element marked `data-sk`. |
| — | Export bug | Copy image and every export ignored a custom atom label size, because `subDoc()` dropped `labelSize`. |
| — | New features | Drawing settings for line, bold and wedge width, bond and hash spacing, and margin. Right-click menu. Ctrl+Shift+C copies SMILES. Name and CAS lookup through PubChem. Name and CAS input in the Insert dialog. |

### Still open

- **ES modules** (item 7 above). This is unchanged and still the largest structural item.
- **Bond length** is a constant (`L` = 14.4 pt) used by all geometry. ChemDraw's "fixed length" setting would need `L` to become a per-document value. Until then, scale the copied image instead.
- **CAS numbers come from PubChem synonyms.** These are filtered by the CAS check digit, and the first one is shown as primary. For an authoritative answer, use the CAS Common Chemistry API. It needs a free API key, so it would have to be a setting.

### Original recommendations

1. **Groups (Ctrl+G).** Alignment has to guess which labels belong to which structure. It attaches text and curly arrows within about 1.6 bond lengths. An explicit group would make this exact, and would also let users move a structure together with its label.
2. **Fixed-gap spacing.** Scheme row keeps the outer pieces where they are and shares out the space between them. A "gap = N bond lengths" option would give the same spacing across every scheme in a paper.
3. **Smart guides while dragging**, as in PowerPoint: snap to the centerlines and edges of other structures. Most alignment would then happen without opening a menu.
4. **Make Delete with no selection safer.** Pressing Delete deletes whatever the cursor is over, and that is easy to trigger by accident. Require a selection, or at least flash the item first.
5. **Combine arrow-key nudges into one undo step.** Each key press adds its own undo step, so nudging 20 times takes 20 undos. It can also push older history out of the 200-step limit.
6. **Collapsible side panel.** The panel is long: Analysis, Text, Project, Export, Style, Templates and Shortcuts.
7. **ES modules.** This is still the largest structural item (see Open items above). The id whitelist in #13 is one example of a coupling that is easy to break without noticing.
