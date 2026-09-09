# Architecture

```text
Grok / GrokBot
      │ MCP (stdio or authenticated HTTPS)
      ▼
RedNote Ops MCP
  ├─ deterministic content checks (asset hashes use file bytes)
  ├─ draft and schedule workflow (get / update / cancel)
  ├─ hash-bound approval gate (does not authenticate a human)
  ├─ publication handoff package
  ├─ manual metrics and summaries
  └─ optional official openaccount OAuth (disabled by default; device grant / min_user_info only)
      │
      ▼
Local JSON data + metadata-only JSONL audit
(+ openaccount-oauth.json when OAuth is enabled; never logged)

Human reviewer ──► official Xiaohongshu client
                 (no cookie/private-API publisher in this repo)
```

The trust boundary is intentionally before publication. The MCP server can prepare a publication package only after `approve_draft` is called with the exact SHA-256 hash. That call does not prove a human made it. The server cannot turn the package into an undocumented Xiaohongshu request.

Installable Agent Plugin / Cursor plugin files live at the repository root (`plugin.json`, `.cursor-plugin/plugin.json`, `mcp.json`, `skills/`). They launch `node dist/cli.js` and must not contain secrets.

## Adapter policy

This repository ships one gated official adapter: Xiaohongshu **openaccount** OAuth (device grant, token refresh, `min_user_info`). It is disabled by default, requires env-provided `app_id` / `app_secret`, never logs tokens, and does not publish notes. Official openaccount documentation does not describe a general third-party note-publishing API. OAuth is not publish permission. Registering an official app is the deployer's responsibility.

Future publication or analytics adapters must:

1. Use a current, publicly documented official API or SDK available to the deployer.
2. Declare every required scope and eligibility condition.
3. Keep client secrets and refresh tokens out of MCP tool results and logs.
4. Preserve the content-hash approval gate and surface the destination account.
5. Be disabled by default and covered by contract tests.
6. Never fall back to cookies, browser fingerprinting, CAPTCHA solving, request signing reverse engineering, or anti-detection techniques.

The public account OAuth capability and the share SDK are distinct from a server-side, unattended content publishing API. An approved login scope must not be treated as publishing permission.
