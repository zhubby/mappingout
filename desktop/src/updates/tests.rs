//! [INPUT]: 依赖测试公钥、签名包、Tauri MockRuntime 与临时目录。
//! [OUTPUT]: 验证持久缓存、篡改拒绝和离线更新元数据恢复。
//! [POS]: 原生程序更新回归；不会调用安装器。
//! [PROTOCOL]: Update this header on change, then check AGENTS.md
use super::cache::{Cache, Choice};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use std::fs;
use tauri_plugin_updater::UpdaterExt;

fn fixture() -> serde_json::Value {
    serde_json::from_str(include_str!("../../../tests/fixtures/updater.json")).unwrap()
}

#[test]
fn deferred_package_and_install_attempt_survive_process_recreation() {
    let dir = tempfile::tempdir().unwrap();
    let value = fixture();
    let bytes = B64.decode(value["bytes"].as_str().unwrap()).unwrap();
    let cache = Cache::new(dir.path().to_owned()).unwrap();
    let mut pending = cache.stage(value["manifest"].clone(), &bytes).unwrap();
    pending.choice = Choice::Deferred;
    pending.resource_generation = Some("a".repeat(64));
    cache.store(&pending).unwrap();
    let restarted = Cache::new(dir.path().to_owned()).unwrap();
    let (mut pending, actual) = restarted.load().unwrap().unwrap();
    assert_eq!(actual, bytes);
    assert_eq!(pending.choice, Choice::Deferred);
    assert_eq!(pending.resource_generation, Some("a".repeat(64)));
    pending.choice = Choice::Installing;
    restarted.store(&pending).unwrap();
    assert_eq!(
        restarted.load().unwrap().unwrap().0.choice,
        Choice::Installing
    );
    restarted.clear().unwrap();
    assert!(restarted.load().unwrap().is_none());
}

#[test]
fn damaged_or_missing_cached_package_is_never_offered_as_ready() {
    let dir = tempfile::tempdir().unwrap();
    let value = fixture();
    let bytes = B64.decode(value["bytes"].as_str().unwrap()).unwrap();
    let cache = Cache::new(dir.path().to_owned()).unwrap();
    let pending = cache.stage(value["manifest"].clone(), &bytes).unwrap();
    let package = dir.path().join(format!("{}.bin", pending.sha256));
    fs::write(&package, b"corrupted").unwrap();
    assert!(cache.load().is_err());
    fs::remove_file(package).unwrap();
    assert!(cache.load().is_err());
}

#[test]
fn cached_manifest_cannot_replace_signed_version_or_package() {
    let value = fixture();
    let bytes = B64.decode(value["bytes"].as_str().unwrap()).unwrap();
    let mut context = tauri::test::mock_context(tauri::test::noop_assets());
    context.config_mut().plugins.0.insert("updater".into(), serde_json::json!({
        "pubkey":value["publicKey"], "endpoints":["https://example.com/latest.json"], "requireSignedVersion":true,
    }));
    let app = tauri::test::mock_builder()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .build(context)
        .unwrap();
    let dir = tempfile::tempdir().unwrap();
    let executable = dir.path().join("Fixture.app/Contents/MacOS/fixture");
    fs::create_dir_all(executable.parent().unwrap()).unwrap();
    fs::write(&executable, b"fixture").unwrap();
    let updater = app
        .updater_builder()
        .executable_path(executable)
        .build()
        .unwrap();
    let update = updater
        .restore_update(value["manifest"].clone())
        .unwrap()
        .unwrap();
    update.verify(&bytes).unwrap();
    assert!(update.verify(b"wrong bytes").is_err());
    let mut inflated = value["manifest"].clone();
    inflated["version"] = "9.0.0".into();
    let update = updater.restore_update(inflated).unwrap().unwrap();
    assert!(update.verify(&bytes).is_err());
}
