//! [INPUT]: 依赖 Tauri Updater、程序缓存与兼容资源。
//! [OUTPUT]: 提供签名程序更新与延期安装生命周期。
//! [POS]: 桌面程序更新边界；前端不能提供任意安装路径。
//! [PROTOCOL]: Update this header on change, then check AGENTS.md
mod cache;
#[cfg(test)]
mod tests;

use crate::resources::ResourceManager;
use cache::{Cache, Choice, Pending};
use serde::Serialize;
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

type Result<T> = std::result::Result<T, String>;
const CHECK_TIMEOUT: Duration = Duration::from_secs(20);
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(600);

#[derive(Debug, Default, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Phase {
    #[default]
    Idle,
    Checking,
    Downloading,
    Preparing,
    Ready,
    Deferred,
    Installing,
    Error,
}

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Status {
    enabled: bool,
    phase: Phase,
    current_version: String,
    version: Option<String>,
    notes: Option<String>,
    downloaded: u64,
    total: Option<u64>,
    error: Option<String>,
    startup_install: bool,
}

#[derive(Debug, Default)]
pub(crate) struct Updates {
    status: Mutex<Status>,
    busy: AtomicBool,
    bootstrapped: AtomicBool,
}
struct Operation<'a>(&'a AtomicBool);
impl Drop for Operation<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
fn err(error: impl std::fmt::Display) -> String {
    format!("updates.failed:{error}")
}
fn cache(app: &tauri::AppHandle) -> Result<Cache> {
    Cache::new(
        app.path()
            .app_local_data_dir()
            .map_err(err)?
            .join("updates-v1"),
    )
}

