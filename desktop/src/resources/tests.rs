//! [INPUT]: 依赖固定签名资源、临时目录与本地 HTTP 服务。
//! [OUTPUT]: 验证完整性、离线启动、续传和会话回退。
//! [POS]: 资源实现的行为回归；测试文件与生产实现分离。
//! [PROTOCOL]: Update this header on change, then check AGENTS.md
use super::*;
use std::{sync::atomic::Ordering, time::Duration};
fn fixture() -> (
    tempfile::TempDir,
    Arc<ResourceManager>,
    Vec<Manifest>,
    PathBuf,
) {
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("../../../tests/fixtures/resources.json")).unwrap();
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
#[test]
fn optional_data_requires_both_locales_while_legacy_resources_remain_valid() {
    let (_dir, manager, manifests, _source) = fixture();
    let mut manifest = manifests[0].clone();
    validate_manifest(&manifest, &manager.config.repository).unwrap();
    for dataset in ["quests", "skills"] {
        for (index, path) in [
            format!("data/{dataset}.json"),
            format!("data/i18n/en/{dataset}.json"),
            format!("data/i18n/zh-CN/{dataset}.json"),
        ]
        .iter()
        .enumerate()
        {
            manifest
                .packs
                .iter_mut()
                .find(|pack| pack.kind == "data")
                .unwrap()
                .files
                .push(File {
                    path: path.clone(),
                    bytes: 1,
                    sha256: "a".repeat(64),
                });
            let result = validate_manifest(&manifest, &manager.config.repository);
            if index < 2 {
                assert_eq!(result.unwrap_err(), "resources.incomplete");
            } else {
                result.unwrap();
            }
        }
    }
}
fn channel_envelope() -> Envelope {
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("../../../tests/fixtures/resources.json")).unwrap();
    serde_json::from_value(fixture["channel"].clone()).unwrap()
}
#[test]
fn deferred_program_update_retains_resources_through_content_updates_and_offline_restart() {
    let (_dir, manager, manifests, source) = fixture();
    manager
        .install(None, manifests[0].clone(), Some(&source))
        .unwrap();
    manager.confirm().unwrap();
    manager
        .install(None, manifests[2].clone(), Some(&source))
        .unwrap();
    assert_eq!(
        manager.prepare_update(None, "2.0.0").unwrap(),
        manifests[2].generation
    );
    manager
        .install(None, manifests[1].clone(), Some(&source))
        .unwrap();
    assert!(manager.complete(&manifests[2]));
    let next = restart(&manager, VERSION);
    assert_eq!(
        next.prepare_update(None, "2.0.0").unwrap(),
        manifests[2].generation
    );
    assert_eq!(
        next.disk.lock().unwrap().pending.as_ref(),
        Some(&manifests[2].generation)
    );
    let upgraded = restart(&next, "2.0.0");
    assert_eq!(
        upgraded.disk.lock().unwrap().active.as_ref(),
        Some(&manifests[2].generation)
    );
    upgraded.release_update().unwrap();
    assert!(upgraded.disk.lock().unwrap().update.is_none());
}
#[test]
fn program_upgrade_uses_pinned_resources_when_content_download_finishes_last() {
    let (_dir, manager, manifests, source) = fixture();
    manager
        .install(None, manifests[0].clone(), Some(&source))
        .unwrap();
    manager.confirm().unwrap();
    manager
        .install(None, manifests[2].clone(), Some(&source))
        .unwrap();
    manager.prepare_update(None, "2.0.0").unwrap();
    // 当前资料在程序安装前完成下载，覆盖 pending。
    manager
        .install(None, manifests[1].clone(), Some(&source))
        .unwrap();
    let upgraded = restart(&manager, "2.0.0");
    assert!(upgraded.status.lock().unwrap().ready);
    assert_eq!(
        upgraded.disk.lock().unwrap().active.as_ref(),
        Some(&manifests[2].generation)
    );
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
    Arc::get_mut(&mut next).unwrap().config.channel_url = "http://127.0.0.1:9/unreachable".into();
    next.check(None, false, VERSION).unwrap();
    assert_eq!(
        next.available.lock().unwrap().as_ref().unwrap().generation,
        manifests[1].generation
    );

    // A later conditional check must retain the same candidate after 304.
    next.disk.lock().unwrap().last_check = 0;
    next.save_disk().unwrap();
    let mut after_day = restart(&next, VERSION);
    let (url, request) = server(b"HTTP/1.1 304 Not Modified\r\nConnection: close\r\n\r\n".to_vec());
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
        let mut response = format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nETag: \"fresh\"\r\nConnection: close\r\n\r\n",
            bytes.len()
        )
        .into_bytes();
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
        serde_json::from_str(include_str!("../../../tests/fixtures/resources.json")).unwrap();
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
    let (url, request) = server(b"HTTP/1.1 304 Not Modified\r\nConnection: close\r\n\r\n".to_vec());
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
