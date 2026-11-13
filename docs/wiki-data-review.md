# Guild Wars Wiki 内容校订

来源为 [Guild Wars Wiki](https://wiki.guildwars.com)。本轮从固定修订快照整理资料，应用正常构建与运行不访问 Wiki，也不执行旧 EXE。Wiki 是社区维护的资料来源；“Wiki 核对”表示列出的字段已对照相应修订，不表示游戏内实测。

## 本轮审查范围

| 内容 | 已接入内容核对 | 旧库总条目 | 范围 |
| --- | ---: | ---: | --- |
| 技能 | 381 | 381 | 对应身份、现行效果、职业、属性、类型、消耗、施放、冷却、获取方式；54 条有独立 PvP 说明 |
| Boss / 来源 | 1,183 | 1,183 | 按记录审查 NPC、任务、宝箱、兑换与组合来源；一条旧 NPC 身份无法确认，显式标注 |
| 装备 | 697 | 697 | 类型、弓种、需求、加成及来源；区分独特武器、随机属性装备、普通物品与多个版本；一条旧物品身份无法确认 |
| 收藏家 | 350 | 350 | NPC 身份与篇章、实际兑换子表、材料数量、护甲 / 武器 / 物品分组及英文奖励属性 |
| 宠物 | 32 | 32 | 对应物种、等级与特殊驯服条件；旧地点并未全部确认 |
| 宝藏 | 12 | 12 | 类型、所在区域、钥匙需求、奖励衰减及重开间隔的不确定性 |
| 区域 | 367 | 366 | 逐条身份与实例类型、所属地区、相邻出入口、清剿资格；另补入独立的莱苏皇宫探索版本 |
| 剧情 | 4 篇章 | 原库未收录 | 中文摘要、关键任务、替代路线和并列流程，按章节折叠以隐藏剧透 |

技能中 31 条已接入经修订号约束的中文效果，其余 350 条优先显示当前英文原文并标注语言。旧中文说明和名称保留在详情折叠区并参与搜索。本轮核对的是应用展示的资料字段，不是游戏内实测、中文翻译全覆盖或地图像素坐标核验。

无法确认身份的两条旧记录为 `boss:3:88b8bb7965eba2a1`（旧名“未知”，关联 Hundred Blades）和 `green:4:fa6b4893b980e1a7`（旧名“火之刃”，仅写“剑、鉴定获取属性”）。这两条均列入来源审查覆盖，但 `wiki.identityStatus` 为 `unresolved`，不计作已确认身份。详情和公开报告说明证据缺口，不将其替换成猜测的 NPC 或武器。

1,183 条 Boss 地点记录可整理为 787 个“篇章 + 旧中文名”组，但同组不一定是同一 NPC。例如 The Afflicted Huan 和 Emissary of Dhuum 需按职业区分。核对按稳定记录 ID 进行，结合区域、主副职业、技能获取列表与 NPC 技能表；`boss-reviews.json` 固定已确认的身份和来源修订。`boss-audit.json` 中的候选本身不表示已核对；数处唯一技能 / 区域候选仍因旧姓名不对应而被排除。

旧库的“绿装”分类实际混有副本宝箱中的随机属性装备，因此界面改称“装备”，URL 和旧 `green:` ID 保持兼容。随机外观不再显示一套保证掉落的数值；Bonecage Scythe 的随机版本与 Mutant Ooze 掉落的独特版本分别保留。Droknar 的盾牌保留四种属性版本，Golden Boar Scepter 的职业 / 收藏家 / 属性表保留行合并关系。收藏家奖励经常位于 `/Collector` 或护甲子页面，只核对主页面不足以确认兑换属性。

50 条旧“Boss”记录实际为技能任务来源。详情保留接取人、接取地点、前置与奖励，并区分 Prenuptial Disagreement 的男女角色分支。22 条旧 Boss / 副本奖励组按实际宝箱改写，包括六条 Mallyx 记录；普通与困难模式奖励规则按每个宝箱来源展示。Droknar’s Key 在 Epilogue 的职业宝箱收藏家处兑换，不能当成 Boss 掉落。Executioner Vekil 被 Wiki 列为不会刷新的历史内容；Eshau Longspear 的旧地点与当前来源有矛盾。

上述任务、宝箱和存在矛盾的来源保留原坐标，使用 `positionStatus: unconfirmed`、`valid: false` 暂停绘制；共享地点 ID 的技能与装备也同步停用标记。数据查询继续保留历史区域筛选，以便查找旧记录，但不会把这些位置当作新来源的实际坐标。

收藏家采用固定来源修订的结构化核对。Kaya 区分三章收藏家与二章任务 NPC；三个 Smuggler 按职业及 1 / 3 / 5 个 Kournan Coin 分开对应。兑换表按材料数量、实际表头及旧记录奖励组匹配，保留 Innis the White 的护甲 / 武器混合表、Monastery Quartermaster 同价但不同奖励的分组，以及价值列为空的武器加成。收藏家奖励未全部翻译为中文，以 Wiki 英文属性为准。

区域校订修正五个旧清剿目标：Divine Path 是通关奖励区域，Churrhir Fields 是训练区域，Battledepths 明确不能清剿，Shards of Orr 是地下城，“四章通关”是旧版自定义标记。Skyward Reach 的额外旧标记没有独立实例证据，继续保留旧 ID，暂停绘制且不另设第二个清剿目标。旧名“申赞通道（任务）”修正为孙江行政区任务；Shenzun Tunnels 的探索区域单独保留。地标、港口、PvP 竞技场、主线任务与地下城分别显示其实际类型。

Raisu Palace 主线任务和探索版本是不同实例。旧库仅单列任务，因此补入 `zone:gww:10970` 探索版本，引用页面 ID 10970、修订 2699046。该版本需完成主线后由 Imperial Sanctum 前哨站进入，不能从 Raisu Palace 前哨站逆向进入；只有探索版本提供清剿进度。新增资料有所属地图分组，支持地区筛选，但没有经过核对的旧地图坐标，保持无位置。当前 136 个清剿目标对应 136 个不同 Wiki 区域页：预言 54、盟与敌 33、黑暗逆袭 34、北方之眼 15。旧角色中曾对错误目标记录的个人数据不会删除或改写，仍可备份。

## 证据与修正

- `data/wiki/pages/<pageid>.json` 保存标题、页面 ID、修订号、修订时间、原始 Wikitext、抓取时间与固定修订链接。
- `scripts/wiki/skill-titles.json` 按旧技能代码保存英文对应；旧代码并非游戏内技能 ID。相同 Wiki 实体的不同旧条目继续保留独立稳定 ID。
- `scripts/wiki/translations.json` 的每段中文效果绑定已核对的来源修订；来源更新后编译会拒绝沿用旧翻译。
- `scripts/wiki/reviewed-content.json` 与 `story-guides.json` 保存已逐项确认的内容和修订约束。刷新来源不会自动提升候选为已核对内容。
- `scripts/wiki/collector-reviews.json` 固定 350 条收藏家的 NPC / 子表修订与所选兑换组；`data/wiki/collector-audit.json` 保留解析结果。来源变化或分组不唯一时编译失败。
- `scripts/wiki/boss-reviews.json` 与 `weapon-reviews.json` 固定逐记录的身份、来源修订及交叉依据；`boss-disambiguation.json` / `weapon-disambiguation.json` 明确区分同区域同技能 NPC、同 Boss 的不同弓和同类武器。不会把尚未确认的候选直接显示为当前资料。
- `supplemental-reviews.json`、`quest-reviews.json`、`reward-reviews.json` 与 `special-reviews.json` 固定其他 NPC、任务分支、宝箱和组合来源；`additional-item-identities.json` / `additional-item-reviews.json` 固定补充物品身份、来源、版本与旧属性差异。新增快照不会自动更改这些映射。
- `data/wiki/skill-icon-comparison.json` 用于技能身份辅助比对。58 像素旧图对应 64 像素 Wiki 图的内部区域；周年、旧图不匹配及重复记录的例外另有说明。图像相似度本身不证明游戏机制。
- `public/data/wiki-review.json` 是随网站发布的覆盖报告；未核对的条目在详情中明确标注。`public/data/catalog.json` 将资料和个人数据分开，个人备份格式仍是版本 1。
- `scripts/wiki/zone-reviews.json` 固定全部 366 条旧区域的身份、修订、类型、所属地区与清剿证据。`location-facts.mjs` 读取实际模板，不把所有探索区域、地下城或主线任务当作可清剿区域。
- `data/wiki/source-audit.json` 记录 3,027 个实际引用修订的原文哈希：先将本地 Wikitext 与快照 SHA-1 比较，再通过 Wiki API 逐条比较页面 ID、标题、修订号、时间与 SHA-1。哈希核验验证原文真实性，不等于游戏内实测或对每段翻译的独立证明。

本轮修正包括 Hundred Blades 的冷却、Energy Surge 的范围伤害比例、Devastating Hammer 的攻击类型、Flint 长杖对所有咒文的回复加成、七彩凤凰初始等级、鹤的等级、狮群任务条件，以及红色 Lurker 和蓝色 Reef Lurker 的身份区别。Flint 旧备注中的十个出生点改为 Wiki 记录的四个；旧备注继续保留。

NPC 提取保留主、副及第三职业，覆盖周年精英技能 Boss；`NPC infobox` 中的 `boss` 标记、大小写职业名及单数 Mission 标题按实际含义处理。Krak Flamewhip 的旧 Dwarven Battle Stance 关联与现有资料冲突，详情已说明其 Jaga Moraine 版本实际使用 Devastating Hammer，且没有 Boss 光环。跨区域 / 模式的技能分组保留英文条件，避免把不同版本的技能当成同一套配置。完整技能与出现条件对有、无子标题的列表均可展开，保留 Root Behemoth 的困难模式限定、The Afflicted Senku 的任务限定和 Oni 的等级限定；汇总列表不表示所有版本同时具有全部技能。

所有旧记录 ID、地点 ID、章节与像素坐标均保持兼容。`data/wiki/legacy-identities.json` 保存校订前 ID 与坐标的 SHA-256 指纹，测试比较全部旧记录；新增 Wiki 区域采用独立 ID，且不借用旧实例坐标。地点出现条件的文字修正不会被解释成像素坐标已经核验。

## 更新与构建

使用 Node.js 24 或更新版本。PowerShell 下用 `npm.cmd` / `node`。

```powershell
$env:WIKI_PROXY = 'http://127.0.0.1:7890'
node scripts/wiki/fetch.mjs skills
node scripts/wiki/fetch.mjs collectors
node scripts/wiki/fetch.mjs story
```

抓取按批次节流并遵循 API 的 `maxlag`，只读访问。不要同时启动多个抓取进程；需要更新快照时显式附加 `--refresh`。抓取失败不会将未返回的页面当成已核对内容。

```powershell
npm.cmd run wiki:compile
npm.cmd run wiki:apply
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e:worker
```

重新核验引用的快照原文，可运行 `node scripts/wiki/audit-references.mjs`；加 `--remote` 会通过 `WIKI_PROXY` 指定的代理逐批与 Wiki API 比较，并在全部通过后更新 `data/wiki/source-audit.json`。普通构建和测试不联网。

`wiki:compile` 从快照编译已核对内容，不联网；`wiki:apply` 应用到部署资料并生成覆盖报告。`build:data` 在原始转换后应用同一组修正。普通 `build` 使用已提交的 `public`，不依赖原始 Campaign 文件或联网补全。

验证覆盖来源模板解析、修订翻译约束、当前效果差异、全量 ID 与坐标兼容、备份往返、重复应用、无效来源拒绝、中英文查询、PvP 详情、技能学习分类、任务性别分支、宝箱分类、多个版本、未确认标记停用、剧情分支及原有角色 / 地图 / 离线流程。测试验证转换与应用行为；来源本身仍是社区资料，后续更新需重新审阅固定修订。

## 署名与授权来源

Wiki 原创贡献版权归各贡献者，按 [GFDL 1.3 或后续版本](../public/licenses/gfdl-1.3.txt) 使用。每项快照和应用详情链接到来源固定修订及贡献历史；完整快照是可检查的透明副本，本目录的整理、翻译和摘要是对相应来源的改编。源站条款见 [Guild Wars Wiki:Copyrights](https://wiki.guildwars.com/wiki/Guild_Wars_Wiki:Copyrights)。

游戏描述、地图、图标及其他 ArenaNet 内容不因出现在 Wiki 上而变成 GFDL 素材，其权利仍归 ArenaNet / NCSOFT 或各自权利人。GNU 许可证只应用于符合该授权的 Wiki 原创文字，不替代游戏资产原有权利归属。
