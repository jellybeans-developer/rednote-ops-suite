import { describe, expect, it } from "vitest";
import { assertOfficialCreatorUrl } from "../src/creator-browser/driver.js";

describe("creator browser URL guard", () => {
  it("accepts only the official HTTPS Creator Center host", () => {
    expect(assertOfficialCreatorUrl("https://creator.rednote.com/login").hostname).toBe("creator.rednote.com");
    expect(() => assertOfficialCreatorUrl("http://creator.rednote.com/login")).toThrow(/non-official/);
    expect(() => assertOfficialCreatorUrl("https://creator.rednote.com.evil.example/login")).toThrow(/non-official/);
    expect(() => assertOfficialCreatorUrl("https://www.xiaohongshu.com/explore")).toThrow(/non-official/);
  });
});
