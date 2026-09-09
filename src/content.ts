import { createHash } from "node:crypto";
import type { ContentCheck } from "./types.js";

export function normalizeTopics(topics: string[]): string[] {
  return [...new Set(topics.map((topic) => topic.trim().replace(/^#+/, "")).filter(Boolean))].slice(0, 10);
}

export function contentHash(title: string, body: string, topics: string[], assetPaths: string[]): string {
  const canonical = JSON.stringify({ title, body, topics: normalizeTopics(topics), assetPaths });
  return createHash("sha256").update(canonical).digest("hex");
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
