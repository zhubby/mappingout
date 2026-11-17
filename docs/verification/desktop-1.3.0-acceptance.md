# 1.3.0 发布验收

> 路径迁移说明：本文保留验收当时的命令与提交事实。当前入口见 [工程结构](../guides/project-structure.md)。
验证日期：2026-11-17。程序源码提交为 `b155ff06173e2a9f263ffb6946e4693455aaa8c5`，标签为 `desktop-v1.3.0`。

## 程序分发

[GitHub Release](https://github.com/zhubby/mappingout/releases/tag/desktop-v1.3.0) 已公开发布，并被 GitHub 标记为最新正式版本。发布流程 [43998862778](https://github.com/zhubby/mappingout/actions/runs/43998862778) 已成功结束；Windows x64、Windows x86、macOS arm64 三个构建任务及发布任务均通过。

三个平台均通过发布检查、单元测试、生产前端构建、原生测试和安装包构建。本地发布前通过 182 项单元测试、48 项浏览器测试、11 项更新界面测试和 23 项 Rust 测试；Clippy 全目标和功能检查通过。Worker 生产构建与 dry-run 通过，25 项 Wrangler 浏览器测试通过。

从公开 Release 重新下载全部十个资产。正式 `releases/latest/download/latest.json` 的内容与版本资产逐字节一致，版本为 `1.3.0`，包含 `windows-x86_64`、`windows-i686`、`darwin-aarch64` 三个平台。

使用仓库原有程序更新公钥验证三个程序包的 Minisign 签名及可信注释，签名版本均为 `1.3.0`。独立 `.sig` 与更新清单内签名一致。`SHA256SUMS.txt` 的四项安装文件校验全部通过。

| 文件 | 字节 | SHA-256 |
|---|---:|---|
| MappingOut_1.3.0_x64-setup.exe | 4,689,181 | `65b62a946a6d00d380490edfd0b414f966775e1ec0d3e8cc90d0602c9792674a` |
| MappingOut_1.3.0_x86-setup.exe | 4,511,551 | `3feddfcd5a034dd76826c30e0b3bd092ddfc2081d22c07ea8b03cf28a26e7fbf` |
| MappingOut.app.tar.gz | 3,798,168 | `f72b94677ba320296fda4c4c324312978f7a34cd8416b5b57982a4d7680146a4` |
| MappingOut_1.3.0_aarch64.dmg | 4,099,396 | `d8d9665df19ef15697c68449ce63e7d7064ada302007a39747d2144e101d919b` |

macOS 公开产物与 CI 归档逐字节一致。解包后版本为 `1.3.0`，可执行文件为 arm64；`codesign --verify --deep --strict` 和 `hdiutil verify` 均通过。签名类型为 ad-hoc，未配置 Apple Developer ID 或公证。Windows 安装包尚无 Authenticode 发布者证书。

本轮未替换 `/Applications` 内的生产应用，也未执行正式 Windows 安装器或从 GitHub 正式频道完成跨版本安装。此前独立应用标识下的真实 macOS 更新证据见[自动更新验收](desktop-updates-verification.md)。

## 独立资源

`resources.json` 和公开 `resources-channel-v1/channel.json` 均使用原有资源公钥验签通过。频道包含当前资源集，兼容范围为 `>=1.2.0, <2.0.0`。

资源代号：`86d11aa273fdd8a7d9b62586fba7772610f767be463c2faf99964e722fe4cc25`。

| 归档 | 字节 | 文件数 | SHA-256 |
|---|---:|---:|---|
| media | 78,902,978 | 3,680 | `538a0c5ef12b1db536a2da410976864339a1dd1808e85dcf4d2b0ac723838b26` |
| data | 9,447,636 | 22 | `266786dc8a9957f60f7700daacfe7ea5772adb3b2c2820724684818ac1b90b50` |
| fonts | 14,461,386 | 8 | `1a18e395a4ba6a6b939d992d896fa7067f9c82edadfc19389743678890c381ee` |

从各自内容寻址 Release 下载三个 ZIP。归档长度与 SHA-256 均符合签名清单。逐项读取全部 3,710 个文件，核对文件集合、长度、SHA-256 和源码 `public/` 内容，全部一致。

## Worker

已部署至 [mappingout-web.zhubby.workers.dev](https://mappingout-web.zhubby.workers.dev)，Cloudflare 版本为 `fa9d6fdc-3d50-4cb9-b261-ea8f9d9c1a9f`，当前承接全部流量。生产构建包含 3,754 个静态文件，离线缓存版本为 `mappingout-410df39fd0c97f1f81320888`。正式域名的 22 项 HTTP 检查通过，任务、技能、资源图标及手机布局完成线上复核。本次代理网络下的首次全量预缓存及断网刷新未完成验收。详细记录见[部署验收](deployment-verification.md)。

## 资料审校与许可边界

本版本按用户明确发布要求记录了单版本例外。指纹为 `d1d3cda467da63479371c6def8928a58dfd92ad2c187412bdbc0dfb24f74b684`，`npm run check:release` 通过；结构、来源与完整性校验继续执行。

131,779 个中文字段位置待人工复核；2,026 个英文字段待确认 Wiki 来源；1,988 个中文字段含数值或标记待核对项；14,086 个中文字段含未译拉丁词。任务攻略仍有 163 项详细攻略来源缺口和 5 个图源缺口。Friz Quadrata Std 分发许可仍为未批准状态。本次例外不改变人工复核或许可状态，也不适用于其他版本。

6,892 个实际引用页面的 Wiki 当前修订检查通过，未发现版本变化或请求错误。固定修订的本地原文哈希核验覆盖 6,916 个修订。上述来源检查不替代译文人工复核。

[PROTOCOL]: Update this header on change, then check AGENTS.md
