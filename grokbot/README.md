# GrokBot 市场发布包

这个目录包含创建“小红书安全运营助手”Bot 所需的可复制材料。`manifest.json` 是本项目的可移植清单，用于版本管理和审核；如果 GrokBot 市场后台没有清单导入功能，请按 `PUBLISHING.md` 将字段复制到创建页面。

Bot 依赖本仓库的 `rednote-ops` MCP。建议先使用本地 stdio 测试，公开上架时部署 HTTPS MCP，并启用 OAuth 或至少 32 位的随机 Bearer Token。

任何用户都必须使用自己的小红书账号与获批的官方能力。Bot 不索取 Cookie、密码、短信验证码，也不提供逆向接口或绕过风控的方法。
