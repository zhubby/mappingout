# scripts/wiki/
> L2 | Parent: ../AGENTS.md

client.mjs: Wiki HTTP 与代理、节流、快照索引接口。
wikitext.mjs: 模板、链接与纯文本解析。
tables.mjs: Wiki 表格与跨行跨列解析。
fetch.mjs: 标题快照采集命令。
fetch-features.mjs: 护甲与活动来源发现及采集。
fetch-quests.mjs: 常驻 PvE 任务分类、区域目录与固定修订采集。
quest-content.mjs: Wiki 分节、奖励单位、gallery 与模板默认路线图编译。
quest-graph.mjs: 任务前置表达式、并行分支和推荐阅读顺序。
quest-support.mjs: 固定玩法指南、精英区子任务及 NPC 操作指示补充。
compile-quests.mjs: 固定快照编译为独立任务资料与完整覆盖审计。
fetch-quest-images.mjs: 路线图媒体采集、缩图、文件修订与版权声明。
translate-quests.mjs: 公开任务和技能辅助译文、技能术语归一；保留待审。
fetch-quest-expansions.mjs: 奖励表格模板展开与固定修订证据采集。
fetch-armor-images.mjs: 护甲男女预览图采集与缩图。
fetch-profession-icons.mjs: 职业图标采集及 GFDL 声明校验。
fetch-material-icons.mjs: 材料原始 PNG 采集与 ArenaNet 来源校验。
compile.mjs: 地图资料校订编译入口。
apply.mjs: 将已审查校订写入公共资料。
compile-content.mjs: 对象资料校订编译。
compile-features.mjs: 护甲配方、材料图标与活动周期编译。
compile-skills.mjs: 技能事实编译。
armor-facts.mjs: 护甲信息框、制作商与材料配方解析。
content-facts.mjs: Wiki 引用与对象事实解析。
source-facts.mjs: 来源字段解析。
skill-facts.mjs: 技能参数与模式解析。
skill-library-facts.mjs: 玩家可学习边界与固定模板逐等级成长编译。
fetch-skill-library.mjs: 职业目录、版本目录、分类及成长模板固定采集。
skill-effects.mjs: 资源语义、固定效果符号与护甲指标、成长说明块编译。
compile-skill-library.mjs: 全技能离线编译、版本身份与覆盖报告。
fetch-skill-library-images.mjs: 原始技能图标、七种资源图标和文件修订采集。
collector-facts.mjs: 收藏家兑换事实解析。
location-facts.mjs: 区域事实解析。
boss-evidence.mjs: Boss 来源证据解析。
weapon-evidence.mjs: 武器来源证据解析。
build-matching.mjs: 旧记录与 Wiki 标题匹配。
audit-armor.mjs: 护甲单件配方与独立总计审计。
audit-bosses.mjs: Boss 身份与来源审计。
audit-collectors.mjs: 收藏家兑换审计。
audit-icons.mjs: 技能图像来源审计。
audit-references.mjs: Wiki 修订与快照审计。
audit-weapons.mjs: 武器身份与来源审计。
translations.mjs: 中文校订查询。
translations.json: 技能中文校订与绑定修订。
additional-item-identities.json: 补充物品身份输入。
additional-item-reviews.json: 补充物品审查输入。
boss-disambiguation.json: 同名 Boss 区分规则。
boss-reviews.json: Boss 人工审查输入。
collector-reviews.json: 收藏家人工审查输入。
quest-reviews.json: 任务审查输入。
reviewed-content.json: 已审查对象校订输入。
reward-reviews.json: 奖励校订输入。
skill-titles.json: 技能标题输入。
special-reviews.json: 特殊对象校订输入。
story-guides.json: 剧情指引输入。
supplemental-identities.json: 补充对象身份输入。
supplemental-reviews.json: 补充对象审查输入。
weapon-disambiguation.json: 同名武器区分规则。
weapon-exclusions.json: 排除武器与原因。
weapon-reviews.json: 武器人工审查输入。
zone-reviews.json: 区域人工审查输入。
zone-titles.json: 区域标题输入。

[PROTOCOL]: Update this header on change, then check AGENTS.md
