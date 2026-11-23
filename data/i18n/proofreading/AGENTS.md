# proofreading/
> L2 | Parent: ../AGENTS.md

skills.json: 技能正文语义校对；绑定英文正文与固定修订。
quests.json: 任务攻略语义校对；保留前置条件、对象与分支。
catalog-calendar.json: 地图、NPC 与轮换语义校对；核对游戏概念。
source-cleanup.json: sic 隔离后的技能与轮换重译；核对数值与作用对象。
quest-source-cleanup.json: 奖励比较符、分节、技能授予与更新来源的任务重译。
revision-refresh.json: 十二页来源更新后的新正文、装备属性与获技能条件。
armor-pass-2.json: 第二轮護甲配方、材料與製作限制校對。
quest-pass-2.json: 第二輪任務攻略與失敗條件校對。
skill-pass-2.json: 第二輪技能正文、動態模板與同源地圖說明校對。
catalog-pass-2.json: 第二輪名稱、技能類型與輪換說明校對。
coverage.json: 全量文本校对覆盖、未审范围与风险分类。

条目记录 source、text、reason 与 bindings。
bindings 使用 dataset、key、englishHash 和 evidenceHash。
每条审读必须逐项比较英文与现有繁体文本。
未修改条目也保留 reason，不以自动规则授予审读。
代理审读不等同人工批准或游戏内截图核验。
英文正文或修订证据变化时，绑定失效。

[PROTOCOL]: Update this header on change, then check AGENTS.md
