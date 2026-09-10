# RedNote Ops Suite

0.5.1 提供一个 MCP 服务和一个 `rednote-operator` Agent，并在 Grok 插件中默认开启受控的最终发布能力。本机创作中心适配器已用国内账号验证登录、自动填稿及一次成功发布；网页结构变化仍可能导致失效。详见 [STATUS.md](STATUS.md)。

一个安全优先的小红书运营工具包，包含可供 Grok / Cursor 调用的 MCP 服务、Grok Agent、插件清单与市场文案。

> 本项目不是小红书官方产品，也未获小红书背书。它不提供私有 API 逆向、Cookie 导出、验证码或风控绕过、刷量。Grok 插件默认允许受控的最终发布点击，但仍只在可见的官方创作中心执行，并要求逐稿哈希与固定短语确认。官方 openaccount OAuth 只覆盖授权与基础资料，不是发笔记权限。

## 为什么这样设计

公开可查的小红书开放能力以账号授权、基础资料和唤起官方客户端分享为主，并不等于普通账号拥有静默批量发布 API。把 Cookie 或私有签名交给第三方 MCP，会同时带来账号、隐私和供应链风险。本项目把 AI 擅长的策划与整理自动化，把不可逆的公开发布留在人类审批边界之后。

## 包含什么

- `rednote-ops` MCP：stdio 与 Streamable HTTP 两种传输
- 本地 JSON 数据库与 JSONL 审计日志
- 内容预检、草稿（含读取/更新/取消）、排期、基于内容哈希的审批（不能验证真人身份）
- 发布交接包、发布结果记录与手工指标复盘
- Grok 原生 `agents/rednote-operator.md`、`.mcp.json`、市场清单与隐私说明
- 仓库根目录的 `plugin.json` / `mcp.json` / `skills/`，便于作为 Cursor / Grok Bot 插件安装
- GitHub Actions、Docker 部署、贡献指南、安全策略和测试
- 可选的本机 Chrome/Edge 创作中心适配器：用户亲自登录，程序上传图片、填写内容，并可在独立开关启用后点击发布

## 快速开始

需要 Node.js 20 或更高版本。

```bash
git clone https://github.com/jellybeans-developer/rednote-ops-suite.git
cd rednote-ops-suite
npm ci
npm run build
npm run doctor
```

直接从 GitHub 安装 Grok 插件并启动 Agent：

```bash
grok plugin install jellybeans-developer/rednote-ops-suite --trust
grok --agent-profile agents/rednote-operator.md
```

也可以复制 `.grok/config.toml.example` 为 `.grok/config.toml`。不要把真实 Token 写进 Git。

## 典型工作流

1. `check_content`：本地预检内容。素材路径存在时会读取文件字节计入哈希；缺失则明确失败，不会伪造字节。
2. `save_draft`：保存草稿并得到 `contentHash`。
3. `get_draft` / `list_drafts`：读取单条或列出草稿。
4. `update_draft`：修改草稿；内容哈希变化时清除批准并退回 `draft`。
5. `submit_for_review`：进入人工审核，可设置排期。
6. 在界面中检查完整内容、素材和哈希。
7. `approve_draft`：提交固定确认短语和当前哈希。该短语不能验证调用者是人类，模型也可以调用。
8. `create_publish_package`：生成发布交接包。
9. 默认由人在官方客户端发布；若单独启用浏览器发布开关，可调用 `prepare_creator_publish`，在逐稿确认后调用 `publish_creator_draft`。平台返回成功后再用 `record_publication` 记账。
10. 用 `record_metrics` 录入真实数据，再通过 `operations_summary` 复盘。
11. `cancel_draft`：取消尚未发布的草稿。

任何内容或素材字节修改都会改变 SHA-256 哈希，旧的批准不能复用。

## HTTP 模式

本机测试：

```bash
npm run build
node dist/cli.js --http
```

端点为 `http://127.0.0.1:3210/mcp`，健康检查为 `/healthz`。连接 Grok：

```bash
grok mcp add --transport http rednote_ops http://127.0.0.1:3210/mcp
```

远程部署至少设置：

```text
REDNOTE_HOST=0.0.0.0
REDNOTE_PORT=3210
REDNOTE_MCP_TOKEN=<至少 32 位随机值>
REDNOTE_DATA_DIR=/var/lib/rednote-ops
```

然后通过 HTTPS 反向代理暴露，并在 Grok 中使用环境变量传递授权头：

