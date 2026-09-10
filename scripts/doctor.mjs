#!/usr/bin/env node
/**
 * 操作员自检：Node 版本、构建产物、插件清单。不访问小红书，也不读取密钥。
 */
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const notes = [];

function versionMajor(raw) {
  const matched = String(raw).match(/v?(\d+)/);
  return matched ? Number(matched[1]) : 0;
}

if (versionMajor(process.versions.node) < 20) {
  errors.push(`Node 20+ required, found ${process.version}`);
} else {
  notes.push(`Node ${process.version}`);
}

const requiredFiles = [
  "plugin.json",
  "mcp.json",
  ".mcp.json",
  ".grok-plugin/plugin.json",
  ".grok-plugin/marketplace.json",
  "agents/rednote-operator.md",
  ".cursor-plugin/plugin.json",
  "skills/rednote-ops-workflow/SKILL.md",
  "skills/rednote-ops-safety/SKILL.md",
  "docs/use-with-grokbot.md",
  "dist/cli.js",
  "plugin-dist/index.js",
];

for (const relativePath of requiredFiles) {
  try {
    await access(join(repoRoot, relativePath));
    notes.push(`found ${relativePath}`);
  } catch {
    const hint = relativePath === "dist/cli.js" ? " (run npm run build)" : "";
    errors.push(`missing ${relativePath}${hint}`);
  }
}

const mcp = JSON.parse(await readFile(join(repoRoot, "mcp.json"), "utf8"));
const grokMcp = JSON.parse(await readFile(join(repoRoot, ".mcp.json"), "utf8"));
if (JSON.stringify({ mcp, grokMcp }).match(/Bearer |app_secret|sk_/i)) {
  errors.push("MCP configuration must not contain bearer tokens or app secrets");
} else {
  notes.push("MCP configurations have no embedded secrets");
}

notes.push("Official openaccount OAuth stays disabled unless REDNOTE_OPENACCOUNT_OAUTH_ENABLED=true");
notes.push("OAuth is not publish permission. Human publishing remains the default.");
notes.push("Visible creator-browser automation stays disabled unless REDNOTE_CREATOR_BROWSER_ENABLED=true");
notes.push("Final publish click additionally requires REDNOTE_CREATOR_ALLOW_PUBLISH=true and an exact confirmation phrase");
notes.push("Install: grok plugin install jellybeans-developer/rednote-ops-suite --trust");
notes.push("Validate (when Grok CLI is installed): grok plugin validate .");
notes.push("Run directly: grok --agent-profile agents/rednote-operator.md");

for (const note of notes) process.stdout.write(`ok  ${note}\n`);
if (errors.length) {
  for (const error of errors) process.stderr.write(`err ${error}\n`);
  process.exit(1);
}
process.stdout.write("doctor checklist passed\n");
