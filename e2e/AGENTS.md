# e2e/
> L2 | Parent: ../AGENTS.md

app.spec.ts: 职业图例浮框、地图、角色、笔记和备份回归。
features.spec.ts: 双语职业与材料图标、已访问资源离线和计划回归。
i18n.spec.ts: 简体偏好迁移、繁英界面、来源状态、字体及手机截图。
loading.spec.ts: 真实 HTTP 字节流进度、繁英窄屏、减弱动效与失败重试。
worker.spec.ts: Workers 分发验收入口，复用 distribution.ts。
distribution.ts: Workers 与容器共用 HTTP、404、首次地图离线和缓存升级断言。
container.spec.ts: HTTP Crypto 缺失、分发特性和同一 origin 重建后的角色保留。
select.ts: 通过可见选项操作自定义菜单的共用测试步骤。
dropdowns.spec.ts: 三级地图导航、空值联动、键盘与手机边界回归。
quests.spec.ts: 任务、日历延迟、全量离线与首次接管前已访问模块缓存。
skills.spec.ts: 繁体查询提示、点数及称号检索、成长、任务跳转和离线回归。
desktop-updates.fixture.ts: 测试 IPC、检查就绪与进度事件；保留真实界面和 IndexedDB。
desktop-updates.spec.ts: 更新弹窗、聚焦延迟、任务备份屏障与延期启动回归。

界面定位器与断言跟随繁英审校措辞。
简体查询用例保留旧名称与语法兼容验证。

[PROTOCOL]: Update this header on change, then check AGENTS.md
