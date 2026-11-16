# src-tauri/
> L2 | Parent: ../AGENTS.md

Cargo.toml: 原生依赖、测试功能和发布编译选项。
Cargo.lock: 原生依赖版本锁。
build.rs: Tauri 构建能力与配置生成。
tauri.conf.json: 稳定应用身份、窗口、CSP 和安装包。
tauri.updater.conf.json: 程序更新公钥、正式频道和静默升级。
tauri.macos.conf.json: Apple Silicon DMG 与最低 macOS 版本。
tauri.offline.conf.json: Windows WebView2 离线安装器配置。
tauri.resources-test.conf.json: 独立应用身份的资源 QA 配置。
resources.config.json: 资源公钥、频道与客户端兼容范围。
src/: 原生备份、资源与程序更新实现。
capabilities/: 仅本地主窗口的最小桌面权限。
icons/: 桌面安装与运行图标。

[PROTOCOL]: Update this header on change, then check AGENTS.md
