# MappingOut Windows 客户端

采用 Tauri 2，复用 React / TypeScript / Leaflet。Web 与桌面共用业务、资料和备份格式，构建产物分别为 `dist/` 与 `dist-desktop/`，互不覆盖。

## 开发和构建

需要 Node.js 24+、Rust stable（MSVC）、Visual Studio C++ Build Tools 和 Windows SDK。Windows 运行时需要 WebView2。Rust 可通过 https://rustup.rs 安装，首次 Cargo 构建需下载依赖。

```powershell
npm.cmd ci
npm.cmd run desktop:dev
npm.cmd run desktop:build
# 正式版：启用 GitHub Releases 更新与更新签名
npm.cmd run desktop:build:release
# 安装过程也无需联网：将 WebView2 离线安装器一起打包，体积更大
npm.cmd run desktop:build:offline
```

默认构建当前架构。Windows x64 NSIS 安装包在 `src-tauri/target/release/bundle/nsis/`。默认按当前用户安装，无需管理员权限；选择安装语言后可创建桌面快捷方式。缺少 WebView2 时普通安装包下载运行时；离线安装包携带运行时。两者安装完成后的地图与资料均完整离线可用。

`desktop:frontend:build` 校验资料、编译前端并移除桌面不使用的 Service Worker 和 Cloudflare 响应头文件。不需要本地 HTTP 后端。应用标识 `dev.zhubby.mappingout`、主窗口标签 `main` 和生产 origin 应保持稳定，以保留 WebView IndexedDB。

## 存储与恢复

个人记录保留现有 IndexedDB v2，事务和 v1 数据迁移逻辑不变。客户端与浏览器不共享数据库；使用现有 JSON 备份迁移。导入仍先校验并预览，未知格式或损坏文件不会替换当前记录。

客户端自动备份位于 `%APPDATA%/dev.zhubby.mappingout/backups/`，可在“客户端设置”打开实际目录。首次加载后生成一次快照；后续变更合并后每 10 分钟最多生成一次。写入失败一分钟后重试，并显示持续提示。自动备份与恢复前备份分别保留最近 20 份。

确认恢复时，在应用写入队列内读取最新已提交数据，先原子保存恢复前备份，再替换数据库。保存恢复前备份失败则不执行替换。备份目录列表可预览恢复。导出使用原生保存对话框，取消不会提示成功。手动导入最大 20 MB，支持中文及带空格路径。

自动备份在应用运行期间执行；关闭应用后 IndexedDB 保留最新已提交记录。同机备份不代替异地备份。卸载时不要主动删除用户数据；重装使用同一应用标识恢复已有数据库。

## 签名更新与发布

默认开发构建不配置远端更新，界面明确显示手动更新。正式构建使用更新配置合并文件，其中只包含公钥和 HTTPS endpoint；签名私钥放在仓库外。

```powershell
# 仅首次生成，务必安全备份；不要覆盖已发布应用使用的密钥
node scripts/desktop.mjs signer generate --ci -w C:/安全目录/updater.key

# 私钥仅通过环境变量提供；不要提交到 Git
$env:TAURI_SIGNING_PRIVATE_KEY = 'C:/安全目录/updater.key'
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
node scripts/desktop.mjs build --config src-tauri/tauri.updater.conf.json
npm.cmd run desktop:release -- --base-url https://你的域名/desktop/
```

仓库的 `tauri.updater.conf.json` 已配置 `zhubby/mappingout` GitHub Releases 的 latest 清单。发布时使用带版本 tag 的下载地址生成清单：

```powershell
npm.cmd run desktop:release -- --base-url https://github.com/zhubby/mappingout/releases/download/desktop-v1.0.0/
```

将 `releases/1.0.0/` 中发布文件上传到对应 Release，发布为正式 latest release。客户端通过 `https://github.com/zhubby/mappingout/releases/latest/download/latest.json` 检查更新。

其他部署的更新配置格式：

```json
{
  "bundle": { "createUpdaterArtifacts": true },
  "plugins": {
    "updater": {
      "pubkey": "生成的 .pub 文件内容",
      "endpoints": ["https://你的域名/desktop/latest.json"]
    }
  }
}
```

发布脚本要求安装包与 `.sig` 存在且版本唯一，输出到 `releases/<版本>/`：安装包、签名、`latest.json`、SHA256 校验文件。先上传安装包与签名，最后更新清单，避免客户端看到不完整发布。下载地址应长期保留或使用带版本文件名。发布前验证 HTTPS 返回 JSON 与正确安装包，清单使用短缓存或不缓存。

更新界面由用户主动检查、下载安装，并选择重启。下载前和重启前保存最新本地备份，签名校验由 Tauri updater 执行。更新签名不等同于 Windows Authenticode 代码签名；未配 Windows 代码签名证书的安装包可能显示未知发布者。

当前 NSIS 安装器启用了语言选择。更新已下载并校验后，点击“保存备份并安装重启”，在安装器中确认语言即可继续安装并重启；该流程包含原生确认窗口，并非全程静默。GitHub 访问受网络环境影响，下载失败时可以重试，地图和现有记录仍可离线使用。

版本同时维护 `package.json`、`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json`。每次发布递增语义版本。不要更换应用标识、公钥或生产 origin；更换公钥需另行设计迁移。

GitHub Actions 工作流 `.github/workflows/desktop.yml` 在推送 `desktop-v<版本>` tag 后构建、测试、上传并发布；手动触发只生成构建产物。使用前在仓库 Actions secrets 配置 `TAURI_SIGNING_PRIVATE_KEY`（私钥文件内容），若私钥设置密码则额外配置 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。密钥必须与已发布客户端内的公钥匹配。

## 验证

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run desktop:frontend:build
# Rust 原生备份与路径边界测试
& "$env:USERPROFILE/.cargo/bin/cargo.exe" test --manifest-path src-tauri/Cargo.toml
```

安装验收包括：首次断网启动、全部地图资源、角色进度重启保留、中文路径导入导出、损坏备份拒绝、恢复前备份、覆盖安装数据保留、单实例、窗口状态、外链系统浏览器、100/150/200% 缩放和更新失败提示。客户端的本地报告与许可证在应用内阅读，避免导航离开应用。

实际验收结果与尚未完成的发布检查见 [desktop-verification.md](desktop-verification.md)。

CI 同时构建普通版和完整离线版。手动构建时，先将普通版及签名复制到独立目录，再运行 `npm run desktop:build:release -- --config src-tauri/tauri.offline.conf.json`。离线构建会覆盖同名 NSIS 输出，因此必须先保留普通版。发布脚本的 `--bundle-dir` 指向保留普通版的目录，`--offline-installer` 指向新生成的离线安装包；脚本自动重命名离线版及签名，并为两个安装包生成校验值。完整发布目录共六个文件，自动更新清单仍指向普通版。
