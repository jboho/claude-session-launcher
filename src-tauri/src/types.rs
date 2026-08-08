use serde::{Deserialize, Deserializer, Serialize};

/// Deserialize a string, coercing any other JSON type to "" instead of erroring.
/// presets.json/settings.json are hand-editable and dotfile-synced, so one bad field
/// must not take the whole file down.
fn lenient_string<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    Ok(match value {
        serde_json::Value::String(s) => s,
        _ => String::new(),
    })
}

fn default_terminal() -> String {
    "iTerm".to_string()
}

/// Deserialize the `terminal` field, falling back to the default for any missing,
/// non-string, or blank value. Mirrors normalizeSettings's `withDefault` in
/// src/core/normalize.ts.
fn lenient_terminal<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    Ok(match value {
        serde_json::Value::String(s) if !s.is_empty() => s,
        _ => default_terminal(),
    })
}

/// Deserialize `models`, reproducing normalizeModels in src/core/normalize.ts exactly:
/// a non-array `models` yields [], non-object entries are skipped, entries without a
/// usable (non-empty string) `value` are dropped, and a missing/non-string/blank
/// `label` falls back to `value`. A malformed entry must never fail the whole
/// Settings load.
fn lenient_models<'de, D>(deserializer: D) -> Result<Vec<ModelOption>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    let entries = match value {
        serde_json::Value::Array(a) => a,
        _ => return Ok(Vec::new()),
    };

    let mut out = Vec::new();
    for entry in entries {
        let obj = match entry {
            serde_json::Value::Object(o) => o,
            _ => continue,
        };
        let value = match obj.get("value") {
            Some(serde_json::Value::String(s)) if !s.is_empty() => s.clone(),
            _ => continue,
        };
        let label = match obj.get("label") {
            Some(serde_json::Value::String(s)) if !s.is_empty() => s.clone(),
            _ => value.clone(),
        };
        out.push(ModelOption { value, label });
    }
    Ok(out)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ModelOption {
    #[serde(default, deserialize_with = "lenient_string")]
    pub value: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default = "default_terminal", deserialize_with = "lenient_terminal")]
    pub terminal: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub wd: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub cmd: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub claude_binary: String,
    #[serde(default, deserialize_with = "lenient_models")]
    pub models: Vec<ModelOption>,
    #[serde(default, deserialize_with = "lenient_string")]
    pub hotkey: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            terminal: default_terminal(),
            wd: String::new(),
            cmd: String::new(),
            claude_binary: String::new(),
            models: Vec::new(),
            hotkey: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Preset {
    #[serde(default, deserialize_with = "lenient_string")]
    pub id: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub name: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub model: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub mode: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub effort: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub wd: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub cmd: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LaunchSpec {
    #[serde(default, deserialize_with = "lenient_string")]
    pub model: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub mode: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub effort: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub wd: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub cmd: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn non_string_fields_coerce_to_blank_instead_of_failing_the_load() {
        let s: Settings = serde_json::from_str(r#"{"claudeBinary": 42, "terminal": "Ghostty"}"#).unwrap();
        assert_eq!(s.claude_binary, "");
        assert_eq!(s.terminal, "Ghostty");
    }

    #[test]
    fn missing_fields_take_defaults() {
        let s: Settings = serde_json::from_str("{}").unwrap();
        assert_eq!(s.terminal, "iTerm");
        assert_eq!(s.models.len(), 0);
        assert_eq!(s.hotkey, "");
    }

    #[test]
    fn unknown_keys_are_ignored() {
        let s: Settings = serde_json::from_str(r#"{"evil": "payload", "wd": "~/Code"}"#).unwrap();
        assert_eq!(s.wd, "~/Code");
    }

    #[test]
    fn preset_fields_coerce_the_same_way() {
        let p: Preset = serde_json::from_str(r#"{"name": 42, "model": null, "id": "a"}"#).unwrap();
        assert_eq!(p.name, "");
        assert_eq!(p.model, "");
        assert_eq!(p.id, "a");
    }

    #[test]
    fn model_entries_survive_a_round_trip() {
        let s: Settings = serde_json::from_str(r#"{"models":[{"value":"opus","label":"Opus"}]}"#).unwrap();
        assert_eq!(s.models[0].value, "opus");
        assert_eq!(s.models[0].label, "Opus");
    }

    #[test]
    fn serialized_settings_use_camel_case_claude_binary_key() {
        let json = serde_json::to_string(&Settings::default()).unwrap();
        assert!(
            json.contains("claudeBinary"),
            "expected serialized Settings to contain \"claudeBinary\", got: {json}"
        );
        assert!(!json.contains("claude_binary"));
    }

    // Mirrors src/core/normalize.ts normalizeModels: a bad model entry must not fail
    // the whole Settings load, and entries without a usable `value` are dropped.

    #[test]
    fn non_object_model_entry_does_not_fail_the_load() {
        let s: Settings =
            serde_json::from_str(r#"{"models":[42,{"value":"opus","label":"Opus"}]}"#).unwrap();
        assert_eq!(s.models.len(), 1);
        assert_eq!(s.models[0].value, "opus");
        assert_eq!(s.models[0].label, "Opus");
    }

    #[test]
    fn null_and_string_model_entries_are_skipped() {
        let s: Settings =
            serde_json::from_str(r#"{"models":[null,"not an object",{"value":"sonnet"}]}"#).unwrap();
        assert_eq!(s.models.len(), 1);
        assert_eq!(s.models[0].value, "sonnet");
    }

    #[test]
    fn entry_with_no_value_is_dropped() {
        let s: Settings = serde_json::from_str(r#"{"models":[{"label":"Foo"}]}"#).unwrap();
        assert_eq!(s.models.len(), 0);
    }

    #[test]
    fn entry_with_blank_value_is_dropped() {
        let s: Settings =
            serde_json::from_str(r#"{"models":[{"value":"","label":"Foo"}]}"#).unwrap();
        assert_eq!(s.models.len(), 0);
    }

    #[test]
    fn missing_label_falls_back_to_value() {
        let s: Settings = serde_json::from_str(r#"{"models":[{"value":"sonnet"}]}"#).unwrap();
        assert_eq!(s.models.len(), 1);
        assert_eq!(s.models[0].value, "sonnet");
        assert_eq!(s.models[0].label, "sonnet");
    }

    #[test]
    fn empty_label_falls_back_to_value() {
        // A label present but empty ("") is treated the same as a missing label — it falls
        // back to the value, rather than yielding a blank menu entry. Distinct from
        // missing_label above: this exercises the `String("") if !is_empty()` guard, not the
        // None arm.
        let s: Settings =
            serde_json::from_str(r#"{"models":[{"value":"sonnet","label":""}]}"#).unwrap();
        assert_eq!(s.models.len(), 1);
        assert_eq!(s.models[0].label, "sonnet");
    }

    #[test]
    fn models_that_is_not_an_array_yields_empty_list() {
        let s: Settings = serde_json::from_str(r#"{"models":{"value":"opus"}}"#).unwrap();
        assert_eq!(s.models.len(), 0);
    }

    #[test]
    fn keeps_only_well_formed_model_entries() {
        // Matches src/core/normalize.test.ts "keeps only well-formed model entries".
        let s: Settings = serde_json::from_str(
            r#"{"models":[
                {"value":"opus","label":"Opus"},
                {"value":1,"label":"bad value"},
                {"value":"sonnet"},
                "not an object",
                null
            ]}"#,
        )
        .unwrap();
        assert_eq!(
            s.models,
            vec![
                ModelOption { value: "opus".to_string(), label: "Opus".to_string() },
                ModelOption { value: "sonnet".to_string(), label: "sonnet".to_string() },
            ]
        );
    }

    // Mirrors src/core/normalize.ts normalizeSettings's `withDefault` behavior for terminal.

    #[test]
    fn wrong_typed_terminal_falls_back_to_default() {
        let s: Settings = serde_json::from_str(r#"{"terminal": 42}"#).unwrap();
        assert_eq!(s.terminal, "iTerm");
    }

    #[test]
    fn blank_terminal_falls_back_to_default() {
        let s: Settings = serde_json::from_str(r#"{"terminal": ""}"#).unwrap();
        assert_eq!(s.terminal, "iTerm");
    }
}
