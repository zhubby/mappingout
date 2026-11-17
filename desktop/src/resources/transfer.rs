//! [INPUT]: 依赖父模块的签名清单、会话和操作锁。
//! [OUTPUT]: 提供频道请求、资源下载、解压与清理。
//! [POS]: 资源传输实现；不替换当前会话。
//! [PROTOCOL]: Update this header on change, then check AGENTS.md
use super::{
    compatible, digest, err, hash, now, read_bounded, safe_path, validate_manifest, verified,
    write_atomic, CachedChannel, Envelope, Manifest, Pack, ResourceManager, Result, MAX_MANIFEST,
    VERSION,
};
use std::{
    collections::{BTreeSet, HashMap},
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::atomic::Ordering,
    time::{Duration, SystemTime},
};

impl ResourceManager {
    pub(super) fn client(&self) -> Result<reqwest::Client> {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(15))
            .read_timeout(Duration::from_secs(20))
            .timeout(Duration::from_secs(600))
            .user_agent(format!("MappingOut/{VERSION}"))
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() > 5 || attempt.url().scheme() != "https" {
                    attempt.error("resource redirect rejected")
                } else {
                    attempt.follow()
                }
            }))
            .build()
            .map_err(err)
    }
    // Called from spawn_blocking. Dropping the future aborts DNS, headers or body
    // reads promptly instead of waiting for the HTTP timeout after cancellation.
    pub(super) fn network<T>(
        &self,
        future: impl std::future::Future<Output = std::result::Result<T, reqwest::Error>>,
    ) -> Result<T> {
        tauri::async_runtime::block_on(async {
            let mut future = std::pin::pin!(future);
            loop {
                if self.cancel.load(Ordering::Relaxed) {
                    return Err("resources.cancelled".into());
                }
                if let Ok(result) =
                    tokio::time::timeout(Duration::from_millis(100), future.as_mut()).await
                {
                    return result.map_err(err);
                }
            }
        })
    }
    pub(super) fn check(
        &self,
        app: Option<&tauri::AppHandle>,
        force: bool,
        target: &str,
    ) -> Result<()> {
        let _guard = self.operation.try_lock().map_err(|_| "resources.busy")?;
        self.cancel.store(false, Ordering::Relaxed);
        self.check_inner(app, force, target)
    }
    pub(super) fn check_inner(
        &self,
        app: Option<&tauri::AppHandle>,
        force: bool,
        target: &str,
    ) -> Result<()> {
        let disk = self.disk.lock().unwrap().clone();
        let cached = self.cached_channel().ok();
        let restored = cached
            .as_ref()
            .is_some_and(|(cache, channel)| self.offer(channel, &cache.envelope, target).is_ok());
        if !force
            && restored
            && self.session.read().unwrap().is_some()
            && now().saturating_sub(disk.last_check) < 86400
        {
            return Ok(());
        }
        self.progress(app, "checking", 0, 0);
        let mut request = self
            .client()?
            .get(&self.config.channel_url)
            .timeout(Duration::from_secs(20));
        // An ETag is usable only alongside the corresponding verified channel.
        // Old state.json files without that cache get an unconditional request.
        if !force {
            if let Some(etag) = cached.as_ref().and_then(|(cache, _)| cache.etag.as_ref()) {
                request = request.header(reqwest::header::IF_NONE_MATCH, etag);
            }
        }
        let mut response = self.network(async { request.send().await })?;
        if response.status() == reqwest::StatusCode::NOT_MODIFIED {
            let (cache, channel) = cached.as_ref().ok_or("resources.manifest")?;
            self.offer(channel, &cache.envelope, target)?;
            self.disk.lock().unwrap().last_check = now();
            self.save_disk()?;
            self.progress(app, "ready", 0, 0);
            return Ok(());
        }
        response.error_for_status_ref().map_err(err)?;
        let etag = response
            .headers()
            .get(reqwest::header::ETAG)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        let mut bytes = Vec::new();
        while let Some(chunk) = self.network(response.chunk())? {
            bytes.extend_from_slice(&chunk);
            if bytes.len() as u64 > MAX_MANIFEST * 2 {
                return Err("resources.too-large".into());
            }
        }
        let envelope: Envelope = serde_json::from_slice(&bytes).map_err(err)?;
        let channel = self.channel(&envelope)?;
        self.offer(&channel, &envelope, target)?;
        write_atomic(
            &self.root()?.join("channel.json"),
            &CachedChannel { envelope, etag },
        )?;
        self.progress(app, "ready", 0, 0);
        self.disk.lock().unwrap().last_check = now();
        self.save_disk()
    }
    pub(super) fn download_pack(
        &self,
        app: Option<&tauri::AppHandle>,
        p: &Pack,
    ) -> Result<PathBuf> {
        let target = self
            .root()?
            .join("downloads")
            .join(format!("{}.zip", p.sha256));
        let part = target.with_extension("part");
        if target.exists() {
            if fs::metadata(&target).map_err(err)?.len() == p.bytes
                && hash(&read_bounded(&target, p.bytes)?) == p.sha256
            {
                return Ok(target);
            }
            fs::remove_file(&target).map_err(err)?;
        }
        let mut offset = fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
        if offset >= p.bytes {
            fs::remove_file(&part).map_err(err)?;
            offset = 0;
        }
        let mut request = self.client()?.get(&p.url);
        if offset > 0 {
            request = request.header(reqwest::header::RANGE, format!("bytes={offset}-"))
        }
        let mut response = self.network(async { request.send().await })?;
        response.error_for_status_ref().map_err(err)?;
        if offset > 0 && response.status() != reqwest::StatusCode::PARTIAL_CONTENT {
            offset = 0;
        }
        if response.status() == reqwest::StatusCode::PARTIAL_CONTENT
            && !response
                .headers()
                .get(reqwest::header::CONTENT_RANGE)
                .and_then(|v| v.to_str().ok())
                .is_some_and(|v| {
                    v.starts_with(&format!("bytes {offset}-"))
                        && v.ends_with(&format!("/{}", p.bytes))
                })
        {
            return Err("resources.range".into());
        }
        let mut output = fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(offset == 0)
            .append(offset > 0)
            .open(&part)
            .map_err(err)?;
        let mut completed = offset;
        let mut last = std::time::Instant::now();
        while let Some(chunk) = self.network(response.chunk())? {
            completed += chunk.len() as u64;
            if completed > p.bytes {
                drop(output);
                fs::remove_file(&part).map_err(err)?;
                return Err("resources.too-large".into());
            }
            output.write_all(&chunk).map_err(err)?;
            if last.elapsed() > Duration::from_millis(100) {
                self.progress(app, "downloading", completed, p.bytes);
                last = std::time::Instant::now();
            }
        }
        output.sync_all().map_err(err)?;
        drop(output);
        if completed != p.bytes {
            return Err("resources.incomplete".into());
        }
        if hash(&read_bounded(&part, p.bytes)?) != p.sha256 {
            fs::remove_file(&part).map_err(err)?;
            return Err("resources.integrity".into());
        }
        fs::rename(&part, &target).map_err(err)?;
        Ok(target)
    }
    pub(super) fn extract(&self, archive: &Path, p: &Pack) -> Result<()> {
        if fs::metadata(archive).map_err(err)?.len() != p.bytes
            || hash(&read_bounded(archive, p.bytes)?) != p.sha256
        {
            return Err("resources.integrity".into());
        }
        let staging = tempfile::tempdir_in(self.root()?.join("staging")).map_err(err)?;
        let mut zip = zip::ZipArchive::new(fs::File::open(archive).map_err(err)?).map_err(err)?;
        if zip.len() != p.files.len() {
            return Err("resources.incomplete".into());
        }
        let expected: HashMap<_, _> = p.files.iter().map(|f| (f.path.as_str(), f)).collect();
        let mut seen = BTreeSet::new();
        for i in 0..zip.len() {
            if self.cancel.load(Ordering::Relaxed) {
                return Err("resources.cancelled".into());
            }
            let mut entry = zip.by_index(i).map_err(err)?;
            let name = entry.name().map_err(err)?.into_owned();
            let f = expected.get(name.as_str()).ok_or("resources.path")?;
            if !safe_path(&name)
                || !seen.insert(name.clone())
                || entry.is_dir()
                || entry.is_symlink()
                || entry.size() != f.bytes
            {
                return Err("resources.path".into());
            }
            let mut bytes = Vec::new();
            entry
                .by_ref()
                .take(f.bytes + 1)
                .read_to_end(&mut bytes)
                .map_err(err)?;
            if bytes.len() as u64 != f.bytes || hash(&bytes) != f.sha256 {
                return Err("resources.integrity".into());
            }
            let out = staging.path().join(name);
            fs::create_dir_all(out.parent().unwrap()).map_err(err)?;
            fs::write(out, bytes).map_err(err)?;
        }
        let destination = self.root()?.join("objects").join(&p.sha256);
        if destination.exists() {
            fs::remove_dir_all(&destination).map_err(err)?
        }
        fs::rename(staging.path(), &destination).map_err(err)?;
        Ok(())
    }
    pub(super) fn install(
        &self,
        app: Option<&tauri::AppHandle>,
        m: Manifest,
        source: Option<&Path>,
    ) -> Result<()> {
        let _guard = self.operation.try_lock().map_err(|_| "resources.busy")?;
        self.cancel.store(false, Ordering::Relaxed);
        self.install_inner(app, m, source)
    }
    pub(super) fn install_inner(
        &self,
        app: Option<&tauri::AppHandle>,
        m: Manifest,
        source: Option<&Path>,
    ) -> Result<()> {
        validate_manifest(&m, &self.config.repository)?;
        for p in &m.packs {
            if self.pack_ready(p) {
                continue;
            }
            let archive = if let Some(folder) = source {
                folder.join(format!("{}-{}.zip", p.kind, p.sha256))
            } else {
                self.download_pack(app, p)?
            };
            self.progress(app, "verifying", 0, p.bytes);
            self.extract(&archive, p)?;
        }
        if !self.complete(&m) {
            return Err("resources.integrity".into());
        }
        if self.session.read().unwrap().is_none() && compatible(&m, VERSION) {
            {
                let mut d = self.disk.lock().unwrap();
                d.previous = d.active.clone();
                d.active = Some(m.generation.clone());
                d.trial = true;
            }
            *self.session.write().unwrap() = Some(m.clone());
            let mut s = self.status.lock().unwrap();
            s.active_generation = Some(m.generation);
            s.ready = true;
            s.phase = "ready".into();
        } else if self.session.read().unwrap().as_ref().map(|v| &v.generation)
            != Some(&m.generation)
        {
            self.disk.lock().unwrap().pending = Some(m.generation.clone());
            let mut s = self.status.lock().unwrap();
            s.pending_generation = compatible(&m, VERSION).then_some(m.generation);
            s.phase = if s.pending_generation.is_some() {
                "pending"
            } else {
                "ready"
            }
            .into();
        } else {
            self.status.lock().unwrap().phase = "ready".into();
        }
        self.save_disk()?;
        let pending = self.status.lock().unwrap().pending_generation.is_some();
        self.progress(app, if pending { "pending" } else { "ready" }, 0, 0);
        self.cleanup()?;
        Ok(())
    }
    pub(super) fn cleanup(&self) -> Result<()> {
        let disk = self.disk.lock().unwrap().clone();
        let session = self.session.read().unwrap().clone();
        let mut keep = BTreeSet::new();
        let mut generations = BTreeSet::new();
        for id in [
            disk.active,
            disk.previous,
            disk.pending,
            disk.update,
            session.map(|m| m.generation),
        ]
        .into_iter()
        .flatten()
        {
            generations.insert(id.clone());
            if let Ok(m) = self.manifest(&id) {
                for p in m.packs {
                    keep.insert(p.sha256);
                }
            }
        }
        if let Some(m) = self.available.lock().unwrap().as_ref() {
            generations.insert(m.generation.clone());
        }
        for entry in fs::read_dir(self.root()?.join("manifests")).map_err(err)? {
            let entry = entry.map_err(err)?;
            let path = entry.path();
            let expired = entry
                .metadata()
                .map_err(err)?
                .modified()
                .ok()
                .and_then(|v| SystemTime::now().duration_since(v).ok())
                .is_some_and(|age| age > Duration::from_secs(7 * 86400));
            if expired
                && entry.file_type().map_err(err)?.is_file()
                && path
                    .file_stem()
                    .and_then(|v| v.to_str())
                    .is_some_and(|id| digest(id) && !generations.contains(id))
            {
                fs::remove_file(path).map_err(err)?;
            }
        }
        for entry in fs::read_dir(self.root()?.join("objects")).map_err(err)? {
            let entry = entry.map_err(err)?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if digest(&name) && !keep.contains(&name) && entry.file_type().map_err(err)?.is_dir() {
                fs::remove_dir_all(entry.path()).map_err(err)?;
            }
        }
        // Completed archives are redundant after extraction. Keep recent partial
        // downloads for resuming, but reclaim abandoned attempts after one week.
        for entry in fs::read_dir(self.root()?.join("downloads")).map_err(err)? {
            let entry = entry.map_err(err)?;
            let path = entry.path();
            let meta = entry.metadata().map_err(err)?;
            if !entry.file_type().map_err(err)?.is_file() {
                continue;
            }
            let complete = path.extension().is_some_and(|v| v == "zip")
                && path
                    .file_stem()
                    .and_then(|v| v.to_str())
                    .is_some_and(|v| keep.contains(v));
            let expired = meta
                .modified()
                .ok()
                .and_then(|v| SystemTime::now().duration_since(v).ok())
                .is_some_and(|age| age > Duration::from_secs(7 * 86400));
            if complete || expired {
                fs::remove_file(path).map_err(err)?;
            }
        }
        Ok(())
    }
    pub(super) fn finish<T>(&self, result: Result<T>) -> Result<T> {
        if let Err(e) = &result {
            if e != "resources.busy" {
                let mut s = self.status.lock().unwrap();
                s.phase = "error".into();
                s.error = Some(e.clone());
            }
        }
        result
    }
    pub(super) fn import_file(&self, app: Option<&tauri::AppHandle>, path: &Path) -> Result<()> {
        let e: Envelope =
            serde_json::from_slice(&read_bounded(path, MAX_MANIFEST * 2)?).map_err(err)?;
        let m: Manifest = verified(&e, &self.config)?;
        validate_manifest(&m, &self.config.repository)?;
        if !compatible(&m, VERSION) {
            return Err("resources.incompatible".into());
        }
        write_atomic(&self.manifest_path(&m.generation)?, &e)?;
        self.install(app, m, path.parent())
    }
}
