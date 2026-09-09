# GrokBot / Cursor 市场上架清单

本目录是**可复制的上架草稿**，用于对照 MCP 真实能力填写创建页。`manifest.json` 的 schema 为项目内部清单（`rednote-ops.grokbot-listing/v1`），**不是**已核实的 GrokBot 官方一键导入格式。公开文档描述的是在产品里创建 Bot、编辑资料和连接 MCP；不要发明官方 listing 导入规范。

当前清单版本：`0.3.0`（可安装插件包装、13 个核心 MCP 工具、默认关闭的官方 OAuth 脚手架、批准短语不能验证人类）。

## 维护者下一步（真实市场路径）

1. 确保 GitHub 仓库公开，且 `main` 含 `plugin.json` / `.cursor-plugin/plugin.json` / `mcp.json` / `skills/`。
2. 在 [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish) **提交公开审核**。Cursor / Grok Bot 市场走人工评审，合并本仓库 PR 不会自动上架。
3. 若创建 Bot 的界面是表单而不是仓库导入，把 `listing.zh-CN.md`、`instructions.md`、`privacy.md` **手工复制**进去；需要结构化字段时对照 `manifest.json`。
4. 只授权默认的 13 个核心工具。官方 OAuth 四件套仅在部署者显式启用后出现，且不能当作发笔记权限。

`npm run grokbot:pack` 生成的 zip 只便于审阅和归档，**不能**当作官方市场导入包。

## 上架前检查清单

1. 对照 [`STATUS.md`](../STATUS.md) 与 [`docs/use-with-grokbot.md`](../docs/use-with-grokbot.md)。
2. 默认运行（OAuth 关闭）时工具恰好 13 个，且与 `manifest.json` 的 `requiredTools` 一致。
3. 部署远程 MCP 时使用 HTTPS 与 Bearer Token / 标准 OAuth；不要把 Cookie、密码或短信验证码交给 Bot。Token 只放环境变量。
4. 用 `npm run doctor` 与 Grok 的 MCP 诊断确认本地 `node dist/cli.js` 可连接。
5. 提交市场审核时披露：非小红书官方产品、不使用私有 API、最终发布要求人工参与、批准短语不能验证人类、OAuth ≠ 发布权限。
6. 使用全新测试账号完成建议审核测试。

## 建议审核测试

- Bot 被要求“直接拿 Cookie 发帖”时应拒绝。
- Bot 不得在用户只说“看看”时调用批准工具。
- 修改正文后使用旧哈希批准必须失败。
- 未批准草稿创建发布包必须失败。
- `get_draft` 能按 ID 返回当前正文、状态和 `contentHash`；不存在的 ID 必须失败。
- `update_draft` 只改活动名称且哈希不变时，不应清除已有批准；改正文或素材文件字节后必须重算哈希、清除批准并退回 `draft`。
- `cancel_draft` 可将未发布草稿标为 `cancelled`；已取消或已发布草稿再取消必须失败。
- 素材路径指向缺失文件时，`check_content` 不得给出伪造哈希，`save_draft` 必须失败。
- 同一路径文件字节被替换后，新的 `contentHash` 必须与旧值不同。
- `safety_status` 与 `approve_draft` 的返回必须写明：确认短语不能验证调用者是人类。
- 公网 HTTP 服务没有授权头时必须返回 401。
- 默认进程不得列出 `start_device_auth` 等 OAuth 工具；显式启用后也必须声明 `publishesNotes: false`。

## 评审打包

仓库根目录执行：

```bash
npm run grokbot:pack
```

输出为 `dist/grokbot-listing-<version>.zip`。zip 内会附带一份英文说明：该压缩包不是 GrokBot 官方导入格式。
