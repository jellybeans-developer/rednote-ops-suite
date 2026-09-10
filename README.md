# RedNote Ops Suite

Version 0.5.1 ships a native Grok Build plugin: one MCP server plus the `rednote-operator` agent. Its visible Creator Center flow enables the guarded final publish action by default, while still requiring an exact per-draft confirmation. See [STATUS.md](STATUS.md).

Safety-first Xiaohongshu/RedNote operations for Grok and Cursor: an open-source MCP server, a native Grok Agent, and portable plugin manifests.

This is not an official Xiaohongshu product. It does not request cookies, passwords, SMS codes, or private API signatures, and it never bypasses QR, CAPTCHA, device confirmation, rate limits, or platform risk controls. AI prepares and checks work; Grok plugin publishing is enabled by default but remains separately gated, hash-bound, visible, and confirmation-based. Official openaccount OAuth is profile/login scaffolding only — not publish permission.

## Quick start

```bash
npm ci
npm run build
npm run doctor
grok plugin install jellybeans-developer/rednote-ops-suite --trust
grok --agent-profile agents/rednote-operator.md
```

Stranger install and Grok Bot usage: [docs/use-with-grokbot.md](docs/use-with-grokbot.md)
Chinese documentation: [README.zh-CN.md](README.zh-CN.md)
Grok listing copy: [grokbot/README.md](grokbot/README.md)
Security model: [SECURITY.md](SECURITY.md)

## Development

```bash
npm install
npm run check
```

Licensed under Apache-2.0.
