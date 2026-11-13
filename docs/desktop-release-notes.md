MappingOut Desktop 1.1.0：仅提供完整离线客户端。

- Windows x86（32 位）与 x64：安装包内含相应架构 WebView2 运行时，安装时无需联网。
- macOS arm64：面向 Apple Silicon，macOS 11 或更新版本，使用系统 WKWebView。
- 全平台完整内置 20 张地图、查询资料及许可文本，无需服务器或账号。
- 个人记录保存在本机，支持 JSON 导入导出、自动备份和恢复前备份。
- 取消需要联网补装运行时的普通 Windows 安装包；Windows 更新同样使用完整离线包。

Windows 选择对应架构的 offline-setup.exe。Mac 初次安装使用 DMG，将应用拖入 Applications；app.tar.gz 与 .sig 用于更新验证。检查更新需要联网，日常地图和个人记录可持续离线使用。

Windows 应用尚无 Authenticode 发布者证书。macOS 使用 ad-hoc 签名，尚无 Apple Developer ID 签名或公证，Gatekeeper 可能阻止打开。Tauri 更新签名只用于更新完整性校验，不能代替系统发布者签名。

网页、Windows 和 Mac 的个人记录相互独立，通过 JSON 备份迁移。升级前会保存本地备份；Windows 安装器需要确认语言，Mac 安装更新后自动重新启动。建议定期将备份另存到其他磁盘。
