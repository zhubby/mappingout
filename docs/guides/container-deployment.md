# Docker 容器部署

镜像支持 `linux/amd64` 和 `linux/arm64`。
使用 Docker Engine 与 Docker Compose 插件。
镜像提供完整 Web 产物：地图、资料、字体、许可与离线 Service Worker。

## 快速部署

在新的部署目录下载 Compose 文件：

```sh
mkdir mappingout-deploy
cd mappingout-deploy
curl -fsSLO https://raw.githubusercontent.com/zhubby/mappingout/main/compose.yaml
MAPPINGOUT_IMAGE=ghcr.io/zhubby/mappingout:edge docker compose up -d --wait
curl -fsS http://localhost:8080/healthz
```

打开 `http://localhost:8080`。健康检查返回 `ok`。
也可以克隆仓库，在仓库根目录执行 Compose 命令。
Compose 只拉取镜像，不从源码构建。

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `MAPPINGOUT_IMAGE` | `ghcr.io/zhubby/mappingout:latest` | 镜像版本或 digest |
| `MAPPINGOUT_PORT` | `8080` | 主机端口；容器端口固定为 8080 |

首次正式容器发布前使用 `edge`。
生产部署推荐固定已发布版本或 digest。
需要保存配置时，在 Compose 同目录写入 `.env`：

```dotenv
MAPPINGOUT_IMAGE=ghcr.io/zhubby/mappingout:edge
MAPPINGOUT_PORT=8080
```

随后执行 `docker compose up -d --wait`。
`edge` 和 `latest` 会随发布推进，不能作为固定回滚目标。

## 访问地址与个人记录

站点部署在域名根路径，例如 `https://maps.example.com/`。
当前构建未提供 `/mappingout/` 等子路径配置。
容器提供 HTTP；HTTPS 由外部反向代理终止。
局域网 HTTP 支持在线地图与个人记录。
缺少 Web Crypto 时，资料仍通过 SHA-256 校验。
本应用仅在 HTTPS 或本机回环地址启用 Service Worker。
建议长期使用同一 HTTPS 地址。

角色、进度和笔记保存在浏览器 IndexedDB。
服务端没有个人数据库，也不需要持久卷。
同一浏览器、同一 origin 下，容器更新和重建保留个人记录。
origin 包含协议、主机和端口；更改任一项会进入独立存储。
迁移地址或浏览器前，在应用中导出 JSON 备份，再到新地址导入。
导入会在确认后替换目标个人记录。

离线使用前，使用应用内的“开始离线准备”下载完整资源。
首次安装只缓存启动资源；成功访问的静态资源也会缓存。
全量准备支持进度、取消和重试，最多并发下载两个文件。
Service Worker 需要 HTTPS；浏览器仍能回收缓存。
角色记录独立保存在 IndexedDB；请保留个人备份。

## 更新与回滚

更新前导出个人备份，并记下当前镜像引用。
以下命令保留 Compose 的端口和其他配置：

```sh
docker compose images
docker image inspect "$(docker compose images -q mappingout)" --format '{{json .RepoDigests}}'
```

把已发布的目标版本替换到 `TARGET_IMAGE`。
也可以填写 `ghcr.io/zhubby/mappingout@sha256:…` 完整 digest。

```sh
TARGET_IMAGE=ghcr.io/zhubby/mappingout:1.3.1
MAPPINGOUT_IMAGE="$TARGET_IMAGE" docker compose pull
MAPPINGOUT_IMAGE="$TARGET_IMAGE" docker compose up -d --wait --force-recreate
docker compose ps
```

示例版本仅说明格式，以 GHCR 实际已发布版本为准。
验证完成后，把目标引用写入 `.env`，供后续命令使用。
如需回滚，填入更新前保存的版本或 digest：

```sh
PREVIOUS_IMAGE=ghcr.io/zhubby/mappingout@sha256:替换为更新前的完整摘要
MAPPINGOUT_IMAGE="$PREVIOUS_IMAGE" docker compose pull
MAPPINGOUT_IMAGE="$PREVIOUS_IMAGE" docker compose up -d --wait --force-recreate
```

