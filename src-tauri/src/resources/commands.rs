//! [INPUT]: 依赖 ResourceManager 与 Tauri 状态、文件选择器。
//! [OUTPUT]: 导出资源状态、准备、导入、取消与重启前兼容命令。
//! [POS]: 本地界面到资源模块的命令边界。
//! [PROTOCOL]: Update this header on change, then check AGENTS.md
use super::{
    compatible, err, verified, write_atomic, Manifest, ResourceManager, Result, Status, VERSION,
};
use std::sync::{atomic::Ordering, Arc};
use tauri::State;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub fn resources_status(manager: State<'_, Arc<ResourceManager>>) -> Status {
    manager.status.lock().unwrap().clone()
}
#[tauri::command]
pub fn resources_cancel(manager: State<'_, Arc<ResourceManager>>) {
    manager.cancel.store(true, Ordering::Relaxed);
}
#[tauri::command]
pub async fn resources_check(
    app: tauri::AppHandle,
    manager: State<'_, Arc<ResourceManager>>,
    force: bool,
    target: Option<String>,
) -> Result<Status> {
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        manager.finish(manager.check(Some(&app), force, target.as_deref().unwrap_or(VERSION)))?;
        Ok(manager.status.lock().unwrap().clone())
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub async fn resources_download(
    app: tauri::AppHandle,
    manager: State<'_, Arc<ResourceManager>>,
    repair: Option<bool>,
) -> Result<Status> {
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = (|| {
            let active = manager.session.read().unwrap().clone();
            let available = manager
                .available
                .lock()
                .unwrap()
                .clone()
                .filter(|m| compatible(m, VERSION));
            let m = if let Some(m) = if repair == Some(true) {
                active.or(available)
            } else {
                available.or(active)
            } {
                m
            } else {
                let e = manager
                    .bootstrap
                    .lock()
                    .unwrap()
                    .clone()
                    .ok_or("resources.no-bootstrap")?;
                let m: Manifest = verified(&e, &manager.config)?;
                write_atomic(&manager.manifest_path(&m.generation)?, &e)?;
                m
            };
            manager.install(Some(&app), m, None)?;
            Ok(manager.status.lock().unwrap().clone())
        })();
        manager.finish(result)
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub async fn resources_import(
    app: tauri::AppHandle,
    manager: State<'_, Arc<ResourceManager>>,
    locale: Option<String>,
) -> Result<Status> {
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = (|| {
            let file = app
                .dialog()
                .file()
                .set_title(if locale.as_deref() == Some("en") {
                    "Import offline resources"
                } else {
                    "导入离线资源"
                })
                .add_filter("MappingOut resources", &["json"])
                .blocking_pick_file();
            if let Some(file) = file {
                manager.import_file(Some(&app), &file.into_path().map_err(err)?)?;
            }
            Ok(manager.status.lock().unwrap().clone())
        })();
        manager.finish(result)
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub fn resources_confirm(manager: State<'_, Arc<ResourceManager>>) -> Result<()> {
    manager.confirm()
}
#[tauri::command]
pub async fn resources_rollback(manager: State<'_, Arc<ResourceManager>>) -> Result<bool> {
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || manager.fallback())
        .await
        .map_err(err)?
}
#[tauri::command]
pub async fn resources_prepare_update(
    app: tauri::AppHandle,
    manager: State<'_, Arc<ResourceManager>>,
    version: String,
) -> Result<()> {
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = manager.prepare_update(Some(&app), &version).map(|_| ());
        manager.finish(result)
    })
    .await
    .map_err(err)?
}
