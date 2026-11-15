import fs from 'node:fs';
const en=JSON.parse(fs.readFileSync('src/i18n/en.json','utf8'));
const zh=JSON.parse(fs.readFileSync('src/i18n/zh-CN.json','utf8'));
const fixes={
  ' / Y ':' / Y ', ' · AR ':' · AR ', ' · 怒气 ':' · Adrenaline ', ' · 施放 ':' · Activation ',
  ' · 第 ':' · Line ', ' 个探索目标':' results', ' 个结果':' results', ' 个部位':' pieces',
  ' 个部位 · ':' pieces · ', ' 份制作方案':' crafting offers', ' 份制作计划':' crafting plans',
  ' 位角色':' characters', ' 位角色 · ':' characters · ', ' 条进度':' progress records', ' 种外观 · ':' armor styles · ',
  ' 秒':' s', ' 秒 · 冷却 ':' s · Recharge ', ' 行':' line', ' 金币':' gold',
  '60–80（依职业）':'60–80 (by profession)', 'Boss / 来源':'Boss / source',
  'NPC 来源备注（英文）':'NPC notes', 'PvE 每周奖励':'Weekly PvE bonus', 'PvP 每周奖励':'Weekly PvP bonus',
  'PvP 版本 · 英文原文':'PvP version', 'Wiki 校订资料 · 固定配方与制作费':'Wiki sources · Fixed recipes and crafting fees',
  'Wiki 核对 · {{v0}}':'Wiki source · {{v0}}', 'Wiki 核对来源':'Wiki references',
  'Wiki 的异常与机制备注（':'Bugs and mechanics (', 'Wiki 获取方式':'Skill acquisition',
  '{{v0}} {{v1}}已制作':'{{v0}} · {{v1}} crafted', '{{v0}} 个可定位地点':'{{v0}} mapped locations',
  '{{v0}} 白金 ':'{{v0}} platinum ', '{{v0}} 的活动':'Activities for {{v0}}',
  '一':'Mon', '二':'Tue', '三':'Wed', '四':'Thu', '五':'Fri', '六':'Sat', '日':'Sun',
  '世界地图':'World atlas', '主要功能':'Main navigation', '任务奖励':'Quest reward',
  '体力牺牲':'Health sacrifice', '保存制作计划':'Save crafting plan', '保存名称':'Save name',
  '保存备份并安装重启':'Back up, install and restart', '保存笔记':'Save note',
  '保存计划后，可在这里逐件记录制作进度。':'Save a plan to track each crafted piece here.',
  '修改角色名':'Rename character', '僧侣':'Monk', '元素':'Elementalist', '死灵':'Necromancer',
  '幻术':'Mesmer', '祭祀':'Ritualist', '圣言者':'Paragon', '神唤':'Dervish', '战士':'Warrior',
  '刺客':'Assassin', '游侠':'Ranger', '关键任务：':'Key missions: ', '冒险篇章':'Campaigns',
  '冷却':'Recharge', '创建角色以保存':'Create a character to save', '创建角色以记录':'Create a character to track',
  '创建角色后可记录每次战承轮换的完成状态。':'Create a character to track each Zaishen rotation.',
  '删除制作计划 {{v0}}':'Delete crafting plan {{v0}}', '制作{{v0}}':'Craft {{v0}}', '制作商：':'Armorer: ',
  '制作地点与防御等级':'Location and armor rating', '制作条件与说明（含英文）':'Crafting requirements and notes',
  '制作计划':'Crafting plan', '制作计划名称':'Crafting plan name', '制作计划已保存':'Crafting plan saved',
  '制作计划已变更，请刷新后重试。':'The crafting plan has changed. Refresh and try again.',
  '剧情指南':'Story guides', '匹配活动与下次日程':'Matching activities and upcoming dates',
  '十职业 · 全防御等级 · ':'Ten professions · All armor ratings · ', '原始编号 ':'Original ID ',
  '发现地点':'Locations', '取消标注':'Cancel note', '名称 / 地点':'Name / location', '含剧情剧透':'Story spoilers',
  '周期预测':'Predicted', '回到当前活动':'Current activities', '地区':'Region', '地区地图':'Regional maps',
  '区域':'Zone', '地图':'Map', '地图图层':'Map layers', '地图地区':'Map region',
  '地图图片暂不可用；请联网访问此地区后重试。':'The map image is unavailable. Restart the application or reinstall the offline package.',
  '地图对应关系待确认':'Map identity unconfirmed', '地点备注来源':'Location source', '坐标待核实':'Unverified coordinates',
  '头部':'Head', '身体':'Chest', '手部':'Hands', '腿部':'Legs', '足部':'Feet', '女性':'Female', '男性':'Male',
  '女性外观':'Female preview', '男性外观':'Male preview', '完整技能与出现条件（英文）':'Skills and appearance conditions',
  '宝藏':'Treasures', '宠物':'Pets', '客户端':'Desktop', '客户端设置':'Desktop settings',
  '尚未创建角色':'No character selected', '展开属于它的探索档案。':'and open its field notes.',
  '怒气':'Adrenaline', '战承任务':'Zaishen Mission', '战承悬赏':'Zaishen Bounty', '战承战斗':'Zaishen Combat',
  '战承清剿':'Zaishen Vanquish', '战承任务 · 旅者尼古拉斯 · 每周奖励':'Zaishen quests · Nicholas the Traveler · Weekly bonuses',
  '战承：每天 UTC 16:00':'Zaishen: daily at 16:00 UTC', '所有属性':'All attributes', '所有篇章':'All campaigns',
  '所有职业':'All professions', '所有职业与通用':'All professions and common armor', '所有防御值':'All armor ratings',
  '技能导师':'Skill trainer', '技能点 · 职业图例':'Skill locations · Professions', '技能职业图例':'Skill profession legend',
  '护甲制作':'Armor crafting', '护甲制作方案':'Armor crafting offer', '护甲篇章':'Armor campaign',
  '护甲职业':'Armor profession', '护甲防御值':'Armor rating', '捕获纹章':'Signet of Capture',
  '探索档案':'Field notes', '探索者管理':'Characters', '搜索护甲或制作商':'Search armor or armorers',
  '搜索活动':'Search activities', '收藏家':'Collectors', '整份计划：':'Entire plan: ', '新建角色':'New character',
  '获取方式':'Acquisition', '获取条件（英文）':'Acquisition requirements', '英雄技能导师':'Hero skill trainer',
  '角色':'Character', '角色名已存在':'A character with this name already exists', '角色已保存':'Character saved',
  '角色进度 ':'Character progress ', '管理角色':'Manage characters', '职业':'Profession', '职业筛选':'Profession filter',
  '职业颜色 + 职业图标':'Profession colors and icons', '篇章':'Campaign', '篇章筛选':'Campaign filter',
  '给制作计划起个名字（可选）':'Name this crafting plan (optional)', '维持消耗':'Upkeep', '过载':'Overcast',
  '本轮已完成 · 撤销':'Completed this rotation · Undo', '标记已学会':'Mark as learned', '标记已开启':'Mark as opened',
  '标记已捕获':'Mark as captured', '标记已清剿':'Mark as vanquished', '标记本轮已完成':'Complete this rotation',
  '核对范围：':'Verified fields: ', '核心':'Core', '核心资料':'Core data', '档案':'Details', '日历时区':'Calendar time zone',
  '显示更多目标（剩余 ':'Show more (', '未知地区':'Unknown region', '本地资料库':'Offline database',
  '查看制作区域 →':'View crafting location →', '查看关联区域 →':'View related zone →', '查询':'Search',
  '正在展开泰瑞亚地图…':'Opening the atlas of Tyria…', '正在展开资料…':'Loading data…',
  '此角色已在其他页面删除。':'This character was deleted in another window.',
  '此角色已在其他页面删除，请重新选择角色。':'This character was deleted in another window. Select another character.',
  '此计划的制作方案已变更，原始记录仍保留在备份中。':'This crafting offer has changed. Your original plan remains in the backup.',
  '每位角色拥有独立的技能、区域、宝藏进度、笔记、护甲计划与战承记录。':'Each character has separate skill, vanquish and treasure progress, notes, armor plans and Zaishen records.',
  '泰瑞亚探索志':'Tyria Explorer', '活动日历':'Activity calendar', '的制作计划 ':"’s crafting plans ",
  '预览恢复 →':'Preview restore →', '防御值':'Armor rating', '选择制作部位':'Select armor pieces',
  '距离下一次轮换':'Next rotation in', '输入角色名称':'Enter character name',
  '资料与许可报告':'Source and license report', '资料概览':'Overview', '资料说明':'About this atlas',
  '说明（含英文）':'Notes', '查看 Wiki 校订覆盖报告':'Wiki verification report',
  '获取方式':'Acquisition', '英文原文':'Localized text', '中文校订':'Localized text', '中文整理 · 含英文资料':'Localized text',
  '角色与进度保存在当前客户端。导出 JSON 文件，可在网页版或其他电脑恢复。':'Characters and progress are stored on this device. Export a JSON backup to restore them on another computer.',
};
Object.assign(en,fixes);
const additions={
 '查看来源原文':['查看来源原文','Original source text'],
 '来源与修订':['来源与修订','Source and revision'],
 '语言':['语言','Language'],
 '版本说明原文':['版本说明原文','Original release notes'],
 '无效的备份目录。':['无效的备份目录。','Invalid backup directory.'],
 '无效的备份类型。':['无效的备份类型。','Invalid backup kind.'],
 '无效的备份文件名。':['无效的备份文件名。','Invalid backup filename.'],
 '不能读取备份链接。':['不能读取备份链接。','A backup cannot be a symbolic link.'],
 '本地文件操作失败，请检查路径和文件权限。':['本地文件操作失败，请检查路径和文件权限。','The local file operation failed. Check the path and file permissions.'],
};
for(const [key,[cn,english]]of Object.entries(additions)){zh[key]=cn;en[key]=english;}
const headings={
 'THE EXPLORER\'S COMPANION':'探索者的旅伴', 'THE STORIES OF TYRIA':'泰瑞亚的故事',
 'THE ARMORER’S WORKBENCH':'护甲工坊', 'A NEW ADVENTURE EVERY DAY':'每一天，新的冒险',
 'A NOTE TO YOUR FUTURE SELF':'留给未来的自己', 'ABOUT THIS ATLAS':'关于探索志',
 'EVERY DISCOVERY HAS A STORY':'每一次发现，都有故事', 'FIELD NOTES / 01':'探索档案 / 01',
 'KEEP YOUR MEMORIES SAFE':'珍藏你的冒险回忆', 'YOUR ADVENTURE, YOUR STORY':'你的冒险，你的故事',
 'TYRIA CARTOGRAPHY / ':'泰瑞亚地图 / ', ' FOR THE LOVE OF EXPLORATION':' 为热爱探索的你',
 'GUILD WARS · ORIGINAL ATLAS':'激战 · 原始地图',
};
Object.assign(zh,headings);
// These labels describe the rendered localization, without implying human review.
zh['英文原文']='本地化资料';zh['中文校订']='本地化资料';zh['中文整理 · 含英文资料']='本地化资料';
zh['获取条件（英文）']='获取条件';zh['NPC 来源备注（英文）']='NPC 备注';
zh['完整技能与出现条件（英文）']='完整技能与出现条件';zh['PvP 版本 · 英文原文']='PvP 版本';
zh['制作条件与说明（含英文）']='制作条件与说明';zh['说明（含英文）']='说明';
const about='地图与旧资料来自 MappingOut 4.00。已校订的内容附 Guild Wars Wiki 修订来源、核对范围及旧版原文；两条无法确认身份的旧记录单独标注。部分技能和装备资料仍为英文；资料对应所引用的 Wiki 修订，不代表游戏内实测。';
zh[about]='地图与旧资料来自 MappingOut 4.00，资料对应所引用的 Guild Wars Wiki 修订。翻译中的机器草稿尚待人工逐条复核；两条身份未确认的旧记录已标注。来源原文可单独展开查看，地图坐标尚未逐点实测。';
en[about]='Maps and legacy data come from MappingOut 4.00; content follows the cited Guild Wars Wiki revisions. Machine translation drafts still require individual review. Two unresolved identities are marked. Expand the source sections to read originals; map coordinates have not been verified individually in game.';
for(const [key,value]of Object.entries(en)){
 let reviewed=value.replace(/\bproduction plan(s)?\b/gi,(_,s)=>'crafting plan'+(s||'')).replace(/\boccupation(s)?\b/gi,(_,s)=>'profession'+(s||'')).replace(/\brole(s)?\b/gi,(_,s)=>'character'+(s||''));
 if(key.startsWith(' ')&&!reviewed.startsWith(' '))reviewed=' '+reviewed;
 if(key.endsWith(' ')&&!reviewed.endsWith(' '))reviewed+=' ';
 if(!key.startsWith(' ')&&/^[a-z]/.test(reviewed))reviewed=reviewed[0].toUpperCase()+reviewed.slice(1);
 en[key]=reviewed;
}
for(const [file,value]of [['en',en],['zh-CN',zh]])fs.writeFileSync(`src/i18n/${file}.json`,JSON.stringify(value,null,2)+'\n');
