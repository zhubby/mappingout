#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::{fs, io::Write, path::{Path, PathBuf}, sync::Mutex, time::{SystemTime, UNIX_EPOCH}};
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

const MAX_BACKUP: u64 = 20_000_000;
const RETAIN: usize = 20;
type Result<T> = std::result::Result<T, String>;

#[derive(Default)]
struct BackupLock(Mutex<()>);

fn err(e: impl std::fmt::Display) -> String { e.to_string() }

fn validate_content(content: &str) -> Result<()> {
    if content.len() as u64 > MAX_BACKUP { return Err("备份超过 20 MB。".into()); }
    let value: serde_json::Value = serde_json::from_str(content).map_err(err)?;
    if value["format"] != "mappingout-backup" || value["version"] != 2 || !value["data"].is_object() {
        return Err("备份格式无效。".into());
    }
    Ok(())
}

fn directory(app: &tauri::AppHandle) -> Result<PathBuf> {
    let path = app.path().app_data_dir().map_err(err)?.join("backups");
    fs::create_dir_all(&path).map_err(err)?;
    Ok(path)
}

// Temp file and final file share a filesystem; persist replaces the destination atomically.
fn atomic_write(path: &Path, content: &str) -> Result<()> {
    let parent = path.parent().ok_or("无效的备份目录。")?;
    let mut file = tempfile::NamedTempFile::new_in(parent).map_err(err)?;
    file.write_all(content.as_bytes()).map_err(err)?;
    file.as_file().sync_all().map_err(err)?;
    file.persist(path).map_err(err)?;
    Ok(())
}

fn read_limited(path: &Path) -> Result<String> {
    if fs::metadata(path).map_err(err)?.len() > MAX_BACKUP { return Err("备份超过 20 MB。".into()); }
    // Limit the actual read as well, in case another process grows the selected file.
    use std::io::Read;
    let mut content = String::new();
    fs::File::open(path).map_err(err)?.take(MAX_BACKUP + 1).read_to_string(&mut content).map_err(err)?;
    if content.len() as u64 > MAX_BACKUP { return Err("备份超过 20 MB。".into()); }
    Ok(content)
}

fn valid_name(name: &str) -> bool {
    (name.starts_with("auto-") || name.starts_with("restore-"))
        && name.ends_with(".json") && name.len() < 100
        && name.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'.')
}

#[derive(Serialize)]
struct LocalBackup { name: String, bytes: u64, modified: u64, kind: String }

fn backups(dir: &Path) -> Result<Vec<LocalBackup>> {
    let mut result = Vec::new();
    for entry in fs::read_dir(dir).map_err(err)? {
        let entry = entry.map_err(err)?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if !valid_name(&name) || !entry.file_type().map_err(err)?.is_file() { continue; }
        let meta = entry.metadata().map_err(err)?;
        let modified = meta.modified().map_err(err)?.duration_since(UNIX_EPOCH).map_err(err)?.as_millis() as u64;
        result.push(LocalBackup { kind: if name.starts_with("auto-") { "auto" } else { "restore" }.into(), name, bytes: meta.len(), modified });
    }
    result.sort_by(|a, b| b.modified.cmp(&a.modified).then_with(|| b.name.cmp(&a.name)));
    Ok(result)
}

#[tauri::command]
async fn save_backup(app: tauri::AppHandle, content: String) -> Result<bool> {
    validate_content(&content)?;
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app.dialog().file().set_title("导出个人数据")
            .add_filter("MappingOut 备份", &["json"]).set_file_name("mappingout-backup.json").blocking_save_file();
        let Some(selected) = selected else { return Ok(false); };
        let mut path = selected.into_path().map_err(err)?;
        if path.extension().and_then(|s| s.to_str()) != Some("json") { path.set_extension("json"); }
        atomic_write(&path, &content)?;
        Ok(true)
    }).await.map_err(err)?
}

