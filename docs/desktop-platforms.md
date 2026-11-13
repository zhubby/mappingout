# 离线客户端平台支持

目标平台：Windows x86（32 位）、Windows x64（兼容已有用户）、macOS arm64（Apple Silicon）。只发布完整离线安装包，不提供安装时联网下载运行时的版本。

Windows 安装包内含对应架构的 Microsoft WebView2 离线安装器。macOS 使用系统 WKWebView，提供 DMG 安装盘和用于签名更新的 app.tar.gz。所有平台内置完整地图、查询资料及许可文本，无需账号或服务器即可使用。

CI 在 Windows 和 Apple Silicon macOS runner 上分别构建并运行原生测试；发布任务等待全部架构成功后生成统一清单。更新清单键为 windows-i686、windows-x86_64、darwin-aarch64，Windows 更新同样下载完整离线安装包。检查更新是可选联网操作，不影响离线功能。

macOS 最低版本 11.0。目前 macOS 使用 ad-hoc 本地签名，尚无 Apple Developer ID 签名或公证，不能承诺双击即可绕过 Gatekeeper。Windows 尚无 Authenticode 应用证书。Tauri 更新签名用于验证更新完整性，不等同于这些系统发布者签名。

Windows x86、Windows x64、macOS arm64 已在 [三平台构建任务](https://github.com/zhubby/mappingout/actions/runs/43437493163) 中分别通过安装包构建与原生测试，离线发布清单合并通过。Windows x86 和 macOS 尚未进行完整图形界面的实机验收，不能将历史 Windows x64 的界面验收结果套用到这两个平台。构建命令：

```sh
npm run desktop:build:release -- --target i686-pc-windows-msvc
npm run desktop:build:release -- --target aarch64-apple-darwin --config src-tauri/tauri.macos.conf.json
```

macOS 命令必须在安装 Xcode Command Line Tools 的 Mac 上运行。请继续保持应用标识、生产 origin 和更新公钥稳定，以保留各平台本地数据。
