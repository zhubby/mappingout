# 目录整理验收

日期：2026-11-17。
基线提交：`9820b81`。
实施分支：`codex/reorganize-project`。

## 实施范围

- `src-tauri` 改为 `desktop`，原生备份独立为模块。
- 前端按 `app`、`features`、`shared`、`storage` 和 `platform` 划分职责。
- 脚本按构建、桌面、校验、Wiki、翻译和资源归组。
- 人工输入迁入 `data/maps` 和 `data/wiki/inputs`。
- 指南、发布说明、验收和截图分别归入文档子目录。
- npm、测试、CI、文档链接和模块地图同步迁移。

目录与依赖规则见 [工程结构](../guides/project-structure.md)。

## 自动验证

Node.js 使用 `24.11.1`。
本次在 macOS 主机执行以下检查。

| 命令或检查 | 结果 |
| --- | --- |
| `npm test` | 18 个测试文件，188 项通过 |
| `npm run test:e2e` | 48 项通过 |
| `npm run test:e2e:worker` | 25 项通过 |
| `npm run test:e2e:updates` | 11 项通过 |
| `cargo test --manifest-path desktop/Cargo.toml` | 23 项通过 |
| `cargo fmt --manifest-path desktop/Cargo.toml -- --check` | 通过 |
| `cargo clippy --manifest-path desktop/Cargo.toml --locked --tests -- -D warnings` | 通过 |
| `npm run check:worker` | 资料校验、TypeScript、网页构建及 Wrangler 部署演练通过 |
| `npm run desktop:frontend:build` | 资料校验、TypeScript、桌面前端和签名资源构建通过 |
| `npm run check:release` | 使用既有版本例外通过；例外内容未变 |
| 76 个 `.mjs` 的 `node --check` | 通过 |
| 文档链接、模块成员和 `git diff --check` | 通过 |

路径回归覆盖非工程工作目录、含空格目录和显式证据根。
任务与技能校验器从指定根读取 Wiki 快照。
实际数据 CLI 从临时工作目录执行通过。
桌面 CLI 从 `/tmp` 执行 `info` 成功。
CLI 正确读取应用配置、CSP、前端产物和开发地址。

## 资料与身份完整性

基线记录的 3,731 个公共资源及翻译证据文件哈希不变。
迁移的 20 个人工 JSON 输入与基线逐字节一致。
`src/i18n` 字典内容不变。
应用配置、程序更新配置、资源配置和 `Cargo.lock` 哈希不变。
npm 命令名称、依赖声明和 `package-lock.json` 不变。

发布输入指纹保持：

```text
d1d3cda467da63479371c6def8928a58dfd92ad2c187412bdbc0dfb24f74b684
```

当前资源清单 payload 与基线构建器输出完全一致。
对比使用隔离目录，并只跳过基线构建器的签名步骤。
资源代次保持：

```text
86d11aa273fdd8a7d9b62586fba7772610f767be463c2faf99964e722fe4cc25
```

| 资源包 | 字节数 | SHA-256 |
| --- | ---: | --- |
| media | 78,902,978 | `538a0c5ef12b1db536a2da410976864339a1dd1808e85dcf4d2b0ac723838b26` |
| data | 9,447,636 | `266786dc8a9957f60f7700daacfe7ea5772adb3b2c2820724684818ac1b90b50` |
| fonts | 14,461,386 | `1a18e395a4ba6a6b939d992d896fa7067f9c82edadfc19389743678890c381ee` |

个人数据库、备份 v3 和 v1/v2 迁移保持兼容。
应用身份、生产 origin、公钥、更新频道与 IPC 名称不变。
任务与技能保持独立懒加载，表单草稿保持应用级生命周期。
本次未重新生成资料、采集 Wiki、翻译或刷新发布例外。

## 验证边界

Windows x86/x64 与 macOS arm64 的 CI 路径已更新。
本次未运行远端三平台 CI，也未构建新安装包或验收已安装程序。
本机只有 Xcode Command Line Tools，缺少完整 Xcode。
Workers 验证使用本地浏览器回归与部署演练。
本次未推送、合并、部署 Worker，或发布程序与资源。
