# Projects, tabs and the project library (October 2026)

Status: built. Tests: `tests/e2e/test_projects.py` (10 browser tests), plus the updated file and autosave tests in `tests/e2e/test_app.py`.

## The problem

Lone Pair kept one autosave per project in `localStorage` (`skeletal.p.<uid>`) plus a pointer to the last one used
(`skeletal.last`). Every new tab or window opened `skeletal.last`, so:

1. **Every tab showed the same project.** Open lonepair.app twice and both tabs held the same structures.
2. **Tabs overwrote each other.** Both autosaved to the same key; whichever wrote last won, silently.
3. **Older projects could not be reopened.** "New project" warned "You won't be able to reopen … from here", and
   the only way back was a saved `.html` file. Autosaves of older projects sat in storage, unreachable.
4. **Storage was small and shared.** `localStorage` holds about 5 MB per site, and projects carry their versions,
   so the quota fills up; the fix for that (evicting old autosaves) deletes work.

## How other editors handle it

| App | New tab | Reopening work | Same document in two tabs |
| --- | --- | --- | --- |
| Google Docs, Figma, Office online | Blank / file browser | "Recent" list; each document has its own id | Live collaboration (server) |
| Excalidraw (local, no account) | Same single scene in every tab | Export / import files | Last writer wins, tabs sync |
| draw.io (browser storage mode) | Start screen with recent diagrams | Recent list, stored in the browser | Warns that the file is open elsewhere |
| ChemDraw / desktop apps | New document | File > Open Recent | OS file lock: "open read-only?" |

The common pattern for a local-first editor is: **one document per window**, a **library of recent documents**
stored in the browser, and **a lock** so the same document isn't edited in two places without warning.

## Design

**Each tab edits its own project.**
- A new tab or window starts a blank project.
- The tab remembers its project id in `sessionStorage`, which is per tab and survives reload. So reloading a tab
  reopens the same project, and other tabs are unaffected.

**Every project with content is kept in a library.**
- Stored in **IndexedDB** (`lonepair` database). It holds far more than `localStorage` (typically hundreds of MB),
  and the app asks the browser to keep it (`navigator.storage.persist()`).
- Two stores: `meta` (id, name, modified, page count, small preview) for listing quickly, and `data` (the project).
- Blank projects are not stored, so opening tabs doesn't litter the list.
- If IndexedDB isn't available (some browsers on `file://`, private modes), the same API falls back to `localStorage`.

**Reopening is one click.**
- A **Projects** button in the top bar opens the library: preview, name, last edited, page count; search; Open; Delete.
- The Project panel shows the five most recent projects.
- A blank tab shows the recent projects on the empty canvas, so the last project is one click away.
- **Open** and **New project** no longer warn about losing work: the current project stays in the library.

**One project, one tab.**
- While a tab has a project open it holds a **Web Lock** named after the project.
- Opening a project that another tab holds offers **Open a copy** instead (a new id, same content).
- **Duplicate tab** copies `sessionStorage`, so the duplicate would claim the same project; it gets a copy automatically.
- Without Web Locks (older browsers), a `BroadcastChannel` ping does the same check.
- Tabs tell each other when the library changes (`BroadcastChannel`), so open Projects lists stay current.

**Files keep working as before.**
- Opening a saved `.html` or `.json` project loads it into this tab and adds it to the library. If the library holds
  newer unsaved edits of that same saved file (same `uid` and `rev`), those are restored, as today.

**Upgrading.** On the first run, existing `skeletal.p.*` autosaves move into the library, and the project that
`skeletal.last` pointed to opens in that tab once, so nothing looks lost. Afterwards the old keys are removed.

## What can still go wrong (and what covers it)

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Browser storage is cleared (user clears site data; Safari deletes script storage after 7 days without a visit) | Library gone | Save project (.html) is the durable copy; later, cloud sync for signed-in users (docs/ACCOUNTS_PLAN.md). `storage.persist()` asks browsers not to evict |
| Each browser, profile and origin has its own library | Projects made in Chrome don't show in Safari; lonepair.app and a downloaded copy differ | Explain in the Projects dialog; cloud sync later |
| Tab closed before the autosave is written | Last edit lost | Save 400 ms after each edit; when the tab is hidden or closed, also write a synchronous copy to `localStorage`, which the next start moves into the library |
| Quota exceeded | Autosave fails | Warn repeatedly; never delete other projects automatically |

## Tests first

Browser tests (Playwright, several pages in one context = several tabs of one browser):

1. A second tab starts blank while the first holds a drawing.
2. Reloading a tab reopens that tab's project.
3. Two tabs editing two projects never overwrite each other.
4. Projects dialog lists earlier projects (newest first) and opens them; Delete removes one.
5. Opening a project that another tab holds offers a copy.
6. A duplicated tab (same `sessionStorage`) gets a copy, not the same project.
7. Blank tabs add nothing to the library.
8. New project keeps the old one in the library (no warning).
9. Old `localStorage` autosaves are migrated and the last one opens once.
10. The existing file tests (Ctrl+S, Ctrl+O, restore from the same file only) still pass.
