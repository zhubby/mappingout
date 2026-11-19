# MappingOut - 泰瑞亚离线地图与个人探索记录
React 19 + TypeScript 5.9 + Vite 7 + Tauri 2 + Rust 2021。

<directory>
src/ - app 编排、features 功能、shared 共用能力、storage 与 platform。
desktop/ - 原生备份、签名资源和程序更新。
container/ - 非 root 容器静态服务和 HTTP 缓存配置。
scripts/ - build、desktop、legacy、validate 与 Wiki、翻译、资源工具。
tests/ - 领域、存储、分发与桌面生命周期测试。
e2e/ - 浏览器交互和部署回归。
public/ - 必须提交的地图、资料、字体与许可输入。
data/ - 地图核对、Wiki 人工输入与快照、翻译基线和复核证据。
docs/ - guides 现行指南、releases 说明、verification 验收与 images 截图。
.github/ - 三平台桌面签名与双架构容器发布工作流。
.context/ - 已完成的任务和技能实施记录。
</directory>

<config>
package.json - Node.js >=24；前端开发、测试和桌面构建入口。
index.html - Web 与桌面共用入口；页面元数据和网站图标声明。
Dockerfile - Node.js 24 构建；Nginx 提供 amd64 与 arm64 静态站点。
compose.yaml - GHCR 镜像、端口、只读文件系统与健康检查。
playwright.container.config.ts - 最终容器镜像的浏览器分发验收。
playwright.updates.config.ts - 生产桌面前端的更新生命周期回归。
desktop/tauri.conf.json - 应用身份、窗口与安装包配置。
desktop/tauri.updater.conf.json - 程序更新公钥与正式频道。
desktop/resources.config.json - 独立资源公钥与兼容频道。
</config>

应用身份、生产 origin 和更新公钥保持稳定。
程序更新与资源更新使用独立签名。
所有单选下拉共用 Select；保留键盘与触摸交互。
任务攻略独立懒加载；角色记录与备份使用 v3。
职业技能独立懒加载；按版本和效果分项检索。
Wiki 修订固定；机器辅助译文保持待审状态。
程序更新在启动时或用户手动操作时检查。
安装前完成资源准备、写入排空与个人备份。
正式发布遵守现有资料、字体与版本校验。
容器复用 Web 产物与缓存契约；个人记录留在浏览器。
新增文件更新模块地图；业务文件维护 INPUT/OUTPUT/POS。
[PROTOCOL]: Update this header on change, then check AGENTS.md
