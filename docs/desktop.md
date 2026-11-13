# MappingOut 离线客户端

Tauri 2 + React / TypeScript。支持目标及限制见 [平台支持](desktop-platforms.md)，历史 1.0.0 验收见 [验收档案](desktop-verification.md)。

只提供完整离线版：Windows x86 / x64 安装包内含对应 WebView2 运行时；macOS Apple Silicon 使用系统 WKWebView。地图与资料全部随安装包提供，不依赖远程服务器。联网检查更新是可选功能。

## 开发构建

Node.js 24+、Rust stable。Windows 需要 MSVC C++ Build Tools 和 Windows SDK；Mac 需要 Xcode Command Line Tools。

```sh
npm ci
npm run desktop:dev
npm run desktop:build:release -- --target i686-pc-windows-msvc
npm run desktop:build:release -- --target x86_64-pc-windows-msvc
# 在 Mac 上构建
npm run desktop:build:release -- --target aarch64-apple-darwin --config src-tauri/tauri.macos.conf.json
```

先通过 rustup target add 安装对应目标。签名私钥通过 TAURI_SIGNING_PRIVATE_KEY 提供，不得提交仓库。macOS 的 ad-hoc 应用签名与 Tauri 更新签名不能替代 Apple Developer ID 或公证。

## 数据

个人记录保存在本机 IndexedDB。网页、Windows、Mac 数据相互独立，可通过 JSON 备份迁移。应用标识 dev.zhubby.mappingout、生产 origin 和更新公钥必须保持稳定。

自动备份在应用运行期间执行，首次加载后生成快照，变更最多每十分钟合并一次；失败一分钟后重试。自动备份和恢复前备份各保留二十份。恢复先校验和预览，确认后保存最新数据的原子备份，再替换数据库；备份失败则阻止替换。客户端设置可打开实际备份目录，建议定期导出到其他磁盘。Windows 路径为 %APPDATA%/dev.zhubby.mappingout/backups，Mac 使用系统应用数据目录。

## 发布

GitHub Actions 分别构建 Windows x86、x64 和 Mac arm64，运行测试后合并安装包、更新签名、SHA256SUMS.txt 和 latest.json。三种架构全部成功后才能发布。推送 desktop-v<版本> 标签触发正式发布；手动运行仅归档产物。

版本同步维护 package.json、Cargo.toml 和 tauri.conf.json。平台更新键为 windows-i686、windows-x86_64、darwin-aarch64。Windows 更新下载完整离线安装包；Mac 下载签名 app.tar.gz，用户初装使用 DMG。当前更新入口为 GitHub Releases latest/download/latest.json。

Windows 安装包含语言确认窗口，升级不是完全静默。macOS 更新安装后需要重新启动应用。下载失败不影响离线使用，签名校验失败不得安装。首次 Windows 安装可能提示未知发布者；Mac 尚无开发者公证，应按实际系统提示处理。

```sh
npm test
npm run desktop:frontend:build
cargo test --manifest-path src-tauri/Cargo.toml
```
