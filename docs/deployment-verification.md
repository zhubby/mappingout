# Workers 适配验收记录

验证日期：2026-11-12。环境：Windows、Node.js 24.22.3 / 26.13.0、Wrangler 4.160.1、本机 Microsoft Edge。

| 验证 | 结果 |
| --- | --- |
| `npm test` | 4 个文件、45 项测试通过；在 Node.js 24 下复核通过 |
| `npm run build` | 通过，不读取原始 Campaign 目录 |
| `npm run build:data` | 转换和构建通过，生成相同资料及缓存版本 |
| `npm run test:e2e:worker` | Wrangler 本地环境下 9 项浏览器测试通过，包含原有全部 7 项流程 |
| `npm run check:worker` | 构建与部署 dry-run 通过，无账号绑定，无实际发布 |
| 独立 Web 工程 | 复制到父目录仅含 `web` 的临时目录，排除依赖及构建产物；Node.js 24 下 `npm ci` 和 `npm run check:worker` 通过 |

部署资料校验覆盖 4 个章节、20 张地图、3,021 条资料和 399 张引用图片。原始资料的 74 条诊断继续保存在 `public/data/report.json`，包含缺图、重复编号及来源不明确等既有问题；没有补造资料或坐标。

Wrangler HTTP 验证结果：

| 请求 | 状态及缓存策略 |
| --- | --- |
| `/`、带地图和中文搜索查询参数的 `/` | 200、HTML、`no-cache` |
| `/data/catalog.json`、`/data/report.json` | 200、JSON、`public, max-age=0, must-revalidate` |
| `/assets/maps/1-1.jpg` | 200、JPEG、`public, max-age=0, must-revalidate` |
| `/sw.js` | 200、JavaScript、`no-cache` |
| 页面实际引用的 `/build/*.js` 和 `/build/*.css` | 200、正确内容类型、`public, max-age=31536000, immutable` |
| 不存在的 JSON、图片、脚本及路径 | 404，不返回应用首页 |

浏览器验证通过：中文查询与定位、查询链接刷新、移动端布局、多角色进度、笔记、备份导出与恢复、非法备份拒绝、跨标签页更新、筛选与图层，以及打开 JSON 报告后的离线刷新和访问过的地图离线加载。

缓存版本测试覆盖相同内容重复构建、代码 / JSON / 图片 / 响应头 / Worker 模板变化，以及旧缓存清理、预缓存失败时保留旧 Worker、缓存故障不丢失在线响应。浏览器通过改变 Worker 脚本查询参数触发真实安装与激活，验证激活完成后清理旧应用缓存、保留无关缓存和已有角色；不同发布内容的版本变化由构建单元测试验证。

实际 Cloudflare 发布和 Git 关联需使用部署者账号；操作步骤见 [部署说明](cloudflare-workers.md)。

## 2026-11-13 线上发布复核

