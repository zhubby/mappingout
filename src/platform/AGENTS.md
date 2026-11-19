# platform/
> L2 | Parent: ../AGENTS.md

index.ts: 桌面能力适配；备份、外链和窗口语言。
auto-backup.ts: 合并个人记录变更；按间隔重试本地快照。
resources.ts: 签名资源命令与状态订阅；供资源入口使用。
update-controller.ts: 全局更新生命周期；合并启动和手动操作。
desktop-updates.ts: Tauri 命令与进度事件适配；提供进程级更新单例。
restart.ts: 个人记录写入队列；备份屏障阻止未保存数据重启。
offline-preparation.ts: Web 离线任务消息客户端；校验 HTTPS，转发进度、结果和取消。
OfflinePreparation.tsx: Web 全量离线准备入口；卸载时取消任务，并显示进度、失败和重试。
offline-preparation.css: 全量离线准备入口的局部布局；沿用应用按钮主题。

[PROTOCOL]: Update this header on change, then check AGENTS.md
