# 离线客户端平台支持

目标平台：Windows x86（32 位）、Windows x64（兼容已有用户）、macOS arm64（Apple Silicon）。开发中的资源分包方案采用轻量程序安装包与共享资源包，完成首次准备后离线使用；离线电脑可导入资源，并预装 Windows 对应架构的 WebView2。详情见 [资源分发](desktop-resources.md)。以下 1.1.0 的发布数据属于历史完整离线安装包。

1.1.0 已正式发布：[下载页面](https://github.com/zhubby/mappingout/releases/tag/desktop-v1.1.0)。Windows x86 离线安装包 213806959 字节，Windows x64 离线安装包 238498566 字节，Mac arm64 DMG 20969858 字节。安装包、签名、校验文件与三平台更新清单均已上传；[正式发布工作流](https://github.com/zhubby/mappingout/actions/runs/43438711930) 四个任务全部成功。

历史 Windows 安装包内含对应架构的 Microsoft WebView2 离线安装器。新方案复用已安装运行时，缺失时由小型引导器下载；完全离线时须预装运行时。macOS 使用系统 WKWebView，提供 DMG 安装盘和用于签名更新的 app.tar.gz。三平台使用相同的地图、资料和字体资源包，无需账号即可使用。

CI 在 Windows 和 Apple Silicon macOS runner 上分别构建并运行原生测试；发布任务等待全部架构成功后生成统一清单。更新清单键为 windows-i686、windows-x86_64、darwin-aarch64。新方案的 Windows 更新下载程序安装包，内容更新仅下载变化的资源包。检查更新失败不影响已准备好的离线功能。

macOS 最低版本 11.0。目前 macOS 使用 ad-hoc 本地签名，尚无 Apple Developer ID 签名或公证，不能承诺双击即可绕过 Gatekeeper。Windows 尚无 Authenticode 应用证书。Tauri 更新签名用于验证更新完整性，不等同于这些系统发布者签名。

Windows x86、Windows x64、macOS arm64 已在 [三平台构建任务](https://github.com/zhubby/mappingout/actions/runs/43437493163) 中分别通过安装包构建与原生测试，离线发布清单合并通过。Windows x86 和 macOS 尚未进行完整图形界面的实机验收，不能将历史 Windows x64 的界面验收结果套用到这两个平台。构建命令：

```sh
npm run desktop:build:release -- --target i686-pc-windows-msvc
npm run desktop:build:release -- --target aarch64-apple-darwin --config src-tauri/tauri.macos.conf.json
```

macOS 命令必须在安装 Xcode Command Line Tools 的 Mac 上运行。请继续保持应用标识、生产 origin 和更新公钥稳定，以保留各平台本地数据。