已通过 Wrangler OAuth 授权发布至 [mappingout-web.zhubby.workers.dev](https://mappingout-web.zhubby.workers.dev)，Cloudflare 版本为 `a3998692-75e1-4b82-8adc-2a8b03b0e1ed`，应用缓存版本为 `mappingout-bbac3b1946da24ba7bdbef2f`。本次为本地命令部署；Git 自动部署的关联步骤见部署说明。

线上检查发现首次地图可能早于 Service Worker 接管完成加载，导致该图片没有进入离线缓存。现在在接管后补缓存当前显示的图片；浏览器回归测试主动推迟 Worker 注册，确认地图先加载、随后接管和断网刷新时仍能完整显示。

本次 `npm test` 的 45 项单元测试、生产构建和 `npm run test:e2e:worker` 的 10 项浏览器测试全部通过。在线上使用 Edge 复核：

- 首页及带查询参数链接正常返回 HTML，中文搜索、详情和刷新恢复通过。
- JSON、地图、Service Worker、实际引用的 JS/CSS 返回 200，内容类型和缓存响应头符合上表；确认已使用本次缓存版本。
- 不存在的 JSON、图片、脚本及路径返回真实 404。
- 首次地图早于 Worker 接管加载时仍会缓存；读取报告后断网刷新，应用和该地图均可加载。

## 2026-11-13 Wiki 校订版发布前验证

环境：Windows、Node.js 26.13.0、Wrangler 4.160.1、本机 Microsoft Edge。

本轮全部 74 项单元测试及 15 项 Wrangler 浏览器测试通过，`npm run check:worker` 的生产构建与部署 dry-run 通过。浏览器覆盖中英文检索、来源修订、PvP 差异、技能学习分类、任务来源、随机及独特装备、收藏家兑换版本、剧情折叠，以及角色隔离、备份恢复、跨标签页同步、地图定位、离线刷新、旧缓存清理和真实 404。

构建校验仍覆盖四篇章、20 张地图、3,021 条资料和 399 张引用图片。原始资料的 74 条诊断保留；两条无法确认身份的旧记录继续明确标注。个人数据结构与备份版本不变。Wiki 内容核对范围与证据见 [校订记录](wiki-data-review.md)。

已从代码提交 `15bf329` 部署至 [mappingout-web.zhubby.workers.dev](https://mappingout-web.zhubby.workers.dev)。Cloudflare 版本：`000ff2bb-4ef4-41fb-9ec9-39323f6bd603`；离线缓存版本：`mappingout-a484100a7a26cef5e516ba66`。本次通过 Wrangler 本地命令发布，未配置 Git 自动部署。

正式域名复核通过：13 项 HTTP 请求覆盖首页、中文查询链接、JSON、地图、Service Worker、实际 JS/CSS 及四种缺失路径；缓存头与内容类型符合预期，缺失路径返回 404。线上首页、Service Worker、资料库及 Wiki 报告的 SHA-256 与本地构建一致。Edge 浏览器完成中英文搜索、PvP 详情、地图定位和四篇章剧情折叠；访问 JSON 报告后断网刷新，选中资料与已访问地图仍可加载，使用本次缓存版本且无页面脚本错误。

## 2026-11-13 区域校订补全

补核全部 366 条旧区域，另以独立 ID 补入莱苏皇宫探索版本。当前 3,022 条资料全部带本轮字段审查来源；136 个清剿目标对应 136 个独立 Wiki 区域，篇章分布为 54 / 33 / 34 / 15。五个错误清剿目标已停用，旧 ID、原始坐标与个人备份格式保留。

`npm run wiki:compile`、`npm run build:data`、78 项单元测试、17 项 Wrangler 浏览器测试，以及生产构建和部署 dry-run 全部通过。新增浏览器流程验证地下城和非清剿区域不显示清剿按钮、莱苏任务与探索版本分开，以及无确认坐标区域的篇章 / 地区 / 区域筛选、角色记录和刷新恢复。NPC 技能列表回归验证 Root Behemoth 的困难模式限定、The Afflicted Senku 的任务限定和 Oni 的等级限定在没有子标题时也能展开查看。

`node scripts/wiki/audit-references.mjs --remote` 通过系统代理与 Wiki API 核验全部 3,027 个实际引用修订的页面 ID、标题、修订号、时间及原文 SHA-1；本地快照原文哈希全部一致。核验记录保存在 `data/wiki/source-audit.json`。两处无法确认的旧 NPC / 物品身份继续明确标注，不补造属性或位置。

已从代码提交 `bc83322` 发布至 [mappingout-web.zhubby.workers.dev](https://mappingout-web.zhubby.workers.dev)。Cloudflare 版本：`d5799eda-e7a0-4350-ba3b-94b333b4471e`；离线缓存版本：`mappingout-fd6a4bedf6e73e0c9ae904de`。通过系统代理使用 Wrangler 本地命令部署；Git 自动部署尚未关联。

正式域名的 13 项 HTTP 检查全部通过：状态码、内容类型和缓存头符合预期，四种缺失资源返回真实 404；首页、Service Worker、资料库及 Wiki 报告的 SHA-256 与本地构建完全一致。线上 Edge 浏览器确认 NPC 技能限定可展开、Battledepths 不显示清剿操作、莱苏皇宫探索版本可按篇章 / 地区 / 区域筛选并刷新恢复，且不显示未经确认的定位按钮。中英文搜索、PvP 详情、地图定位、四篇章剧情折叠和读取报告后的离线刷新通过，访问过的地图可离线显示；缓存版本正确，未出现页面脚本错误。

## 2026-11-13 护甲制作与活动日历

新增独立护甲制作及活动日历页面，共 298 种可制造外观、1,057 份制作方案、52 位制作商、33 种材料、596 张男女预览图与 430 条活动。四类每日战承任务、137 周旅者轮换和 PvE/PvP 周奖励均在浏览器按核验序列计算。范围、来源和维护说明见 [护甲与日历说明](armor-calendar.md)。

100 项单元测试、21 项 Wrangler 浏览器测试和生产构建全部通过；部署 dry-run 确认 1,016 个静态文件。回归保留原有全部 17 项浏览器流程，新增制作计算、角色计划、跨标签页勾选、v2 备份恢复、真实 v1 数据库迁移、重置边界、时区和分享恢复，以及手机离线页面与预览图。桌面和手机截图保存为 `armor-desktop.png`、`armor-mobile.png`、`calendar-desktop.png` 和 `calendar-mobile.png`。

全部 3,706 个实际引用修订的本地原文 SHA-1、Wiki API 页面身份、修订号、时间及 SHA-1 核验通过。654 行独立金币总计和 654 行材料总计已与计算结果对照；两处 Ranger Drakescale AR 55 的来源算术冲突经过 Armorer 总表交叉核对并在界面说明。未处理的配方解析错误为零。

IndexedDB 升级到版本 2，旧角色、进度和笔记通过事务迁移；备份导出 v2 并接受 v1。数据库升级后不应直接回滚到仅支持 v1 的应用；回退代码时须保留 v2 存储兼容层，操作前导出备份。

### 正式发布与线上验收

代码提交 `9ce29dd` 已推送至 GitHub `main`，并通过 Wrangler 发布到 [正式站点](https://mappingout-web.zhubby.workers.dev)。Cloudflare 版本：`410d4407-99a7-4108-b345-81cbd45c8329`；离线缓存版本：`mappingout-e37952656545f3f4efa16120`。

从该 Git 提交导出仅含 Web 工程的独立临时目录，在 Node.js 24.22.3 下执行 `npm ci` 和 `npm run check:worker` 均通过。构建生成相同的 JS/CSS 文件名与离线缓存版本，部署 dry-run 确认 1,016 个静态文件，无需原始 Campaign 目录。

正式域名验收结果：

- 13 项基础 HTTP 检查通过：首页、查询链接、资料库、地图、Service Worker 与 JS/CSS 的状态、内容类型及缓存头正确；四类缺失资源返回真实 404。首页、Service Worker、资料库及 Wiki 报告的 SHA-256 与本地构建一致。
- 新增护甲与日历 JSON、所选护甲的男女 WebP 预览图均返回 200，缓存头正确且 SHA-256 与本地一致。
- Edge 独立浏览器上下文确认战士阿斯卡隆 AR 80 制作费合计 5 白金；保存具名计划、勾选身体部位、刷新后仍保留，剩余四部位计算正常。
- 完成应用缓存后断网刷新，计划及已访问预览图可读取，首次切换日历页面可离线加载；任务完成记录在断网刷新后保留。UTC 时区及 2027-01-01 日期可从 URL 恢复，未来任务按钮禁用。
- 浏览器使用本次缓存版本且未出现页面脚本错误。首次线上浏览器验收遇到资料加载超过默认 5 秒断言时限，延长验收等待后完整流程通过；未修改产品逻辑。

入口：[护甲制作](https://mappingout-web.zhubby.workers.dev/?view=armor)、[活动日历](https://mappingout-web.zhubby.workers.dev/?view=calendar)。个人数据继续保存在各自浏览器及域名内，未向服务器写入角色或计划。

## 2026-11-13 技能点职业图标

技能点使用十职业 Tango 图标、对应颜色边框及深色圆底，选中时显示浅金色光环；提示中增加职业名。原始地点及图标中心锚点保持一致。技能图层有可定位地点时显示十职业图例，窄屏默认收起，可随时展开；技能图层关闭或添加笔记时隐藏图例。

图标从 Guild Wars Wiki 下载，原图 SHA-1 与 API 对照通过，文件页的 GFDL 声明、修订和输出哈希记录在 `data/wiki/profession-icons.json`，更新脚本为 `scripts/wiki/fetch-profession-icons.mjs`。十张图标随 Vite 生成带哈希的 `/build/` 资源，自动加入应用离线预缓存，浏览器无需向 Wiki 请求图片。

100 项单元测试、22 项 Wrangler 浏览器测试、生产构建及部署 dry-run 全部通过。新增浏览器流程使用资料库独立核对实际点位的十职业归属，并检查图标加载、手机图例、离线刷新和技能图层开关；原有缩放定位与分享链接流程继续通过。桌面 1680×1080 及手机 390×844 截图已人工检查，无水平溢出。
