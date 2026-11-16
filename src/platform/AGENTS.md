# platform/
> L2 | Parent: ../AGENTS.md

index.ts: 桌面能力适配；备份、外链和窗口语言。
auto-backup.ts: 合并个人记录变更；按间隔重试本地快照。
resources.ts: 签名资源命令与状态订阅；供资源入口使用。
update-controller.ts: 全局更新生命周期；合并启动和手动操作。
desktop-updates.ts: Tauri 命令与进度事件适配；提供进程级更新单例。
restart.ts: 个人记录写入队列；备份屏障阻止未保存数据重启。

[PROTOCOL]: Update this header on change, then check AGENTS.md
