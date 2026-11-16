//! [INPUT]: 依赖资源公钥、文件系统与 Tauri 资源接口。
//! [OUTPUT]: 提供固定会话、更新资料启动选择与回退。
//! [POS]: 原生资源边界；传输、命令与测试由子模块实现。
//! [PROTOCOL]: Update this header on change, then check AGENTS.md
pub(crate) mod commands;
#[cfg(test)]
mod tests;
mod transfer;
mod updates;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use minisign_verify::{PublicKey, Signature};
use semver::{Version, VersionReq};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    borrow::Cow,
    collections::BTreeSet,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{atomic::AtomicBool, Arc, Mutex, RwLock},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{
    utils::assets::{AssetKey, AssetsIter, CspHash},
    Assets, Emitter, Manager,
};
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
    update: Option<String>,
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
            config: serde_json::from_str(include_str!("../../resources.config.json"))
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
        // 旧程序的后台资料下载能覆盖 pending；新版仍从固定资料启动。
        let selected = pending.filter(|m| compatible(m, version)).or_else(|| {
            disk.update
                .as_ref()
                .and_then(|id| self.manifest(id).ok())
                .filter(|m| compatible(m, version) && self.complete(m))
        });
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
