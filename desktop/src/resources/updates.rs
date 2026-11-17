//! [INPUT]: 依赖签名资源清单、完整性检查和资源操作锁。
//! [OUTPUT]: 提供程序更新资源准备与延期资源保留。
//! [POS]: 程序更新到资源会话的边界；优先复用本机资源。
//! [PROTOCOL]: Update this header on change, then check AGENTS.md
use super::{compatible, err, ResourceManager, Result};
use semver::Version;
use std::sync::atomic::Ordering;

impl ResourceManager {
    /// 准备并保留目标程序的资源；完整缓存不发起网络请求。
    pub(crate) fn prepare_update(
        &self,
        app: Option<&tauri::AppHandle>,
        version: &str,
    ) -> Result<String> {
        Version::parse(version).map_err(err)?;
        let _guard = self.operation.try_lock().map_err(|_| "resources.busy")?;
        self.cancel.store(false, Ordering::Relaxed);
        let disk = self.disk.lock().map_err(err)?.clone();
        let local = [disk.update, disk.pending, disk.active, disk.previous]
            .into_iter()
            .flatten()
            .filter_map(|id| self.manifest(&id).ok())
            .find(|m| compatible(m, version) && self.complete(m));
        let manifest = if let Some(manifest) = local {
            manifest
        } else {
            self.check_inner(app, true, version)?;
            let manifest = self
                .available
                .lock()
                .map_err(err)?
                .clone()
                .filter(|m| compatible(m, version))
                .ok_or("resources.incompatible")?;
            self.install_inner(app, manifest.clone(), None)?;
            manifest
        };
        {
            let mut disk = self.disk.lock().map_err(err)?;
            disk.update = Some(manifest.generation.clone());
            if disk.active.as_deref() != Some(&manifest.generation) {
                disk.pending = Some(manifest.generation.clone());
            }
        }
        self.save_disk()?;
        Ok(manifest.generation)
    }

    /// 程序完成升级后释放资源保留；当前会话仍保持引用。
    pub(crate) fn release_update(&self) -> Result<()> {
        let _guard = self.operation.try_lock().map_err(|_| "resources.busy")?;
        self.disk.lock().map_err(err)?.update = None;
        self.save_disk()
    }
}