```bash
grok mcp add --transport http rednote_ops https://mcp.example.com/mcp --header "Authorization: Bearer ${REDNOTE_MCP_TOKEN}"
```

Bearer Token 适合单用户或可信团队的初始部署。公众多租户服务必须增加标准 OAuth、租户隔离、限流、加密存储、备份和数据删除接口。

## Grok Agent 安装与上架

见 [`docs/use-with-grokbot.md`](docs/use-with-grokbot.md) 与 [`grokbot/PUBLISHING.md`](grokbot/PUBLISHING.md)。Grok Build 可以直接从此 GitHub 仓库安装，并自动发现 `.mcp.json`、`agents/` 与 `skills/`。进入 xAI 官方公共插件目录仍需向 `xai-org/plugin-marketplace` 提交 PR；仓库不再生成或保存 ZIP 上架包。

## 实验性模拟登录与发布

本功能只能在安装了 Chrome 或 Edge 的本机运行。用户必须在弹出的官方创作中心页面亲自扫码或完成验证。

```text
REDNOTE_CREATOR_BROWSER_ENABLED=true
REDNOTE_CREATOR_BROWSER_CHANNEL=chrome
REDNOTE_CREATOR_ALLOW_PUBLISH=true
```

重启 MCP 后依次调用：`start_creator_login` → 用户登录 → `creator_session_status` → 正常草稿审批流程 → `prepare_creator_publish`。Grok 插件已默认允许最终发布工具；用户明确要求发布且当前哈希一致时，再调用 `publish_creator_draft`。如只希望自动填稿，将 `REDNOTE_CREATOR_ALLOW_PUBLISH=false` 后重启 MCP。

浏览器登录状态由 Chrome/Edge 自己保存在 `REDNOTE_DATA_DIR/creator-browser-profile`。不要把该目录提交到 Git。网页自动化没有使用反检测参数，也不会导出 Cookie。发布工具点击后不会擅自把本地草稿标为已发布；只有创作中心返回成功并取得公开笔记 ID 后，才调用 `record_publication`。平台可能随后审核拒绝，因此仍需检查内容管理状态。

## 配置

| 变量 | 默认值 | 说明 |
|---|---:|---|
| `REDNOTE_DATA_DIR` | `.rednote-ops` | 本地数据与审计目录 |
| `REDNOTE_READ_ONLY` | `false` | 为 `true` 时拒绝所有写操作 |
| `REDNOTE_HOST` | `127.0.0.1` | HTTP 监听地址 |
| `REDNOTE_PORT` | `3210` | HTTP 端口 |
| `REDNOTE_MCP_TOKEN` | 空 | HTTP Bearer Token；非回环监听时强制要求 |
| `REDNOTE_OPENACCOUNT_OAUTH_ENABLED` | `false` | 显式设为 `true` 才注册官方 OAuth 工具 |
| `REDNOTE_OPENACCOUNT_APP_ID` / `APP_SECRET` | 空 | 仅启用 OAuth 时必填；由使用者自己注册官方应用 |
| `REDNOTE_OPENACCOUNT_BASE_URL` | 官方生产地址 | 只允许官方 openaccount 生产或 beta 主机 |
| `REDNOTE_CREATOR_BROWSER_ENABLED` | `false` | 启用本机可见浏览器模拟登录与填稿 |
| `REDNOTE_CREATOR_BROWSER_CHANNEL` | `chrome` | 使用 `chrome` 或 `msedge` |
| `REDNOTE_CREATOR_PROFILE_DIR` | 数据目录下的 Profile | 浏览器保存登录会话的位置 |
| `REDNOTE_CREATOR_ALLOW_PUBLISH` | MCP 核心默认 `false`；Grok 插件默认 `true` | 允许工具点击最终发布按钮的独立开关 |

## 当前限制

- 内容限制和平台政策会变化；内置检查只做提示。
- 指标目前由人录入，避免抓取页面或使用未公开接口。
- JSON 存储面向单实例、小团队；生产多租户部署应实现数据库适配器。
- 官方发布适配器需要开发者自己获得小红书相应资格与权限后贡献或配置。当前脚手架只做 OAuth / `min_user_info`，不能发笔记。

## 开源与安全

Apache-2.0 许可。提交代码前运行 `npm run check`。安全问题请使用 GitHub 私密漏洞报告，不要在 Issue 中粘贴账号凭据或真实用户数据。

架构与扩展边界见 [`docs/architecture.md`](docs/architecture.md)，安全分析见 [`docs/threat-model.md`](docs/threat-model.md)。
