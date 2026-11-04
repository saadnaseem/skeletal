# Survey queue

Editors still to survey, and gaps left from earlier passes.

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| 1 | **ACD/ChemSketch** (Freeware, ACD/Labs) | Queued | **Closed source.** No public source code was found: the only GitHub result is an unrelated anonymous gist, and the freeware is proprietary. **Windows only** (64-bit). The download link is **emailed after filling in a form** on ACD/Labs' site, which the user has to do. The licence is for non-commercial use, with no support for the freeware. Plan: the user installs it on Windows (or in a VM) and shares the installer or the install folder. Then fingerprint the install (frameworks, bundled libraries, the `.sk2` format), run [test-suite.md](test-suite.md) by hand, and write `apps/chemsketch.md`. Its `.sk2` and `.skc` files matter because Zoho claims to open them, and Lone Pair doesn't |
| 2 | Zoho ChemStudio, hands-on | Waiting on the user | Install the desktop app (no account needed) and run the suite. Also note its Wiley preset values, for Lone Pair's improvement I13 |
| 3 | MolView (new and old), hands-on | Waiting on the user | Both ask you to accept their terms first |
| 4 | ChemDraw re-test against the suite | Not started | The reference point for B-section drawing behaviour |
| 5 | B-section drawing tests (B1–B15) on each app | Partly done | Most need someone at the screen |
