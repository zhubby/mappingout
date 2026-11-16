use base64::{engine::general_purpose::STANDARD as B64, Engine};
use minisign_verify::{PublicKey, Signature};
use semver::{Version, VersionReq};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    borrow::Cow,
    collections::{BTreeSet, HashMap},
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, RwLock,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{
    utils::assets::{AssetKey, AssetsIter, CspHash},
    Assets, Emitter, Manager, State,
};
use tauri_plugin_dialog::DialogExt;
type Result<T> = std::result::Result<T, String>;
// The signed channel retains up to 100 manifests, including older client ranges.
const MAX_MANIFEST: u64 = 16_000_000;
const MAX_PACK: u64 = 512_000_000;
const MAX_EXPANDED: u64 = 1_500_000_000;
const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Config {
    public_key: String,
    channel_url: String,
    repository: String,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Envelope {
    payload: String,
    signature: String,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct File {
    path: String,
    bytes: u64,
    sha256: String,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Pack {
    kind: String,
    sha256: String,
    bytes: u64,
    url: String,
    files: Vec<File>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    schema: u32,
    generation: String,
    client_range: String,
    packs: Vec<Pack>,
}
#[derive(Clone, Serialize, Deserialize)]
struct Channel {
    schema: u32,
    releases: Vec<Manifest>,
}
#[derive(Clone, Serialize, Deserialize)]
struct CachedChannel {
    envelope: Envelope,
    etag: Option<String>,
}
#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Disk {
    active: Option<String>,
    previous: Option<String>,
    pending: Option<String>,
    trial: bool,
    last_check: u64,
}
#[derive(Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub active_generation: Option<String>,
    pub pending_generation: Option<String>,
    pub available_generation: Option<String>,
    pub phase: String,
    pub completed: u64,
    pub total: u64,
    pub error: Option<String>,
    pub ready: bool,
}
pub struct ResourceManager {
    config: Config,
    root: RwLock<Option<PathBuf>>,
    session: RwLock<Option<Manifest>>,
    disk: Mutex<Disk>,
    status: Mutex<Status>,
    available: Mutex<Option<Manifest>>,
    bootstrap: Mutex<Option<Envelope>>,
    operation: Mutex<()>,
    cancel: AtomicBool,
}
fn err(e: impl std::fmt::Display) -> String {
    format!("resources.io:{e}")
}
fn hash(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn digest(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}
fn safe_path(value: &str) -> bool {
    !value.is_empty()
        && !value.starts_with('/')
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_./-".contains(&b))
        && value
            .split('/')
            .all(|s| !s.is_empty() && s != "." && s != "..")
}
fn compatible(m: &Manifest, version: &str) -> bool {
    m.schema == 1
        && VersionReq::parse(&m.client_range)
            .ok()
            .zip(Version::parse(version).ok())
            .is_some_and(|(r, v)| r.matches(&v))
}
fn write_atomic<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    let mut tmp =
        tempfile::NamedTempFile::new_in(path.parent().ok_or("resources.path")?).map_err(err)?;
    tmp.write_all(&serde_json::to_vec(value).map_err(err)?)
        .map_err(err)?;
    tmp.as_file().sync_all().map_err(err)?;
    tmp.persist(path).map_err(err)?;
    Ok(())
}
fn read_bounded(path: &Path, max: u64) -> Result<Vec<u8>> {
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(err)?
        .take(max + 1)
        .read_to_end(&mut bytes)
        .map_err(err)?;
    if bytes.len() as u64 > max {
        return Err("resources.too-large".into());
    }
    Ok(bytes)
}
fn url_allowed(value: &str, repository: &str) -> bool {
    reqwest::Url::parse(value).ok().is_some_and(|u| {
        u.scheme() == "https"
            && u.host_str() == Some("github.com")
            && u.username().is_empty()
            && u.password().is_none()
            && u.port().is_none()
            && u.path()
                .starts_with(&format!("/{repository}/releases/download/"))
    })
}
fn validate_manifest(m: &Manifest, repository: &str) -> Result<()> {
    if m.schema != 1
        || !digest(&m.generation)
        || VersionReq::parse(&m.client_range).is_err()
        || m.packs.len() != 3
    {
        return Err("resources.manifest".into());
    }
    let mut kinds = BTreeSet::new();
    let mut paths = BTreeSet::new();
    let mut expanded = 0u64;
    for p in &m.packs {
        if !["media", "data", "fonts"].contains(&p.kind.as_str())
            || !kinds.insert(&p.kind)
            || !digest(&p.sha256)
            || p.bytes == 0
            || p.bytes > MAX_PACK
            || !url_allowed(&p.url, repository)
            || !p.url.ends_with(&format!("/{}-{}.zip", p.kind, p.sha256))
            || p.files.is_empty()
            || p.files.len() > 20000
        {
            return Err("resources.manifest".into());
        }
        for f in &p.files {
            let prefix = match p.kind.as_str() {
                "media" => f.path.starts_with("assets/"),
                "fonts" => f.path.starts_with("fonts/"),
                _ => f.path.starts_with("data/") || f.path.starts_with("licenses/"),
            };
            if !prefix
                || !safe_path(&f.path)
                || !digest(&f.sha256)
                || !paths.insert(f.path.to_ascii_lowercase())
                || f.bytes > MAX_PACK
            {
                return Err("resources.path".into());
            }
            expanded = expanded.checked_add(f.bytes).ok_or("resources.too-large")?;
            if expanded > MAX_EXPANDED {
                return Err("resources.too-large".into());
            }
        }
    }
    for required in [
        "data/catalog.json",
        "data/armor.json",
        "data/calendar.json",
        "data/i18n/en/catalog.json",
        "data/i18n/en/armor.json",
        "data/i18n/en/calendar.json",
        "data/i18n/zh-CN/catalog.json",
        "data/i18n/zh-CN/armor.json",
        "data/i18n/zh-CN/calendar.json",
        "fonts/manifest.json",
        "licenses/gfdl-1.3.txt",
    ] {
        if !paths.contains(&required.to_ascii_lowercase()) {
            return Err("resources.incomplete".into());
        }
    }
    Ok(())
}
fn verified<T: for<'a> Deserialize<'a>>(e: &Envelope, config: &Config) -> Result<T> {
    let payload = B64.decode(&e.payload).map_err(err)?;
    if payload.len() as u64 > MAX_MANIFEST {
        return Err("resources.too-large".into());
    }
    let public = String::from_utf8(B64.decode(&config.public_key).map_err(err)?).map_err(err)?;
    let sig = String::from_utf8(B64.decode(&e.signature).map_err(err)?).map_err(err)?;
    PublicKey::decode(&public)
        .map_err(|_| "resources.signature")?
        .verify(
            &payload,
            &Signature::decode(&sig).map_err(|_| "resources.signature")?,
            true,
        )
        .map_err(|_| "resources.signature")?;
    serde_json::from_slice(&payload).map_err(err)
}
impl ResourceManager {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            config: serde_json::from_str(include_str!("../resources.config.json"))
                .expect("resource public configuration"),
            root: RwLock::new(None),
            session: RwLock::new(None),
            disk: Mutex::new(Disk::default()),
            status: Mutex::new(Status {
                phase: "missing".into(),
                ..Status::default()
            }),
            available: Mutex::new(None),
            bootstrap: Mutex::new(None),
            operation: Mutex::new(()),
            cancel: AtomicBool::new(false),
        })
    }
    fn root(&self) -> Result<PathBuf> {
        self.root
            .read()
            .unwrap()
            .clone()
            .ok_or("resources.not-initialized".into())
    }
    fn manifest_path(&self, generation: &str) -> Result<PathBuf> {
        if !digest(generation) {
            return Err("resources.path".into());
        }
        Ok(self
            .root()?
            .join("manifests")
            .join(format!("{generation}.json")))
    }
    fn manifest(&self, generation: &str) -> Result<Manifest> {
        let e: Envelope = serde_json::from_slice(&read_bounded(
            &self.manifest_path(generation)?,
            MAX_MANIFEST * 2,
        )?)
        .map_err(err)?;
        // Cached channel envelopes can contain several resource generations.
        let payload: serde_json::Value = verified(&e, &self.config)?;
        let candidates = if payload.get("releases").is_some() {
            serde_json::from_value::<Channel>(payload)
                .map_err(err)?
                .releases
        } else {
            vec![serde_json::from_value(payload).map_err(err)?]
        };
        let m = candidates
            .into_iter()
            .find(|m| m.generation == generation)
            .ok_or("resources.manifest")?;
        validate_manifest(&m, &self.config.repository)?;
        Ok(m)
    }
    fn save_disk(&self) -> Result<()> {
        write_atomic(
            &self.root()?.join("state.json"),
            &*self.disk.lock().unwrap(),
        )
    }
    fn channel(&self, envelope: &Envelope) -> Result<Channel> {
        let channel: Channel = verified(envelope, &self.config)?;
        if channel.schema != 1 || channel.releases.len() > 100 {
            return Err("resources.manifest".into());
        }
        for manifest in &channel.releases {
            validate_manifest(manifest, &self.config.repository)?;
        }
        Ok(channel)
    }
    fn cached_channel(&self) -> Result<(CachedChannel, Channel)> {
        let cache: CachedChannel = serde_json::from_slice(&read_bounded(
            &self.root()?.join("channel.json"),
            MAX_MANIFEST * 2,
        )?)
        .map_err(err)?;
        let channel = self.channel(&cache.envelope)?;
        Ok((cache, channel))
    }
    fn offer(&self, channel: &Channel, envelope: &Envelope, target: &str) -> Result<()> {
        let candidate = channel
            .releases
            .iter()
            .find(|m| compatible(m, target))
            .ok_or("resources.incompatible")?;
        write_atomic(&self.manifest_path(&candidate.generation)?, envelope)?;
        *self.available.lock().unwrap() = Some(candidate.clone());
        self.status.lock().unwrap().available_generation = Some(candidate.generation.clone());
        Ok(())
    }
    fn file_path(&self, p: &Pack, f: &File) -> Result<PathBuf> {
        let base = self.root()?.join("objects").join(&p.sha256);
        let mut current = base;
        if fs::symlink_metadata(&current)
            .map_err(err)?
            .file_type()
            .is_symlink()
        {
            return Err("resources.path".into());
        }
        for component in f.path.split('/') {
            current.push(component);
            if fs::symlink_metadata(&current)
                .map_err(err)?
                .file_type()
                .is_symlink()
            {
                return Err("resources.path".into());
            }
        }
        Ok(current)
    }
    fn read_file(&self, p: &Pack, f: &File) -> Result<Vec<u8>> {
        let path = self.file_path(p, f)?;
        if fs::metadata(&path).map_err(err)?.len() != f.bytes {
            return Err("resources.integrity".into());
        }
        let bytes = read_bounded(&path, f.bytes)?;
        if hash(&bytes) != f.sha256 {
            return Err("resources.integrity".into());
        }
        Ok(bytes)
    }
    fn pack_ready(&self, p: &Pack) -> bool {
        p.files.iter().all(|f| self.read_file(p, f).is_ok())
    }
    fn complete(&self, m: &Manifest) -> bool {
        m.packs.iter().all(|p| self.pack_ready(p))
    }
    pub fn initialize(&self, app: &tauri::App, bootstrap: Option<Vec<u8>>) -> Result<()> {
        let root = app
            .path()
            .app_local_data_dir()
            .map_err(err)?
            .join("resources-v1");
        self.initialize_at(root, bootstrap, VERSION)
    }
    fn initialize_at(
        &self,
        root: PathBuf,
        bootstrap: Option<Vec<u8>>,
        version: &str,
    ) -> Result<()> {
        for dir in ["objects", "manifests", "downloads", "staging"] {
            fs::create_dir_all(root.join(dir)).map_err(err)?
        }
        *self.root.write().unwrap() = Some(root.clone());
        let mut disk: Disk = fs::read(root.join("state.json"))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        if disk.trial {
            // Roll back only when a usable previous generation exists. A first
            // import, or an upgrade with no compatible predecessor, must remain
            // available for another offline startup and confirmation attempt.
            let previous = disk
                .previous
                .as_ref()
                .and_then(|id| self.manifest(id).ok())
                .filter(|m| compatible(m, version) && self.complete(m));
            if let Some(previous) = previous {
                disk.active = Some(previous.generation);
                disk.previous = None;
                disk.trial = false;
            }
        }
        // A resource set prepared for a program upgrade must survive a restart
        // of the older executable, which may still be running before installation.
        let pending = disk
            .pending
            .as_ref()
            .and_then(|id| self.manifest(id).ok())
            .filter(|m| self.complete(m));
        if pending.is_none() {
            disk.pending = None;
        }
        let selected = pending.filter(|m| compatible(m, version));
        if selected.is_some() {
            disk.pending = None;
        }
        let selected = selected.or_else(|| {
            disk.active
                .as_ref()
                .and_then(|id| self.manifest(id).ok())
                .filter(|m| compatible(m, version) && self.complete(m))
        });
        let selected = selected.or_else(|| {
            let fallback = disk
                .previous
                .as_ref()
                .and_then(|id| self.manifest(id).ok())
                .filter(|m| compatible(m, version) && self.complete(m));
            if let Some(m) = &fallback {
                disk.active = Some(m.generation.clone());
                disk.previous = None;
            }
            fallback
        });
        if let Some(m) = selected {
            if disk.active.as_ref() != Some(&m.generation) {
                disk.previous = disk.active.clone();
                disk.active = Some(m.generation.clone());
                disk.trial = true;
            }
            *self.session.write().unwrap() = Some(m.clone());
            *self.status.lock().unwrap() = Status {
                active_generation: Some(m.generation),
                ready: true,
                phase: "ready".into(),
                ..Status::default()
            };
        } else {
            disk.active = None;
        }
        *self.disk.lock().unwrap() = disk;
        self.save_disk()?;
        if let Some(bytes) = bootstrap {
            let e: Envelope = serde_json::from_slice(&bytes).map_err(err)?;
            let m: Manifest = verified(&e, &self.config)?;
            validate_manifest(&m, &self.config.repository)?;
            *self.bootstrap.lock().unwrap() = Some(e);
        }
        // Rehydrate a known update even during the 24-hour check interval or
        // while offline. Its signature is verified again before it is offered.
        if let Ok((cache, channel)) = self.cached_channel() {
            let _ = self.offer(&channel, &cache.envelope, version);
        }
        Ok(())
    }
    fn progress(&self, app: Option<&tauri::AppHandle>, phase: &str, completed: u64, total: u64) {
        let mut s = self.status.lock().unwrap();
        s.phase = phase.into();
        s.completed = completed;
        s.total = total;
        s.error = None;
        if let Some(app) = app {
            let _ = app.emit("resources-progress", s.clone());
        }
    }
    fn client(&self) -> Result<reqwest::Client> {
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
    fn network<T>(
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
    fn check(&self, app: Option<&tauri::AppHandle>, force: bool, target: &str) -> Result<()> {
        let _guard = self.operation.try_lock().map_err(|_| "resources.busy")?;
        self.cancel.store(false, Ordering::Relaxed);
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
    fn download_pack(&self, app: Option<&tauri::AppHandle>, p: &Pack) -> Result<PathBuf> {
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
    fn extract(&self, archive: &Path, p: &Pack) -> Result<()> {
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
    fn install(
        &self,
        app: Option<&tauri::AppHandle>,
        m: Manifest,
        source: Option<&Path>,
    ) -> Result<()> {
        let _guard = self.operation.try_lock().map_err(|_| "resources.busy")?;
        self.cancel.store(false, Ordering::Relaxed);
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
    fn cleanup(&self) -> Result<()> {
        let disk = self.disk.lock().unwrap().clone();
        let session = self.session.read().unwrap().clone();
        let mut keep = BTreeSet::new();
        let mut generations = BTreeSet::new();
        for id in [
            disk.active,
            disk.previous,
            disk.pending,
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
    fn finish<T>(&self, result: Result<T>) -> Result<T> {
        if let Err(e) = &result {
            if e != "resources.busy" {
                let mut s = self.status.lock().unwrap();
                s.phase = "error".into();
                s.error = Some(e.clone());
            }
        }
        result
    }
    fn import_file(&self, app: Option<&tauri::AppHandle>, path: &Path) -> Result<()> {
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
    fn confirm(&self) -> Result<()> {
        // Confirmation concerns the pinned session, so it need not wait for a
        // channel request or download. Hold the session and disk state together
        // to avoid confirming a different generation during a concurrent switch.
        let session = self.session.read().unwrap();
        let manifest = session.as_ref().ok_or("resources.incomplete")?;
        let mut disk = self.disk.lock().unwrap();
        if disk.active.as_deref() != Some(manifest.generation.as_str()) {
            return Err("resources.busy".into());
        }
        disk.trial = false;
        write_atomic(&self.root()?.join("state.json"), &*disk)
    }
    fn fallback(&self) -> Result<bool> {
        let _guard = self.operation.try_lock().map_err(|_| "resources.busy")?;
        let previous = self.disk.lock().unwrap().previous.clone();
        if let Some(m) = previous
            .and_then(|id| self.manifest(&id).ok())
            .filter(|m| compatible(m, VERSION) && self.complete(m))
        {
            {
                let mut d = self.disk.lock().unwrap();
                d.active = Some(m.generation.clone());
                d.pending = None;
                d.trial = false;
                d.previous = None;
            }
            *self.session.write().unwrap() = Some(m.clone());
            let mut s = self.status.lock().unwrap();
            s.ready = true;
            s.active_generation = Some(m.generation);
            s.pending_generation = None;
            drop(s);
            self.save_disk()?;
            return Ok(true);
        }
        Ok(false)
    }
}

pub struct ResourceAssets {
    pub inner: Box<dyn Assets<tauri::Wry>>,
    pub manager: Arc<ResourceManager>,
}
pub struct EmptyAssets;
impl Assets<tauri::Wry> for EmptyAssets {
    fn get(&self, _: &AssetKey) -> Option<Cow<'_, [u8]>> {
        None
    }
    fn iter(&self) -> Box<AssetsIter<'_>> {
        Box::new(std::iter::empty())
    }
    fn csp_hashes(&self, _: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        Box::new(std::iter::empty())
    }
}
impl Assets<tauri::Wry> for ResourceAssets {
    fn setup(&self, app: &tauri::App) {
        self.inner.setup(app);
        let bootstrap = self
            .inner
            .get(&AssetKey::from("resources-bootstrap.json"))
            .map(|v| v.into_owned());
        if let Err(error) = self.manager.initialize(app, bootstrap) {
            self.manager.status.lock().unwrap().error = Some(error);
        }
    }
    fn get(&self, key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        let path = key.as_ref().trim_start_matches('/');
        if ["assets/", "data/", "fonts/", "licenses/"]
            .iter()
            .any(|prefix| path.starts_with(prefix))
        {
            let session = self.manager.session.read().unwrap();
            let m = session.as_ref()?;
            for p in &m.packs {
                if let Some(f) = p.files.iter().find(|f| f.path == path) {
                    return match self.manager.read_file(p, f) {
                        Ok(bytes) => Some(Cow::Owned(bytes)),
                        Err(error) => {
                            let mut status = self.manager.status.lock().unwrap();
                            status.error = Some(error);
                            status.phase = "error".into();
                            None
                        }
                    };
                }
            }
            return None;
        }
        self.inner.get(key)
    }
    fn iter(&self) -> Box<AssetsIter<'_>> {
        self.inner.iter()
    }
    fn csp_hashes(&self, path: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        self.inner.csp_hashes(path)
    }
}

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
        let result = (|| {
            Version::parse(&version).map_err(err)?;
            if manager
                .session
                .read()
                .unwrap()
                .as_ref()
                .is_some_and(|m| compatible(m, &version) && manager.complete(m))
            {
                return Ok(());
            }
            manager.check(Some(&app), true, &version)?;
            let m = manager
                .available
                .lock()
                .unwrap()
                .clone()
                .ok_or("resources.incompatible")?;
            if !compatible(&m, &version) {
                return Err("resources.incompatible".into());
            }
            manager.install(Some(&app), m, None)
        })();
        manager.finish(result)
    })
    .await
    .map_err(err)?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (
        tempfile::TempDir,
        Arc<ResourceManager>,
        Vec<Manifest>,
        PathBuf,
    ) {
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../../tests/fixtures/resources.json")).unwrap();
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("source");
        fs::create_dir(&source).unwrap();
        let mut manager = ResourceManager::new();
        Arc::get_mut(&mut manager).unwrap().config =
            serde_json::from_value(fixture["config"].clone()).unwrap();
        manager
            .initialize_at(dir.path().join("cache"), None, VERSION)
            .unwrap();
        for (name, bytes) in fixture["archives"].as_object().unwrap() {
            fs::write(
                source.join(name),
                B64.decode(bytes.as_str().unwrap()).unwrap(),
            )
            .unwrap();
        }
        let manifests = fixture["manifests"]
            .as_array()
            .unwrap()
            .iter()
            .map(|value| {
                let e: Envelope = serde_json::from_value(value.clone()).unwrap();
                let m: Manifest = verified(&e, &manager.config).unwrap();
                validate_manifest(&m, &manager.config.repository).unwrap();
                write_atomic(&manager.manifest_path(&m.generation).unwrap(), &e).unwrap();
                m
            })
            .collect();
        (dir, manager, manifests, source)
    }
    fn restart(manager: &ResourceManager, version: &str) -> Arc<ResourceManager> {
        let mut next = ResourceManager::new();
        Arc::get_mut(&mut next).unwrap().config = manager.config.clone();
        next.initialize_at(manager.root().unwrap(), None, version)
            .unwrap();
        next
    }
    fn channel_envelope() -> Envelope {
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../../tests/fixtures/resources.json")).unwrap();
        serde_json::from_value(fixture["channel"].clone()).unwrap()
    }
    #[test]
    fn resumes_known_update_after_restart_during_check_interval_and_after_304() {
        let (_dir, manager, manifests, source) = fixture();
        manager
            .install(None, manifests[0].clone(), Some(&source))
            .unwrap();
        manager.confirm().unwrap();
        let envelope = channel_envelope();
        let channel = manager.channel(&envelope).unwrap();
        manager.offer(&channel, &envelope, VERSION).unwrap();
        write_atomic(
            &manager.root().unwrap().join("channel.json"),
            &CachedChannel {
                envelope,
                etag: Some("\"revision-a\"".into()),
            },
        )
        .unwrap();
        manager.disk.lock().unwrap().last_check = now();
        manager.save_disk().unwrap();

        let mut next = restart(&manager, VERSION);
        assert_eq!(
            next.status.lock().unwrap().available_generation.as_ref(),
            Some(&manifests[1].generation)
        );
        // No server is running here. The recent check must return the restored
        // candidate without contacting GitHub, so backgroundResources can retry.
        Arc::get_mut(&mut next).unwrap().config.channel_url =
            "http://127.0.0.1:9/unreachable".into();
        next.check(None, false, VERSION).unwrap();
        assert_eq!(
            next.available.lock().unwrap().as_ref().unwrap().generation,
            manifests[1].generation
        );

        // A later conditional check must retain the same candidate after 304.
        next.disk.lock().unwrap().last_check = 0;
        next.save_disk().unwrap();
        let mut after_day = restart(&next, VERSION);
        let (url, request) =
            server(b"HTTP/1.1 304 Not Modified\r\nConnection: close\r\n\r\n".to_vec());
        Arc::get_mut(&mut after_day).unwrap().config.channel_url = url;
        after_day.check(None, false, VERSION).unwrap();
        assert!(request
            .recv_timeout(Duration::from_secs(3))
            .unwrap()
            .to_ascii_lowercase()
            .contains("if-none-match: \"revision-a\""));
        let mut pack = after_day.available.lock().unwrap().as_ref().unwrap().packs[1].clone();
        assert_eq!(pack.sha256, manifests[1].packs[1].sha256);
        let zip = fs::read(source.join(format!("data-{}.zip", pack.sha256))).unwrap();
        fs::write(
            after_day
                .root()
                .unwrap()
                .join("downloads")
                .join(format!("{}.part", pack.sha256)),
            &zip[..10],
        )
        .unwrap();
        let mut response = format!("HTTP/1.1 206 Partial Content\r\nContent-Length: {}\r\nContent-Range: bytes 10-{}/{}\r\nConnection: close\r\n\r\n", zip.len()-10, zip.len()-1, zip.len()).into_bytes();
        response.extend_from_slice(&zip[10..]);
        let (url, request) = server(response);
        pack.url = url;
        assert_eq!(
            fs::read(after_day.download_pack(None, &pack).unwrap()).unwrap(),
            zip
        );
        assert!(request
            .recv_timeout(Duration::from_secs(3))
            .unwrap()
            .to_ascii_lowercase()
            .contains("range: bytes=10-"));
    }
    #[test]
    fn missing_or_untrusted_channel_fetches_unconditionally_despite_old_etag() {
        for damaged in [false, true] {
            let (_dir, manager, manifests, source) = fixture();
            manager
                .install(None, manifests[0].clone(), Some(&source))
                .unwrap();
            manager.confirm().unwrap();
            let state = serde_json::json!({"active": manifests[0].generation, "lastCheck": now(), "etag": "\"legacy-etag\""});
            write_atomic(&manager.root().unwrap().join("state.json"), &state).unwrap();
            if damaged {
                let mut envelope = channel_envelope();
                envelope.payload = B64.encode(b"{}");
                write_atomic(
                    &manager.root().unwrap().join("channel.json"),
                    &CachedChannel {
                        envelope,
                        etag: Some("\"bad-cache\"".into()),
                    },
                )
                .unwrap();
            }
            let mut next = restart(&manager, VERSION);
            assert!(next.available.lock().unwrap().is_none());
            let bytes = serde_json::to_vec(&channel_envelope()).unwrap();
            let mut response = format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nETag: \"fresh\"\r\nConnection: close\r\n\r\n", bytes.len()).into_bytes();
            response.extend_from_slice(&bytes);
            let (url, request) = server(response);
            Arc::get_mut(&mut next).unwrap().config.channel_url = url;
            next.check(None, false, VERSION).unwrap();
            assert!(!request
                .recv_timeout(Duration::from_secs(3))
                .unwrap()
                .to_ascii_lowercase()
                .contains("if-none-match"));
            assert_eq!(
                next.available.lock().unwrap().as_ref().unwrap().generation,
                manifests[1].generation
            );
        }
    }
    #[test]
    fn first_unconfirmed_import_survives_offline_restarts() {
        let (_dir, manager, manifests, source) = fixture();
        manager
            .install(None, manifests[1].clone(), Some(&source))
            .unwrap();
        assert!(manager.disk.lock().unwrap().trial);
        assert!(manager.disk.lock().unwrap().previous.is_none());
        fs::remove_dir_all(source).unwrap();
        let next = restart(&manager, VERSION);
        assert!(next.status.lock().unwrap().ready);
        assert_eq!(
            next.session.read().unwrap().as_ref().unwrap().generation,
            manifests[1].generation
        );
        assert!(next.disk.lock().unwrap().trial);
        let retry = restart(&next, VERSION);
        retry.confirm().unwrap();
        let confirmed = restart(&retry, VERSION);
        assert_eq!(
            confirmed.disk.lock().unwrap().active.as_ref(),
            Some(&manifests[1].generation)
        );
        assert!(!confirmed.disk.lock().unwrap().trial);
    }
    #[test]
    fn unconfirmed_upgrade_keeps_resources_when_previous_is_incompatible() {
        let (_dir, manager, manifests, source) = fixture();
        manager
            .install(None, manifests[0].clone(), Some(&source))
            .unwrap();
        manager.confirm().unwrap();
        manager
            .install(None, manifests[2].clone(), Some(&source))
            .unwrap();
        let trial = restart(&manager, "2.0.0");
        assert!(trial.disk.lock().unwrap().trial);
        let retry = restart(&trial, "2.0.0");
        assert!(retry.status.lock().unwrap().ready);
        assert_eq!(
            retry.disk.lock().unwrap().active.as_ref(),
            Some(&manifests[2].generation)
        );
    }
    #[test]
    fn confirms_pinned_generation_while_background_operation_is_locked() {
        let (_dir, manager, manifests, source) = fixture();
        manager
            .install(None, manifests[0].clone(), Some(&source))
            .unwrap();
        let _background = manager.operation.lock().unwrap();
        manager.confirm().unwrap();
        assert!(!manager.disk.lock().unwrap().trial);
        let saved: Disk =
            serde_json::from_slice(&fs::read(manager.root().unwrap().join("state.json")).unwrap())
                .unwrap();
        assert!(!saved.trial);
        assert_eq!(saved.active.as_ref(), Some(&manifests[0].generation));
    }
    #[test]
    fn confirmation_never_confirms_another_active_generation() {
        let (_dir, manager, manifests, source) = fixture();
        assert_eq!(manager.confirm().unwrap_err(), "resources.incomplete");
        manager
            .install(None, manifests[0].clone(), Some(&source))
            .unwrap();
        manager.disk.lock().unwrap().active = Some(manifests[1].generation.clone());
        assert_eq!(manager.confirm().unwrap_err(), "resources.busy");
        assert!(manager.disk.lock().unwrap().trial);
    }
    #[test]
    fn switches_on_next_launch_and_rolls_back_unconfirmed_generation() {
        let (_dir, manager, m, source) = fixture();
        manager.install(None, m[0].clone(), Some(&source)).unwrap();
        manager.confirm().unwrap();
        manager.install(None, m[1].clone(), Some(&source)).unwrap();
        assert_eq!(
            manager.session.read().unwrap().as_ref().unwrap().generation,
            m[0].generation
        );
        assert_eq!(
            manager.disk.lock().unwrap().pending.as_ref(),
            Some(&m[1].generation)
        );
        let make = || {
            let mut next = ResourceManager::new();
            Arc::get_mut(&mut next).unwrap().config = manager.config.clone();
            next.initialize_at(manager.root().unwrap(), None, VERSION)
                .unwrap();
            next
        };
        let trial = make();
        assert_eq!(
            trial.disk.lock().unwrap().active.as_ref(),
            Some(&m[1].generation)
        );
        assert!(trial.disk.lock().unwrap().trial);
        let rolled_back = make();
        assert_eq!(
            rolled_back.disk.lock().unwrap().active.as_ref(),
            Some(&m[0].generation)
        );
        assert!(!rolled_back.disk.lock().unwrap().trial);
    }
    #[test]
    fn retains_future_resource_set_until_program_upgrade() {
        let (_dir, manager, m, source) = fixture();
        manager.install(None, m[0].clone(), Some(&source)).unwrap();
        manager.confirm().unwrap();
        manager.install(None, m[2].clone(), Some(&source)).unwrap();
        let mut next = ResourceManager::new();
        Arc::get_mut(&mut next).unwrap().config = manager.config.clone();
        next.initialize_at(manager.root().unwrap(), None, VERSION)
            .unwrap();
        assert_eq!(
            next.disk.lock().unwrap().active.as_ref(),
            Some(&m[0].generation)
        );
        assert_eq!(
            next.disk.lock().unwrap().pending.as_ref(),
            Some(&m[2].generation)
        );
        let mut upgraded = ResourceManager::new();
        Arc::get_mut(&mut upgraded).unwrap().config = manager.config.clone();
        upgraded
            .initialize_at(manager.root().unwrap(), None, "2.0.0")
            .unwrap();
        assert_eq!(
            upgraded.disk.lock().unwrap().active.as_ref(),
            Some(&m[2].generation)
        );
        assert!(upgraded.disk.lock().unwrap().pending.is_none());
    }
    #[test]
    fn failed_import_preserves_active_generation_and_reuses_unchanged_packs() {
        let (_dir, manager, m, source) = fixture();
        manager.install(None, m[0].clone(), Some(&source)).unwrap();
        manager.confirm().unwrap();
        let before = manager.disk.lock().unwrap().active.clone();
        fs::write(
            source.join(format!("data-{}.zip", m[1].packs[1].sha256)),
            b"corrupt",
        )
        .unwrap();
        assert!(manager.install(None, m[1].clone(), Some(&source)).is_err());
        assert_eq!(manager.disk.lock().unwrap().active, before);
        assert!(manager.complete(&m[0]));
        // Media and fonts no longer need their original ZIPs for another set.
        for p in [&m[0].packs[0], &m[0].packs[2]] {
            fs::remove_file(source.join(format!("{}-{}.zip", p.kind, p.sha256))).unwrap();
        }
        manager.install(None, m[2].clone(), Some(&source)).unwrap();
        assert!(manager.complete(&m[2]));
    }
    #[test]
    fn rejects_wrong_signer_duplicate_paths_and_damaged_archives() {
        let (_dir, manager, m, source) = fixture();
        let e: Envelope = serde_json::from_slice(
            &fs::read(manager.manifest_path(&m[0].generation).unwrap()).unwrap(),
        )
        .unwrap();
        assert!(verified::<Manifest>(&e, &ResourceManager::new().config).is_err());
        let mut invalid = m[0].clone();
        let mut duplicate = invalid.packs[1].files[0].clone();
        duplicate.path = duplicate.path.to_ascii_uppercase();
        invalid.packs[1].files.push(duplicate);
        assert!(validate_manifest(&invalid, &manager.config.repository).is_err());
        let mut p = m[0].packs[0].clone();
        p.files[0].path = "assets/../outside".into();
        assert!(manager
            .extract(&source.join(format!("media-{}.zip", p.sha256)), &p)
            .is_err());
        assert!(!source.parent().unwrap().join("outside").exists());
    }
    fn server(response: Vec<u8>) -> (String, std::sync::mpsc::Receiver<String>) {
        let socket = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = socket.local_addr().unwrap();
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let (mut stream, _) = socket.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(3)))
                .unwrap();
            let mut request = Vec::new();
            let mut byte = [0u8; 1];
            while !request.ends_with(b"\r\n\r\n") {
                if stream.read(&mut byte).unwrap_or(0) == 0 {
                    break;
                }
                request.push(byte[0]);
            }
            tx.send(String::from_utf8_lossy(&request).into_owned()).ok();
            stream.write_all(&response).ok();
        });
        (format!("http://{address}/pack.zip"), rx)
    }
    #[test]
    fn resumes_interrupted_download_and_handles_server_ignoring_range() {
        let (_dir, manager, m, _source) = fixture();
        let body = b"download test bytes for interrupted transport";
        let mut pack = m[0].packs[0].clone();
        pack.bytes = body.len() as u64;
        pack.sha256 = hash(body);
        let mut response = format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        )
        .into_bytes();
        response.extend_from_slice(&body[..10]);
        let (url, request) = server(response);
        pack.url = url;
        assert!(manager.download_pack(None, &pack).is_err());
        request.recv_timeout(Duration::from_secs(3)).unwrap();
        let partial = manager
            .root()
            .unwrap()
            .join("downloads")
            .join(format!("{}.part", pack.sha256));
        assert_eq!(fs::read(&partial).unwrap(), &body[..10]);
        let mut response=format!("HTTP/1.1 206 Partial Content\r\nContent-Length: {}\r\nContent-Range: bytes 10-{}/{}\r\nConnection: close\r\n\r\n",body.len()-10,body.len()-1,body.len()).into_bytes();
        response.extend_from_slice(&body[10..]);
        let (url, request) = server(response);
        pack.url = url;
        let archive = manager.download_pack(None, &pack).unwrap();
        assert_eq!(fs::read(&archive).unwrap(), body);
        assert!(request
            .recv_timeout(Duration::from_secs(3))
            .unwrap()
            .to_ascii_lowercase()
            .contains("range: bytes=10-"));
        fs::remove_file(&archive).unwrap();
        fs::write(&partial, &body[..10]).unwrap();
        let mut response = format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        )
        .into_bytes();
        response.extend_from_slice(body);
        let (url, _request) = server(response);
        pack.url = url;
        assert_eq!(
            fs::read(manager.download_pack(None, &pack).unwrap()).unwrap(),
            body
        );
    }
    #[test]
    fn signed_channel_selects_compatible_set_and_reuses_etag() {
        let (_dir, mut manager, manifests, _source) = fixture();
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../../tests/fixtures/resources.json")).unwrap();
        let bytes = serde_json::to_vec(&fixture["channel"]).unwrap();
        let mut response = format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nETag: \"revision-a\"\r\nConnection: close\r\n\r\n", bytes.len()).into_bytes();
        response.extend_from_slice(&bytes);
        let (url, request) = server(response);
        Arc::get_mut(&mut manager).unwrap().config.channel_url = url;
        manager.check(None, true, VERSION).unwrap();
        request.recv_timeout(Duration::from_secs(3)).unwrap();
        assert_eq!(
            manager
                .available
                .lock()
                .unwrap()
                .as_ref()
                .unwrap()
                .generation,
            manifests[1].generation
        );
        assert_eq!(
            manager
                .manifest(&manifests[1].generation)
                .unwrap()
                .generation,
            manifests[1].generation
        );
        let (url, request) =
            server(b"HTTP/1.1 304 Not Modified\r\nConnection: close\r\n\r\n".to_vec());
        Arc::get_mut(&mut manager).unwrap().config.channel_url = url;
        manager.check(None, false, VERSION).unwrap();
        assert!(request
            .recv_timeout(Duration::from_secs(3))
            .unwrap()
            .to_ascii_lowercase()
            .contains("if-none-match: \"revision-a\""));
        assert!(manager.disk.lock().unwrap().last_check > 0);
    }
    #[test]
    fn cancellation_interrupts_waiting_for_http_headers() {
        let (_dir, manager, m, _source) = fixture();
        let socket = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = socket.local_addr().unwrap();
        std::thread::spawn(move || {
            let (_stream, _) = socket.accept().unwrap();
            std::thread::sleep(Duration::from_secs(1));
        });
        let mut pack = m[0].packs[0].clone();
        pack.url = format!("http://{address}/hang");
        let cancel = manager.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(150));
            cancel.cancel.store(true, Ordering::Relaxed);
        });
        let start = std::time::Instant::now();
        assert_eq!(
            manager.download_pack(None, &pack).unwrap_err(),
            "resources.cancelled"
        );
        assert!(start.elapsed() < Duration::from_millis(900));
    }
    #[test]
    fn rejects_unsafe_paths_and_urls() {
        for value in ["../a", "/a", "a//b", "C:/a", "a\\b", "a/./b", "a/../b"] {
            assert!(!safe_path(value), "{value}")
        }
        assert!(safe_path("fonts/lxgw/OFL.txt"));
        assert!(url_allowed(
            "https://github.com/zhubby/mappingout/releases/download/resources-a/a.zip",
            "zhubby/mappingout"
        ));
        for url in [
            "http://github.com/zhubby/mappingout/releases/download/a/a",
            "https://github.com/other/repo/releases/download/a/a",
            "https://evil.test/a",
        ] {
            assert!(!url_allowed(url, "zhubby/mappingout"));
        }
    }
    #[test]
    fn verifies_real_packs_and_signed_manifest() {
        let envelope =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../releases/resources/resources.json");
        if !envelope.exists() {
            return;
        }
        let manager = ResourceManager::new();
        let e: Envelope = serde_json::from_slice(&fs::read(envelope).unwrap()).unwrap();
        let m: Manifest = verified(&e, &manager.config).unwrap();
        validate_manifest(&m, &manager.config.repository).unwrap();
        assert!(compatible(&m, VERSION));
        assert!(!compatible(&m, "9.0.0"));
        let mut bad = e.clone();
        bad.payload = B64.encode(b"{}");
        assert!(verified::<Manifest>(&bad, &manager.config).is_err());
        let root = tempfile::tempdir().unwrap();
        for dir in ["objects", "staging"] {
            fs::create_dir(root.path().join(dir)).unwrap()
        }
        *manager.root.write().unwrap() = Some(root.path().to_owned());
        for p in &m.packs {
            let zip = Path::new(env!("CARGO_MANIFEST_DIR"))
                .join(format!("../releases/resources/{}-{}.zip", p.kind, p.sha256));
            manager.extract(&zip, p).unwrap();
            assert!(manager.pack_ready(p));
        }
        let p = &m.packs[0];
        let f = &p.files[0];
        fs::write(manager.file_path(p, f).unwrap(), b"corrupt").unwrap();
        assert!(!manager.pack_ready(p));
    }
}
