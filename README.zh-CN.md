# RedNote Ops Suite

开发中：当前是本地运营工作流原型，尚未连接小红书，Bot 市场格式尚未核实。现有确认短语不能验证真人身份。详见 [STATUS.md](STATUS.md)。

一个安全优先的小红书运营工具包，包含可供 Grok 调用的 MCP 服务，以及 GrokBot 市场发布材料。

> 本项目不是小红书官方产品，也未获小红书背书。它不提供私有 API 逆向、Cookie 登录、验证码绕过、刷量或无人值守发布。最终发布必须由人在小红书官方客户端确认，或由部署者自己获批的官方能力完成。

## 为什么这样设计

公开可查的小红书开放能力以账号授权、基础资料和唤起官方客户端分享为主，并不等于普通账号拥有静默批量发布 API。把 Cookie 或私有签名交给第三方 MCP，会同时带来账号、隐私和供应链风险。本项目把 AI 擅长的策划与整理自动化，把不可逆的公开发布留在人类审批边界之后。

## 包含什么

- `rednote-ops` MCP：stdio 与 Streamable HTTP 两种传输
- 本地 JSON 数据库与 JSONL 审计日志
- 内容预检、草稿、排期、基于内容哈希的人工审批
- 发布交接包、发布结果记录与手工指标复盘
- GrokBot 角色指令、市场文案、隐私说明和上架清单
- GitHub Actions、Docker 部署、贡献指南、安全策略和测试

## 快速开始

需要 Node.js 20 或更高版本。

```bash
git clone https://github.com/YOUR_NAME/rednote-ops-suite.git
cd rednote-ops-suite
npm ci
npm run build
```

把 MCP 加到 Grok 项目配置：

```bash
grok mcp add --scope project rednote_ops -- node dist/cli.js
grok mcp doctor rednote_ops
```

也可以复制 `.grok/config.toml.example` 为 `.grok/config.toml`。不要把真实 Token 写进 Git。

## 典型工作流

1. `check_content`：本地预检内容。
2. `save_draft`：保存草稿并得到 `contentHash`。
3. `submit_for_review`：进入人工审核，可设置排期。
4. 在界面中检查完整内容、素材和哈希。
5. `approve_draft`：人明确同意后，提交固定确认短语和当前哈希。
6. `create_publish_package`：生成发布交接包。
7. 人在官方客户端完成发布，再用 `record_publication` 记账。
8. 用 `record_metrics` 录入真实数据，再通过 `operations_summary` 复盘。

任何内容修改都会改变 SHA-256 哈希，旧的批准不能复用。

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

## GrokBot 上架

见 [`grokbot/PUBLISHING.md`](grokbot/PUBLISHING.md)。市场字段可能调整，因此仓库中的 `manifest.json` 是可审计的项目清单，不宣称是 GrokBot 官方导入格式。

## 配置

| 变量 | 默认值 | 说明 |
|---|---:|---|
| `REDNOTE_DATA_DIR` | `.rednote-ops` | 本地数据与审计目录 |
| `REDNOTE_READ_ONLY` | `false` | 为 `true` 时拒绝所有写操作 |
| `REDNOTE_HOST` | `127.0.0.1` | HTTP 监听地址 |
| `REDNOTE_PORT` | `3210` | HTTP 端口 |
| `REDNOTE_MCP_TOKEN` | 空 | HTTP Bearer Token；非回环监听时强制要求 |

## 当前限制

- 内容限制和平台政策会变化；内置检查只做提示。
- 指标目前由人录入，避免抓取页面或使用未公开接口。
- JSON 存储面向单实例、小团队；生产多租户部署应实现数据库适配器。
- 官方发布适配器需要开发者自己获得小红书相应资格与权限后贡献或配置。

## 开源与安全

Apache-2.0 许可。提交代码前运行 `npm run check`。安全问题请使用 GitHub 私密漏洞报告，不要在 Issue 中粘贴账号凭据或真实用户数据。

架构与扩展边界见 [`docs/architecture.md`](docs/architecture.md)，安全分析见 [`docs/threat-model.md`](docs/threat-model.md)。
