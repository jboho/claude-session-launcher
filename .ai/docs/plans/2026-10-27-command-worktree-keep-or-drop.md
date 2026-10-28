# Command and worktree: keep or drop?

## Goal

Decide whether the inline **command** field and the **worktree** toggle stay in the launcher, record the reasoning, and (for any feature dropped) remove it completely. The owner reports using neither much.

## What "command" and "worktree" are here

- **Command**: the optional `cmd` text (a prompt or slash command) that the launch string passes to `claude` after `--`. It is also a field on every preset and on the global defaults.
- **Worktree**: a toggle plus optional name that adds `claude --worktree [name]`. Preset and launch fields `worktree` / `worktreeName`.

## Step 1: Usage evidence (acceptance criterion 1)

The app has no telemetry and no servers, so adoption can only be read from what exists. Period: all time up to 2026-10-27 (v1.0.0 shipped 2026-10-05).

| Signal | Reading on 2026-10-27 |
|--------|------------------------|
| Owner's `~/.config/claude-launcher/presets.json` | 5 presets; 0 set `cmd`; 0 set `worktree` |
| Starter presets seeded on first run (`config.rs`) | "Design" (`/design`) and "Review" (`/code-review`) use `cmd`; none use worktree |
| GitHub repo | 0 stars, 0 forks, 2 release-asset downloads in total |
| Issues / feature requests mentioning either feature | to check at execution (`gh issue list --search`) |

Limit to state in the decision note: the only real user is the owner, so this measures one person. It cannot show whether outside users would miss either feature. No telemetry will be added just for this (it would cost more than either feature and conflicts with the "no servers" design).

## Step 2: Recommendation (criteria 2, 4)

Decided by the owner on 2026-10-27 (worktree: drop; command: keep). Automatic worktrees (creating one on every launch) are out of scope for this item; the owner does not want them. Reaching an existing worktree is already covered by the working-directory field.

Basis:

- **Worktree: drop.** It is a thin pass-through of one CLI flag, the owner does not use it, and `claude --worktree` can still be typed by hand. Cost to keep: a Rust charset guard (`is_safe_worktree_name`) and its tests, two fields in three type definitions, a UI row, and preset serialization.
- **Command: keep.** The two starter presets depend on it, the README lists it as a headline feature, and removing it also removes the `--`-separated quoting path that the shell-safety design relies on for `wd`. Zero use in the owner's own presets is weak evidence against a field whose value is mostly in presets other people write. Planned improvement to drive adoption: none beyond the existing starter presets; revisit if the repo gains outside users.

If the owner prefers a different outcome (keep both, or drop both), Step 3 changes accordingly; the file list below still shows what each feature touches.

## Step 3: Changes if worktree is dropped (criterion 3)

| File | Change |
|------|--------|
| `src-tauri/src/launch.rs` | Remove `is_safe_worktree_name`, `assert_safe_worktree_name`, the `--worktree` emission (~line 190), and the worktree tests (~lines 546-595, plus the worktree parts of the "everything at once" test at ~690) |
| `src-tauri/src/types.rs` | Remove `worktree` / `worktree_name` from `Preset` (~141) and `LaunchSpec` (~166) |
| `src/core/types.ts`, `src/core/types.test.ts` | Remove the three worktree references and the test line |
| `src/renderer/panel.ts` | Remove composer fields, `renderWorktree`, the preset badge `"wt"`, and the load/save mapping (about 10 of 28 cmd/worktree lines) |
| `src/renderer/index.html`, `panel.css` | Remove the worktree row and its styles (grep found no match for "worktree" in these two files, so the row's id is probably `wt`; confirm at execution) |
| `README.md` | Remove the "Worktree launch" bullet (line 53) and the worktree mention in the screenshot alt text (line 41) |
| `docs/images/panel.png` | Re-capture the screenshot without the toggle |
| `.ai/docs/notes/operational-knowledge.md` | Remove the worktree mention in the launch-flag surface (line 11) |
| `ROADMAP.md` | Tick or remove the keep-or-drop item |

Existing `presets.json` files that still contain `worktree` / `worktreeName`: serde ignores unknown fields unless `deny_unknown_fields` is set. Check this in `types.rs` before removing; add a test that loads a preset with the old fields.

Done when: `command grep -rIi worktree` over `src`, `src-tauri/src`, `README.md`, `ROADMAP.md` returns only the intentional leftovers (the `.worktreeinclude` file and CLAUDE.md's dev-workflow lines, which are about git worktrees for development, not the feature).

## Testing

- `cargo test --manifest-path src-tauri/Cargo.toml` (after `command pnpm build`), `command pnpm test`, `command pnpm build`.
- New test: an old `presets.json` with `worktree: true` still loads.
- Manual: launch the app, confirm the panel has no toggle, a preset launches, the preview matches the launched command, and a pre-existing config opens without error.

## Risks

- Evidence is one user. A public user of worktree would lose the toggle; mitigated by the manual `claude --worktree` route, which the release notes should mention.
- Old config files with worktree fields (see above).
- Dropping a field changes the on-disk format that CLAUDE.md says stays compatible; extra fields on read are the only compatibility need, since nothing downstream reads them.

## Step 4: Record and share (criterion 5)

- Write the decision, evidence table and reasoning into `.ai/docs/decisions/2026-10-27-command-worktree-keep-or-drop.md`.
- Share with the team: post the same summary on the GitHub issue for this item (the only team surface this solo project has), and note it in the release notes of the version that removes worktree.
- Step 3 was carried out on this branch after the owner's decision. One item remains: `docs/images/panel.png` still shows the worktree toggle and needs a new capture from the running app.
