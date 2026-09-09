# RedNote Ops Suite

Development prototype: no live Xiaohongshu connection or verified marketplace integration yet. The approval phrase does not authenticate a human. See [STATUS.md](STATUS.md).

Safety-first Xiaohongshu/RedNote operations for Grok: an open-source MCP server plus a versioned GrokBot marketplace package.

This is not an official Xiaohongshu product. It does not request cookies, passwords, SMS codes, or private API signatures; it does not bypass platform controls or perform unattended publishing. AI prepares and checks work, while a human approves the exact content hash and finishes publication in an official client or through an independently approved official integration.

## Quick start

```bash
npm ci
npm run build
grok mcp add --scope project rednote_ops -- node dist/cli.js
grok mcp doctor rednote_ops
```

The server includes content checks, draft storage, scheduling, hash-bound human approval, publication handoff packages, a local audit trail, and manual metric snapshots. It supports local stdio and authenticated Streamable HTTP.

Chinese documentation: [README.zh-CN.md](README.zh-CN.md)  
GrokBot package: [grokbot/README.md](grokbot/README.md)  
Security model: [SECURITY.md](SECURITY.md)

## Development

```bash
npm install
npm run check
```

Licensed under Apache-2.0.
