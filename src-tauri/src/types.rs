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
    #[serde(default = "default_terminal", deserialize_with = "lenient_string")]
    pub terminal: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub wd: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub cmd: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub claude_binary: String,
    #[serde(default)]
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
}
