# 容器部署验收

日期：2026-11-18。
基线提交：`fa78ca8`。
实施分支：`codex/container-deployment`。

## 实施范围

- 多阶段 Docker 构建复用完整 Web 产物。
- Nginx 以 `101:101` 用户提供静态文件。
- Compose 使用只读根文件系统与 `/tmp` tmpfs。
- GitHub Actions 在原生 amd64、arm64 runner 验收镜像。
- 两种架构均通过后，发布已验收镜像并聚合 OCI 索引。
- main 推进 `edge`；正式标签推进版本与单调 `latest`。
- PR 和手动运行仅执行验收。

部署步骤见 [容器部署指南](../guides/container-deployment.md)。

## 本地自动验证

主机为 macOS arm64，Node.js 为 `24.11.1`。
Docker 使用 OrbStack Linux 虚拟机。

| 命令或检查 | 结果 |
| --- | --- |
| `npm test` | 19 个文件、261 项通过；含 66 项容器发布测试 |
| `npm run build` | 资料校验、TypeScript 与完整 Web 构建通过 |
| `npm run check:release` | 沿用既有资料与字体发布例外通过 |
| arm64 最终镜像构建与 HTTP 验收 | 通过；Linux arm64 原生执行 |
| amd64 最终镜像构建与 HTTP 验收 | 通过；本机使用模拟执行 |
| `npm run test:e2e:container` | 27 项通过；访问实际 arm64 镜像 |
| `npm run test:e2e:worker` | 25 项通过；共用分发断言回归 |
| Compose `up -d --wait` 与 HTTP 验收 | 健康检查与静态服务通过 |
| `actionlint .github/workflows/container.yml` | 通过 |
| 新增 Node.js 脚本语法与 `git diff --check` | 通过 |

一轮单元测试中，现有任务资料测试触发 5 秒超时。
停止并行镜像操作后，全量复跑 261 项通过。
本次未修改该测试的时限。

HTTP 验收覆盖健康检查、资料、地图、字体和许可。
它验证 MIME、缓存、gzip、ETag、304、Range 与真实 404。
浏览器验收覆盖角色、备份、离线访问与缓存升级。
重建测试实际删除并重建隔离容器。
重建前后镜像 ID 相同，容器 ID 不同。
同一 origin 下的角色与技能进度保持。

## 注册表发布链路

使用隔离的本地 `registry:3.0.0` 执行真实发布验证。
网络与 Docker 引用均定向到本地注册表。
该验证没有向 GHCR 写入镜像。

验证调用实际的架构发布、索引写入与公开拉取函数。
两个已验收镜像经 Docker tag/push 原样发布。
远端配置摘要与本地已验收镜像 ID 一致。
两种架构均保留 `HEALTHCHECK` 与非 root 用户。

| 检查 | 结果 |
| --- | --- |
| amd64、arm64 子镜像 | 原始摘要保持，匿名拉取通过 |
| SHA 暂存标签 | OCI 索引含两个架构与版本注解 |
| `1.3.1`、`latest`、`edge` | 索引验证与频道写入通过 |
| 模拟重跑 `1.3.0` | 发布旧版本，`latest` 保持 `1.3.1` |
| OCI 索引 HTTP PUT | 内容摘要与精确请求字节一致 |

索引直接引用原始 Docker/OCI 子清单。
该路径保留镜像配置中的健康检查。
匿名验证先检查索引，再分别拉取两个子摘要。
独立 Docker 配置确保拉取不使用发布凭据。

## 远端发布与 HTTP 回归

容器改造已于 2026-11-18 合并到 main。
提交为 `6730556ef41b05aea5959f06a2236931272f6827`。
[首次容器工作流](https://github.com/zhubby/mappingout/actions/runs/44293227580) 全部成功。
两个原生 runner 均完成验收与架构发布。
GHCR 包已公开，双架构索引已发布。

ZimaBoard2 的局域网 HTTP 验收发现启动错误。
HTTP origin 不提供 `crypto.subtle` 与 `crypto.randomUUID`。
资料加载直接调用 digest，导致首页无法打开。
资料哈希现使用 Web Crypto 或 noble SHA-256。
个人记录 UUID 回退到 `crypto.getRandomValues`。
两条路径均保留完整性校验与安全随机数。

2026-11-19 的回归结果：

- 20 个单元测试文件、274 项通过。
- 无 Web Crypto 时，正确资料加载通过。
- 被修改的原始资料和英文包仍被拒绝。
- 最终 arm64 镜像构建与 HTTP 验收通过。
- Chromium 模拟缺少安全上下文 Crypto API。
  页面加载、创建角色与重载后技能进度保留通过。

## 验证边界

本次未发布桌面程序或签名资源。
远程离线访问仍要求外部 HTTPS 与稳定 origin。
个人记录继续保存在浏览器 IndexedDB。

[PROTOCOL]: Update this header on change, then check AGENTS.md
