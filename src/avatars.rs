use std::{collections::HashMap, sync::LazyLock};

use serde::Deserialize;

use crate::error::{AppError, AppResult};

pub const AVATAR_BASE_PATH: &str = "/gamerpics/xbox-360-dashboard";
const MANIFEST_JSON: &str =
    include_str!("../web/public/gamerpics/xbox-360-dashboard/manifest.json");

#[derive(Debug, Clone)]
pub struct AvatarManifest {
    filenames_by_key: HashMap<String, String>,
}

impl AvatarManifest {
    pub fn contains(&self, key: &str) -> bool {
        self.filenames_by_key.contains_key(key)
    }

    pub fn filename_for(&self, key: &str) -> Option<&str> {
        self.filenames_by_key.get(key).map(String::as_str)
    }
}

#[derive(Debug, Deserialize)]
struct RawAvatarManifest {
    entries: Vec<RawAvatarEntry>,
}

#[derive(Debug, Deserialize)]
struct RawAvatarEntry {
    key: String,
    filename: String,
}

static AVATAR_MANIFEST: LazyLock<AvatarManifest> = LazyLock::new(|| {
    load_avatar_manifest_from_str(MANIFEST_JSON).expect("avatar manifest must be valid")
});

pub fn avatar_url_for_key(avatar_key: Option<&str>) -> Option<String> {
    let key = avatar_key?.trim();
    AVATAR_MANIFEST
        .filename_for(key)
        .map(|filename| format!("{AVATAR_BASE_PATH}/{filename}"))
}

pub fn validate_avatar_key(avatar_key: Option<&str>) -> AppResult<()> {
    let Some(avatar_key) = avatar_key else {
        return Ok(());
    };

    let avatar_key = avatar_key.trim();
    if avatar_key.is_empty() {
        return Err(AppError::bad_request("avatar key cannot be empty"));
    }

    if !AVATAR_MANIFEST.contains(avatar_key) {
        return Err(AppError::bad_request("unknown avatar key"));
    }

    Ok(())
}

pub fn load_avatar_manifest_from_str(contents: &str) -> AppResult<AvatarManifest> {
    let raw: RawAvatarManifest = serde_json::from_str(contents).map_err(|error| {
        tracing::error!(?error, "failed to parse avatar manifest");
        AppError::internal("failed to parse avatar manifest")
    })?;

    let mut filenames_by_key = HashMap::new();
    for entry in raw.entries {
        let key = entry.key.trim();
        let filename = entry.filename.trim();
        if key.is_empty() || filename.is_empty() {
            return Err(AppError::internal(
                "avatar manifest contained an empty key or filename",
            ));
        }

        filenames_by_key.insert(key.to_string(), filename.to_string());
    }

    if filenames_by_key.is_empty() {
        return Err(AppError::internal(
            "avatar manifest did not contain any keys",
        ));
    }

    Ok(AvatarManifest { filenames_by_key })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derives_avatar_url_from_key() {
        assert_eq!(
            avatar_url_for_key(Some("2000b")),
            Some("/gamerpics/xbox-360-dashboard/2000b.png".to_string())
        );
        assert_eq!(avatar_url_for_key(None), None);
    }

    #[test]
    fn parses_avatar_manifest_entries() {
        let manifest = load_avatar_manifest_from_str(
            r#"{"entries":[{"key":"alpha","filename":"alpha.png"},{"key":"beta","filename":"beta.png"}]}"#,
        )
        .unwrap();
        assert!(manifest.contains("alpha"));
        assert_eq!(manifest.filename_for("beta"), Some("beta.png"));
    }

    #[test]
    fn bundled_manifest_has_expected_keys() {
        assert!(AVATAR_MANIFEST.contains("2000b"));
        assert!(AVATAR_MANIFEST.contains("21069"));
        assert!(!AVATAR_MANIFEST.contains("8000"));
    }
}
