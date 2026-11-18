# e2e/
> L2 | Parent: ../AGENTS.md

app.spec.ts: 职业图例浮框、地图、角色、笔记和备份回归。
features.spec.ts: 双语职业与材料图标、离线配方和计划回归。
i18n.spec.ts: 双语界面、来源原文与语言持久化。
worker.spec.ts: Workers 分发验收入口，复用 distribution.ts。
distribution.ts: Workers 与容器共用 HTTP、404、首次地图离线和缓存升级断言。
container.spec.ts: HTTP Crypto 缺失、分发特性和同一 origin 重建后的角色保留。
select.ts: 通过可见选项操作自定义菜单的共用测试步骤。
dropdowns.spec.ts: 三级地图导航、空值联动、键盘与手机边界回归。
quests.spec.ts: 任务检索、角色奖励、前置、备份、日历与未访问路线图离线回归。
skills.spec.ts: 科学计数范围、护甲惩罚、任务跳转、图标和手机离线回归。
desktop-updates.fixture.ts: 测试 IPC 与进度事件；保留真实界面和 IndexedDB。
desktop-updates.spec.ts: 更新弹窗、聚焦延迟、任务备份屏障与延期启动回归。

[PROTOCOL]: Update this header on change, then check AGENTS.md