#[tauri::command]
async fn pick_backup(app: tauri::AppHandle) -> Result<Option<String>> {
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app.dialog().file().set_title("从备份恢复")
            .add_filter("MappingOut 备份", &["json"]).blocking_pick_file();
        selected.map(|p| read_limited(&p.into_path().map_err(err)?)).transpose()
    }).await.map_err(err)?
}

#[tauri::command]
fn write_local_backup(app: tauri::AppHandle, lock: State<BackupLock>, content: String, kind: String) -> Result<()> {
    if kind != "auto" && kind != "restore" { return Err("无效的备份类型。".into()); }
    validate_content(&content)?;
    let _guard = lock.0.lock().map_err(err)?;
    let dir = directory(&app)?;
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map_err(err)?.as_nanos();
    let path = dir.join(format!("{kind}-{stamp}.json"));
    atomic_write(&path, &content)?;
    for item in backups(&dir)?.into_iter().filter(|item| item.kind == kind).skip(RETAIN) {
        fs::remove_file(dir.join(item.name)).map_err(err)?;
    }
    Ok(())
}

#[tauri::command]
fn list_local_backups(app: tauri::AppHandle, lock: State<BackupLock>) -> Result<Vec<LocalBackup>> {
    let _guard = lock.0.lock().map_err(err)?;
    backups(&directory(&app)?)
}

#[tauri::command]
fn read_local_backup(app: tauri::AppHandle, lock: State<BackupLock>, name: String) -> Result<String> {
    if !valid_name(&name) { return Err("无效的备份文件名。".into()); }
    let _guard = lock.0.lock().map_err(err)?;
    let path = directory(&app)?.join(name);
    if fs::symlink_metadata(&path).map_err(err)?.file_type().is_symlink() { return Err("不能读取备份链接。".into()); }
    read_limited(&path)
}

#[tauri::command]
fn open_backup_directory(app: tauri::AppHandle) -> Result<()> {
    app.opener().open_path(directory(&app)?.to_string_lossy().into_owned(), None::<&str>).map_err(err)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopInfo { version: String, backup_directory: String, update_configured: bool }

#[tauri::command]
fn desktop_info(app: tauri::AppHandle) -> Result<DesktopInfo> {
    let configured = app.config().plugins.0.get("updater")
        .and_then(|v| v.get("endpoints")).and_then(|v| v.as_array()).is_some_and(|v| !v.is_empty());
    Ok(DesktopInfo {
        version: app.package_info().version.to_string(),
        backup_directory: directory(&app)?.to_string_lossy().into_owned(),
        update_configured: configured,
    })
}

#[tauri::command]
fn restart_desktop(app: tauri::AppHandle) { app.restart(); }

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize(); let _ = window.show(); let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(BackupLock::default())
        .invoke_handler(tauri::generate_handler![save_backup, pick_backup, write_local_backup,
            list_local_backups, read_local_backup, open_backup_directory, desktop_info, restart_desktop])
        .setup(|app| {
            if app.config().plugins.0.contains_key("updater") {
                app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .on_navigation(|url| {
                    url.scheme() == "tauri"
                        || (url.scheme() == "http" && url.host_str() == Some("tauri.localhost"))
                        || (cfg!(debug_assertions) && url.scheme() == "http" && url.host_str() == Some("127.0.0.1"))
                })
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("无法启动 MappingOut");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn backup_paths_and_atomic_replacement() {
        for bad in ["../auto-1.json", "auto-../file.json", "restore-1.json/other", "other.json"] {
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
        assert!(validate_content("{}").is_err());
        assert!(validate_content(&"x".repeat(MAX_BACKUP as usize + 1)).is_err());
        assert!(validate_content(r#"{"format":"mappingout-backup","version":2,"data":{}}"#).is_ok());
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("large.json");
        let file = fs::File::create(&path).unwrap();
        file.set_len(MAX_BACKUP + 1).unwrap();
        assert!(read_limited(&path).is_err());
    }
}
