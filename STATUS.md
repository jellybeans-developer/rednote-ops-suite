# Development status

Honest product truth: official Xiaohongshu **openaccount** docs expose OAuth, device grant for web, token refresh, and basic profile (`min_user_info`). They do **not** document a general third-party note-publishing API. This project's safe ops path remains: AI prepares drafts → human hash-bound approval → human publishes in the official client → record publication/metrics locally.

## Shippable now (0.4.0)

- Local MCP draft workflow (13 core tools): check, save, get, update, cancel, review, hash-bound approval, publish-package handoff, local publication/metric records. `contentHash` includes asset file bytes and fails closed on missing files.
- Installable Grok Bot / Cursor plugin layout: root `plugin.json` (Agent Plugins 1.0), `.cursor-plugin/plugin.json`, `mcp.json` (local `node dist/cli.js`), operator `skills/`, and a Cursor safety rule. Secrets stay out of plugin files.
- Operator docs: [docs/use-with-grokbot.md](docs/use-with-grokbot.md) (Chinese + English), `npm run doctor`, `npm run grokbot:pack`, [docs/RELEASE.md](docs/RELEASE.md).
- Optional official openaccount OAuth **scaffold**, disabled by default. When explicitly enabled with `app_id` / `app_secret`, MCP exposes `start_device_auth`, `poll_device_auth`, `get_connected_profile`, `disconnect_official_oauth`. Tokens are never returned in tool results. This is **not** publish capability.
- Experimental Creator Center browser adapter, disabled by default: visible Chrome/Edge, user-completed login, image upload, title/body/topic fill, and a separately gated publish-button click. The browser keeps its session in a local profile; MCP does not export cookies.
- CI via `npm run check`. Listing copy lives in `grokbot/` for manual paste.

## Still blocked / external

- **Browser adapter is not yet live-account validated.** Selectors can break when the Creator Center UI changes. Publish click does not prove the platform accepted the note; the user must verify the result.
- **Marketplace review is external.** A maintainer must submit the public repo at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish). This repository does not invent an official one-click GrokBot import schema. `grokbot/manifest.json` remains a project-internal snapshot (`rednote-ops.grokbot-listing/v1`).
- The approval phrase plus `contentHash` only bind a review to exact content. They do not prove a human clicked. A model can still call `approve_draft`.
- HTTP deployment is single-user/single-process. Internet-facing or multi-user production still needs HTTPS, standard OAuth for the MCP itself, tenant isolation, and stronger storage.
- Registering a Xiaohongshu openaccount app, passing platform review, and obtaining any future official publish scope are the user's responsibility. OAuth ≠ publish permission.

See this status before relying on README or listing copy.
