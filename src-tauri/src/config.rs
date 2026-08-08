use crate::types::{Preset, Settings};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Env is passed in rather than read, so path resolution is testable.
pub type Env = HashMap<String, String>;

pub fn current_env() -> Env {
    std::env::vars().collect()
}

pub fn home_dir() -> String {
    std::env::var("HOME").unwrap_or_else(|_| "/".to_string())
}

/// Mirrors Node's `path.dirname`: an empty parent (bare filename, no directory
/// component) becomes ".", never "". `Path::parent()` returns `Some("")` for a bare
/// filename rather than `None` — treating that as a literal empty path is a footgun
/// the moment it's joined, displayed, or handed to another API (e.g. create_dir_all,
/// "reveal in Finder"), so it's normalized here at the source.
fn dirname(path: &Path) -> PathBuf {
    match path.parent() {
        Some(p) if !p.as_os_str().is_empty() => p.to_path_buf(),
        _ => PathBuf::from("."),
    }
}

pub fn config_dir(env: &Env, home: &str) -> PathBuf {
    if let Some(explicit) = env.get("CLAUDE_LAUNCHER_CONFIG") {
        return dirname(Path::new(explicit));
    }
    match env.get("XDG_CONFIG_HOME") {
        Some(xdg) => Path::new(xdg).join("claude-launcher"),
        None => Path::new(home).join(".config").join("claude-launcher"),
    }
}

pub fn presets_path(env: &Env, home: &str) -> PathBuf {
    match env.get("CLAUDE_LAUNCHER_CONFIG") {
        Some(explicit) => PathBuf::from(explicit),
        None => config_dir(env, home).join("presets.json"),
    }
}

pub fn settings_path(env: &Env, home: &str) -> PathBuf {
    config_dir(env, home).join("settings.json")
}

/// Write-then-rename so a crash mid-save cannot truncate the real file. Shared by
/// save_presets and save_settings so both configs get the same durability guarantee —
/// previously only presets were saved atomically.
fn atomic_write(path: &Path, contents: &str) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        if !dir.as_os_str().is_empty() {
            std::fs::create_dir_all(dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
        }
    }
    let tmp = tmp_path_for(path);
    std::fs::write(&tmp, contents).map_err(|e| format!("Could not write {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, path).map_err(|e| format!("Could not replace {}: {e}", path.display()))
}

/// Appends ".tmp" to the whole path, matching the TS implementation's `${file}.tmp`
/// exactly. `Path::with_extension` REPLACES the extension rather than appending to the
/// full name, which is fine for "presets.json" (-> "presets.json.tmp") by coincidence
/// but produces "config.json.tmp" instead of "config.tmp" for an extensionless
/// override path — this sidesteps that ambiguity entirely.
fn tmp_path_for(path: &Path) -> PathBuf {
    let mut s = path.as_os_str().to_os_string();
    s.push(".tmp");
    PathBuf::from(s)
}

pub fn load_presets(file: &Path) -> Result<Vec<Preset>, String> {
    let raw = match std::fs::read_to_string(file) {
        Ok(r) => r,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(format!("Could not read {}: {e}", file.display())),
    };
    let parsed: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| format!("Presets file {} is not valid JSON: {e}", file.display()))?;
    let items = parsed.as_array()
        .ok_or_else(|| format!("Presets file {} must be a JSON array of presets.", file.display()))?;

    Ok(items.iter().filter_map(|raw| {
        // A malformed non-object element (e.g. `42`) would otherwise deserialize-fail
        // and fall through to Preset::default() via unwrap_or_default(), silently
        // inserting a phantom blank preset with a freshly minted UUID. Skip it instead.
        if !raw.is_object() {
            return None;
        }
        let mut p: Preset = serde_json::from_value(raw.clone()).unwrap_or_default();
        if p.id.is_empty() { p.id = uuid::Uuid::new_v4().to_string(); }
        Some(p)
    }).collect())
}

pub fn save_presets(presets: &[Preset], file: &Path) -> Result<(), String> {
    let json = serde_json::to_string_pretty(presets).map_err(|e| e.to_string())?;
    atomic_write(file, &json)
}

/// The presets a fresh install starts with (was `STARTER_PRESETS` in the old TS core, seeded
/// by the now-removed Electron `seed.ts`). ids are minted here at seed time.
pub fn starter_presets() -> Vec<Preset> {
    fn preset(name: &str, model: &str, mode: &str, effort: &str) -> Preset {
        Preset {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.into(),
            model: model.into(),
            mode: mode.into(),
            effort: effort.into(),
            ..Default::default()
        }
    }
    vec![
        preset("Plan", "opus", "plan", ""),
        preset("Build", "opus", "acceptEdits", "high"),
        preset("Autopilot", "opus", "auto", "high"),
        preset("Quick", "haiku", "", ""),
        preset("Explore", "sonnet", "plan", ""),
    ]
}

