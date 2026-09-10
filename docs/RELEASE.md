# Release checklist / 发版检查

Cut a GitHub-ready tag only after `main` (or the release PR) has plugin packaging, the default-off official OAuth scaffold, and green `npm run check`.

打 `vX.Y.Z` 标签前：插件清单、默认关闭的官方 OAuth 脚手架、以及 `npm run check` 都必须就绪。不要宣称可以自动发笔记。

## Commands

```bash
npm ci
npm run check
npm run grokbot:pack
npm run release:check
```

`release:check` verifies version alignment across `package.json`, `plugin.json`, `.cursor-plugin/plugin.json`, and `grokbot/manifest.json`, and that `mcp.json` has no secrets.

## Tag

Version source of truth: `package.json` `version` (currently intended `0.4.0`).

```bash
VERSION="$(node -p "require('./package.json').version")"
git tag "v${VERSION}"
git push origin "v${VERSION}"
```

Then attach `dist/grokbot-listing-${VERSION}.zip` on the GitHub Release if reviewers need listing copy. That zip is **not** an official one-click GrokBot import package.

## Marketplace next step (maintainer)

Create the Bot in Grok Bot, copy the reviewed fields from `grokbot/`, and use the product's public share-link flow. The official docs do not currently document a self-service Bot Marketplace submission API. Grok Build's separate plugin marketplace accepts pull requests at [xai-org/plugin-marketplace](https://github.com/xai-org/plugin-marketplace). Do not invent an official Grok Bot listing-import schema.

市场审核是仓库外部流程；合并本仓库的 PR 不会自动上架。
