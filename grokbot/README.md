# GrokBot 市场发布包

这个目录包含创建“小红书安全运营助手”Bot 所需的可复制材料。当前清单版本为 `0.3.0`，与仓库中默认的 13 个 MCP 工具对齐。

`manifest.json` 是本项目的可移植清单，用于版本管理和审核。它使用项目内部 schema `rednote-ops.grokbot-listing/v1`，**不是**已核实的 GrokBot 市场官方导入格式。不要假设存在一键导入。

可安装插件文件在仓库根目录：`plugin.json`、`.cursor-plugin/plugin.json`、`mcp.json`、`skills/`。Grok Bot 可在应用内创建并生成公开分享链接；官方尚未公开 Bot Marketplace 自助提交接口。Grok Build 的独立插件市场通过 [xai-org/plugin-marketplace](https://github.com/xai-org/plugin-marketplace) 接收 PR。

Bot 依赖本仓库构建后的 `rednote-ops` MCP（`node dist/cli.js`）。建议先使用本地 stdio；公开上架时部署 HTTPS MCP，并用环境变量传递至少 32 位 Bearer Token。插件文件里不要放密钥。

任何用户都必须使用自己的小红书账号。Bot 不索取 Cookie、密码、短信验证码，也不提供逆向接口。Grok 插件默认允许在可见的官方创作中心执行受控发布，但每条发布仍需要用户明确要求、当前内容哈希和固定确认短语；平台验证必须由用户完成。可选的官方 openaccount OAuth 脚手架默认关闭，启用后也只做设备授权与 `min_user_info`，**不能发笔记**。

能力与限制以仓库根目录的 [`STATUS.md`](../STATUS.md) 和 [`docs/use-with-grokbot.md`](../docs/use-with-grokbot.md) 为准。
