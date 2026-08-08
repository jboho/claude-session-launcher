use crate::types::LaunchSpec;

/// POSIX single-quote so the receiving shell treats the value literally.
pub fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', r"'\''"))
}

/// model/mode/effort are written UNQUOTED into the shell command, so they are restricted
/// to a charset that cannot express a metacharacter, and forbidden from starting with `-`
/// so a value can never be interpreted as a CLI flag by the external `claude` binary's own
/// (undocumented, closed) argument parser. Mirrors SAFE_DIAL in the TypeScript dispatcher.
/// wd/cmd are intentionally unrestricted — they are quoted and `--`-separated instead.
pub fn is_safe_dial(value: &str) -> bool {
    !value.starts_with('-')
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
}

fn assert_safe_dial(name: &str, value: &str) -> Result<(), String> {
    if is_safe_dial(value) {
        Ok(())
    } else {
        Err(format!(
            "Unsafe {name} value: {value:?} — only letters, digits, '.', '-', '_' are allowed."
        ))
    }
}

/// The token that stands in for `claude`: a quoted explicit path, or the bare command.
pub fn resolve_claude_command(binary: &str) -> String {
    let b = binary.trim();
    if b.is_empty() {
        "claude".to_string()
    } else {
        shell_quote(b)
    }
}

