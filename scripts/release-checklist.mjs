#!/usr/bin/env node
/**
 * 发版前核对版本号与插件清单。不替代 npm run check。
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relativePath) {
  return JSON.parse(await readFile(join(repoRoot, relativePath), "utf8"));
}

const pkg = await readJson("package.json");
const plugin = await readJson("plugin.json");
const grokPlugin = await readJson(".grok-plugin/plugin.json");
const grokMarketplace = await readJson(".grok-plugin/marketplace.json");
const cursorPlugin = await readJson(".cursor-plugin/plugin.json");
const listing = await readJson("grokbot/manifest.json");
const mcp = await readJson("mcp.json");
const grokMcp = await readJson(".mcp.json");
const version = pkg.version;

const mismatches = [];
if (plugin.version !== version) mismatches.push(`plugin.json version ${plugin.version} != ${version}`);
if (grokPlugin.version !== version) mismatches.push(`.grok-plugin/plugin.json version ${grokPlugin.version} != ${version}`);
if (grokMarketplace.plugins?.[0]?.version !== version) mismatches.push(`.grok-plugin/marketplace.json version does not equal ${version}`);
if (cursorPlugin.version !== version) mismatches.push(`.cursor-plugin/plugin.json version ${cursorPlugin.version} != ${version}`);
if (listing.version !== version) mismatches.push(`grokbot/manifest.json version ${listing.version} != ${version}`);
if (plugin.name !== "rednote-ops-suite" || cursorPlugin.name !== "rednote-ops-suite" || grokPlugin.name !== "rednote-ops-suite") {
  mismatches.push("plugin name must be rednote-ops-suite");
}
if (JSON.stringify({ mcp, grokMcp }).match(/Bearer |app_secret|sk_/i)) {
  mismatches.push("MCP configurations must not contain secrets");
}
if (listing.disclosures?.marketplaceImportFormatVerified) {
  mismatches.push("do not claim a verified GrokBot import schema");
}

if (mismatches.length) {
  for (const item of mismatches) process.stderr.write(`${item}\n`);
  process.exit(1);
}

process.stdout.write(`release checklist passed for v${version}\n`);
process.stdout.write(`Tag with: git tag v${version} && git push origin v${version}\n`);
process.stdout.write("Direct install: grok plugin install jellybeans-developer/rednote-ops-suite --trust\n");
process.stdout.write("Grok Build plugin catalog: submit a PR to https://github.com/xai-org/plugin-marketplace\n");
process.stdout.write("No zip bundle is required or generated.\n");
