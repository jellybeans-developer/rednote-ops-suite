import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { AssetByteDigest, ContentCheck } from "./types.js";

export type AssetAccessFailureReason = "missing" | "not_a_file" | "unreadable";

export class AssetAccessError extends Error {
  readonly reason: AssetAccessFailureReason;
  readonly assetPath: string;

  constructor(reason: AssetAccessFailureReason, assetPath: string, message: string) {
    super(message);
    this.name = "AssetAccessError";
    this.reason = reason;
    this.assetPath = assetPath;
  }
}

export function normalizeTopics(topics: string[]): string[] {
  return [...new Set(topics.map((topic) => topic.trim().replace(/^#+/, "")).filter(Boolean))].slice(0, 10);
}

export function contentHash(title: string, body: string, topics: string[], assetDigests: AssetByteDigest[]): string {
  const canonical = JSON.stringify({
    title,
    body,
    topics: normalizeTopics(topics),
    assets: assetDigests.map((asset) => ({
      path: asset.path,
      sha256: asset.sha256,
      byteLength: asset.byteLength,
    })),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export async function digestAssetFiles(assetPaths: string[]): Promise<AssetByteDigest[]> {
  const digests: AssetByteDigest[] = [];
  for (const assetPath of assetPaths) {
    digests.push(await digestOneAssetFile(assetPath));
  }
  return digests;
}

export async function inspectAssetFiles(assetPaths: string[]): Promise<{
  digests: AssetByteDigest[];
  checks: ContentCheck[];
}> {
  const digests: AssetByteDigest[] = [];
  const checks: ContentCheck[] = [];
  for (const assetPath of assetPaths) {
    try {
      digests.push(await digestOneAssetFile(assetPath));
    } catch (error) {
      if (error instanceof AssetAccessError) {
        checks.push({
          level: "error",
          code: `assets.${error.reason}`,
          message: error.message,
        });
        continue;
      }
      throw error;
    }
  }
  return { digests, checks };
}

export async function contentHashForAssetPaths(
  title: string,
  body: string,
  topics: string[],
  assetPaths: string[],
): Promise<{ contentHash: string; assetDigests: AssetByteDigest[] }> {
  const assetDigests = await digestAssetFiles(assetPaths);
  return {
    contentHash: contentHash(title, body, topics, assetDigests),
    assetDigests,
  };
}

export function checkContent(title: string, body: string, topics: string[], assetPaths: string[]): ContentCheck[] {
  const checks: ContentCheck[] = [];
  if (!title.trim()) checks.push({ level: "error", code: "title.empty", message: "标题不能为空。" });
  if (!body.trim()) checks.push({ level: "error", code: "body.empty", message: "正文不能为空。" });
  if (title.length > 20) checks.push({ level: "warning", code: "title.long", message: "标题超过 20 个字符；发布前请按当前小红书规则复核。" });
  if (body.length > 1000) checks.push({ level: "warning", code: "body.long", message: "正文超过 1000 个字符；发布前请按当前小红书规则复核。" });
  if (topics.length > 10) checks.push({ level: "warning", code: "topics.many", message: "话题多于 10 个，已只保留前 10 个去重话题。" });
  if (assetPaths.length === 0) checks.push({ level: "info", code: "assets.none", message: "未附素材；图文笔记通常需要至少一张图片。" });

  const risky = [
    { pattern: /最(?:好|强|低|高|大)|第一|顶级|国家级|绝对/iu, code: "claims.absolute", message: "包含绝对化或最高级表述，请核实广告合规性。" },
    { pattern: /治愈|根治|药到病除|零风险|稳赚|保本/iu, code: "claims.regulated", message: "包含医疗或金融效果承诺，必须由人工和合规人员复核。" },
    { pattern: /微信|vx|v信|加我|私下交易/iu, code: "traffic.diversion", message: "可能包含站外引流表述，请按平台现行规则复核。" },
  ];
  for (const item of risky) {
    if (item.pattern.test(`${title}\n${body}`)) checks.push({ level: "warning", code: item.code, message: item.message });
  }
  return checks;
}

async function digestOneAssetFile(assetPath: string): Promise<AssetByteDigest> {
  const resolvedPath = resolve(assetPath);
  let fileStat;
  try {
    fileStat = await stat(resolvedPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new AssetAccessError(
        "missing",
        resolvedPath,
        `素材文件不存在，拒绝用路径字符串或空字节伪造哈希: ${resolvedPath}`,
      );
    }
    throw new AssetAccessError(
      "unreadable",
      resolvedPath,
      `无法读取素材文件: ${resolvedPath} (${(error as Error).message})`,
    );
  }
  if (!fileStat.isFile()) {
    throw new AssetAccessError("not_a_file", resolvedPath, `素材路径不是普通文件: ${resolvedPath}`);
  }
  try {
    const { sha256, byteLength } = await hashFileBytes(resolvedPath);
    return { path: resolvedPath, sha256, byteLength };
  } catch (error) {
    throw new AssetAccessError(
      "unreadable",
      resolvedPath,
      `无法读取素材文件字节: ${resolvedPath} (${(error as Error).message})`,
    );
  }
}

async function hashFileBytes(filePath: string): Promise<{ sha256: string; byteLength: number }> {
  const hash = createHash("sha256");
  let byteLength = 0;
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    const bytes = chunk as Buffer;
    hash.update(bytes);
    byteLength += bytes.length;
  }
  return { sha256: hash.digest("hex"), byteLength };
}
