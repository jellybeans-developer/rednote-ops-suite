import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AssetAccessError,
  checkContent,
  contentHash,
  contentHashForAssetPaths,
  digestAssetFiles,
  inspectAssetFiles,
  normalizeTopics,
} from "../src/content.js";

describe("content utilities", () => {
  it("normalizes and de-duplicates topics", () => {
    expect(normalizeTopics(["#旅行", "旅行", "  上海 ", ""])).toEqual(["旅行", "上海"]);
  });

  it("creates stable hashes and changes them when text content changes", () => {
    const first = contentHash("标题", "正文", ["话题"], []);
    expect(first).toHaveLength(64);
    expect(contentHash("标题", "正文", ["#话题"], [])).toBe(first);
    expect(contentHash("新标题", "正文", ["话题"], [])).not.toBe(first);
  });

  it("hashes real asset file bytes instead of path strings", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rednote-hash-"));
    const assetPath = join(dir, "cover.png");
    await writeFile(assetPath, Buffer.from("image-bytes-version-a"));
    const first = await contentHashForAssetPaths("标题", "正文", ["话题"], [assetPath]);
    expect(first.contentHash).toHaveLength(64);
    expect(first.assetDigests).toHaveLength(1);
    expect(first.assetDigests[0]!.byteLength).toBe(Buffer.byteLength("image-bytes-version-a"));
    expect(first.assetDigests[0]!.sha256).toHaveLength(64);

    await writeFile(assetPath, Buffer.from("image-bytes-version-b"));
    const second = await contentHashForAssetPaths("标题", "正文", ["话题"], [assetPath]);
    expect(second.contentHash).not.toBe(first.contentHash);
    expect(second.assetDigests[0]!.sha256).not.toBe(first.assetDigests[0]!.sha256);
  });

  it("fails closed when an asset path is missing and does not invent bytes", async () => {
    const missingPath = join(tmpdir(), "rednote-missing-asset-does-not-exist.png");
    await expect(digestAssetFiles([missingPath])).rejects.toBeInstanceOf(AssetAccessError);
    await expect(digestAssetFiles([missingPath])).rejects.toThrow(/不存在/);

    const inspection = await inspectAssetFiles([missingPath]);
    expect(inspection.digests).toEqual([]);
    expect(inspection.checks.map((item) => item.code)).toEqual(["assets.missing"]);
  });

  it("fails closed when an asset path is a directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rednote-dir-asset-"));
    await expect(digestAssetFiles([dir])).rejects.toMatchObject({ reason: "not_a_file" });
  });

  it("flags regulated and diversion language", () => {
    const checks = checkContent("全网第一", "加我微信，保证稳赚", [], []);
    expect(checks.map((item) => item.code)).toEqual(expect.arrayContaining(["claims.absolute", "claims.regulated", "traffic.diversion"]));
  });
});
