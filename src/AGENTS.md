# src/
> L2 | Parent: ../AGENTS.md

App.tsx: 应用编排；个人写入队列、编辑延迟和更新弹窗。
DesktopUpdates.tsx: 启动延期安装、更新进度和二选一弹窗。
DesktopPanel.tsx: 客户端备份、资源与手动程序更新入口。
ResourcePanel.tsx: 离线资源检查、导入、修复与重启。
ResourceGate.tsx: 生产桌面资源准备与固定会话确认。
main.tsx: React 挂载；区分桌面启动与网页缓存。
storage.ts: IndexedDB 事务、个人备份校验和迁移。
domain.ts: 资料查询、筛选、地图定位与角色进度。
types.ts: 地图资料和个人记录共享类型。
AtlasMap.tsx: Leaflet 图片地图、标记和笔记交互。
WikiDetails.tsx: Wiki 来源、原始资料与剧情展示。
LocalDocument.tsx: 本地 JSON 和许可文本阅读。
ArmorWorkshop.tsx: 护甲计划、材料与制作进度界面。
ActivityCalendar.tsx: 活动轮换、时区与按角色完成记录。
features-domain.ts: 护甲计算与活动周期领域规则。
feature-types.ts: 护甲和活动资料类型。
feature-ui.tsx: 护甲与活动共用界面组件。
professions.ts: 职业标签、颜色与图标。
styles.css: 应用主题、布局、按钮和弹窗。
desktop.css: 客户端设置、资源准备和更新状态布局。
features.css: 护甲与日历视图布局。
profession-markers.css: 地图职业标记配色。
platform/: 桌面能力与重启数据屏障。
i18n/: 界面翻译、资料投影与本地字体。
assets/: 职业图形静态输入。

[PROTOCOL]: Update this header on change, then check AGENTS.md
