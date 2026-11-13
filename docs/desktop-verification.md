# Windows 客户端交付验收

本文记录 1.0.0 的历史验收。按后续“只保留离线版”的要求，普通 Windows 安装包已从 Release 撤下，1.0.0 更新清单已切换至离线包。当前平台范围与 1.1.0 验证结果见 [平台支持](desktop-platforms.md)。

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
- 本地 JSON 校验报告和 GFDL 许可证在应用内打开；系统浏览器外链交接成功，应用未导航离开或产生弹出页面。
- 静默安装及覆盖安装后个人记录保留。
- 默认卸载确实移除程序文件，重新安装 1.0.0 后验收角色保留；未选择删除用户数据。证据为 `uninstall-reinstall-check.json`。
- 含 WebView2 的完整离线安装包静默安装返回 0，安装后程序启动及窗口重启验证通过；本机已有运行时，未验证全新系统缺少运行时的情况。

原始验收证据保存在本地忽略目录 `releases/qa/`：`desktop-smoke.json`、`installed-check.json` 及界面截图。页面缩放测试不等同于更换物理显示器 DPI 的完整测试。

## 安装包

本地产物目录：`releases/1.0.0/`。

| 文件 | 字节数 | SHA256 |
| --- | ---: | --- |
| MappingOut_1.0.0_x64-setup.exe | 20514613 | `049f1c26cc99c2dd12fa6c16a145fa78216a0eac67e29c6be963629b6a929977` |
| MappingOut_1.0.0_x64-offline-setup.exe | 238503919 | `5d4270ae241005d66142bdd230d6ea0133f7ac2a736d2ab52edb81bfb64d0d89` |

两份安装包分别附带更新签名，目录还包含 `latest.json` 与 `SHA256SUMS.txt`。离线版包含已验证 Microsoft Authenticode 签名有效的 WebView2 安装程序。应用安装包本身尚未使用 Windows Authenticode 证书签名。

## 正式发布与在线更新

已于 2026-11-13 18:44（北京时间）正式发布：[desktop-v1.0.0](https://github.com/zhubby/mappingout/releases/tag/desktop-v1.0.0)。六份附件状态均为 uploaded，GitHub Release API 提供的两个安装包 SHA256 与本档案一致。客户端更新端点为 `https://github.com/zhubby/mappingout/releases/latest/download/latest.json`。

公开 HTTPS latest 清单已下载并与本地发布清单逐项比对一致。[发布工作流](https://github.com/zhubby/mappingout/actions/runs/43411364437) 已完整成功，包括单元测试、前端构建、两种签名安装包构建、原生测试和附件归档；检测到已有正式 Release 后保留了已验收附件。

测试用 0.9.0 客户端已从正式 endpoint 检测到 1.0.0，下载 GitHub Release 安装包并完成签名校验。点击保存备份并安装重启、确认安装器中文语言后，安装与重启完成；实际新进程报告版本 1.0.0，验收角色和更新前备份均保留。证据为本地 `releases/qa/updater-check.json`、`update-downloaded.png` 和 `update-installed.png`。

第一次下载因本机 GitHub 网络缓慢而超时，已确认仍保持 0.9.0 和原有角色，且未启用安装按钮；证据为 `failed-download-check.json`。成功的重试使用本机既有 Windows HTTPS 系统代理，公开下载地址与 TLS 校验未改动。自动化等待重启时曾因安装语言确认窗口超时，确认窗口后已连接实际重启进程继续完成验收；升级并非全程静默。

全新系统缺少 WebView2 的安装场景未在干净虚拟机上执行；本机已有运行时。离线包包含 Microsoft 签名有效的运行时安装器，但该限制不能替代全新系统验收。

更新私钥保存在仓库外；不得提交 Git，后续版本须持续使用同一公钥、应用标识及生产 origin。