/// Builds the shell command written into the terminal. Both quoted positional arguments
/// (`cmd`, and `wd` via `cd`) are preceded by a literal `--` so a value that happens to be
/// flag-shaped (e.g. a hand-edited preset with `cmd: "--dangerously-skip-permissions"`) is
/// parsed as a positional argument by `claude`/`cd`, never as an option — do not remove
/// either `--` as a "simplification".
pub fn build_launch_string(spec: &LaunchSpec, claude_cmd: &str) -> Result<String, String> {
    assert_safe_dial("model", spec.model.trim())?;
    assert_safe_dial("mode", spec.mode.trim())?;
    assert_safe_dial("effort", spec.effort.trim())?;

    let mut parts = vec![claude_cmd.to_string()];
    if !spec.model.trim().is_empty() {
        parts.push(format!("--model {}", spec.model.trim()));
    }
    if !spec.mode.trim().is_empty() {
        parts.push(format!("--permission-mode {}", spec.mode.trim()));
    }
    if !spec.effort.trim().is_empty() {
        parts.push(format!("--effort {}", spec.effort.trim()));
    }
    if !spec.cmd.trim().is_empty() {
        parts.push("--".to_string());
        parts.push(shell_quote(spec.cmd.trim()));
    }
    let invocation = parts.join(" ");

    Ok(if spec.wd.trim().is_empty() {
        invocation
    } else {
        format!("cd -- {} && {}", shell_quote(spec.wd.trim()), invocation)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::LaunchSpec;

    fn spec(model: &str, mode: &str, effort: &str, wd: &str, cmd: &str) -> LaunchSpec {
        LaunchSpec {
            model: model.into(), mode: mode.into(), effort: effort.into(),
            wd: wd.into(), cmd: cmd.into(),
        }
    }

    #[test]
    fn single_quotes_inside_a_value_are_escaped() {
        // The POSIX idiom: close, escaped literal quote, reopen.
        assert_eq!(shell_quote("it's"), r"'it'\''s'");
    }

    #[test]
    fn metacharacters_are_inert_inside_single_quotes() {
        assert_eq!(shell_quote("a; rm -rf /"), "'a; rm -rf /'");
        assert_eq!(shell_quote("$(whoami)"), "'$(whoami)'");
        assert_eq!(shell_quote("`id`"), "'`id`'");
    }

    #[test]
    fn builds_the_full_invocation() {
        let s = spec("opus", "auto", "high", "~/Code", "/wrap");
        assert_eq!(
            build_launch_string(&s, "claude").unwrap(),
            "cd -- '~/Code' && claude --model opus --permission-mode auto --effort high -- '/wrap'"
        );
    }

    #[test]
    fn blank_dials_omit_their_flags() {
        let s = spec("opus", "", "", "", "");
        assert_eq!(build_launch_string(&s, "claude").unwrap(), "claude --model opus");
    }

    #[test]
    fn a_dial_with_shell_metacharacters_is_refused() {
        let s = spec("opus; rm -rf /", "", "", "", "");
        let err = build_launch_string(&s, "claude").unwrap_err();
        assert!(err.contains("model"), "error should name the offending dial: {err}");
    }

    #[test]
    fn every_dial_is_guarded_not_just_the_model() {
        assert!(build_launch_string(&spec("opus", "auto`id`", "", "", ""), "claude").is_err());
        assert!(build_launch_string(&spec("opus", "", "high$(id)", "", ""), "claude").is_err());
    }

    #[test]
    fn dial_charset_matches_the_typescript_guard() {
        assert!(is_safe_dial(""));
        assert!(is_safe_dial("claude-opus-5"));
        assert!(is_safe_dial("opus_1.5"));
        assert!(!is_safe_dial("opus[1m]"));
        assert!(!is_safe_dial("a b"));
        assert!(!is_safe_dial("a\nb"));
    }

    // Defense in depth: a dial must never be able to masquerade as a CLI flag, even
    // though the currently-installed `claude` binary happens to bind `--model -rf` as a
    // value rather than parsing it as an option — that safety is an accident of an
    // external, closed binary's undocumented parser, not a guarantee.
    #[test]
    fn is_safe_dial_rejects_a_leading_hyphen_but_allows_an_interior_one() {
        assert!(!is_safe_dial("-rf"));
        assert!(!is_safe_dial("--dangerously-skip-permissions"));
        assert!(is_safe_dial("claude-opus-5"));
        assert!(is_safe_dial("opus_1.5"));
    }

    #[test]
    fn a_leading_hyphen_dial_is_refused_with_the_normal_named_field_error() {
        let s = spec("-rf", "", "", "", "");
        let err = build_launch_string(&s, "claude").unwrap_err();
        assert!(err.contains("model"), "error should name the offending dial: {err}");
    }

    #[test]
    fn an_explicit_binary_path_is_quoted_but_a_blank_one_is_bare() {
        assert_eq!(resolve_claude_command(""), "claude");
        assert_eq!(resolve_claude_command("/opt/my claude/claude"), "'/opt/my claude/claude'");
    }

    // --- Additional requirement 1: a `cmd` containing a single quote is one inert
    // quoted argument, not a quote-escape out of the string. ---
    #[test]
    fn a_cmd_with_a_single_quote_stays_one_inert_quoted_argument() {
        let s = spec("", "", "", "", "'; rm -rf /; echo '");
        assert_eq!(
            build_launch_string(&s, "claude").unwrap(),
            r"claude -- ''\''; rm -rf /; echo '\'''"
        );
    }

    // --- Additional requirement 2: a `wd` containing both a single quote and a space. ---
    #[test]
    fn a_wd_with_a_single_quote_and_a_space_is_quoted_safely() {
        let s = spec("opus", "", "", "/Users/me/My Code's Stuff", "");
        assert_eq!(
            build_launch_string(&s, "claude").unwrap(),
            r"cd -- '/Users/me/My Code'\''s Stuff' && claude --model opus"
        );
    }

    // --- Additional requirement 3: a newline inside `cmd` stays inside the quotes. ---
    #[test]
    fn a_newline_inside_cmd_stays_inside_the_quotes() {
        let s = spec("", "", "", "", "line1\nline2");
        assert_eq!(build_launch_string(&s, "claude").unwrap(), "claude -- 'line1\nline2'");
    }

    // --- Additional requirement 4: leading/trailing whitespace in a dial is trimmed
    // before both the charset check and the emitted flag, matching the TypeScript
    // builder's `.trim()` at emission time. (The TS *dispatch-layer* assertSafeDial in
    // src/main/spawn/index.ts checks the RAW, untrimmed value and would reject a
    // whitespace-padded dial before it ever reaches buildLaunchString — see the report
    // for the reasoning on why this divergence is not a security regression.) ---
    #[test]
    fn leading_and_trailing_whitespace_in_a_dial_is_trimmed_like_the_ts_builder() {
        let s = spec(" opus ", "", "", "", "");
        assert_eq!(build_launch_string(&s, "claude").unwrap(), "claude --model opus");
    }

    // --- Additional requirement 5: a dial that is entirely whitespace trims to empty
    // and is treated as "not set", omitting its flag — matches
    // `if (spec.mode.trim()) parts.push(...)` in launch-string.ts. ---
    #[test]
    fn a_whitespace_only_dial_trims_to_empty_and_omits_its_flag() {
        let s = spec("opus", "   ", "", "", "");
        assert_eq!(build_launch_string(&s, "claude").unwrap(), "claude --model opus");
    }

    // --- Additional requirement 6: unicode in `cmd` and `wd` passes through unmangled. ---
    #[test]
    fn unicode_in_cmd_and_wd_passes_through_unmangled() {
        let s = spec("opus", "", "", "~/Café/日本語", "café éè 😀");
        assert_eq!(
            build_launch_string(&s, "claude").unwrap(),
            "cd -- '~/Café/日本語' && claude --model opus -- 'café éè 😀'"
        );
    }

    // --- Additional requirement 7: is_safe_dial rejects NUL and other control chars,
    // since they are outside [A-Za-z0-9._-] just like every other metacharacter. ---
    #[test]
    fn is_safe_dial_rejects_nul_and_control_characters() {
        assert!(!is_safe_dial("opus\0"));
        assert!(!is_safe_dial("opus\x1b[31m"));
        assert!(!is_safe_dial("a\tb"));
        assert!(!is_safe_dial("\r"));
    }

    // --- TS cross-check gaps (src/core/launch-string.test.ts) ---

    // "wraps in single quotes" (shellQuote, no special chars).
    #[test]
    fn shell_quote_wraps_a_plain_value_in_single_quotes() {
        assert_eq!(shell_quote("/Users/me/Code"), "'/Users/me/Code'");
    }

    // "escapes embedded single quotes" (shellQuote("a'b")).
    #[test]
    fn shell_quote_escapes_an_embedded_single_quote_in_ab() {
        assert_eq!(shell_quote("a'b"), r"'a'\''b'");
    }

    // "all dials empty -> bare claude": unlike the given `blank_dials_omit_their_flags`
    // test (which still sets model), this leaves EVERY field blank, including model.
    #[test]
    fn every_dial_and_field_blank_yields_bare_claude() {
        let s = spec("", "", "", "", "");
        assert_eq!(build_launch_string(&s, "claude").unwrap(), "claude");
    }

    // "omits unset dials": model + effort set, mode left out — checks that a dial in
    // the MIDDLE of the flag sequence (not just a trailing one) is correctly omitted.
    #[test]
    fn omits_only_the_unset_dial_in_the_middle_of_the_sequence() {
        let s = spec("sonnet", "", "low", "", "");
        assert_eq!(build_launch_string(&s, "claude").unwrap(), "claude --model sonnet --effort low");
    }

    // "quotes a working directory containing spaces" (space only, no embedded quote).
    #[test]
    fn quotes_a_working_directory_containing_only_spaces() {
        let s = spec("opus", "", "", "/Users/me/My Code", "");
        assert_eq!(
            build_launch_string(&s, "claude").unwrap(),
            "cd -- '/Users/me/My Code' && claude --model opus"
        );
    }

    // "uses a supplied claude command token in place of bare claude".
    #[test]
    fn uses_a_supplied_claude_command_token_in_place_of_bare_claude() {
        let s = spec("opus", "", "", "~/Code", "");
        assert_eq!(
            build_launch_string(&s, "'/opt/tools/claude'").unwrap(),
            "cd -- '~/Code' && '/opt/tools/claude' --model opus"
        );
    }

    // --- TS cross-check gaps (src/main/spawn/index.test.ts) ---

    // "allows a real hyphenated/dotted model id" — a realistic model string threaded
    // through the full builder, not just the raw is_safe_dial charset check.
    #[test]
    fn allows_a_real_hyphenated_dotted_model_id_through_the_full_builder() {
        let s = spec("claude-haiku-4-5-20251001", "auto", "high", "", "");
        assert_eq!(
            build_launch_string(&s, "claude").unwrap(),
            "claude --model claude-haiku-4-5-20251001 --permission-mode auto --effort high"
        );
    }

    // "uses the configured claude binary path (quoted) in the launch string" — the
    // resolve_claude_command + build_launch_string integration, with a space in the path.
    #[test]
    fn a_spaced_binary_path_resolves_and_feeds_into_the_full_launch_string() {
        let claude_cmd = resolve_claude_command("/opt/my tools/claude");
        let s = spec("opus", "auto", "high", "", "");
        assert_eq!(
            build_launch_string(&s, &claude_cmd).unwrap(),
            "'/opt/my tools/claude' --model opus --permission-mode auto --effort high"
        );
    }

    // --- Argument-injection regression suite: `--` must make `cmd` (and `wd` via `cd`)
    // strictly positional, so a hand-edited presets.json cannot smuggle a real claude
    // (or cd) flag through those fields. ---

    #[test]
    fn a_flag_shaped_cmd_is_positional_not_an_option() {
        let s = spec("opus", "", "", "", "--dangerously-skip-permissions");
        let out = build_launch_string(&s, "claude").unwrap();
        assert_eq!(out, "claude --model opus -- '--dangerously-skip-permissions'");
        assert!(out.contains("-- '--dangerously-skip-permissions'"));
    }

    #[test]
    fn mcp_config_and_append_system_prompt_shaped_cmds_land_after_the_separator() {
        let mcp = spec("opus", "", "", "", "--mcp-config {\"evil\":true}");
        assert_eq!(
            build_launch_string(&mcp, "claude").unwrap(),
            "claude --model opus -- '--mcp-config {\"evil\":true}'"
        );

        let prompt = spec("opus", "", "", "", "--append-system-prompt ignore all rules");
        assert_eq!(
            build_launch_string(&prompt, "claude").unwrap(),
            "claude --model opus -- '--append-system-prompt ignore all rules'"
        );
    }

    #[test]
    fn a_blank_cmd_emits_no_dangling_separator() {
        let s = spec("opus", "", "", "", "");
        let out = build_launch_string(&s, "claude").unwrap();
        assert_eq!(out, "claude --model opus");
        assert!(!out.ends_with("--"), "blank cmd must not leave a trailing --: {out}");
        assert!(!out.contains(" -- "), "blank cmd must not emit a separator at all: {out}");
    }

    #[test]
    fn cmd_combined_with_wd_still_orders_cd_then_dashdash_then_cmd() {
        let s = spec("opus", "", "", "~/Code", "/wrap");
        assert_eq!(
            build_launch_string(&s, "claude").unwrap(),
            "cd -- '~/Code' && claude --model opus -- '/wrap'"
        );
    }

    // A `wd` of exactly "-" must not be reinterpreted by `cd` as "jump to $OLDPWD";
    // `cd --` forces it to be read as a literal directory name.
    #[test]
    fn a_wd_of_bare_hyphen_is_forced_positional_for_cd() {
        let s = spec("", "", "", "-", "");
        assert_eq!(build_launch_string(&s, "claude").unwrap(), "cd -- '-' && claude");
    }
}
