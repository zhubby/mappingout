# resources/
> L2 | Parent: ../AGENTS.md

mod.rs: 签名模型与固定会话；启动时兼顾程序更新固定资料。
transfer.rs: 频道请求、资源下载、校验解压与保留清理。
commands.rs: Tauri 资源命令与离线导入对话框。
updates.rs: 程序更新兼容资源准备；延期期间阻止清理目标资源。
tests.rs: 固定签名和本地 HTTP 的行为回归。

[PROTOCOL]: Update this header on change, then check AGENTS.md
