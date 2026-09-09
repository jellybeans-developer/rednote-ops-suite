import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("configuration", () => {
  it("defaults to loopback", () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(3210);
  });

  it("refuses public binding without a strong token", () => {
    expect(() => loadConfig({ REDNOTE_HOST: "0.0.0.0" } as NodeJS.ProcessEnv)).toThrow(/TOKEN/);
    expect(() => loadConfig({ REDNOTE_HOST: "0.0.0.0", REDNOTE_MCP_TOKEN: "short" } as NodeJS.ProcessEnv)).toThrow(/TOKEN/);
  });

  it("allows public binding with a long token", () => {
    const config = loadConfig({ REDNOTE_HOST: "0.0.0.0", REDNOTE_MCP_TOKEN: "x".repeat(32) } as NodeJS.ProcessEnv);
    expect(config.host).toBe("0.0.0.0");
  });

  it("keeps official openaccount OAuth disabled by default", () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    expect(config.openAccountOAuth.enabled).toBe(false);
    expect(config.openAccountOAuth.appSecret).toBeUndefined();
  });

  it("fails closed when OAuth is enabled without official app credentials", () => {
    expect(() => loadConfig({
      REDNOTE_OPENACCOUNT_OAUTH_ENABLED: "true",
    } as NodeJS.ProcessEnv)).toThrow(/REDNOTE_OPENACCOUNT_APP_ID/);
    expect(() => loadConfig({
      REDNOTE_OPENACCOUNT_OAUTH_ENABLED: "true",
      REDNOTE_OPENACCOUNT_APP_ID: "xhs_test_app",
    } as NodeJS.ProcessEnv)).toThrow(/APP_SECRET/);
  });

  it("fails closed when OAuth is enabled with a non-official host or non-basic_info scope", () => {
    const credentials = {
      REDNOTE_OPENACCOUNT_OAUTH_ENABLED: "true",
      REDNOTE_OPENACCOUNT_APP_ID: "xhs_test_app",
      REDNOTE_OPENACCOUNT_APP_SECRET: "sk_test_secret",
    };
    expect(() => loadConfig({
      ...credentials,
      REDNOTE_OPENACCOUNT_BASE_URL: "https://evil.example.com",
    } as NodeJS.ProcessEnv)).toThrow(/官方 openaccount/);
    expect(() => loadConfig({
      ...credentials,
      REDNOTE_OPENACCOUNT_SCOPES: "publish_note",
    } as NodeJS.ProcessEnv)).toThrow(/basic_info/);
  });

  it("accepts an explicitly enabled official OAuth config", () => {
    const config = loadConfig({
      REDNOTE_OPENACCOUNT_OAUTH_ENABLED: "true",
      REDNOTE_OPENACCOUNT_APP_ID: "xhs_test_app",
      REDNOTE_OPENACCOUNT_APP_SECRET: "sk_test_secret",
      REDNOTE_OPENACCOUNT_BASE_URL: "https://openaccount.beta.xiaohongshu.com",
    } as NodeJS.ProcessEnv);
    expect(config.openAccountOAuth.enabled).toBe(true);
    expect(config.openAccountOAuth.baseUrl).toBe("https://openaccount.beta.xiaohongshu.com");
    expect(config.openAccountOAuth.scopes).toEqual(["basic_info"]);
  });
});