/// First-run seeding: when the presets file does not yet exist, write the starter set and
/// return it (mirrors the old Electron seed's "seed when no presets file exists"). An
/// existing file — even an empty `[]` the user deliberately cleared — is respected and
/// never re-seeded.
pub fn load_or_seed_presets(file: &Path) -> Result<Vec<Preset>, String> {
    if file.exists() {
        return load_presets(file);
    }
    let seeded = starter_presets();
    save_presets(&seeded, file)?;
    Ok(seeded)
}

pub fn load_settings(file: &Path) -> Result<Settings, String> {
    let raw = match std::fs::read_to_string(file) {
        Ok(r) => r,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Settings::default()),
        Err(e) => return Err(format!("Could not read {}: {e}", file.display())),
    };
    serde_json::from_str(&raw).map_err(|e| format!("Settings file {} is not valid JSON: {e}", file.display()))
}

pub fn save_settings(settings: &Settings, file: &Path) -> Result<(), String> {
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    atomic_write(file, &json)
}

pub fn directory_exists(dir: &str) -> bool {
    !dir.trim().is_empty() && Path::new(dir).is_dir()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn env(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn defaults_to_xdg_config_under_home() {
        assert_eq!(config_dir(&env(&[]), "/Users/x"), PathBuf::from("/Users/x/.config/claude-launcher"));
    }

    #[test]
    fn xdg_config_home_wins_over_the_default() {
        assert_eq!(config_dir(&env(&[("XDG_CONFIG_HOME", "/tmp/cfg")]), "/Users/x"), PathBuf::from("/tmp/cfg/claude-launcher"));
    }

    #[test]
    fn the_explicit_override_points_at_the_presets_file_and_its_dir_holds_settings() {
        let e = env(&[("CLAUDE_LAUNCHER_CONFIG", "/tmp/p/presets.json")]);
        assert_eq!(presets_path(&e, "/Users/x"), PathBuf::from("/tmp/p/presets.json"));
        assert_eq!(settings_path(&e, "/Users/x"), PathBuf::from("/tmp/p/settings.json"));
    }

    #[test]
    fn a_missing_presets_file_is_an_empty_list_not_an_error() {
        let dir = tempdir();
        assert!(load_presets(&dir.join("nope.json")).unwrap().is_empty());
    }

    #[test]
    fn presets_round_trip_through_disk() {
        let dir = tempdir();
        let file = dir.join("presets.json");
        let p = Preset { id: "a".into(), name: "Plan".into(), model: "opus".into(),
                         mode: "plan".into(), effort: String::new(), wd: String::new(), cmd: String::new() };
        save_presets(&[p], &file).unwrap();
        let loaded = load_presets(&file).unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].name, "Plan");
    }

    #[test]
    fn an_entry_with_no_id_gets_one_assigned_on_load() {
        let dir = tempdir();
        let file = dir.join("presets.json");
        std::fs::write(&file, r#"[{"name":"X"}]"#).unwrap();
        assert!(!load_presets(&file).unwrap()[0].id.is_empty());
    }

    #[test]
    fn a_presets_file_that_is_not_an_array_is_a_clear_error_not_a_silent_empty_list() {
        let dir = tempdir();
        let file = dir.join("presets.json");
        std::fs::write(&file, r#"{"name":"X"}"#).unwrap();
        let err = load_presets(&file).unwrap_err();
        assert!(err.contains("array"), "error should say what is wrong: {err}");
    }

    #[test]
    fn a_missing_settings_file_yields_the_defaults() {
        let dir = tempdir();
        assert_eq!(load_settings(&dir.join("nope.json")).unwrap().terminal, "iTerm");
    }

    // --- Defect investigations ---

    /// Defect 1: a malformed non-object array element (e.g. `42`) must not become a
    /// phantom blank preset with a freshly minted UUID. TS's normalizePreset actually
    /// *does* produce a blank preset for a non-object element (property access on a
    /// primitive yields `undefined`, which `str()` coerces to ""), but a phantom blank
    /// preset silently appearing in the user's list is bad UX regardless of what TS
    /// happens to do — so we deliberately diverge and skip it instead.
    #[test]
    fn malformed_non_object_entries_are_skipped_not_turned_into_phantom_blank_presets() {
        let dir = tempdir();
        let file = dir.join("presets.json");
        std::fs::write(&file, r#"[42, {"name":"ok"}]"#).unwrap();
        let loaded = load_presets(&file).unwrap();
        assert_eq!(loaded.len(), 1, "expected the malformed entry to be skipped, got: {loaded:?}");
        assert_eq!(loaded[0].name, "ok");
    }

    #[test]
    fn a_string_array_element_is_also_skipped() {
        let dir = tempdir();
        let file = dir.join("presets.json");
        std::fs::write(&file, r#"["a string", {"name":"ok"}]"#).unwrap();
        let loaded = load_presets(&file).unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].name, "ok");
    }

    /// Defect 2: save_settings must be atomic (write-then-rename) like save_presets,
    /// so a crash mid-write cannot truncate the real file. We can't easily inject a
    /// crash, but we can confirm the write goes through a tmp file that is gone by the
    /// time save_settings returns, and that a normal save still round-trips.
    #[test]
    fn save_settings_is_atomic_no_tmp_file_left_behind() {
        let dir = tempdir();
        let file = dir.join("settings.json");
        let mut s = Settings::default();
        s.terminal = "Ghostty".into();
        save_settings(&s, &file).unwrap();
        assert!(file.exists());
        assert!(!dir.join("settings.json.tmp").exists());
        assert_eq!(load_settings(&file).unwrap().terminal, "Ghostty");
    }

    /// Defect 3: `with_extension` REPLACES the extension rather than appending to the
    /// full name. For "presets.json" that happens to produce a sane "presets.json.tmp"
    /// (extension "json" -> "json.tmp"), but for an extensionless override path (e.g.
    /// `CLAUDE_LAUNCHER_CONFIG=/tmp/p/config`) it produces "config.json.tmp" instead of
    /// the expected "config.tmp" — diverging from the TS implementation's plain
    /// `${file}.tmp`. We fix this by appending ".tmp" to the whole path, matching TS
    /// exactly and removing the ambiguity altogether.
    #[test]
    fn the_tmp_file_is_the_full_path_with_tmp_appended_not_a_replaced_extension() {
        assert_eq!(tmp_path_for(Path::new("/tmp/p/presets.json")), PathBuf::from("/tmp/p/presets.json.tmp"));
        assert_eq!(tmp_path_for(Path::new("/tmp/p/config")), PathBuf::from("/tmp/p/config.tmp"));
    }

    #[test]
    fn saving_to_an_extensionless_override_path_round_trips_and_leaves_no_stray_tmp() {
        let dir = tempdir();
        let file = dir.join("config");
        save_presets(&[], &file).unwrap();
        assert!(file.exists());
        assert!(!dir.join("config.json.tmp").exists());
        assert!(!dir.join("config.tmp").exists());
    }

    /// Defect 4: `Path::parent()` on a bare filename (no directory component) returns
    /// `Some("")`, not `None`. An empty-string config dir is a footgun the moment it's
    /// joined, displayed, or handed to another API. Node's `path.dirname` returns "."
    /// for the same input, so we normalize to "." for parity and to kill the footgun.
    #[test]
    fn a_bare_filename_override_resolves_to_the_current_directory_not_an_empty_path() {
        let e = env(&[("CLAUDE_LAUNCHER_CONFIG", "presets.json")]);
        assert_eq!(config_dir(&e, "/Users/x"), PathBuf::from("."));
        assert_eq!(settings_path(&e, "/Users/x"), PathBuf::from("./settings.json"));
    }

    // --- Corrupt files must fail loudly, never silently fall back to defaults ---

    #[test]
    fn a_corrupt_settings_file_is_a_clear_error_not_silent_defaults() {
        let dir = tempdir();
        let file = dir.join("settings.json");
        std::fs::write(&file, "{not valid json").unwrap();
        let err = load_settings(&file).unwrap_err();
        assert!(err.to_lowercase().contains("json"), "error should mention JSON: {err}");
    }

    #[test]
    fn a_corrupt_presets_file_is_a_clear_error_not_silent_defaults() {
        let dir = tempdir();
        let file = dir.join("presets.json");
        std::fs::write(&file, "{not valid json").unwrap();
        let err = load_presets(&file).unwrap_err();
        assert!(err.to_lowercase().contains("json"), "error should mention JSON: {err}");
    }

    #[test]
    fn directory_exists_distinguishes_real_dirs_from_missing_blank_and_files() {
        let dir = tempdir();
        assert!(directory_exists(dir.to_str().unwrap()), "a real directory exists");
        assert!(!directory_exists(dir.join("nope").to_str().unwrap()), "missing path");
        assert!(!directory_exists(""), "blank is not a directory");
        assert!(!directory_exists("   "), "whitespace-only is not a directory");
        let file = dir.join("f.txt");
        std::fs::write(&file, "x").unwrap();
        assert!(!directory_exists(file.to_str().unwrap()), "a file is not a directory");
    }

    /// A unique temp dir without a dev-dependency.
    fn tempdir() -> PathBuf {
        let base = std::env::temp_dir().join(format!(
            "csl-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&base).unwrap();
        base
    }

    #[test]
    fn first_run_seeds_the_starter_presets_and_persists_them() {
        let dir = tempdir();
        let file = dir.join("presets.json");
        assert!(!file.exists());

        let seeded = load_or_seed_presets(&file).unwrap();
        assert_eq!(seeded.len(), 5);
        assert_eq!(seeded[0].name, "Plan");
        assert!(seeded.iter().all(|p| !p.id.is_empty()), "every seeded preset gets an id");
        assert!(file.exists(), "seeding writes the file so it isn't re-seeded next launch");

        // A second call reads the SAME persisted ids back rather than minting a new set.
        let again = load_or_seed_presets(&file).unwrap();
        let ids = |v: &[Preset]| v.iter().map(|p| p.id.clone()).collect::<Vec<_>>();
        assert_eq!(ids(&again), ids(&seeded));
    }

    #[test]
    fn an_existing_empty_presets_file_is_respected_not_reseeded() {
        let dir = tempdir();
        let file = dir.join("presets.json");
        std::fs::write(&file, "[]").unwrap();
        assert!(load_or_seed_presets(&file).unwrap().is_empty());
    }
}