impl Updates {
    /// 仅签名生产构建启用程序更新；开发构建不访问正式更新缓存。
    pub(crate) fn configure(&self, app: &tauri::AppHandle) -> Result<()> {
        let configured = app
            .config()
            .plugins
            .0
            .get("updater")
            .and_then(|value| value.get("endpoints"))
            .and_then(|value| value.as_array())
            .is_some_and(|endpoints| !endpoints.is_empty());
        let mut status = self.status.lock().map_err(err)?;
        status.enabled = configured && !cfg!(debug_assertions);
        status.current_version = app.package_info().version.to_string();
        Ok(())
    }
    fn operation(&self) -> Result<Operation<'_>> {
        self.busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| "updates.busy")?;
        Ok(Operation(&self.busy))
    }
    fn snapshot(&self) -> Result<Status> {
        Ok(self.status.lock().map_err(err)?.clone())
    }
    fn publish(&self, app: &tauri::AppHandle, change: impl FnOnce(&mut Status)) -> Result<Status> {
        let status = {
            let mut status = self.status.lock().map_err(err)?;
            change(&mut status);
            status.clone()
        };
        let _ = app.emit("desktop-update-progress", &status);
        Ok(status)
    }
    fn finish<T>(&self, app: &tauri::AppHandle, result: Result<T>) -> Result<T> {
        if let Err(error) = &result {
            let _ = self.publish(app, |status| {
                status.phase = Phase::Error;
                status.error = Some(error.clone());
                status.startup_install = false;
            });
        }
        result
    }
    fn restored(
        app: &tauri::AppHandle,
        cache: &Cache,
    ) -> Result<Option<(Pending, Update, Vec<u8>)>> {
        let Some((pending, bytes)) = cache.load()? else {
            return Ok(None);
        };
        let update = app
            .updater_builder()
            .timeout(CHECK_TIMEOUT)
            .build()
            .map_err(err)?
            .restore_update(pending.raw_json.clone())
            .map_err(err)?;
        let Some(update) = update else {
            // 新进程已达到目标版本；先删除安装意图，避免重复安装。
            cache.clear()?;
            app.state::<Arc<ResourceManager>>().release_update()?;
            return Ok(None);
        };
        update
            .verify(&bytes)
            .map_err(|error| format!("updates.signature:{error}"))?;
        Ok(Some((pending, update, bytes)))
    }
    fn bootstrap(&self, app: &tauri::AppHandle) -> Result<Status> {
        if !self.snapshot()?.enabled || self.bootstrapped.load(Ordering::Acquire) {
            return self.snapshot();
        }
        let _operation = self.operation()?;
        if self.bootstrapped.swap(true, Ordering::AcqRel) {
            return self.snapshot();
        }
        let result = (|| {
            let Some((pending, update, bytes)) = Self::restored(app, &cache(app)?)? else {
                return self.snapshot();
            };
            self.publish(app, |status| {
                status.version = Some(update.version);
                status.notes = update.body;
                status.downloaded = bytes.len() as u64;
                status.total = Some(bytes.len() as u64);
                status.phase = match pending.choice {
                    Choice::Installing | Choice::Failed => Phase::Error,
                    Choice::Deferred if pending.resource_generation.is_some() => Phase::Deferred,
                    Choice::Prompt if pending.resource_generation.is_some() => Phase::Ready,
                    _ => Phase::Idle,
                };
                status.startup_install = matches!(status.phase, Phase::Deferred);
                status.error =
                    matches!(status.phase, Phase::Error).then(|| "updates.interrupted".into());
            })
        })();
        self.finish(app, result).or_else(|_| self.snapshot())
    }
    fn prepare(app: &tauri::AppHandle, version: &str) -> Result<String> {
        let resources = app.state::<Arc<ResourceManager>>();
        let deadline = Instant::now() + DOWNLOAD_TIMEOUT;
        loop {
            match resources.prepare_update(Some(app), version) {
                Err(error) if error == "resources.busy" && Instant::now() < deadline => {
                    // 资源后台检查或用户导入完成后再准备；不抢占资源操作。
                    std::thread::sleep(Duration::from_millis(100));
                }
                result => return result,
            }
        }
    }
    async fn check(&self, app: &tauri::AppHandle) -> Result<Status> {
        if !self.snapshot()?.enabled {
            return self.snapshot();
        }
        let _operation = self.operation()?;
        let result = self.check_inner(app).await;
        self.finish(app, result)
    }
    async fn check_inner(&self, app: &tauri::AppHandle) -> Result<Status> {
        self.publish(app, |status| {
            status.phase = Phase::Checking;
            status.error = None;
            status.startup_install = false;
        })?;
        let storage = cache(app)?;
        let saved = {
            let app = app.clone();
            let storage = storage.clone();
            tauri::async_runtime::spawn_blocking(move || -> Result<_> {
                match Self::restored(&app, &storage) {
                    Ok(saved) => Ok(saved),
                    Err(_) => {
                        storage.clear()?;
                        Ok(None)
                    }
                }
            })
            .await
            .map_err(err)??
        };
        let (mut pending, update, bytes) = if let Some(saved) = saved {
            saved
        } else {
            let update = app
                .updater_builder()
                .timeout(CHECK_TIMEOUT)
                .build()
                .map_err(err)?
                .check()
                .await
                .map_err(err)?;
            let Some(mut update) = update else {
                return self.publish(app, |status| {
                    status.phase = Phase::Idle;
                    status.version = None;
                    status.notes = None;
                    status.downloaded = 0;
                    status.total = None;
                });
            };
            update.timeout = Some(DOWNLOAD_TIMEOUT);
            self.publish(app, |status| {
                status.phase = Phase::Downloading;
                status.version = Some(update.version.clone());
                status.notes = update.body.clone();
                status.downloaded = 0;
                status.total = None;
            })?;
            let bytes = update
                .download(
                    |chunk, total| {
                        let _ = self.publish(app, |status| {
                            status.downloaded = status.downloaded.saturating_add(chunk as u64);
                            status.total = total;
                        });
                    },
                    || {},
                )
                .await
                .map_err(err)?;
            // 缓存恢复强制验证签名中的版本；首次下载也执行相同约束。
            let restored = app
                .updater()
                .map_err(err)?
                .restore_update(update.raw_json.clone())
                .map_err(err)?
                .ok_or("updates.no-update")?;
            restored
                .verify(&bytes)
                .map_err(|error| format!("updates.signature:{error}"))?;
            let pending = {
                let storage = storage.clone();
                let raw_json = update.raw_json.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    let pending = storage.stage(raw_json, &bytes)?;
                    Ok::<_, String>((pending, bytes))
                })
                .await
                .map_err(err)??
            };
            (pending.0, update, pending.1)
        };
        self.publish(app, |status| {
            status.phase = Phase::Preparing;
            status.version = Some(update.version.clone());
            status.notes = update.body.clone();
            status.downloaded = bytes.len() as u64;
            status.total = Some(bytes.len() as u64);
        })?;
        let generation = {
            let app = app.clone();
            let version = update.version.clone();
            tauri::async_runtime::spawn_blocking(move || Self::prepare(&app, &version))
                .await
                .map_err(err)??
        };
        pending.resource_generation = Some(generation);
        pending.choice = Choice::Prompt;
        tauri::async_runtime::spawn_blocking(move || storage.store(&pending))
            .await
            .map_err(err)??;
        self.publish(app, |status| {
            status.phase = Phase::Ready;
        })
    }
    fn defer(&self, app: &tauri::AppHandle) -> Result<Status> {
        if !self.snapshot()?.enabled {
            return self.snapshot();
        }
        let _operation = self.operation()?;
        let result = (|| {
            let storage = cache(app)?;
            let (mut pending, _, _) = Self::restored(app, &storage)?.ok_or("updates.no-update")?;
            if pending.resource_generation.is_none() {
                return Err("updates.not-ready".into());
            }
            pending.choice = Choice::Deferred;
            storage.store(&pending)?;
            self.publish(app, |status| {
                status.phase = Phase::Deferred;
                status.startup_install = false;
            })
        })();
        self.finish(app, result)
    }
    fn install(&self, app: &tauri::AppHandle) -> Result<()> {
        if !self.snapshot()?.enabled {
            return Err("updates.disabled".into());
        }
        let _operation = self.operation()?;
        let result = (|| {
            let storage = cache(app)?;
            let (mut pending, update, bytes) =
                Self::restored(app, &storage)?.ok_or("updates.no-update")?;
            self.publish(app, |status| {
                status.phase = Phase::Preparing;
                status.startup_install = false;
                status.error = None;
            })?;
            pending.resource_generation = Some(Self::prepare(app, &update.version)?);
            pending.choice = Choice::Installing;
            storage.store(&pending)?;
            self.publish(app, |status| {
                status.phase = Phase::Installing;
            })?;
            if let Err(error) = update.restart_after_install(true).install(&bytes) {
                pending.choice = Choice::Failed;
                storage.store(&pending)?;
                return Err(err(error));
            }
            #[cfg(not(windows))]
            app.restart();
            #[cfg(windows)]
            Ok(())
        })();
        self.finish(app, result)
    }
}

#[tauri::command]
pub(crate) async fn desktop_update_status(
    app: tauri::AppHandle,
    updates: State<'_, Arc<Updates>>,
) -> Result<Status> {
    let updates = updates.inner().clone();
    tauri::async_runtime::spawn_blocking(move || updates.bootstrap(&app))
        .await
        .map_err(err)?
}
#[tauri::command]
pub(crate) async fn desktop_update_check(
    app: tauri::AppHandle,
    updates: State<'_, Arc<Updates>>,
) -> Result<Status> {
    let updates = updates.inner().clone();
    updates.check(&app).await
}
#[tauri::command]
pub(crate) async fn desktop_update_defer(
    app: tauri::AppHandle,
    updates: State<'_, Arc<Updates>>,
) -> Result<Status> {
    let updates = updates.inner().clone();
    tauri::async_runtime::spawn_blocking(move || updates.defer(&app))
        .await
        .map_err(err)?
}
#[tauri::command]
pub(crate) async fn desktop_update_install(
    app: tauri::AppHandle,
    updates: State<'_, Arc<Updates>>,
) -> Result<()> {
    let updates = updates.inner().clone();
    tauri::async_runtime::spawn_blocking(move || updates.install(&app))
        .await
        .map_err(err)?
}
