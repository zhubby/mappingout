---
status: complete
priority: p1
issue_id: "003"
tags: [architecture, desktop, scripts, documentation]
dependencies: []
---

## Problem Statement
按已确认的 src 与 desktop 布局整理工程。
功能、资料和个人数据的行为保持稳定。

## Findings
基线提交为 9820b81。前端根层有 39 个文件。
桌面工程路径散布于脚本、测试与 CI。
Wiki 脚本混有人工资料输入。

## Proposed Solutions
按业务归组前端，建立纯类型契约和存储边界。
显式定位 desktop 工程，提取原生备份模块。
按职责归组脚本、资料输入、指南、验收和图片。

## Recommended Action
在 codex/reorganize-project 分支顺序实施六个阶段。
保持 npm 命令、IPC、运行 URL、备份 v3 与签名身份。

## Acceptance Criteria
- [x] 记录测试、资源哈希、发布指纹和迁移基线。
- [x] 完成 desktop 改名、原生备份拆分和调用路径更新。
- [x] 拆分公共契约、存储、护甲与日历职责。
- [x] 归组前端功能并提取个人记录与桌面界面。
- [x] 归组脚本和人工输入，保留命令及临时目录能力。
- [x] 整理文档和模块地图，完成构建与回归。

## Work Log
- 2026-11-17：用户批准完整计划并要求实施。
- 2026-11-17：创建实施分支；资源与发布指纹保存在临时基线。
- 2026-11-17：基线 182 项测试通过；发布校验通过；记录 3,731 个资料文件哈希。
- 2026-11-17：desktop 路径定向测试 10 项、Rust 原生测试 23 项通过；备份命令名称不变。
- 2026-11-17：前端归组并拆分混合职责；TypeScript 与 184 项单元测试通过。
- 2026-11-17：76 个脚本语法检查通过；脚本归组后原有 184 项测试通过。
- 2026-11-17：188 项单元测试、48 项网页、25 项 Workers、11 项桌面更新回归通过。
- 2026-11-17：23 项 Rust 测试、格式与 Clippy 检查通过；网页与桌面前端构建通过。
- 2026-11-17：3,731 个受保护文件、20 个人工输入与应用配置保持一致；发布指纹及资源 payload 不变。
- 2026-11-17：补齐工程指南、模块地图与验收记录；保留本地分支，未推送、部署或发布。

## Verification
[目录整理验收](../../../docs/verification/project-structure-verification.md) 记录命令、结果与平台限制。
