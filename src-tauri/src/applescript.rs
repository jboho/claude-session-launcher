use std::process::Command;

/// Escape for an AppleScript double-quoted literal. Backslashes first — otherwise the
/// backslash added for a quote would itself be re-escaped and the quote would break out.
pub fn osa_quote(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

/// The AppleScript, one `-e` line per element, that opens a terminal running the command.
///
/// Two iTerm quirks make the obvious script unreliable, both verified against iTerm 3.x:
///  1. `current window` is `missing value` when iTerm has no key window (cold start, or
///     coming forward right after `activate`) — reading it fails with -1728. So never
///     re-derive it after creating; use what `create ...` returned.
///  2. `create tab with default profile` returns `missing value` (it does not error) when
///     the target window is hidden or minimized.
/// Hence: attempt the tab, and treat anything that does not yield a session as "open a
/// new window" rather than trusting either reference.
pub fn build_mac_script(launch_string: &str, terminal_app: &str) -> Vec<String> {
    if terminal_app == "Terminal" {
        return vec![
            r#"tell application "Terminal""#.to_string(),
            "  activate".to_string(),
            format!("  do script {}", osa_quote(launch_string)),
            "end tell".to_string(),
        ];
    }
    vec![
        r#"tell application "iTerm""#.to_string(),
        "  activate".to_string(),
        "  set targetSession to missing value".to_string(),
        "  try".to_string(),
        "    set targetWindow to current window".to_string(),
        "    if targetWindow is not missing value then".to_string(),
        "      tell targetWindow to set newTab to (create tab with default profile)".to_string(),
        "      if newTab is not missing value then set targetSession to current session of newTab".to_string(),
        "    end if".to_string(),
        "  end try".to_string(),
        "  if targetSession is missing value then".to_string(),
        "    set newWindow to (create window with default profile)".to_string(),
        r#"    if newWindow is missing value then error "iTerm could not open a new window.""#.to_string(),
        "    set targetSession to current session of newWindow".to_string(),
        "  end if".to_string(),
        format!("  tell targetSession to write text {}", osa_quote(launch_string)),
        "end tell".to_string(),
    ]
}

/// Ghostty has no AppleScript surface; it takes the command as CLI args via `open`.
pub fn build_ghostty_args(launch_string: &str) -> Vec<String> {
    vec![
        "-na".into(), "Ghostty".into(), "--args".into(),
        "-e".into(), "/bin/zsh".into(), "-lc".into(), launch_string.into(),
    ]
}

/// Formats a non-zero exit into an actionable message. An empty stderr (osascript and
/// `open` both do this on some failure paths, e.g. a missing target application) must not
/// surface as `Err("")` — that tells the user nothing happened but not what to do about it.
fn describe_process_failure(program: &str, status: &std::process::ExitStatus, stderr: &str) -> String {
    let stderr = stderr.trim();
    if stderr.is_empty() {
        format!("{program} exited with status {status} and no error output.")
    } else {
        stderr.to_string()
    }
}

/// Thin impure wrapper — argv only, never a shell.
pub fn launch_mac(launch_string: &str, terminal_app: &str) -> Result<(), String> {
    let program = if terminal_app == "Ghostty" { "open" } else { "osascript" };
    let output = if terminal_app == "Ghostty" {
        Command::new("open")
            .args(build_ghostty_args(launch_string))
            .output()
    } else {
        let mut args: Vec<String> = Vec::new();
        for line in build_mac_script(launch_string, terminal_app) {
            args.push("-e".to_string());
            args.push(line);
        }
        Command::new("osascript").args(args).output()
    }
    .map_err(|e| format!("Failed to start the terminal: {e}"))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(describe_process_failure(
            program,
            &output.status,
            &String::from_utf8_lossy(&output.stderr),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn double_quotes_and_backslashes_are_escaped_for_an_applescript_literal() {
        assert_eq!(osa_quote(r#"say "hi""#), r#""say \"hi\"""#);
        assert_eq!(osa_quote(r"C:\path"), r#""C:\\path""#);
    }

    #[test]
    fn a_backslash_before_a_quote_does_not_let_the_quote_escape() {
        // Backslashes must be doubled BEFORE quotes are escaped, or `\"` re-opens the literal.
        assert_eq!(osa_quote(r#"a\"b"#), r#""a\\\"b""#);
    }

    #[test]
    fn terminal_uses_do_script() {
        let lines = build_mac_script("claude --model opus", "Terminal");
        assert_eq!(lines[0], r#"tell application "Terminal""#);
        assert!(lines.iter().any(|l| l.contains("do script")));
        assert_eq!(lines.last().unwrap(), "end tell");
    }

    #[test]
    fn iterm_keeps_the_created_window_reference_instead_of_re_deriving_it() {
        // iTerm's `current window` is `missing value` on a cold start, so the script must
        // use what `create ...` returned. A script that re-reads `current window` after
        // creating is the bug this guards.
        let lines = build_mac_script("claude", "iTerm");
        let script = lines.join("\n");
        assert!(script.contains("set targetSession to missing value"));
        assert!(script.contains("create tab with default profile"));
        assert!(script.contains("create window with default profile"));
        assert!(script.contains("write text"));
        let after_create = script.split("create window with default profile").nth(1).unwrap();
        assert!(
            !after_create.contains("current window"),
            "must not re-derive `current window` after creating one"
        );
    }

    #[test]
    fn ghostty_runs_through_open_with_a_login_shell() {
        assert_eq!(
            build_ghostty_args("claude --model opus"),
            vec!["-na", "Ghostty", "--args", "-e", "/bin/zsh", "-lc", "claude --model opus"]
        );
    }

    // --- TS cross-check gaps (src/main/spawn/macos.test.ts) ---

    // "wraps in double quotes" (osaQuote, no special chars).
    #[test]
    fn osa_quote_wraps_a_plain_value_in_double_quotes() {
        assert_eq!(osa_quote("claude --model opus"), r#""claude --model opus""#);
    }

    // "iTerm: creates a window and writes the launch string" — exact first/last lines and
    // the exact quoted write-text line, not just a substring match.
    #[test]
    fn iterm_creates_a_window_and_writes_the_exact_launch_string() {
        let lines = build_mac_script("claude --model opus", "iTerm");
        assert_eq!(lines[0], r#"tell application "iTerm""#);
        assert!(lines.contains(&r#"  tell targetSession to write text "claude --model opus""#.to_string()));
        assert_eq!(lines.last().unwrap(), "end tell");
    }

    // "iTerm: falls back to a new window when the tab is not created" — the specific
    // fallback lines, not just that both create-branches are present somewhere.
    #[test]
    fn iterm_falls_back_to_a_new_window_when_the_tab_is_not_created() {
        let script = build_mac_script("claude", "iTerm").join("\n");
        assert!(script.contains(
            "if newTab is not missing value then set targetSession to current session of newTab"
        ));
        assert!(script.contains("if targetSession is missing value then"));
        assert!(script.contains(r#"if newWindow is missing value then error "iTerm could not open a new window.""#));
    }

    // "Terminal: uses do script" — the exact quoted do-script line, not just a substring.
    #[test]
    fn terminal_do_script_line_is_exactly_quoted() {
        let lines = build_mac_script("claude", "Terminal");
        assert!(lines.contains(&r#"  do script "claude""#.to_string()));
    }

    // --- Additional requirement 1: prove the escape order is load-bearing by computing
    // what the WRONG order (quotes escaped before backslashes are doubled) would produce,
    // and showing it desyncs from the real (correct-order) osa_quote output. Under the
    // wrong order, the backslash inserted to escape a quote gets doubled by the later
    // backslash pass, leaving the quote itself unescaped — which would let it close the
    // AppleScript string literal early. ---
    // A run of N backslashes immediately followed by a `"` is safe (the quote stays inside
    // the literal) only when N is ODD: N-1 backslashes pair off into (N-1)/2 literal
    // backslashes, and the final, unpaired backslash escapes the quote. An EVEN N means
    // every backslash pairs off, leaving the quote bare — it closes the AppleScript string
    // literal early instead of being escaped.
    fn backslash_run_before_first_quote_is_odd(s: &str) -> bool {
        let bytes = s.as_bytes();
        let quote_pos = bytes.iter().position(|&b| b == b'"').unwrap();
        let mut run = 0;
        let mut i = quote_pos;
        while i > 0 && bytes[i - 1] == b'\\' {
            run += 1;
            i -= 1;
        }
        run % 2 == 1
    }

    #[test]
    fn reversing_the_escape_order_would_leave_the_quote_unescaped() {
        let input = r#"a\"b"#; // characters: a \ " b
        let correct = osa_quote(input);
        // The wrong order: escape the quote FIRST (inserting a backslash in front of it),
        // then double every backslash SECOND — which also doubles the backslash that was
        // just inserted to escape the quote.
        let wrong_order = format!("\"{}\"", input.replace('"', "\\\"").replace('\\', "\\\\"));

        assert_eq!(correct, r#""a\\\"b""#, "sanity check on the real (correct) implementation");
        assert_ne!(wrong_order, correct, "wrong escape order must diverge from the correct output");

        // Correct: 3 backslashes then the quote (odd — one literal backslash pair, then an
        // escaped quote). Wrong: 4 backslashes then the quote (even — two literal backslash
        // pairs, then a BARE quote that closes the AppleScript string literal early).
        assert!(
            backslash_run_before_first_quote_is_odd(&correct[1..]), // skip the outer opening quote
            "correct output must escape the quote (odd backslash run): {correct}"
        );
        assert!(
            !backslash_run_before_first_quote_is_odd(&wrong_order[1..]),
            "wrong-order output must leave the quote unescaped (even backslash run), proving it would break out of the literal: {wrong_order}"
        );
    }

    // --- Additional requirement 2: a launch string containing a raw newline. Verified via
    // an `osascript` syntax probe (see report) that a physical newline embedded inside an
    // AppleScript double-quoted literal is valid and preserved — AppleScript does not
    // require `\n`/`return` concatenation the way many other languages do. osa_quote
    // therefore correctly leaves newlines untouched (only `\` and `"` are escaped), and the
    // resulting -e line carries the newline through unmangled. ---
    #[test]
    fn a_raw_newline_in_the_launch_string_is_preserved_unescaped_in_the_quoted_literal() {
        let launch_string = "line1\nline2";
        assert_eq!(osa_quote(launch_string), "\"line1\nline2\"");

        let lines = build_mac_script(launch_string, "Terminal");
        assert_eq!(lines[2], "  do script \"line1\nline2\"");
    }

    // --- Additional requirement 3: terminal_app (attacker-influenceable via settings.json)
    // must only ever be COMPARED, never interpolated into the generated script or argv. ---
    #[test]
    fn terminal_app_is_never_interpolated_into_the_generated_script() {
        // terminal_app comes from settings.json (attacker-influenceable). build_mac_script
        // only ever COMPARES it (`== "Terminal"`); anything else — including a hostile,
        // AppleScript-metacharacter-laden value — must fall through to the fixed iTerm
        // template and never be written verbatim into a `tell application` line or anywhere
        // else in the script.
        let hostile = r#"Terminal" with hostile activate end tell tell application "iTerm"#;
        let lines = build_mac_script("claude", hostile);
        assert_eq!(
            lines[0],
            r#"tell application "iTerm""#,
            "an unrecognized terminal_app must fall through to the fixed iTerm template"
        );
        assert!(!lines.join("\n").contains(hostile));
    }

    // --- Additional requirement 4: an empty stderr on a non-zero exit must not surface as
    // an unactionable `Err("")` — it should name the program and exit status instead. ---
    #[test]
    fn a_failure_with_empty_stderr_falls_back_to_a_named_actionable_message() {
        #[cfg(unix)]
        {
            use std::os::unix::process::ExitStatusExt;
            let status = std::process::ExitStatus::from_raw(1 << 8); // exit code 1
            let msg = describe_process_failure("osascript", &status, "");
            assert!(msg.contains("osascript"), "message should name the program: {msg}");
            assert!(!msg.is_empty());
        }
    }

    #[test]
    fn a_failure_with_stderr_passes_it_through_verbatim() {
        #[cfg(unix)]
        {
            use std::os::unix::process::ExitStatusExt;
            let status = std::process::ExitStatus::from_raw(1 << 8);
            let msg = describe_process_failure("osascript", &status, "  execution error: -1728\n");
            assert_eq!(msg, "execution error: -1728");
        }
    }
}
