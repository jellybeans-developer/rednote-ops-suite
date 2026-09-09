# RedNote Ops Suite

Local draft ops and plugin packaging are shippable in 0.3.0. There is no auto-publish, and marketplace listing still needs a maintainer submission. The approval phrase does not authenticate a human. See [STATUS.md](STATUS.md).

Safety-first Xiaohongshu/RedNote operations for Grok Bot / Cursor: an open-source MCP server, Agent Plugin / Cursor plugin layout, and versioned listing copy.

This is not an official Xiaohongshu product. It does not request cookies, passwords, SMS codes, or private API signatures; it does not bypass platform controls or perform unattended publishing. AI prepares and checks work, while a human approves the exact content hash and finishes publication in an official client. Official openaccount OAuth (optional, off by default) is profile/login scaffolding only — not publish permission.

## Quick start

```bash
npm ci
npm run build
npm run doctor
grok mcp add --scope project rednote_ops -- node dist/cli.js
grok mcp doctor rednote_ops
```

Stranger install and Grok Bot usage: [docs/use-with-grokbot.md](docs/use-with-grokbot.md)  
Chinese documentation: [README.zh-CN.md](README.zh-CN.md)  
GrokBot listing copy: [grokbot/README.md](grokbot/README.md)  
Security model: [SECURITY.md](SECURITY.md)

## Development

```bash
npm install
npm run check
```

Licensed under Apache-2.0.
