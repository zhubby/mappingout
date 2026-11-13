# Windows 客户端交付验收

验收日期：2026-11-13。技术方案为 Tauri 2 + React / TypeScript，Windows x64，版本 1.0.0，应用标识 `dev.zhubby.mappingout`。

## 已通过

- 前端单元测试：103 项；Rust 原生测试：2 项。
- Web 浏览器端到端测试：19 项；Worker 端到端测试：22 项。
- Web 与桌面前端构建，以及资料校验：20 张地图、3022 条记录、399 张图片。
- 真实桌面程序在不可用网络代理下首次启动，完整加载地图与功能资料，不注册 Service Worker。
- 自动备份轮换、路径越界拒绝、恢复预览，以及恢复前备份失败时阻止数据库替换。
- 单实例、100% / 150% / 200% 页面缩放、重启后 IndexedDB 数据保留。
- 原生窗口移动和尺寸调整后关闭、重启，窗口状态文件保持一致。
- 已安装程序的原生导入导出：中文及空格路径、取消操作、损坏文件拒绝、预览确认恢复。
- 静默安装及覆盖安装后个人记录保留。

原始验收证据保存在本地忽略目录 `releases/qa/`：`desktop-smoke.json`、`installed-check.json` 及界面截图。页面缩放测试不等同于更换物理显示器 DPI 的完整测试。

## 安装包

本地产物目录：`releases/1.0.0/`。

| 文件 | 字节数 | SHA256 |
| --- | ---: | --- |
| MappingOut_1.0.0_x64-setup.exe | 20514613 | `049f1c26cc99c2dd12fa6c16a145fa78216a0eac67e29c6be963629b6a929977` |
| MappingOut_1.0.0_x64-offline-setup.exe | 238503919 | `5d4270ae241005d66142bdd230d6ea0133f7ac2a736d2ab52edb81bfb64d0d89` |

两份安装包分别附带更新签名，目录还包含 `latest.json` 与 `SHA256SUMS.txt`。离线版包含已验证 Microsoft Authenticode 签名有效的 WebView2 安装程序。应用安装包本身尚未使用 Windows Authenticode 证书签名。

## 发布与待验收

用户已选择 GitHub Releases：`https://github.com/zhubby/mappingout/releases`。计划标签为 `desktop-v1.0.0`，客户端更新端点为 `https://github.com/zhubby/mappingout/releases/latest/download/latest.json`。

截至本档案编写时，尚未完成 GitHub 登录及发布，不能将本地产物视为已上线。发布后还必须核对远端安装包哈希，并通过测试用 0.9.0 客户端完成真实检查更新、签名下载、备份、安装重启和数据保留验收。完整离线安装过程及卸载重装尚未独立记录为通过。

更新私钥保存在仓库外；不得提交 Git，后续版本须持续使用同一公钥、应用标识及生产 origin。
