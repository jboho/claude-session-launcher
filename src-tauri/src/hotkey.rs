//! Hotkey candidate ordering + Electron-accelerator-to-Tauri-shortcut translation.
//!
//! Port of `src/main/hotkey.ts` (candidate ordering / default) and the shortcut-string
//! half of `src/core/accelerator.ts`'s contract: settings.json stores Electron accelerator
//! strings (e.g. "Alt+W"), and this module translates them for
//! `tauri_plugin_global_shortcut::Shortcut::from_str`.

pub const DEFAULT_HOTKEY: &str = "Alt+W"; // Option+W on macOS
/// Alt+<letter> triggers menu-bar mnemonics on Windows, so use a Ctrl+Alt combo there.
pub const DEFAULT_HOTKEY_WIN: &str = "Control+Alt+C";

pub fn default_hotkey(platform: &str) -> String {
    if platform == "windows" { DEFAULT_HOTKEY_WIN } else { DEFAULT_HOTKEY }.to_string()
}

/// Registration order: preferred, then the currently-active binding (so a failed change
/// keeps the old one working), then the platform default. Blanks dropped, de-duplicated.
pub fn hotkey_candidates(preferred: &str, current: &str, platform: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for candidate in [preferred.trim(), current.trim(), &default_hotkey(platform)] {
        if !candidate.is_empty() && !out.iter().any(|e| e == candidate) {
            out.push(candidate.to_string());
        }
    }
    out
}

