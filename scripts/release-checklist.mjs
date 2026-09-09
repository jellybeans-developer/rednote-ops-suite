#!/usr/bin/env node
/**
 * 发版前核对版本号与插件清单。不替代 npm run check。
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relativePath) {
  return JSON.parse(await readFile(join(repoRoot, relativePath), "utf8"));
}

const pkg = await readJson("package.json");
const plugin = await readJson("plugin.json");
const cursorPlugin = await readJson(".cursor-plugin/plugin.json");
const listing = await readJson("grokbot/manifest.json");
const mcp = await readJson("mcp.json");
const version = pkg.version;

const mismatches = [];
if (plugin.version !== version) mismatches.push(`plugin.json version ${plugin.version} != ${version}`);
if (cursorPlugin.version !== version) mismatches.push(`.cursor-plugin/plugin.json version ${cursorPlugin.version} != ${version}`);
if (listing.version !== version) mismatches.push(`grokbot/manifest.json version ${listing.version} != ${version}`);
if (plugin.name !== "rednote-ops-suite" || cursorPlugin.name !== "rednote-ops-suite") {
  mismatches.push("plugin name must be rednote-ops-suite");
}
if (JSON.stringify(mcp).match(/Bearer |app_secret|sk_/i)) {
  mismatches.push("mcp.json must not contain secrets");
}
if (listing.disclosures?.marketplaceImportFormatVerified) {
  mismatches.push("do not claim a verified GrokBot import schema");
}

if (mismatches.length) {
  for (const item of mismatches) process.stderr.write(`${item}\n`);
  process.exit(1);
}

const pack = spawnSync("npm", ["run", "grokbot:pack"], { cwd: repoRoot, encoding: "utf8" });
if (pack.status !== 0) {
  process.stderr.write(pack.stderr || pack.stdout || "grokbot:pack failed\n");
  process.exit(pack.status ?? 1);
}

process.stdout.write(`release checklist passed for v${version}\n`);
process.stdout.write(`Tag with: git tag v${version} && git push origin v${version}\n`);
process.stdout.write("Maintainer marketplace next step: https://cursor.com/marketplace/publish\n");
process.stdout.write("This does not publish notes to Xiaohongshu and is not a one-click GrokBot import schema.\n");
