---
status: ready
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
- [ ] 完成 desktop 改名、原生备份拆分和调用路径更新。
- [ ] 拆分公共契约、存储、护甲与日历职责。
- [ ] 归组前端功能并提取个人记录与桌面界面。
- [ ] 归组脚本和人工输入，保留命令及临时目录能力。
- [ ] 整理文档和模块地图，完成构建与回归。

## Work Log
- 2026-11-17：用户批准完整计划并要求实施。
- 2026-11-17：创建实施分支；资源与发布指纹保存在临时基线。
- 2026-11-17：基线 182 项测试通过；发布校验通过；记录 3,731 个资料文件哈希。