/// Translate a stored Electron-style accelerator (as produced by `src/core/accelerator.ts`
/// and already sitting in users' settings.json) into a string
/// `tauri_plugin_global_shortcut::Shortcut::from_str` accepts.
///
/// Empirically (see `global_hotkey::hotkey::parse_hotkey`/`parse_key`, which
/// `tauri-plugin-global-shortcut` re-exports `Shortcut` = `HotKey` from), the parser:
/// - splits on `+` and uppercases each token for matching, so "Control", "Alt", "Shift",
///   "Command", and even "CommandOrControl" already match directly as modifier aliases —
///   no translation is strictly required for those.
/// - accepts bare letters ("W"), digits ("3"), F1-F24, arrow names ("Up"/"Down"/...),
///   "Escape", "Tab", "Space", "Backspace", "Delete", and the base punctuation characters
///   `` ` \ [ ] , = - . ' ; / `` directly.
/// - does NOT recognize "Return" (only "Enter") — this is the one real translation gap
///   between `accelerator.ts`'s NAMED map (`Enter: "Return"`) and Tauri's parser.
///
/// We translate by splitting on `+` and mapping each token independently, rather than
/// chained `String::replace` calls, specifically to avoid a substring-replace ordering bug:
/// `"CommandOrControl".replace("Command", "Super")` yields `"SuperOrControl"` first, so a
/// later `.replace("CommandOrControl", "CmdOrCtrl")` can never match. Token-based mapping
/// sidesteps that whole class of bug. (In practice `accelerator.ts` never emits
/// "CommandOrControl" on its own — see hotkey.rs investigation notes in the task report —
/// but settings.json is hand-editable, so a stored value could still contain it.)
pub fn to_tauri_shortcut(accelerator: &str) -> String {
    accelerator
        .split('+')
        .map(|token| match token {
            "CommandOrControl" => "CmdOrCtrl",
            "Command" => "Super",
            "Return" => "Enter",
            other => other,
        })
        .collect::<Vec<_>>()
        .join("+")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;
    use tauri_plugin_global_shortcut::Shortcut;

    #[test]
    fn tauri_parses_the_accelerator_format_this_app_already_stores() {
        for stored in ["Alt+W", "Control+Alt+C", "Command+Shift+K"] {
            assert!(
                Shortcut::from_str(&to_tauri_shortcut(stored)).is_ok(),
                "Tauri rejected {stored:?} (translated: {:?})",
                to_tauri_shortcut(stored)
            );
        }
    }

    #[test]
    fn the_default_is_option_w_on_macos() {
        assert_eq!(default_hotkey("macos"), "Alt+W");
    }

    #[test]
    fn windows_avoids_bare_alt_because_it_triggers_menu_mnemonics() {
        assert_eq!(default_hotkey("windows"), "Control+Alt+C");
    }

    #[test]
    fn candidates_are_preferred_then_current_then_default() {
        assert_eq!(hotkey_candidates("Alt+J", "Alt+K", "macos"), vec!["Alt+J", "Alt+K", "Alt+W"]);
    }

    #[test]
    fn blanks_are_dropped_and_duplicates_collapsed() {
        assert_eq!(hotkey_candidates("", "Alt+W", "macos"), vec!["Alt+W"]);
        assert_eq!(hotkey_candidates("  ", "", "macos"), vec!["Alt+W"]);
    }

    #[test]
    fn the_current_binding_is_kept_as_a_fallback_so_a_failed_change_does_not_lose_it() {
        assert!(hotkey_candidates("Alt+W", "Alt+Q", "macos").contains(&"Alt+Q".to_string()));
    }

    // --- Investigation 1: Command / CommandOrControl replace-ordering bug ---

    #[test]
    fn command_or_control_translates_and_parses_despite_containing_the_word_command() {
        // Regression test for the ordering bug in the naive
        // `.replace("Command", "Super").replace("CommandOrControl", "CmdOrCtrl")` approach:
        // the first replace consumes "Command" inside "CommandOrControl" before the second
        // replace ever gets a chance to match, leaving "SuperOrControl" (unparseable).
        let translated = to_tauri_shortcut("CommandOrControl+K");
        assert_eq!(translated, "CmdOrCtrl+K");
        assert!(
            Shortcut::from_str(&translated).is_ok(),
            "translated {translated:?} was rejected by Tauri's parser"
        );
    }

    #[test]
    fn plain_command_still_translates_to_super() {
        assert_eq!(to_tauri_shortcut("Command+Shift+K"), "Super+Shift+K");
    }

    // --- Investigation 2: full range of accelerator.ts key categories ---

    #[test]
    fn single_letter_keys_parse() {
        for letter in ["A", "W", "Z"] {
            let accel = format!("Alt+{letter}");
            let translated = to_tauri_shortcut(&accel);
            assert!(
                Shortcut::from_str(&translated).is_ok(),
                "letter key {accel:?} (translated {translated:?}) was rejected"
            );
        }
    }

    #[test]
    fn digit_keys_parse() {
        for digit in ["0", "1", "9"] {
            let accel = format!("Control+{digit}");
            let translated = to_tauri_shortcut(&accel);
            assert!(
                Shortcut::from_str(&translated).is_ok(),
                "digit key {accel:?} (translated {translated:?}) was rejected"
            );
        }
    }

    #[test]
    fn function_keys_f1_through_f12_parse() {
        for n in 1..=12 {
            let accel = format!("Control+Alt+F{n}");
            let translated = to_tauri_shortcut(&accel);
            assert!(
                Shortcut::from_str(&translated).is_ok(),
                "function key {accel:?} (translated {translated:?}) was rejected"
            );
        }
    }

    #[test]
    fn named_navigation_and_control_keys_parse() {
        // Everything accelerator.ts's NAMED map produces except "Return", which is
        // covered separately below because it needs translation.
        for key in ["Up", "Down", "Left", "Right", "Escape", "Tab", "Space", "Backspace", "Delete"]
        {
            let accel = format!("Control+Shift+{key}");
            let translated = to_tauri_shortcut(&accel);
            assert!(
                Shortcut::from_str(&translated).is_ok(),
                "named key {accel:?} (translated {translated:?}) was rejected"
            );
        }
    }

    #[test]
    fn return_key_is_translated_to_enter_because_tauri_does_not_recognize_return() {
        // accelerator.ts's NAMED map emits "Return" for the Enter key
        // (`Enter: "Return"`), but global-hotkey's parser only recognizes "Enter".
        let translated = to_tauri_shortcut("Control+Return");
        assert_eq!(translated, "Control+Enter");
        assert!(
            Shortcut::from_str(&translated).is_ok(),
            "translated {translated:?} was rejected by Tauri's parser"
        );
        // And document the gap: the untranslated stored form does NOT parse.
        assert!(Shortcut::from_str("Control+Return").is_err());
    }

    #[test]
    fn single_punctuation_characters_parse() {
        // Base (non-shifted) punctuation characters a keydown event can report, per
        // accelerator.ts's `k.length === 1` fallback branch.
        for punct in ['`', '\\', '[', ']', ',', '=', '-', '.', '\'', ';', '/'] {
            let accel = format!("Alt+{punct}");
            let translated = to_tauri_shortcut(&accel);
            assert!(
                Shortcut::from_str(&translated).is_ok(),
                "punctuation key {accel:?} (translated {translated:?}) was rejected"
            );
        }
    }
}
