# Claude change review (repeatable)

Run monthly, and when a new Claude model or a new Claude Code major feature ships. The launcher has no API calls; the contract is the `claude` CLI, so the CLI is the ground truth. Last review: 2026-10-27, Claude Code 2.1.312 (report: `.ai/docs/analysis/2026-10-27-claude-changes-review.md`).

## Sources

1. Claude Code changelog: `https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md`. Read from the last-reviewed version up. Look for: `--model`, `--permission-mode`, `--effort`, `--worktree`, `--settings`, `outputStyle`, `MAX_THINKING_TOKENS`, `CLAUDE_CODE_FORK_SUBAGENT`, "breaking".
2. Models overview: `https://platform.claude.com/docs/en/about-claude/models/overview` (current ids, legacy list, retirement dates), and the deprecations page it links.
3. Claude Code env vars page: `https://code.claude.com/docs/en/env-vars`.
4. The installed CLI: `claude --version`, `claude --help`.

## Checks

1. Inventory: the table in the last report. Re-grep for `claude-`, `--model`, `--permission-mode`, `--effort`, and the two env vars.
2. Flags: compare `claude --help` choices with `MODES`, `EFFORTS` and `src-tauri/src/launch.rs`.
3. Aliases: `claude -p --model ALIAS --effort low --output-format json 'Say ok'` for each alias in `MODELS`; read `modelUsage` for the resolved id (the model's own answer to "which model are you" is not reliable).
4. Modes and efforts: one `claude -p` run per value, exit code 0.
5. Dials tied to model behavior (`capabilitiesFor`, thinking budget): compare with the env-vars page.
6. `command pnpm test`, `command pnpm build`, `cargo test --manifest-path src-tauri/Cargo.toml`.

## Output

A report in `.ai/docs/analysis/DATE-claude-changes-review.md` with a severity (breaks launches / degrades a dial / wording or opportunity) and priority for each item, one issue per required change, or "no action required" in the first line. Update the last-reviewed line above.
