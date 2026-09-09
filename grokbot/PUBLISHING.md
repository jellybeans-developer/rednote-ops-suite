# GrokBot 市场上架清单

本目录是**可复制的上架草稿**，用于对照 MCP 真实能力填写 GrokBot 创建页。`manifest.json` 的 schema 为项目内部清单（`rednote-ops.grokbot-listing/v1`），**不是**已核实的 GrokBot 官方导入格式。公开文档目前只描述在产品里创建 Bot、编辑资料和连接 MCP，没有可引用的官方 listing 导入规范。平台后台字段变化时，以当时显示的官方要求为准。

当前清单版本：`0.2.0`（对齐 13 个 MCP 工具、文件字节哈希，以及“批准短语不能验证人类”的披露）。

## 上架前检查清单

1. 对照 [`STATUS.md`](../STATUS.md)：没有小红书账号连接、没有自动发布适配器、市场导入格式仍未核实。
2. 本地运行 MCP，确认工具恰好为 13 个，且与 `manifest.json` 的 `requiredTools` 一致：
   `safety_status`、`check_content`、`save_draft`、`list_drafts`、`get_draft`、`update_draft`、`cancel_draft`、`submit_for_review`、`approve_draft`、`create_publish_package`、`record_publication`、`record_metrics`、`operations_summary`。
3. 部署远程 MCP 时使用 HTTPS，并配置每用户鉴权；不要把 Cookie、密码或短信验证码交给 Bot。
4. 用 Grok 的 MCP 诊断命令确认工具列表与调用成功。
5. 在 GrokBot 创建页**手工复制** `listing.zh-CN.md`、`instructions.md` 和 `privacy.md` 中对应内容；需要结构化字段时对照 `manifest.json`，不要假设可以一键导入。
6. 只授权清单中的这 13 个工具；不要给 Bot 浏览器 Cookie、密码库或任意命令执行权限。
7. 使用全新测试账号完成建议审核测试。
8. 提交市场审核时披露：非小红书官方产品、不使用私有 API、最终发布要求人工参与、批准短语不能验证人类。
9. 需要把本目录打包给评审人时，运行 `npm run grokbot:pack`。生成的 zip 只便于审阅和归档，**不能**当作官方市场导入包。

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

## 评审打包

仓库根目录执行：

```bash
npm run grokbot:pack
```

输出为 `dist/grokbot-listing-<version>.zip`，内含本目录的 Markdown/JSON 文案。zip 内会附带一份英文说明：该压缩包不是 GrokBot 官方导入格式。
