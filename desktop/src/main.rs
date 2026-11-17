#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
//! [INPUT]: 依赖 Tauri、原生文件选择器、签名资源与更新插件。
//! [OUTPUT]: 注册应用窗口、备份、资源和程序更新命令。
//! [POS]: 桌面进程入口；个人记录内容仍由前端 IndexedDB 保存。
//! [PROTOCOL]: Update this header on change, then check AGENTS.md

mod backup;
mod resources;
mod updates;

use backup::BackupLock;
use serde::Serialize;
use std::sync::Arc;
use tauri::Manager;
type Result<T> = std::result::Result<T, String>;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopInfo {
    version: String,
    backup_directory: String,
    update_configured: bool,
}

#[tauri::command]
fn desktop_info(app: tauri::AppHandle) -> Result<DesktopInfo> {
    let configured = app
        .config()
        .plugins
        .0
        .get("updater")
        .and_then(|v| v.get("endpoints"))
        .and_then(|v| v.as_array())
        .is_some_and(|v| !v.is_empty());
    Ok(DesktopInfo {
        version: app.package_info().version.to_string(),
        backup_directory: backup::directory(&app)?.to_string_lossy().into_owned(),
        update_configured: configured,
    })
}

#[tauri::command]
fn restart_desktop(app: tauri::AppHandle) {
    app.restart();
}

fn main() {
    let resources = resources::ResourceManager::new();
    let mut context = tauri::generate_context!();
    let inner = context.set_assets(Box::new(resources::EmptyAssets));
    context.set_assets(Box::new(resources::ResourceAssets {
        inner,
        manager: resources.clone(),
    }));
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(BackupLock::default())
        .manage(resources)
        .manage(Arc::new(updates::Updates::default()))
        .invoke_handler(tauri::generate_handler![
            backup::save_backup,
            backup::pick_backup,
            backup::write_local_backup,
            backup::list_local_backups,
            backup::read_local_backup,
            backup::open_backup_directory,
            desktop_info,
            restart_desktop,
            resources::commands::resources_status,
            resources::commands::resources_check,
            resources::commands::resources_download,
            resources::commands::resources_cancel,
            resources::commands::resources_import,
            resources::commands::resources_confirm,
            resources::commands::resources_rollback,
            resources::commands::resources_prepare_update,
            updates::desktop_update_status,
            updates::desktop_update_check,
            updates::desktop_update_defer,
            updates::desktop_update_install
        ])
        .setup(|app| {
            if app.config().plugins.0.contains_key("updater") {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            app.state::<Arc<updates::Updates>>()
                .configure(app.handle())
                .map_err(std::io::Error::other)?;
            tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .on_navigation(|url| {
                    url.scheme() == "tauri"
                        || (url.scheme() == "http" && url.host_str() == Some("tauri.localhost"))
                        || (cfg!(debug_assertions)
                            && url.scheme() == "http"
                            && url.host_str() == Some("127.0.0.1"))
                })
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .build()?;
            Ok(())
        })
        .run(context)
        .expect("无法启动 MappingOut");
}
