# 在 Grok 中使用 RedNote Ops Suite

版本 0.5.1 同时提供一个 MCP 服务和一个 Grok Agent。Grok Build 可直接从 GitHub 安装，不需要下载或提交 ZIP。

本项目不是小红书官方产品。它只使用本地数据与可见的官方创作中心页面，不调用私有 API，不导出 Cookie，也不绕过二维码、验证码、设备确认、频率限制或平台风控。

## 1. 安装

先安装 Node.js 20 或更高版本，然后执行：

```bash
git clone https://github.com/jellybeans-developer/rednote-ops-suite.git
cd rednote-ops-suite
npm ci
npm run build
npm run doctor
grok plugin install jellybeans-developer/rednote-ops-suite --trust
```

Grok 会从仓库中的 `.mcp.json` 加载 `rednote_ops` MCP，并从 `agents/rednote-operator.md` 加载 Agent。MCP 使用已提交的 `plugin-dist/` 自包含运行包，安装后不依赖仓库中的 `node_modules`。也可以在仓库中直接启动 Agent：

```bash
grok --agent-profile agents/rednote-operator.md
```

若本机安装了 Grok CLI，可额外运行 `grok plugin validate .`。

## 2. MCP 与 Agent 的分工

- MCP 负责内容检查、草稿、排期、哈希审批、发布交接、浏览器填稿、发布点击及本地审计。
- `rednote-operator` Agent 负责按正确顺序调用工具，并在登录、风控、逐稿批准和最终发布处保留边界。
- `.grok-plugin/plugin.json` 是插件清单；`.grok-plugin/marketplace.json` 允许把本仓库作为自定义插件市场来源。

## 3. 默认安全状态

Grok 原生插件默认启用可见浏览器与受控发布能力，即 `REDNOTE_CREATOR_ALLOW_PUBLISH=true`。登录由用户在官方页面完成，浏览器状态保存在 Grok 插件数据目录，不会进入 Git。默认开启只代表 Agent 可以调用最终发布工具，不会取消逐稿批准、哈希匹配或固定确认短语。

如果只需要草稿工作流，可将 `REDNOTE_CREATOR_BROWSER_ENABLED` 设为 `false`；如果只需要自动填稿，可将 `REDNOTE_CREATOR_ALLOW_PUBLISH` 设为 `false`。每条发布仍需最新 `contentHash`、用户在当前会话中的明确发布要求，以及固定确认短语 `PUBLISH_TO_XIAOHONGSHU`。

## 4. 推荐工作流

1. `safety_status`
2. `check_content`
3. `save_draft`
4. `submit_for_review`
5. 用户核对完整内容、素材与当前哈希
6. `approve_draft`
7. `create_publish_package`
8. `creator_session_status`；如未登录，调用 `start_creator_login` 并由用户完成官方验证
9. `prepare_creator_publish`
10. 用户明确要求发布且开关允许时，调用 `publish_creator_draft`
11. 平台返回成功后调用 `record_publication`
12. 后续检查创作中心审核状态并用 `record_metrics` 记录真实数据

发布按钮被点击不等于平台已接受，平台接受也不等于最终审核通过。Agent 必须如实区分这三种状态。

## 5. 验证与风控

二维码、验证码、扫码确认、登录异常和设备校验只能由用户在小红书官方页面处理。本项目不会尝试绕过。浏览器会保留正常登录会话，因此平台未再次要求验证时，后续操作可以复用；是否再次验证完全由平台决定。

## 6. Grok.com 自定义连接器

Grok.com 的自定义 MCP 连接器需要一个公网可访问的 HTTP MCP 地址。可使用 `node dist/cli.js --http` 启动服务，再通过 HTTPS 反向代理发布并设置强随机 Bearer Token。远程服务只能控制它所在机器上的浏览器；若要使用本机 Chrome/Edge 发布，优先使用本地 Grok Build 插件。

## 7. 上架

任何人现在都可以通过 GitHub 仓库直接安装。进入 xAI 官方 Grok Build 插件目录还需要向 [xai-org/plugin-marketplace](https://github.com/xai-org/plugin-marketplace) 提交 PR，并把来源固定到完整的 40 位提交 SHA。仓库中的 `grokbot/` 保留应用内 Bot 的名称、介绍和隐私文案，但不再生成 ZIP。

---

## English quick guide

RedNote Ops Suite 0.5.1 contains one MCP server and one native Grok Agent. Install it directly from GitHub:

```bash
npm ci
npm run build
grok plugin install jellybeans-developer/rednote-ops-suite --trust
grok --agent-profile agents/rednote-operator.md
```

The plugin loads `.mcp.json`, `agents/rednote-operator.md`, and the bundled skills. Visible Creator Center publishing is enabled by default, but every final click still requires an exact per-draft content hash, explicit user intent, and confirmation phrase. Never bypass QR, CAPTCHA, device checks, rate limits, or risk controls. A click, platform acceptance, and final content approval are distinct states.
