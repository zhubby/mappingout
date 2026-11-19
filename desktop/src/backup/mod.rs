//! [INPUT]: 依赖 Tauri 路径、文件选择器与原子文件写入。
//! [OUTPUT]: 提供 v1/v2/v3 备份校验、导入导出与本地保留。
//! [POS]: 原生备份边界；入口只注册命令和查询备份目录。
//! [PROTOCOL]: Update this header on change, then check AGENTS.md

use serde::Serialize;
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

const MAX_BACKUP: u64 = 20_000_000;
const RETAIN: usize = 20;
type Result<T> = std::result::Result<T, String>;

#[derive(Default)]
pub(crate) struct BackupLock(Mutex<()>);

fn err(e: impl std::fmt::Display) -> String {
    format!("native.io:{e}")
}

fn validate_content(content: &str) -> Result<()> {
    if content.len() as u64 > MAX_BACKUP {
        return Err("native.backup-too-large".into());
    }
    let value: serde_json::Value = serde_json::from_str(content).map_err(err)?;
    if value["format"] != "mappingout-backup"
        || !matches!(value["version"].as_u64(), Some(1..=3))
        || !value["data"].is_object()
    {
        return Err("native.invalid-backup".into());
    }
    Ok(())
}

pub(crate) fn directory(app: &tauri::AppHandle) -> Result<PathBuf> {
    let path = app.path().app_data_dir().map_err(err)?.join("backups");
    fs::create_dir_all(&path).map_err(err)?;
    Ok(path)
}

// Temp file and final file share a filesystem; persist replaces the destination atomically.
fn atomic_write(path: &Path, content: &str) -> Result<()> {
    let parent = path.parent().ok_or("native.invalid-directory")?;
    let mut file = tempfile::NamedTempFile::new_in(parent).map_err(err)?;
    file.write_all(content.as_bytes()).map_err(err)?;
    file.as_file().sync_all().map_err(err)?;
    file.persist(path).map_err(err)?;
    Ok(())
}

fn read_limited(path: &Path) -> Result<String> {
    if fs::metadata(path).map_err(err)?.len() > MAX_BACKUP {
        return Err("native.backup-too-large".into());
    }
    // Limit the actual read as well, in case another process grows the selected file.
    use std::io::Read;
    let mut content = String::new();
    fs::File::open(path)
        .map_err(err)?
        .take(MAX_BACKUP + 1)
        .read_to_string(&mut content)
        .map_err(err)?;
    if content.len() as u64 > MAX_BACKUP {
        return Err("native.backup-too-large".into());
    }
    Ok(content)
}

fn valid_name(name: &str) -> bool {
    (name.starts_with("auto-") || name.starts_with("restore-"))
        && name.ends_with(".json")
        && name.len() < 100
        && name
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'.')
}

#[derive(Serialize)]
pub(crate) struct LocalBackup {
    name: String,
    bytes: u64,
    modified: u64,
    kind: String,
}

fn backups(dir: &Path) -> Result<Vec<LocalBackup>> {
    let mut result = Vec::new();
    for entry in fs::read_dir(dir).map_err(err)? {
        let entry = entry.map_err(err)?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if !valid_name(&name) || !entry.file_type().map_err(err)?.is_file() {
            continue;
        }
        let meta = entry.metadata().map_err(err)?;
        let modified = meta
            .modified()
            .map_err(err)?
            .duration_since(UNIX_EPOCH)
            .map_err(err)?
            .as_millis() as u64;
        result.push(LocalBackup {
            kind: if name.starts_with("auto-") {
                "auto"
            } else {
                "restore"
            }
            .into(),
            name,
            bytes: meta.len(),
            modified,
        });
    }
    result.sort_by(|a, b| {
        b.modified
            .cmp(&a.modified)
            .then_with(|| b.name.cmp(&a.name))
    });
    Ok(result)
}

#[tauri::command]
pub(crate) async fn save_backup(
    app: tauri::AppHandle,
    content: String,
    locale: Option<String>,
) -> Result<bool> {
    validate_content(&content)?;
    tauri::async_runtime::spawn_blocking(move || {
        let english = locale.as_deref() == Some("en");
        let selected = app
            .dialog()
            .file()
            .set_title(if english {
                "Export personal data"
            } else {
                "匯出個人資料"
            })
            .add_filter(
                if english {
                    "MappingOut backup"
                } else {
                    "MappingOut 備份"
                },
                &["json"],
            )
            .set_file_name("mappingout-backup.json")
            .blocking_save_file();
        let Some(selected) = selected else {
            return Ok(false);
        };
        let mut path = selected.into_path().map_err(err)?;
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            path.set_extension("json");
        }
        atomic_write(&path, &content)?;
        Ok(true)
    })
    .await
    .map_err(err)?
}

