# 职业图标

这十张 PNG 来自 Guild Wars Wiki 的 `File:<Profession>-tango-icon-200.png`，对应预览中采用的 Tango 职业图标。各来源文件页声明 `GFDL image`；原作者及编辑历史可从相应文件页与历史查看，原始图形不作修改，仅从 200×200 缩小为 72×72。

逐文件来源、来源修订、原图 SHA-1、输出 SHA-256 和许可证声明保存在 [profession-icons.json](../../../data/wiki/profession-icons.json)。GFDL 全文随网站提供于 [gfdl-1.3.txt](../../../public/licenses/gfdl-1.3.txt)。

更新命令（普通网站构建不联网）：

```powershell
$env:WIKI_PROXY='http://127.0.0.1:7890'
node scripts/wiki/fetch-profession-icons.mjs
```

图标由 Vite 导入并随应用代码或 `/build/` 资源发布，纳入现有离线预缓存。
