# Review: new Claude changes that affect the launcher

Roadmap item: "Claude-launcher: Any new Claude changes that affect the application?" (type: feature)

## Goal

Find out whether recent Claude changes (models, Claude Code CLI, API) break or change the launcher, fix what needs fixing, and leave a repeatable review process behind.

## What the launcher depends on

The launcher makes no Anthropic API calls and has no API version, key or SDK. It builds a shell command for the `claude` CLI and opens it in a terminal. Its real contract with Claude is:

- CLI flags: `--model`, `--permission-mode`, `--effort`, `--worktree`, `--settings` (output style as inline JSON), plus the env prefixes `MAX_THINKING_TOKENS` and `CLAUDE_CODE_FORK_SUBAGENT` (`src-tauri/src/launch.rs`, mirrored in `src/core/launch-string.ts`).
- Model values: aliases `opus`, `sonnet`, `haiku`, `fable` (`src/core/types.ts` `MODELS`), and full ids such as `claude-opus-4-8[1m]` (charset rule in `launch.rs` and `src/core/validate.ts`).
- Per-model behavior: Fable ignores the thinking budget (`isFable`, `capabilitiesFor`); Haiku 4.5 accepts `--effort` and auto mode.
- Value lists: permission modes (`MODES`), effort levels (`EFFORTS`), output styles (`OUTPUT_STYLES`).
- Detection: `$SHELL -lc 'command -v claude'` (`src-tauri/src/detect.rs`).

## Steps

1. **Inventory (criterion 2).** Build a table of every model id, alias, flag, env var and value list above, with its file and line. Sources: `types.ts`, `launch-string.ts`, `launch.rs`, `validate.ts`, `panel.ts` defaults, the launch-surface paragraph in `.ai/docs/notes/operational-knowledge.md`, starter presets in `config.rs`.
2. **Gather the latest facts (criteria 1, 3).** Read these primary sources, with the date read:
   - Claude Code changelog (CHANGELOG.md in `anthropics/claude-code`) from the last reviewed version to the installed one (currently 2.1.312, `claude --version`).
   - Model overview and deprecations pages on docs.claude.com (current aliases, retired ids, new models).
   - API release notes, only to confirm nothing applies (the launcher has no API calls).
3. **Cross-check against the installed CLI (criterion 2, 3).** Run `claude --help` and read the output. Confirm each flag still exists and each value list (permission modes, effort levels) matches. Probe each model alias and the `[1m]` variant with a one-shot `claude -p --model X` call (cheap prompt) to confirm it resolves. Do not assume the docs match the binary; the binary wins.
4. **Impact list (criterion 3).** For each difference found, record: what changed, which launcher file it touches, who is affected, and the fix. Cover at least: deprecated or renamed models, new or removed flags, changed permission-mode or effort values, new models for the picker, changed thinking-budget behavior, and any change to how `claude` is located.
5. **Summary report (criterion 4).** Write `.ai/docs/analysis/2026-10-27-claude-changes-review.md` with the inventory, the impact list, and a severity (breaks launches / degrades a dial / cosmetic / opportunity) and priority (now / next / later) for each item.
6. **Follow-up issues (criterion 5).** One GitHub issue per required change, linked from the report. If nothing is required, the report says "no action required" in its first line and the roadmap item is closed with that note.
7. **Apply and verify (criterion 6).** For each required change, branch from main, fix with tests (`command pnpm test`, `cargo test` after `command pnpm build`). Then run the built app and launch a session for each changed model or flag against the real CLI, and confirm the session starts without a flag or model error. Record the commands and results in the report.
8. **Review process (criterion 1).** Add `.ai/docs/notes/claude-change-review.md`: the sources to read, the checks in steps 1 to 4, a command checklist, and the last-reviewed CLI version and date. Add a pointer from `CLAUDE.md` and a recurring ROADMAP line so the review repeats (suggested cadence: monthly, and on each new model release).

## Done when

- The report exists with the inventory, impact list, severities and priorities.
- Each required change has a linked issue, or the report states "no action required".
- Any fixes are merged and a real launch against the latest CLI succeeded.
- The review process note exists and records the last-reviewed version.

## Out of scope

Windows launch backend (ROADMAP #2) and any new feature work that is not driven by a Claude change; those become separate issues from step 6.
