# 1.3.1 发布验收

验证日期：2026-11-17。
程序源码：`fb809c0991c59bee306a2784fd323f34d61ad3f1`。
发布标签：`desktop-v1.3.1`。
修复提交：`e66be39`。

## 审查与修复

对照 `9820b81..7ae1d19` 审查目录与职责迁移。
领域、存储、备份和原生命令保持原行为。
审查发现四项既有发布缺陷，本轮均已修复。

| 级别 | 缺陷 | 修复 |
| --- | --- | --- |
| P1 | 旧版本 Windows 安装包被标为当前版本 | 精确匹配产品、版本和架构 |
| P2 | 缺失或过期 macOS 安装盘未阻止聚合 | 要求当前版本 DMG |
| P2 | 下载根地址缺少斜杠时丢失版本路径 | 规范化目录地址 |
| P2 | 输入校验失败时已写入部分产物 | 全部输入校验通过后再创建输出目录 |

新增 8 项聚合回归，修复前 6 项失败，修复后全部通过。
完整审查记录保存在 `.context/compound-engineering/ce-review/2026-11-17-project-structure/review.md`。

## 三平台 CI

[发布工作流 44048967162](https://github.com/zhubby/mappingout/actions/runs/44048967162) 全部成功。
Windows x64、Windows x86、macOS arm64 及发布聚合任务均通过。
每个平台均运行发布门禁、195 项单元测试、生产构建、签名安装包构建与 23 项原生测试。
日志中的单元测试和原生测试数量已逐平台核对。

本地 Node.js 24.11.1 下的 195 项单元测试和 23 项原生测试通过。
`npm run check:worker`、`npm run check:release`、Clippy 和 Rust 格式检查通过。
目录迁移的浏览器回归记录见 [工程整理验收](project-structure-verification.md)。

## 公开产物

[GitHub Release](https://github.com/zhubby/mappingout/releases/tag/desktop-v1.3.1) 于 `2026-11-17T08:56:26Z` 公开发布。
GitHub 最新正式版本指向 `desktop-v1.3.1`。
从公开 Release 重新下载全部 10 个资产。
各资产长度和 SHA-256 均符合 GitHub API 元数据。
7 个安装包、更新归档与独立签名文件和 CI 归档逐字节一致。

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| MappingOut_1.3.1_x64-setup.exe | 4,689,901 | `00b33416c9a43e79ec8302aa0a8c5ef9cf8222c197010a1984cb4196dbb65513` |
| MappingOut_1.3.1_x86-setup.exe | 4,511,824 | `753be5610b9dc465c1bbadc428bf50867369ce0d84d4309e5f29b962206caa0e` |
| MappingOut.app.tar.gz | 3,798,817 | `9f22950e831400e74390e04d2d30b5ed96fcd8a026e964deba484b25cbb57625` |
| MappingOut_1.3.1_aarch64.dmg | 4,100,372 | `458f4f34a9a0d664c28cd4c8a1cd78d961337d14aa5cfb8c4bd004a0ee5e02de` |

`SHA256SUMS.txt` 的四项校验全部通过。
使用原程序更新公钥验证三个更新包的 Minisign 签名及可信注释。
三个签名绑定的版本均为 `1.3.1`。
独立 `.sig` 和更新清单内签名一致。
清单仅包含 `windows-x86_64`、`windows-i686`、`darwin-aarch64`。
全部下载地址指向本版 Release。
公开最新版本入口的 `latest.json` 与本版资产逐字节一致。

macOS 解包后的版本为 `1.3.1`，应用标识为 `dev.zhubby.mappingout`。
可执行文件为 arm64，`codesign --verify --deep --strict` 通过。
DMG 的 `hdiutil verify` 通过。

## 资源与资料

本版 `resources.json` 与公开资源频道均通过原资源公钥验签。
频道包含当前资源集，客户端兼容范围保持 `>=1.2.0, <2.0.0`。
资源代次保持 `86d11aa273fdd8a7d9b62586fba7772610f767be463c2faf99964e722fe4cc25`。
内容未变的三个资源包继续复用。

资料指纹保持 `d1d3cda467da63479371c6def8928a58dfd92ad2c187412bdbc0dfb24f74b684`。
受保护资料的唯一改动为本版发布例外；地图、译文和字体内容不变。
新例外仅绑定 1.3.1、当前指纹和原有五类问题。
131,779 个中文字段位置待审，2,026 个英文字段待确认来源。
1,988 个译文字段含数值或标记待核对项，14,086 个中文字段含未译拉丁词。
Friz Quadrata Std 的应用分发许可仍为未批准状态。
发布说明披露上述边界，不改变人工复核或许可状态。

## 验证边界

Windows 安装包没有 Authenticode 发布者证书。
macOS 使用 ad-hoc 签名，没有 Apple Developer ID 或公证。
本次未替换生产安装，也未执行真实跨版本安装流程。
三平台 CI 与签名回读不代替设备安装及图形交互验收。
Worker 本轮完成构建与部署演练，生产 Worker 未变更。

[PROTOCOL]: Update this header on change, then check AGENTS.md
