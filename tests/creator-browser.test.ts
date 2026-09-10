import { describe, expect, it } from "vitest";
import { assertOfficialCreatorUrl, isCreatorPublishSuccessUrl } from "../src/creator-browser/driver.js";

describe("creator browser URL guard", () => {
  it("accepts only the official HTTPS Creator Center host", () => {
    expect(assertOfficialCreatorUrl("https://creator.rednote.com/login").hostname).toBe("creator.rednote.com");
    expect(assertOfficialCreatorUrl("https://creator.xiaohongshu.com/login").hostname).toBe("creator.xiaohongshu.com");
    expect(() => assertOfficialCreatorUrl("http://creator.rednote.com/login")).toThrow(/non-official/);
    expect(() => assertOfficialCreatorUrl("https://creator.rednote.com.evil.example/login")).toThrow(/non-official/);
    expect(() => assertOfficialCreatorUrl("https://www.xiaohongshu.com/explore")).toThrow(/non-official/);
  });

  it("recognizes only the official Creator Center publish success page", () => {
    expect(isCreatorPublishSuccessUrl("https://creator.xiaohongshu.com/publish/success?source=official")).toBe(true);
    expect(isCreatorPublishSuccessUrl("https://creator.xiaohongshu.com/publish/publish")).toBe(false);
    expect(() => isCreatorPublishSuccessUrl("https://creator.xiaohongshu.com.evil.example/publish/success")).toThrow(/non-official/);
  });
});
