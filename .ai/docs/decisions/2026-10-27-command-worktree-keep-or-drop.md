# Decision: drop worktree, keep command

Date: 2026-10-27. Decided by the owner. Issue: #21. Plan: `.ai/docs/plans/2026-10-27-command-worktree-keep-or-drop.md`.

## Evidence

The app has no telemetry, so adoption was read from what exists on 2026-10-27 (v1.0.0 shipped 2026-10-05):

- The owner's `presets.json` has 5 presets; none set `cmd`, none set `worktree`.
- The repo has 0 stars, 0 forks and 2 release downloads in total.
- The only real user is the owner, so this measures one person.

## Decision

- **Worktree: dropped.** The toggle only created a new worktree. Using an existing one is already done through the working-directory field. Automatic worktrees on every launch were considered and rejected.
- **Command: kept.** The "Design" and "Review" starter presets use it, and it is a documented feature. No adoption work is planned beyond those starter presets; revisit if outside users appear.

## Consequences

- Presets saved with `worktree` / `worktreeName` still load; the extra fields are ignored (test: `a_preset_saved_with_the_removed_worktree_fields_still_loads`).
- Anyone who wants a worktree can run `claude --worktree` by hand.
