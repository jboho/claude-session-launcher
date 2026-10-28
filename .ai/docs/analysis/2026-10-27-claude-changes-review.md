# Claude changes review, 2026-10-27

Result: **no breaking changes found; two follow-ups needed (one medium, one low).** Launches work unchanged. Roadmap item: issue #22. Plan: `.ai/docs/plans/2026-10-27-claude-changes-review.md`.

Reviewed against Claude Code **2.1.312** (installed, also the newest entry in the changelog) on 2026-10-27.

## What the launcher depends on

No Anthropic API calls, API version, key or SDK. The contract is the `claude` CLI flags, model names, and two environment variables.

| Item | Where | Status on 2.1.312 |
|------|-------|-------------------|
| `--model` aliases `opus`, `sonnet`, `haiku`, `fable` | `src/core/types.ts` `MODELS` | Work. JSON output shows they resolve to `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-fable-5-1` |
| `--model` full ids, `[1m]` suffix | `launch.rs:39`, `validate.ts:44` | `claude-haiku-5-5` and `claude-haiku-4-5-20251001` run; `opus[1m]` runs. Suffix is now optional (see item 2) |
| `--permission-mode` plan, auto, acceptEdits, dontAsk, manual | `types.ts` `MODES`, `DEFAULT_MODE` | All five accepted (one-shot run each) |
| `--effort` low, medium, high, xhigh, max | `types.ts` `EFFORTS` | All five accepted on Sonnet |
| `--worktree [name]` | `launch.rs` | In `--help` |
| `--settings '{"outputStyle":...}'` | `launch.rs` | In `--help` |
| `MAX_THINKING_TOKENS` | `launch.rs:183` | Accepted, but see item 1 |
| `CLAUDE_CODE_FORK_SUBAGENT` 0/1 | `commands.rs:22` | Documented; fork mode now on by default (2.1.302), matches the launcher's "default / on / off" |
| `claude` discovery (`$SHELL -lc 'command -v claude'`) | `detect.rs` | Found `/opt/homebrew/bin/claude` |

Latest models (platform docs, models overview): Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5, all with 1M context. Legacy but available: Fable 5, Opus 5, Opus 4.8 to 4.5, Sonnet 5 and 4.6, Haiku 4.5. No retirement of a launcher-relevant model is announced; the earliest date on the current lineup is September 1, 2027.

## Items

| # | Item | Impact | Severity | Priority | Issue |
|---|------|--------|----------|----------|-------|
| 1 | Thinking-budget "Off" dial: docs say `MAX_THINKING_TOKENS=0` cannot turn thinking off on Opus 5.5, Sonnet 5.5, Haiku 5.5 or Fable; the launcher greys the dial only for Fable | Dial looks active but has no effect on all four default models | Medium | Next | Proposed, not filed |
| 2 | Stale wording: "Haiku 4.5" in `types.ts:39`; `claude-opus-4-8[1m]` examples (README.md:56, launch-string.ts:10, validate.ts:44, launch.rs:39); `default` listed as a mode and `claude-fable-5` in `operational-knowledge.md:11`. Claude Code 2.1.312 no longer shows `[1m]` and the CLI's mode list has `manual`, not `default` | Wording only; the suffix is still accepted so the charset rule must stay | Low | Later | Proposed, not filed |

Watch items, no action: `CLAUDE_CODE_EFFORT_LEVEL`, if set in the user's shell, takes precedence over `--effort` (env-vars docs), so the effort dial would be ignored; `bypassPermissions` is still a CLI choice but stays removed from the UI by design; `claude ultrareview` and `claude remote-control --sandbox` changes (2.1.309, 2.1.300) do not touch the launcher.

## Verification

- Real launches with the launcher's flag shapes on 2.1.312: every alias, every permission mode, every effort level exited 0 (`claude -p`, one-shot).
- `command pnpm test`: 67 passed. `command pnpm build`: ok. `cargo test`: 141 passed.
- Not done: the launcher app was not started and a session was not opened through its UI; the check exercises the same flags through `claude -p`. No code changed, so none was needed.

## Limits of this review

- Changelog read for 2.1.290 to 2.1.312 only, and the 2.1.297/298 entries were not clearly labelled in the fetched text. There was no earlier review to set the start version, so older entries were not read.
- Item 1 comes from the docs; I did not measure thinking on the CLI. The follow-up starts with that check.
- The Claude Code docs `MAX_THINKING_TOKENS` entry itself was cut off in the fetch; the claim rests on the two entries that mention it.

## Issues

`gh issue create` for items 1 and 2 was refused by the session's permission check (the task authorised one issue), so they are proposed, not filed. Suggested titles: "Thinking-budget dial does nothing on current Claude models" and "Refresh stale Claude model wording and examples".
