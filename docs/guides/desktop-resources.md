# 客户端资源分发

程序保留 React 界面与原生功能；地图、图片、资料和字体从二进制中移出。资源准备完成后地图、查询、语言切换和个人记录均可离线使用。首次使用可联网下载，也可导入资源包。本方案替代每个程序版本重复打包、上传相同静态资料的方式，不改变生产应用标识 `dev.zhubby.mappingout`、Tauri origin 或个人 IndexedDB。

## 资源与版本

| 包 | 内容 | 当前 ZIP 大小 |
|---|---|---:|
| media | `public/assets/` 地图及图片 | 75.25 MiB |
| data | `public/data/`、许可文本，原始资料与中英文语言包共同更新 | 9.01 MiB |
| fonts | `public/fonts/` 字体与许可声明 | 13.79 MiB |

三种架构共用这三个包。包名为 `<kind>-<sha256>.zip`；ZIP 中顺序、时间和压缩参数固定，Git 文本资源使用 LF。只改翻译时媒体和字体包不变，仅下载资料包。代码变化不要求重新上传相同资源。

`resources.json` 是包含 Base64 payload 与 Minisign 签名的单文件封套。payload 包含 schema、客户端兼容范围、资源代号、每包 URL/字节数/SHA256，以及逐文件路径、大小与哈希。公钥固化于客户端 `desktop/resources.config.json`；私钥独立于程序更新签名。

GitHub Release 结构：

- `resources-pack-<sha>`：一个不可变 ZIP，任何后续版本复用原 URL。
- `resources-set-<generation>`：不可变的签名 `resources.json`，供离线导入。
- `resources-channel-v1`：可更新的签名 `channel.json`，按新到旧保留最多 100 个清单，并限制签名 payload 为 16 MB。客户端选择兼容自身版本的第一项。
- `desktop-v<version>`：程序安装包、更新签名与 `latest.json`，另附该程序的首次准备清单。

资源发布都设置 `latest=false`；只有程序 Release 成为 latest。频道最后上传，所有 ZIP 与清单先就绪；重试可恢复未完成草稿，已存在 ZIP 核对大小和 GitHub SHA256 后复用，绝不覆盖内容寻址包。

## 客户端生命周期

启动先验证本地签名、兼容范围与全部文件哈希，有完整资料就直接进入应用。没有资料时显示首次准备界面，可切换语言、取消和续传下载、重试或导入。程序内保留首次准备签名清单，资源频道暂时不可用时仍能尝试其固定 URL。

运行后最多每 24 小时自动检查一次，设置中也可手动检查。HTTP Range 续传；服务端不支持 Range 时从头下载。取消可中断等待响应和正文读取。下载后验证 ZIP 哈希，解压到临时目录并验证逐文件清单，拒绝越界路径、链接、重复项和未列出的文件，全部完成才登记新资料。

签名频道与对应 ETag 一起原子保存到 `channel.json`。重启时重新验证签名并恢复待下载版本；即使仍在检查间隔内、离线或服务器返回 304，也保留已知更新和续传依据。缺少可信频道缓存时不发送旧 ETag，也不因旧检查时间跳过请求。

本次会话固定使用同一资源代号。更新先放入 pending，下次进程启动生效；保留上一代，新的资料加载失败或启动未确认时，仅在上一代完整且兼容时回退。首次导入没有上一代，或程序升级后上一代不兼容时，保留完整的当前资料，允许再次离线启动并确认。启动确认针对固定会话，不等待后台网络操作；后台检查或下载期间刷新界面仍可读取当前资料。设置中的重启先保存个人备份。程序更新安装前也要准备适用于目标版本的资源；为未来版本准备的 pending 资源会保留到兼容的程序启动。

资源位于系统 app-local-data 的 `resources-v1/` 下。Windows 通常是 `%LOCALAPPDATA%/dev.zhubby.mappingout/resources-v1`，macOS 由系统应用数据目录提供。`objects/<sha>/` 保存已验证文件；`manifests/` 保存签名依据；`downloads/` 保留续传；`state.json` 保存 active/previous/pending、程序更新固定的 update 与检查时间，`channel.json` 保存签名频道和 ETag。延期程序更新所需的资源保留到新程序启动，详见 [自动更新](desktop-updates.md)。成功安装后清理未引用对象和冗余 ZIP，部分下载超过七天可回收。个人数据库与备份不放在这些目录。

从完整内置资源版迁移时首次准备一次外部资源，之后按包复用。不尝试从旧安装 EXE 提取资源，不迁移或重建个人记录。

## 完全离线安装

1. 在有网络的电脑下载程序安装包、对应资源集的 `resources.json`，以及其 payload 中列出的三个 ZIP，放在同一文件夹，文件名保持原样。
2. Windows 如未安装 WebView2，额外准备微软提供的对应架构 Evergreen Standalone Installer。默认程序安装包只内置引导器；macOS 使用系统 WKWebView。
3. 安装并启动程序，取消自动准备后点“导入离线资源”，选择 `resources.json`。先验证签名，再读取同目录 ZIP；导入过程不联网。
4. 准备完成后可以断网使用。下次启动优先读取已验证的本地资料。

`npm run desktop:build:offline` 仅将 WebView2 离线安装器加入 Windows 包，地图、资料和字体仍按以上方式单独导入；该开发命令不代表恢复资源内置发行渠道。

## 构建与发布

```sh
npm ci
npm run resources:build
npm run desktop:frontend:build
cargo test --manifest-path desktop/Cargo.toml
npm run desktop:build
```

Windows 原生界面验收使用独立应用标识，避免覆盖正式客户端和个人记录：

```sh
npm run desktop:build:resources-test
npm run test:resources:desktop
```

首次运行测试时，在弹出的客户端中导入 `releases/resources/resources.json`；测试脚本随后自动验证地图、语言、字体、功能页和重启后的记录，也会阻塞后台频道请求，在锁仍被占用时刷新界面并验证地图可用。测试代理拒绝其他网络请求；CDP 端口仅限该测试进程，测试结束后进程与代理关闭。已有 QA 资源缓存时会直接验证离线启动。

本地资源私钥默认读取 `~/.mappingout/keys/resources.key`，也可通过 `MAPPINGOUT_RESOURCE_PRIVATE_KEY` 和可选 `MAPPINGOUT_RESOURCE_KEY_PASSWORD` 提供。仓库仅保存公钥，私钥不得进入提交、安装包或日志。首次建库时 `node scripts/resources/init-key.mjs` 可初始化；已有公钥时必须恢复匹配的私钥，脚本拒绝静默换钥。需另行安全备份私钥；丢失后不能继续向现有客户端提供受信资源更新。

GitHub Actions 使用同名资源签名 secrets，与已有 `TAURI_SIGNING_PRIVATE_KEY` 独立。`desktop.yml` 先构建全部架构，发布资源，再发布程序。`resources.yml` 手动运行可独立发布兼容内容更新。两工作流共享并发锁，避免同时覆盖频道。

```sh
# 已通过发布检查且 GitHub CLI 已登录时
npm run check:release
npm run resources:build
npm run resources:publish
```

资源发布脚本和 CI 均执行 `check:release`，通过后才上传。资源拆包不代表资料复核完成或获得字体分发许可。1.3.0 按用户本次明确发布要求重新评估并记录限定本版的例外；1.2.0 的旧例外未沿用。版本、资料和待审项变化时重新评估，不能自动刷新例外来绕过检查。当前实施与验证记录见 [资源验收](../verification/desktop-resources-verification.md)。
