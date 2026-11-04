# Decisions log (append-only)

## 2026-11-03 — Thin constitution, derived from the repo
- **Decision:** Start SDD with a thin mission/tech-stack and a roadmap built from the user's 19-item improvement list, each item verified against `main` (30203e3) before it is planned.
- **Alternatives:** full interview-driven constitution first.
- **Consequence:** mission and metrics may need deepening; roadmap is the working to-do list.

## 2026-11-03 — Work in a separate worktree
- **Decision:** SDD work happens in `/Users/snaseem/sideProjects/skeletal/lonepair-sdd` (branch `sdd/roadmap`), because another session is actively changing branches in `lonepair-gh` (PRs #27–#32).
- **Consequence:** roadmap items that overlap those PRs wait for them to merge rather than duplicating the work.

## 2026-11-03 — Spec 001: saved projects and JSON drawings don't get the over-valence count
- **Decision:** FR-009's count is added where other programs' files open (`insertForeign`: CDXML, CDX, CML, MRV, and those formats pasted as text). Lone Pair's own saved projects and JSON drawings open as before, with no count.
- **Why:** they are the user's own drawings, so any over-valent atom was drawn on purpose or already showed the red warning; their open paths (`confirmOpenProject`, `pasteDoc`) have no "Opened …" message to extend.
- **Consequence:** `requirements.md` FR-009 is narrowed to match. The red warning still shows on those files.

## 2026-11-03 — Spec 001: noticed, not changed
- A reaction SMILES with agents (`A>B>C`) takes two undo steps (the agent text is a second `pushUndo`). It predates spec 001 and is the same with Insert anyway; a separate small fix.
- A refused `.sdf` first record now shows the specific reason (like other text files) instead of "Could not read this file".
