# Decisions log (append-only)

## 2026-11-03 — Thin constitution, derived from the repo
- **Decision:** Start SDD with a thin mission/tech-stack and a roadmap built from the user's 19-item improvement list, each item verified against `main` (30203e3) before it is planned.
- **Alternatives:** full interview-driven constitution first.
- **Consequence:** mission and metrics may need deepening; roadmap is the working to-do list.

## 2026-11-03 — Work in a separate worktree
- **Decision:** SDD work happens in `/Users/snaseem/sideProjects/skeletal/lonepair-sdd` (branch `sdd/roadmap`), because another session is actively changing branches in `lonepair-gh` (PRs #27–#32).
- **Consequence:** roadmap items that overlap those PRs wait for them to merge rather than duplicating the work.
