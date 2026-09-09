import { describe, expect, it } from "vitest";
import { checkContent, contentHash, normalizeTopics } from "../src/content.js";

describe("content utilities", () => {
  it("normalizes and de-duplicates topics", () => {
    expect(normalizeTopics(["#旅行", "旅行", "  上海 ", ""])).toEqual(["旅行", "上海"]);
  });

  it("creates stable hashes and changes them when content changes", () => {
    const first = contentHash("标题", "正文", ["话题"], ["a.png"]);
    expect(first).toHaveLength(64);
    expect(contentHash("标题", "正文", ["#话题"], ["a.png"])).toBe(first);
    expect(contentHash("新标题", "正文", ["话题"], ["a.png"])).not.toBe(first);
  });

  it("flags regulated and diversion language", () => {
    const checks = checkContent("全网第一", "加我微信，保证稳赚", [], []);
    expect(checks.map((item) => item.code)).toEqual(expect.arrayContaining(["claims.absolute", "claims.regulated", "traffic.diversion"]));
  });
});
