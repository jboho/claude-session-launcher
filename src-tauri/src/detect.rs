//! Port of `src/main/detect.ts` and the detection-argv half of `src/core/claude-binary.ts`
//! (`buildDetectArgv`).
//!
//! Detects the `claude` CLI via a login shell (so the result matches the terminal's PATH,
//! including nvm/mise shims a non-login shell would miss) and probes for installed terminal
//! apps via `open -Ra`.

use std::process::Command;

pub const TERMINAL_CANDIDATES: [&str; 3] = ["iTerm", "Terminal", "Ghostty"];

/// Login-shell argv that reports the claude path if present — matches the terminal's PATH.
pub fn build_detect_argv(shell: Option<&str>) -> Vec<String> {
    let sh = match shell.map(str::trim) {
        Some(s) if !s.is_empty() => s,
        _ => "/bin/zsh",
    };
    vec![sh.to_string(), "-lc".to_string(), "command -v claude".to_string()]
}

/// Take only the first line of shell output as the path; `lines()` already strips both
/// `\n` and `\r\n` terminators, and `trim()` mops up any stray whitespace.
pub fn first_path(stdout: &str) -> String {
    stdout.lines().next().unwrap_or("").trim().to_string()
}

/// Only trust stdout when the shell command actually succeeded. `command -v` exits
/// non-zero and prints nothing when `claude` isn't found, but a misbehaving/aliased shell
/// could still write stale or garbage text to stdout on a non-zero exit — without this
/// check that text would be reported as a real, working claude path.
fn extract_claude_path(success: bool, stdout: &str) -> Option<String> {
    if !success {
        return None;
    }
    let path = first_path(stdout);
    if path.is_empty() { None } else { Some(path) }
}

/// Never fails: "not found" is a normal answer, not an error. Matches the TS `detectClaude`
/// contract (`{ found: false }` on any failure, never a rejected promise).
pub fn detect_claude() -> Option<String> {
    let argv = build_detect_argv(std::env::var("SHELL").ok().as_deref());
    let out = Command::new(&argv[0]).args(&argv[1..]).output().ok()?;
    extract_claude_path(out.status.success(), &String::from_utf8_lossy(&out.stdout))
}

/// The installed subset, probed with `open -Ra`. Apple Terminal ships with the OS.
pub fn detect_terminals() -> Vec<String> {
    TERMINAL_CANDIDATES
        .iter()
        .filter(|name| {
            **name == "Terminal"
                || Command::new("open")
                    .args(["-Ra", name])
                    .output()
                    .map(|o| o.status.success())
                    .unwrap_or(false)
        })
        .map(|s| s.to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detection_uses_a_login_shell_so_it_sees_the_terminals_path() {
        // A non-login shell misses nvm/mise shims, which is the whole point.
        assert_eq!(build_detect_argv(Some("/bin/fish")), vec!["/bin/fish", "-lc", "command -v claude"]);
    }

    #[test]
    fn falls_back_to_zsh_when_shell_is_unset_or_blank() {
        assert_eq!(build_detect_argv(None)[0], "/bin/zsh");
        assert_eq!(build_detect_argv(Some("   "))[0], "/bin/zsh");
    }

    #[test]
    fn only_the_first_line_of_output_is_taken_as_the_path() {
        assert_eq!(first_path("/usr/local/bin/claude\n/other/claude\n"), "/usr/local/bin/claude");
        assert_eq!(first_path("  \n"), "");
    }

    #[test]
    fn apple_terminal_is_always_offered() {
        assert!(TERMINAL_CANDIDATES.contains(&"Terminal"));
    }

    // --- additional coverage: error-swallowing contract (investigation point 1) ---

    #[test]
    fn extract_claude_path_ignores_stdout_when_the_shell_exit_status_is_non_zero() {
        // Fake output: `command -v` failed (exit 1) but stdout still has stale/garbage text.
        // Without a status check this would be misreported as a found, working path.
        assert_eq!(extract_claude_path(false, "/stale/garbage/claude\n"), None);
    }

    #[test]
    fn extract_claude_path_trusts_stdout_only_on_success() {
        assert_eq!(extract_claude_path(true, "/usr/local/bin/claude\n"), Some("/usr/local/bin/claude".to_string()));
    }

    #[test]
    fn extract_claude_path_treats_empty_stdout_on_success_as_not_found() {
        assert_eq!(extract_claude_path(true, "\n"), None);
    }

    // --- additional coverage: Windows line endings (investigation point 2) ---

    #[test]
    fn first_path_strips_crlf_line_endings_without_corrupting_the_path() {
        assert_eq!(first_path("/usr/local/bin/claude\r\n/other/claude\r\n"), "/usr/local/bin/claude");
        assert!(!first_path("/usr/local/bin/claude\r\n").contains('\r'));
    }

    // --- additional coverage: cross-checked against src/main/detect.test.ts ---

    #[test]
    fn candidate_list_matches_iterm_terminal_ghostty_order() {
        assert_eq!(TERMINAL_CANDIDATES, ["iTerm", "Terminal", "Ghostty"]);
    }
}
