# src/
> L2 | Parent: ../AGENTS.md

App.tsx: 应用编排；搜索框置顶、三级地图导航、个人写入与更新弹窗。
DesktopUpdates.tsx: 启动延期安装、更新进度和二选一弹窗。
DesktopPanel.tsx: 客户端备份、资源与手动程序更新入口。
ResourcePanel.tsx: 离线资源检查、导入、修复与重启。
ResourceGate.tsx: 生产桌面资源准备与固定会话确认。
main.tsx: React 挂载；区分桌面启动与网页缓存。
storage.ts: IndexedDB 事务、个人备份校验和迁移。
domain.ts: 资料查询、筛选、地图定位与角色进度。
types.ts: 地图资料和个人记录共享类型。
AtlasMap.tsx: Leaflet 图片地图、标记、笔记与职业图例浮框。
WikiDetails.tsx: Wiki 来源、原始资料与剧情展示。
LocalDocument.tsx: 本地 JSON 和许可文本阅读。
ArmorWorkshop.tsx: 带职业与材料图标的配方、个人计划和制作进度。
ActivityCalendar.tsx: 活动与时区菜单、轮换和角色完成记录。
features-domain.ts: 护甲计算与活动周期领域规则。
feature-types.ts: 护甲、材料图标和活动资料类型；兼容旧资源。
feature-ui.tsx: 护甲与活动共用界面组件。
quest-types.ts: 任务攻略、结构化内容、前置表达式与角色记录契约。
skill-types.ts: 全技能目录、模式、资源和逐等级效果契约。
skill-query.ts: 双语及科学计数值解析、嵌套效果分项匹配和名称排序。
skill-params.ts: 应用与技能页共享地址参数、安全等级和多选解析。
SkillLibrary.tsx: 技能目录、查询防抖、地址恢复和懒加载入口。
SkillFilters.tsx: 多选分面、资源范围和独立属性及称号等级。
SkillDetails.tsx: 匹配版本详情、成长、对照与清除旧难度的任务导航。
skill-ui.tsx: Wiki 资源图标、效果值与双语标签共用呈现。
skills.css: 双栏检索、版本对照和手机技能目录样式。
quests-domain.ts: 三态前置判断、双语检索与原子任务记录变更。
quest-storage.ts: 任务记录和角色条件的导入校验与纯对象复制。
QuestGuides.tsx: 任务目录、双语检索、角色筛选与下一步建议。
QuestArticle.tsx: 结构化攻略、前置确认、奖励进度和路线图放大。
quests.css: 任务双栏、路线图、手机目录和可横向滚动的奖励表。
Select.tsx: 全应用单选菜单；可选图标、分组、键盘和触摸交互。
select.css: 单选菜单的主题、浮层与可访问状态样式。
professions.ts: 职业标签、颜色与图标。
styles.css: 应用主题、布局、按钮和弹窗。
desktop.css: 客户端设置、资源准备和更新状态布局。
features.css: 护甲与日历视图布局。
profession-markers.css: 职业标记配色、图例按钮与两行五列浮框。
platform/: 桌面能力与重启数据屏障。
i18n/: 界面翻译、资料投影与本地字体。
assets/: 职业图形静态输入。

[PROTOCOL]: Update this header on change, then check AGENTS.md
