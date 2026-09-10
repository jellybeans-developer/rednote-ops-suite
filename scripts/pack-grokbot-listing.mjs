#!/usr/bin/env node
/**
 * 把 grokbot/ 上架文案打成评审用 zip。
 * 该压缩包只便于审阅和归档，不是 GrokBot 官方导入格式。
 */
import { createWriteStream, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ZipArchive } from "archiver";

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
await new Promise((resolve, reject) => {
  const output = createWriteStream(zipPath);
  const zip = new ZipArchive({ zlib: { level: 9 } });
  output.on("close", resolve);
  output.on("error", reject);
  zip.on("error", reject);
  zip.pipe(output);
  for (const name of listingFiles) zip.file(join(grokbotDir, name), { name });
  zip.append(`${packagingNote}\n`, { name: "PACKAGING-NOTE.txt" });
  void zip.finalize();
});

process.stdout.write(`Wrote reviewer bundle ${zipPath}\n`);
process.stdout.write("This zip is not an official GrokBot import format.\n");
