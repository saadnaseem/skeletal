# Mission — Lone Pair

> Status: draft (thin constitution — deepen later) · Last updated: 2026-11-03

## Problem
Chemists need to draw publication-quality structures, reactions and mechanisms and get correct numbers out of them (formula, mass, InChI, NMR/pKa estimates) without installing ChemDraw or paying for it. Free web editors either get chemistry wrong silently or lock features behind accounts.

## Users
- Students and teachers in organic and inorganic chemistry courses.
- Researchers preparing figures and SI for journals (ACS style), moving files to and from ChemDraw.
- [ASSUMED: AI agents and scripts calling the app are a future user, see roadmap Phase 3.]

## Jobs to be done
1. Draw a structure or scheme and paste it into Word/PowerPoint looking like ChemDraw output.
2. Get a trustworthy formula, mass and identifiers for what was drawn or imported.
3. Open and save ChemDraw, molfile, SMILES and other files without losing information.

## Principles
1. **Never be silently wrong.** If the app cannot represent an input faithfully, it says so instead of inventing atoms, radicals or hydrogens.
2. **Do not break what works.** Every change ships with regression tests; the full unit + browser suite stays green on every PR.
3. **One file, offline first.** The app keeps working as a single HTML file with no server; network features are opt-in.
4. **One improvement at a time.** Each roadmap item is its own spec, branch and PR.

## Success metrics
| Metric | Today (2026-11-03) | Target |
|---|---|---|
| External rubric score (user's 100-point competitor rubric) | 56.4 | ≥ 78.5 after Phase 2 |
| Edge-case suite (PR #29) paths matching reference InChIKey and mass | not on main yet | 100 % on main |
| CI on `main` (unit + e2e + pages build) | green | stays green on every merge |

## Non-goals
- Not a full ELN or inventory system.
- No paid tier and no feature gated behind sign-in.
- No server-side computation required for core drawing and analysis.
