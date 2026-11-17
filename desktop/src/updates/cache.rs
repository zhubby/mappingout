//! [INPUT]: 依赖文件系统、SHA256 与原始更新清单。
//! [OUTPUT]: 提供包字节、签名依据和安装选择的原子缓存。
//! [POS]: 程序更新的磁盘边界；签名复验由更新模块执行。
//! [PROTOCOL]: Update this header on change, then check AGENTS.md
use semver::Version;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

type Result<T> = std::result::Result<T, String>;
// 与资源包相同的量级上限；拒绝损坏缓存导致的无界读取。
const MAX_PACKAGE: u64 = 512_000_000;
const MAX_METADATA: u64 = 4_000_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) enum Choice {
    Prompt,
    Deferred,
    Installing,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Pending {
    schema: u32,
    pub raw_json: serde_json::Value,
    pub sha256: String,
    pub choice: Choice,
    pub resource_generation: Option<String>,
}

impl Pending {
    pub fn version(&self) -> Result<String> {
        let value = self.raw_json["version"].as_str().ok_or("updates.cache")?;
        Version::parse(value.trim_start_matches('v')).map_err(|_| "updates.cache")?;
        Ok(value.to_owned())
    }
}

#[derive(Debug, Clone)]
pub(super) struct Cache {
    root: PathBuf,
}

fn err(error: impl std::fmt::Display) -> String {
    format!("updates.cache:{error}")
}
fn hash(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
fn digest(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn read(path: &Path, limit: u64) -> Result<Vec<u8>> {
    let metadata = fs::symlink_metadata(path).map_err(err)?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > limit {
        return Err("updates.cache".into());
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(err)?
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(err)?;
    if bytes.len() as u64 > limit {
        return Err("updates.cache".into());
    }
    Ok(bytes)
}
fn atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    let mut file =
        tempfile::NamedTempFile::new_in(path.parent().ok_or("updates.cache")?).map_err(err)?;
    file.write_all(bytes).map_err(err)?;
    file.as_file().sync_all().map_err(err)?;
    file.persist(path).map_err(err)?;
    Ok(())
}

impl Cache {
    pub fn new(root: PathBuf) -> Result<Self> {
        fs::create_dir_all(&root).map_err(err)?;
        if fs::symlink_metadata(&root)
            .map_err(err)?
            .file_type()
            .is_symlink()
        {
            return Err("updates.cache".into());
        }
        Ok(Self { root })
    }
    pub fn load(&self) -> Result<Option<(Pending, Vec<u8>)>> {
        let path = self.root.join("pending.json");
        if !path.try_exists().map_err(err)? {
            return Ok(None);
        }
        let pending: Pending = serde_json::from_slice(&read(&path, MAX_METADATA)?).map_err(err)?;
        if pending.schema != 1
            || !digest(&pending.sha256)
            || pending
                .resource_generation
                .as_ref()
                .is_some_and(|id| !digest(id))
        {
            return Err("updates.cache".into());
        }
        pending.version()?;
        let bytes = read(
            &self.root.join(format!("{}.bin", pending.sha256)),
            MAX_PACKAGE,
        )?;
        if bytes.is_empty() || hash(&bytes) != pending.sha256 {
            return Err("updates.cache".into());
        }
        Ok(Some((pending, bytes)))
    }
    pub fn stage(&self, raw_json: serde_json::Value, bytes: &[u8]) -> Result<Pending> {
        if bytes.is_empty() || bytes.len() as u64 > MAX_PACKAGE {
            return Err("updates.cache".into());
        }
        let pending = Pending {
            schema: 1,
            raw_json,
            sha256: hash(bytes),
            choice: Choice::Prompt,
            resource_generation: None,
        };
        pending.version()?;
        atomic(&self.root.join(format!("{}.bin", pending.sha256)), bytes)?;
        self.store(&pending)?;
        self.prune(Some(&pending.sha256))?;
        Ok(pending)
    }
    pub fn store(&self, pending: &Pending) -> Result<()> {
        let bytes = serde_json::to_vec(pending).map_err(err)?;
        if bytes.len() as u64 > MAX_METADATA {
            return Err("updates.cache".into());
        }
        atomic(&self.root.join("pending.json"), &bytes)
    }
    pub fn clear(&self) -> Result<()> {
        match fs::remove_file(self.root.join("pending.json")) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(err(error)),
        }
        self.prune(None)
    }
    fn prune(&self, keep: Option<&str>) -> Result<()> {
        for entry in fs::read_dir(&self.root).map_err(err)? {
            let entry = entry.map_err(err)?;
            let path = entry.path();
            if path.extension().is_some_and(|extension| extension == "bin")
                && path
                    .file_stem()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| digest(name) && Some(name) != keep)
                && entry.file_type().map_err(err)?.is_file()
            {
                fs::remove_file(path).map_err(err)?;
            }
        }
        Ok(())
    }
}