#[tauri::command]
pub(crate) async fn pick_backup(
    app: tauri::AppHandle,
    locale: Option<String>,
) -> Result<Option<String>> {
    tauri::async_runtime::spawn_blocking(move || {
        let english = locale.as_deref() == Some("en");
        let selected = app
            .dialog()
            .file()
            .set_title(if english {
                "Restore from backup"
            } else {
                "從備份還原"
            })
            .add_filter(
                if english {
                    "MappingOut backup"
                } else {
                    "MappingOut 備份"
                },
                &["json"],
            )
            .blocking_pick_file();
        selected
            .map(|p| read_limited(&p.into_path().map_err(err)?))
            .transpose()
    })
    .await
    .map_err(err)?
}

#[tauri::command]
pub(crate) fn write_local_backup(
    app: tauri::AppHandle,
    lock: State<BackupLock>,
    content: String,
    kind: String,
) -> Result<()> {
    if kind != "auto" && kind != "restore" {
        return Err("native.invalid-kind".into());
    }
    validate_content(&content)?;
    let _guard = lock.0.lock().map_err(err)?;
    let dir = directory(&app)?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(err)?
        .as_nanos();
    let path = dir.join(format!("{kind}-{stamp}.json"));
    atomic_write(&path, &content)?;
    for item in backups(&dir)?
        .into_iter()
        .filter(|item| item.kind == kind)
        .skip(RETAIN)
    {
        fs::remove_file(dir.join(item.name)).map_err(err)?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn list_local_backups(
    app: tauri::AppHandle,
    lock: State<BackupLock>,
) -> Result<Vec<LocalBackup>> {
    let _guard = lock.0.lock().map_err(err)?;
    backups(&directory(&app)?)
}

#[tauri::command]
pub(crate) fn read_local_backup(
    app: tauri::AppHandle,
    lock: State<BackupLock>,
    name: String,
) -> Result<String> {
    if !valid_name(&name) {
        return Err("native.invalid-name".into());
    }
    let _guard = lock.0.lock().map_err(err)?;
    let path = directory(&app)?.join(name);
    if fs::symlink_metadata(&path)
        .map_err(err)?
        .file_type()
        .is_symlink()
    {
        return Err("native.symlink".into());
    }
    read_limited(&path)
}

#[tauri::command]
pub(crate) fn open_backup_directory(app: tauri::AppHandle) -> Result<()> {
    app.opener()
        .open_path(
            directory(&app)?.to_string_lossy().into_owned(),
            None::<&str>,
        )
        .map_err(err)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn backup_paths_and_atomic_replacement() {
        for bad in [
            "../auto-1.json",
            "auto-../file.json",
            "restore-1.json/other",
            "other.json",
        ] {
            assert!(!valid_name(bad), "{bad}");
        }
        assert!(valid_name("auto-123456.json"));
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("auto-1.json");
        atomic_write(&path, "first").unwrap();
        atomic_write(&path, "second").unwrap();
        assert_eq!(read_limited(&path).unwrap(), "second");
        assert_eq!(backups(dir.path()).unwrap().len(), 1);
    }
    #[test]
    fn rejects_invalid_or_oversized_content() {
        for version in [1, 2, 3] {
            assert!(validate_content(&format!(
                r#"{{"format":"mappingout-backup","version":{},"data":{{}}}}"#,
                version
            ))
            .is_ok());
        }
        assert!(
            validate_content(r#"{"format":"mappingout-backup","version":4,"data":{}}"#).is_err()
        );
        assert!(validate_content("{}").is_err());
        assert!(validate_content(&"x".repeat(MAX_BACKUP as usize + 1)).is_err());
        assert!(
            validate_content(r#"{"format":"mappingout-backup","version":2,"data":{}}"#).is_ok()
        );
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("large.json");
        let file = fs::File::create(&path).unwrap();
        file.set_len(MAX_BACKUP + 1).unwrap();
        assert!(read_limited(&path).is_err());
    }
}
