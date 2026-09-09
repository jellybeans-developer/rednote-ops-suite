#!/usr/bin/env node
/**
 * 把 grokbot/ 上架文案打成评审用 zip。
 * 该压缩包只便于审阅和归档，不是 GrokBot 官方导入格式。
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const grokbotDir = join(repoRoot, "grokbot");
const manifest = JSON.parse(readFileSync(join(grokbotDir, "manifest.json"), "utf8"));
const version = manifest.version;
const listingFiles = [
  "manifest.json",
  "listing.zh-CN.md",
  "instructions.md",
  "privacy.md",
  "PUBLISHING.md",
  "README.md",
];

const packagingNote = [
  "RedNote Ops Suite GrokBot listing snapshot",
  `listingVersion=${version}`,
  `schema=${manifest.schema}`,
  "",
  "This zip is a reviewer/archive bundle of draft marketplace copy.",
  "It is NOT a verified or official GrokBot marketplace import package.",
  "Maintainer submit path: https://cursor.com/marketplace/publish (public review).",
  "Copy fields into the GrokBot create UI as described in PUBLISHING.md.",
  "",
  `MCP tools (${manifest.mcp.toolCount}): ${manifest.mcp.requiredTools.join(", ")}`,
  `marketplaceImportFormatVerified=${manifest.disclosures.marketplaceImportFormatVerified}`,
  `officialXiaohongshuProduct=${manifest.disclosures.officialXiaohongshuProduct}`,
  `approvalPhraseAuthenticatesHuman=${manifest.disclosures.approvalPhraseAuthenticatesHuman}`,
].join("\n");

const distDir = join(repoRoot, "dist");
mkdirSync(distDir, { recursive: true });
const zipPath = join(distDir, `grokbot-listing-${version}.zip`);
const notePath = join(distDir, "grokbot-PACKAGING-NOTE.txt");
writeFileSync(notePath, `${packagingNote}\n`, "utf8");

const pythonScript = `
import zipfile
from pathlib import Path

grokbot = Path(${JSON.stringify(grokbotDir)})
zip_path = Path(${JSON.stringify(zipPath)})
note_path = Path(${JSON.stringify(notePath)})
names = ${JSON.stringify(listingFiles)}

with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for name in names:
        archive.write(grokbot / name, arcname=name)
    archive.write(note_path, arcname="PACKAGING-NOTE.txt")
print(zip_path)
`;

const result = spawnSync("python3", ["-c", pythonScript], {
  encoding: "utf8",
  cwd: repoRoot,
});
rmSync(notePath, { force: true });

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || "python3 zip packing failed\n");
  process.exit(result.status ?? 1);
}

process.stdout.write(`Wrote reviewer bundle ${zipPath}\n`);
process.stdout.write("This zip is not an official GrokBot import format.\n");
