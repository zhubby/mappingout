# Cloudflare Workers 部署

本项目使用 Workers Static Assets。React、Leaflet、查询参数路由和浏览器 IndexedDB 均直接运行，无需服务端脚本、数据库绑定或登录系统。Worker 名称为 `mappingout-web`，兼容日期为 `2026-11-12`，默认启用 `workers.dev`。

## 命令

在 `web` 目录执行；独立 Web 仓库则在仓库根目录执行。使用 Node.js 24；Windows PowerShell 若禁止执行 `npm.ps1`，将下面的 `npm` / `npx` 写成 `npm.cmd` / `npx.cmd`。

```sh
npm ci
```

| 命令 | 行为 |
| --- | --- |
| `npm run build` | 校验已提交资料、TypeScript 检查、Vite 构建、生成离线缓存版本 |
| `npm run build:data` | 从完整原始 Campaign 目录重新转换资料，再构建 |
| `npm run preview:worker` | Wrangler 本地运行现有 `dist`，地址 `http://127.0.0.1:8787` |
| `npm run check:worker` | 构建并执行 `wrangler deploy --dry-run`，不发布 |
| `npm run deploy` | 构建并发布 |
| `npm run deploy:assets` | 直接发布已构建的 `dist`，用于 Git 自动部署 |
| `npm run test:e2e:worker` | 在 Wrangler 本地环境运行浏览器验收；先执行构建 |

## 本地登录和发布

```sh
npx wrangler login
npx wrangler whoami
npm run check:worker
npm run deploy
```

`login` 会打开浏览器授权。发布成功后终端输出实际地址，通常为 `https://mappingout-web.<账号子域>.workers.dev`。首次使用时，在 Cloudflare 控制台按提示设置账号的 workers.dev 子域。不要将账号令牌或 Wrangler 登录文件提交到仓库。

本地运行与 dry-run 不需要 Cloudflare 登录。Wrangler 固定为 `4.160.1`，通过 `package-lock.json` 安装；本地状态保存在已忽略的 `.wrangler/`。

## 关联 Git 自动部署

先把工程推送到自己的 GitHub 或 GitLab 仓库。在 Cloudflare 的 **Workers & Pages** 中创建或选择 `mappingout-web` Worker，连接 Git 仓库并选择生产分支；已有 Worker 可在设置中的 Builds / Git repository 连接。

| Cloudflare 构建设置 | 完整 MappingOut 仓库 | 独立 Web 仓库 |
| --- | --- | --- |
| 项目 / 根目录 | `web` | 仓库根目录（留空或 `/`） |
| 构建命令 | `npm run build` | `npm run build` |
| 部署命令 | `npm run deploy:assets` | `npm run deploy:assets` |
| Worker 名称 | `mappingout-web` | `mappingout-web` |
| Node.js | `24` | `24` |

`.node-version` 已设为 `24`；也可在 Builds 环境变量中明确设置 `NODE_VERSION=24`，避免控制台已有变量覆盖它。Cloudflare 按锁文件安装依赖。若改名，需同时修改 `wrangler.jsonc` 和控制台 Worker 名称。

必须提交以下部署输入：`package.json`、`package-lock.json`、`.node-version`、`wrangler.jsonc`、`index.html`、TypeScript / Vite 配置、`src/`、`scripts/` 和完整 `public/`。其中 `public/data/catalog.json`、`public/data/report.json`、`public/assets/maps/*.jpg`、`public/assets/skills/*.jpg` 都应纳入 Git；不要忽略 JPG 或 JSON。`scripts/map-verification.json` 用于校验地图覆盖范围，也必须保留。测试和文档建议一起提交。

`dist/`、`node_modules/`、`.wrangler/` 无需提交。云端构建只依赖 Web 工程，不需要上级 EXE 或 Campaign 资料。没有完整原始资料时不要使用 `build:data`。若当前目录尚未创建 Git 仓库，应先在自己的仓库提交以上工程文件，再关联 Cloudflare。

## 资源路由、缓存和离线行为

应用入口为 `/`，地图和筛选在查询参数中，例如 `/?kind=skill&map=2%3A2`。配置禁用缺失资源的 SPA 回退，错误的 JSON、图片、脚本和路径返回真实 404。`/index.html` 可能按 Cloudflare 默认 HTML 规则重定向到 `/`。

Vite 输出到 `/build/`，文件名带内容哈希，使用一年 immutable 缓存。`/`、`/index.html`、`/sw.js` 使用 `no-cache`；`/data/*` 和固定名称的 `/assets/*` 使用 `max-age=0, must-revalidate`。规则由 `public/_headers` 随构建发布。

构建脚本按排序后的产物路径与内容生成缓存版本，覆盖代码、资料、图片、响应头和 Service Worker 模板。同样内容重复构建得到相同版本；修改任一发布输入会产生新版本。Service Worker 安装时重新获取入口、构建资源和资料库，安装成功才接管并清理旧的 MappingOut 缓存。报告和图片导航不会覆盖 HTML 入口，网络成功时缓存写入失败也不影响返回。

首次成功加载后可离线打开应用；地图与技能图片在访问后加入缓存。首次安装接管页面时，会补缓存当前显示的图片，覆盖图片早于 Service Worker 加载的情况。新版发布后旧地图缓存会清理，需在线访问地图以重新缓存。浏览器可能回收离线缓存。角色、笔记和进度仍由 IndexedDB 单独保存，缓存升级与部署回滚不会修改它们。

## 回滚

在 Cloudflare Worker 的 Deployments 中选择此前成功版本并执行回滚，也可使用本地已登录的 Wrangler：

```sh
npx wrangler deployments list
npx wrangler versions list
npx wrangler rollback <目标版本ID> --message "Rollback MappingOut release"
```

回滚恢复该版本的应用和静态资源。浏览器再次在线访问后会安装对应缓存版本；已打开页面可刷新以加载回滚版本。若启用了 Git 自动部署，还需在生产分支撤销问题提交，否则下次推送可能再次发布它。

## 从本地预览迁移角色

`localhost`、`127.0.0.1`、不同端口、`workers.dev` 和自定义域名属于不同来源，各自持有独立的浏览器数据。

1. 在原预览地址打开「数据备份」，导出个人数据 JSON。
2. 打开正式 Workers 地址，进入「数据备份」并导入该文件。
3. 核对角色数量和预览后，点击「确认替换并恢复」。这会整体替换目标地址的个人数据。

当前护甲与日历版本导出 `mappingout-backup` v2，并支持 v1 备份迁移。数据库名称仍为 `mappingout`，版本升级到 2；回滚时应保留 v2 存储兼容层，见 [新功能与兼容说明](armor-calendar.md)。

## 验收

```sh
npm test
npm run build
npm run test:e2e:worker
npm run check:worker
```

浏览器测试覆盖原有七项查询、角色、备份与离线流程，并检查资源类型、响应头、缺失资源 404 和缓存更新。测试运行期间不要同时重建预览目录。独立 Web 构建可将整个 Web 工程复制到无 Campaign 父目录的临时目录，排除 `node_modules`、`dist`、`.wrangler` 后执行 `npm ci` 和 `npm run check:worker`。

参考：[静态资源配置](https://developers.cloudflare.com/workers/static-assets/binding/)、[响应头规则](https://developers.cloudflare.com/workers/static-assets/headers/)、[Git 构建设置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)、[构建环境](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)。