回滚镜像不会回滚浏览器个人记录。
保持访问 origin 不变，并重新加载页面检查版本。

## 从源码构建

在包含完整仓库输入的根目录执行：

```sh
docker build -t mappingout:local .
MAPPINGOUT_IMAGE=mappingout:local docker compose up -d --wait
```

构建层使用官方 Node.js 24 镜像的 ECR 镜像源。
运行层使用上游 `nginx-unprivileged` Alpine 镜像。
两个基础镜像均在 `Dockerfile` 中固定 digest。
运行用户为 `101:101`，监听 8080。
Compose 使用只读根文件系统与 `/tmp` tmpfs。
它丢弃 Linux capabilities，并启用 `no-new-privileges`。

Nginx 的 `/healthz` 提供独立健康检查。
`/build/` 哈希资源长期缓存；HTML 和 Service Worker 重新验证。
其他静态资源要求重新验证；缺失文件返回真实 404。
日志输出到容器标准输出与标准错误：

```sh
docker compose logs --tail=100 mappingout
```

## GHCR 发布

`.github/workflows/container.yml` 使用两个原生 Linux runner。
amd64 与 arm64 都完成单元测试、最终镜像构建和 HTTP 验收。
amd64 另执行浏览器验收。
两种架构均通过后，工作流发布已验收镜像并合并清单。

| 触发来源 | 发布行为 |
| --- | --- |
| Pull request | 只验证，不推送镜像 |
| Actions 手动运行 | 只验证，不推送镜像 |
| `main` push | 发布 `sha-完整提交SHA`；当前 main 提交推进 `edge` |
| `desktop-vX.Y.Z` push | 发布 `X.Y.Z` 与 `sha-完整提交SHA`；版本不低于当前 latest 时推进 `latest` |

正式标签必须与 `package.json` 版本相同，否则拒绝发布。
正式发布沿用 `npm run check:release` 的资料、字体与版本门槛。
保留既有发布例外规则，不为容器绕过门槛。
`latest` 按语义版本单调推进，旧标签重试不会降低版本。
容器发布独立于桌面发布结果，不使用桌面签名密钥。

GHCR 新建包默认私有，首次发布后需显式公开：

1. 打开 GitHub 用户或组织的 **Packages**，选择 `mappingout`。
2. 打开 **Package settings**。
3. 在 **Danger Zone → Change visibility** 中选择 **Public** 并确认。
4. 在 **Manage Actions access** 中确认本仓库具有写入权限。

工作流通过 `GITHUB_TOKEN` 的 `packages: write` 权限发布。
仓库或组织策略必须允许该权限；包访问权限允许仓库 Actions 读取和写入。
镜像的 OCI `org.opencontainers.image.source` 标签连接来源仓库。
公开后可匿名拉取，无需在部署服务器配置 GitHub 凭据。
工作流在包已公开时验证双架构匿名拉取；私有包会输出设置提示。

## 本地验收

以下命令用于隔离测试，不能填入生产容器名称。
先准备 Node.js 24、Docker 与 npm 依赖：

```sh
npm ci
npm test
npm run check:release
docker build -t mappingout:test .
docker run --detach --name mappingout-e2e-acceptance \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m,mode=1777 \
  --cap-drop=ALL --security-opt=no-new-privileges \
  --publish 127.0.0.1:8080:8080 mappingout:test
npm run test:container
npx playwright install chromium
MAPPINGOUT_CONTAINER_NAME=mappingout-e2e-acceptance npm run test:e2e:container
docker rm --force mappingout-e2e-acceptance
```

等待容器健康检查通过后执行 HTTP 和浏览器验收。
测试默认访问 `http://127.0.0.1:8080`，先确保端口空闲。
`MAPPINGOUT_CONTAINER_URL` 可指定测试地址。
浏览器重建测试会删除并重建指定的 `mappingout-e2e-*` 容器。
它验证相同 origin 下的角色和进度保留。
测试结果以实际命令输出为准。
本次实施的结果与验证边界见 [容器部署验收](../verification/container-deployment-verification.md)。

[PROTOCOL]: Update this header on change, then check AGENTS.md
