# 工程结构

前端保留 `src`。原生工程使用 `desktop`。
根目录保留单一 npm 工程与 Worker 部署入口。

```text
src/
  main.tsx
  app/desktop/
  features/{atlas,quests,skills,armor,calendar,journal,desktop}/
  shared/{contracts,ui,content,game}/
  storage/
  platform/
  i18n/
  assets/
desktop/
  src/{backup,resources,updates}/
  capabilities/
  icons/
scripts/
  lib/
  build/
  desktop/
  legacy/
  validate/
  wiki/{fetch,compile,audit,lib}/
  i18n/
  resources/
data/
  maps/
  wiki/{inputs,pages,revisions}/
  i18n/
docs/{guides,releases,verification,images}/
tests/
e2e/
public/
```

## 前端边界

`app` 装配导航、布局、写入队列与启动屏障。
`features` 保存用户功能的界面与领域规则。
`shared/contracts` 只声明类型，不加载翻译和界面。
`shared/game` 保存职业、分类名称与图标。
`shared/content` 提供资料加载和资源地址。
`shared/ui` 提供菜单、来源、文档和状态组件。

`storage` 保存 IndexedDB 事务、校验和迁移。
`platform` 保存原生适配、自动备份与更新控制器。
功能页通过应用注入的回调提交个人记录。
角色、笔记与备份表单归 `features/journal`。
角色删除在此清除所有功能的角色记录。
任务与日历通过日历领域规则完成活动联动。
`app/desktop` 负责更新恢复和资源准备后挂载应用。

领域和契约不依赖 `app`。
公共模块不依赖功能界面。
技能和任务仍通过动态导入加载。
CSS 导入顺序和现有选择器保持原有层叠语义。

## 桌面工程定位

所有桌面命令从 `scripts/desktop/desktop.mjs` 进入。
该入口设置两个绝对路径：

- `TAURI_APP_PATH` 指向工程的 `desktop`。
- `TAURI_FRONTEND_PATH` 指向工程根目录。

CLI 的工作目录保持工程根。
Tauri 的 beforeDevCommand 和 beforeBuildCommand 继续调用根 npm 命令。
`frontendDist` 继续指向 `../dist-desktop`。
应用标识、origin、公钥、频道与安装包身份保持不变。
原生入口只装配窗口、插件与命令。
`backup` 负责原生备份的校验、原子写入和保留。
`resources` 与 `updates` 保持独立签名边界。

## 脚本与输入

`scripts/lib/paths.mjs` 从自身模块 URL 定位工程根。
默认路径不依赖调用者的工作目录。
校验器和资源构建器保留显式目录参数，用于隔离测试。
显式 CLI 文件参数继续按各命令原有语义解析。

| 旧位置 | 当前归属 |
| --- | --- |
| `src-tauri/` | `desktop/` |
| `src/types.ts` | `src/shared/contracts/` 与 `src/shared/game/` |
| `src/features-domain.ts` | `src/features/armor/domain.ts` 与 `src/features/calendar/domain.ts` |
| `src/storage.ts` | `src/storage/` |
| `scripts/validate-*.mjs` | `scripts/validate/` |
| `scripts/desktop*.mjs` | `scripts/desktop/`；构建收尾归 `scripts/build/` |
| `scripts/wiki/*.json` | `data/wiki/inputs/` |
| `scripts/map-verification.json` | `data/maps/verification.json` |
| `docs/*.png`、`docs/*.jpg` | `docs/images/` |

npm 命令名称、CLI 参数和退出码保持兼容。
`npm run check:worker` 只执行构建与部署演练。
`npm run deploy` 仍从根目录发布单一 Worker。
一键部署入口见 [部署指南](cloudflare-workers.md)。

## 兼容与维护

个人数据库保持 `mappingout`、版本 3、`personal` 对象仓库。
备份保持 `mappingout-backup` v3，继续迁移 v1/v2。
公共资源 URL 和 `public` 文件内容保持稳定。
`data/i18n` 与 `src/i18n` 字典路径保持稳定。
目录整理不重新编译资料、采集 Wiki 或刷新发布例外。

历史验收、资料快照和已分发报告保留原始路径文字。
其中旧截图路径的文件现在位于 `docs/images`。
历史脚本命令的当前入口按上表转换。

新增或移动文件时更新所属 `AGENTS.md`。
依赖、导出或责任变化时更新 INPUT/OUTPUT/POS。
目录重排与职责拆分分提交保存；回退提交时同时恢复代码、调用路径与模块地图。
验证命令和本次结果见 [目录整理验收](../verification/project-structure-verification.md)。
