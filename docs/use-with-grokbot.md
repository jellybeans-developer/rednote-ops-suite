# Use with Grok Bot today / 今天就用 Grok Bot

This package is installable as a local MCP plus an Agent Plugin / Cursor plugin. It does **not** auto-publish to Xiaohongshu. Official openaccount docs cover OAuth and basic profile (`min_user_info`); they do **not** document a general third-party note-publishing API.

本包装成本地 MCP，并带有 Agent Plugins / Cursor 插件清单。它**不会**自动发小红书。官方 openaccount 文档覆盖 OAuth 与基础资料，**没有**通用第三方发笔记 API。

## English

### 1. Install (Node 20+)

```bash
git clone https://github.com/jellybeans-developer/rednote-ops-suite.git
cd rednote-ops-suite
node -v   # must be v20 or newer
npm ci
npm run build
npm run doctor
```

`npm run doctor` checks Node, `dist/cli.js`, and plugin manifests. It does not talk to Xiaohongshu.

### 2. Connect local MCP

Primary path (stdio, no secrets in git):

```bash
grok mcp add --scope project rednote_ops -- node dist/cli.js
grok mcp doctor rednote_ops
```

Or copy `.grok/config.toml.example` to `.grok/config.toml`.

Cursor / Grok Bot plugin layout at the repo root:

- `plugin.json` — Agent Plugins 1.0 manifest
- `.cursor-plugin/plugin.json` — Cursor plugin manifest
- `mcp.json` — local stdio MCP (`node dist/cli.js`)
- `skills/` — operator workflow and refusal skills

Local plugin smoke test in Cursor: symlink this repo to `~/.cursor/plugins/local/rednote-ops-suite`, then reload. Build `dist/cli.js` first.

### 3. Optional remote HTTP MCP (bearer token)

```bash
export REDNOTE_MCP_TOKEN="$(openssl rand -hex 32)"
node dist/cli.js --http
grok mcp add --transport http rednote_ops https://mcp.example.com/mcp --header "Authorization: Bearer ${REDNOTE_MCP_TOKEN}"
```

Keep the token in the environment, never in `mcp.json`, plugin manifests, or git. Loopback HTTP may omit the token; non-loopback binding requires 32+ characters.

### 4. Operator doctor checklist

- [ ] `node -v` is 20+
- [ ] `npm ci` and `npm run build` succeeded
- [ ] `npm run doctor` exits 0
- [ ] `grok mcp doctor rednote_ops` lists the 13 core tools
- [ ] `safety_status` says no cookies, no silent publish, approval phrase does not authenticate a human
- [ ] Official OAuth tools are **absent** unless you set `REDNOTE_OPENACCOUNT_OAUTH_ENABLED=true` with your own app id/secret

### 5. Human publish steps

1. `check_content` → `save_draft` → `submit_for_review`
2. Human reviews title, body, topics, assets, and `contentHash`
3. `approve_draft` with `I_APPROVE_PUBLICATION` and the current hash (this does not prove a human clicked)
4. `create_publish_package`
5. Paste into the **official Xiaohongshu client** and publish yourself
6. `record_publication` then later `record_metrics`

### What Grok Bot can do today

Draft, lint, hash, approve-gate, handoff package, local audit, manual metrics. Optional official OAuth (off by default) can do device grant / token refresh / `min_user_info` only.

### What it still cannot do

Cookie login, private API publishing, CAPTCHA solving, signature reverse engineering, unattended posting, or marketplace listing until a maintainer submits https://cursor.com/marketplace/publish for public review. OAuth ≠ publish permission. Registering an official app is your responsibility.

## 中文

### 1. 安装（Node 20+）

```bash
git clone https://github.com/jellybeans-developer/rednote-ops-suite.git
cd rednote-ops-suite
node -v   # 需要 20 或更高
npm ci
npm run build
npm run doctor
```

### 2. 连接本地 MCP

```bash
grok mcp add --scope project rednote_ops -- node dist/cli.js
grok mcp doctor rednote_ops
```

插件清单在仓库根目录：`plugin.json`、`.cursor-plugin/plugin.json`、`mcp.json`、`skills/`。`mcp.json` 只声明本地 `node dist/cli.js`，不含密钥。

### 3. 可选远程 HTTP MCP

使用环境变量中的 Bearer Token，不要把 token 写进插件文件。非回环监听必须提供至少 32 位 `REDNOTE_MCP_TOKEN`。

### 4. 操作员检查清单

- [ ] Node 20+，`npm ci` / `npm run build` / `npm run doctor` 通过
- [ ] `grok mcp doctor rednote_ops` 能看到 13 个核心工具
- [ ] `safety_status` 写明：无 Cookie、无静默发布、确认短语不能验证人类
- [ ] 未显式启用官方 OAuth 时，不应出现设备授权工具

### 5. 人工发布

AI 准备草稿 → 哈希绑定批准 → **人在官方客户端点发布** → 本地 `record_publication` / `record_metrics`。

官方 OAuth 脚手架默认关闭。启用后也只做扫码授权与基础资料；**不能发笔记**。注册开放平台应用是使用者自己的责任。
