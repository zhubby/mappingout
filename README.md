# MappingOut · 泰瑞亚探索志

基于 MappingOut 4.00 本地资料重新实现的中文地图工具。React + TypeScript + Vite + Tailwind CSS + Leaflet；无需后端或账号。

Windows 离线客户端采用 Tauri 2，复用同一套界面和资料。开发、安装包、备份和签名更新见 [客户端说明](docs/desktop.md)。

安装 Windows 客户端：[GitHub Releases 下载](https://github.com/zhubby/mappingout/releases/latest)。普通版约 20 MiB；完全断网安装请选择含 WebView2 的 `offline-setup.exe`，约 227 MiB。网页与客户端的个人记录通过 JSON 备份迁移。

## 运行

使用 Node.js 24（`.node-version` 固定云端主版本；也支持更新的 Node.js）。在此目录执行：

```powershell
npm.cmd ci
npm.cmd run dev
```

开发地址以终端输出为准，默认 http://127.0.0.1:5173 。PowerShell 禁止运行 npm.ps1 时直接使用上面的 npm.cmd，无需修改系统策略。

```powershell
npm.cmd run build
npm.cmd run preview:worker
```

构建产物在 `dist/`，Worker 预览地址为 http://127.0.0.1:8787 。使用 **Cloudflare Workers Static Assets** 托管，默认发布到 `workers.dev`；本地发布、Git 自动部署、回滚和角色迁移见 [部署说明](docs/cloudflare-workers.md)。`npm run preview` 仍提供 Vite 静态预览。

不能通过双击 HTML 的 `file://` 方式运行。首次生产加载后 Service Worker 缓存应用与资料，地图和技能图片访问后缓存。离线功能需要 HTTPS 或 localhost，开发模式不注册 Service Worker。

## 功能

- 四大章节、20 张地图；技能、Boss、装备、收藏家、宠物、宝藏、区域查询。
- 名称 / 描述 / Boss 搜索，章节、地区、区域、职业、属性筛选；搜索结果与地图双向定位。
- 图层开关、图片坐标缩放拖动；URL 保留地图、筛选与选中记录。
- 多角色独立技能捕获、可清剿区域进度、宝藏日期；个人地图笔记可编辑或删除。
- IndexedDB 保存；JSON 备份导出、校验预览、明确确认后整体替换。未知备份版本拒绝导入；导入失败不替换已有数据。
- 手机切换查询 / 地图 / 档案三个视图。
- 护甲制作：十职业全防御等级与通用部位，制作商、男女外观、单件配方和固定费用合计；按角色保存计划和逐件制作进度。
- 活动日历：四类每日战承任务、旅者尼古拉斯与 PvE/PvP 周奖励；时区切换、周期预测及按角色记录每次战承完成状态。

个人数据操作在 IndexedDB 读写事务内基于最新记录执行，避免标签页旧快照覆盖其他页面的修改。支持 BroadcastChannel 的浏览器会同步更新；不支持时在页面重新获得焦点后刷新。角色进度操作绑定点击时的角色，已删除角色的旧操作会被拒绝。完整备份恢复仍按确认后的整份数据替换。

切换资料类型会清除不适用的属性与职业筛选；自动定位优先使用符合当前章节、地区和区域条件的地点。图层关闭后，选中条目的标记也会隐藏。

离线首页仅缓存入口 HTML，查看 JSON 报告不会替换首页。缓存写入失败时仍正常返回网络资源。构建根据产物内容生成离线缓存版本；新版安装成功后清理旧的 MappingOut 缓存，不影响 IndexedDB 中的个人记录。新版发布后，地图需要在线访问一次以加入新版缓存。

## 数据和兼容性

`npm run build` 校验并使用已生成的 `public/data/*.json` 和 `public/assets/**`；这些文件是必须提交的部署输入，独立复制或克隆 `web` 后即可构建。缺失章节、地图、资料或引用图片时构建直接失败，不生成空库。

仅当需要更新原始资料、且保留上一级完整 Campaign 目录时，执行 `npm run build:data`（转换并构建）或 `npm run convert`（仅转换）。转换会先检查原始输入是否完整，再生成 `public/data/catalog.json`、`public/data/report.json` 并复制图片。原 EXE、TXT、JPG 不修改。副本与附件不合并；ASCII / UTF-8 / GB18030 / 带 BOM 的 UTF-16 经明确解码。

资料包含 381 个技能条目、1,183 条 Boss / 获取来源、697 条装备、350 位收藏家、32 组章节宠物、12 处宝藏与 366 条区域记录。这里是原始资料条目数量，不是经过游戏核验的唯一实体数量。少数技能为种族技能或旧资料重复，装备包含固定绿装与随机属性掉落。

Wiki 校订另补入莱苏皇宫的探索版本，使用独立 ID `zone:gww:10970`，与主线任务分开记录，暂不绘制未确认的地图位置。目前为 367 条区域记录、136 个可清剿目标（预言 54、盟与敌 33、黑暗逆袭 34、北方之眼 15）。旧版的五个错误清剿目标已停用，既有个人记录仍随备份保留。

同编号跨章节资料保持独立身份。地点优先引用本篇章技能，再引用核心技能，最后仅在全局编号唯一时跨章节引用。相同名称不用于合并实体。绿装仅在本章节 Boss 名称唯一匹配时显示候选地点，详情明确标注此关联未在游戏中核验；多候选或缺失来源不推测坐标。原始重复行保留并增加来源行后缀，不覆盖其他记录。

20 张地图通过原图与每张前三个区域标记的叠加图进行人工核对；证据在 `scripts/map-verification.json` 与 `docs/map-check-*.jpg`。这是代表性地标核对，不是全量坐标或游戏运行验证。只有已核对底图、且坐标在原图边界内的地点绘制标记。

`public/data/report.json` 保留编码、排除项、缺图、重复编号、缺失引用和无法定位资料的文件 / 行号。转换后应用带来源修订号的 Wiki 校订；未核对内容保留原文，不补造未知字段。旧人物存档、旧更新器、账号云同步均不迁移。

个人备份格式为 `{ format: "mappingout-backup", version: 2, exportedAt, data }`，仍接受 v1 并在预览中说明迁移。IndexedDB 升级到版本 2，保留旧数据并增加护甲计划与活动记录。资料版本与个人备份版本独立。清理网站数据、换浏览器或使用不同网站地址不会共享进度；请通过备份迁移。角色删除会同步删除其进度、笔记、计划和活动记录。新功能、来源核验和升级／回滚说明见 [护甲与日历说明](docs/armor-calendar.md)。

## Wiki 数据校订

本轮已审查全部技能、Boss / 获取来源、装备、收藏家、宠物、宝藏、区域和四篇章剧情。详情显示说明、字段范围、固定修订与旧版原文，支持中英文搜索；任务奖励、宝箱、随机装备和独特武器分别说明。两条旧身份无法确认，显式标注；350 条技能效果及部分物品资料保留英文。未确认来源位置不绘制标记，旧 ID、坐标与个人备份格式保持兼容。3,027 个引用修订已通过 Wiki API 核对原文哈希。覆盖与证据见 [Wiki 校订记录](docs/wiki-data-review.md)。

## 测试

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e:worker
npm.cmd run check:worker
```

Vitest 检查编码、字段与来源、图片尺寸、编号关联、查询、角色隔离、备份验证、IndexedDB 并发事务，以及部署资料缺失、缓存版本生成、缓存规则、离线首页和缓存故障。Playwright 使用本机 Edge，启动 Wrangler 本地环境，运行原有七项流程并检查 Workers 响应头、404 和缓存更新。请先完成构建，再运行浏览器测试，避免测试期间重建 `dist/`。

`npm run test:e2e` 保留原有 Vite 预览测试；`npm run check:worker` 构建后执行 dry-run，不发布到 Cloudflare。

本次适配的命令结果、HTTP 检查和独立构建记录见 [验收记录](docs/deployment-verification.md)。

未安装 Edge 的机器可安装 Playwright Chromium 后，将 `playwright.config.ts` 的 `channel: 'msedge'` 删除；Wrangler 测试会继承此配置。无需运行任何原始 EXE。

## 工程结构

- `scripts/`：旧资料转换、地图核对证据；`public/`：资料、素材和离线缓存。
- `src/domain.ts`：查询和角色进度；`src/storage.ts`：存储接口、备份校验。
- `src/AtlasMap.tsx`：Leaflet 图片地图；`src/App.tsx`：界面及交互。
- `tests/`、`e2e/`：单元与浏览器测试。

原始地图、图片、文字的版权归各自权利人。公开分发素材前需确认授权。当前站点：[MappingOut Web](https://mappingout-web.zhubby.workers.dev)。
