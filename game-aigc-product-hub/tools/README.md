# tools/

团队协作工具，脱离 Fat 本地环境的可独立开发部署项目。

| 目录 | 说明 | 在线地址 |
|---|---|---|
| [laotie-editor/](./laotie-editor/) | 老铁找茬王配置后台（关卡编辑、坐标标注、云端同步） | https://laotie-editor.frontend-cloud.corp.kuaishou.com |

新增工具请遵循规范：
- 独立 `package.json` + `npm run deploy` 一条命令部署
- 敏感配置（AppID/密钥）从环境变量或 Appwrite 拉，不硬编码
- 顶层 README 写清楚"新同学 5 分钟上手"步骤
